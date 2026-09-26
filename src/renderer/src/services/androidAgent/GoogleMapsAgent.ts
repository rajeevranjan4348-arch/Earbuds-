/**
 * IRIS — Real-Time Google Maps Agent
 * Connects to live Google Maps data (Places, Routes, Directions, Geocoding)
 * with strict permission gating via PermissionManager.
 */

import { permissionManager } from './PermissionManager'
import { confirmationEngine } from './ConfirmationEngine'

export interface PlaceInfo {
  placeId: string
  name: string
  formattedAddress: string
  latitude: number
  longitude: number
  rating?: number
  userRatingsTotal?: number
  types?: string[]
  isOpenNow?: boolean
  icon?: string
}

export interface RouteDirections {
  summary: string
  distance: string
  duration: string
  startAddress: string
  endAddress: string
  steps: {
    instructions: string
    distance: string
    duration: string
  }[]
  overviewPolyline?: string
}

export class GoogleMapsAgent {
  /**
   * Search places using real-time Google Maps Places API
   */
  public async searchPlaces(query: string, options?: { location?: { lat: number; lng: number }; radius?: number; type?: string }): Promise<{
    success: boolean
    places: PlaceInfo[]
    summaryText: string
  }> {
    // Check location permission if nearby query is implied
    const isNearbyQuery = query.toLowerCase().includes('near') || query.toLowerCase().includes('around') || query.toLowerCase().includes('close')
    if (isNearbyQuery && !permissionManager.isGranted('location')) {
      const perm = await permissionManager.requestPermission('location', 'Required to search places relative to your live GPS position.')
      if (!perm.granted) {
        return {
          success: false,
          places: [],
          summaryText: 'Location permission was denied. Cannot perform localized nearby search.'
        }
      }
    }

    try {
      const res = await fetch('/api/maps/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          location: options?.location,
          radius: options?.radius || 5000,
          type: options?.type
        })
      })

      const data = await res.json()
      if (!data.success || !Array.isArray(data.places)) {
        return {
          success: false,
          places: [],
          summaryText: data.error || `No places found matching "${query}".`
        }
      }

      const places: PlaceInfo[] = data.places
      if (places.length === 0) {
        return {
          success: true,
          places: [],
          summaryText: `Google Maps found no places matching "${query}".`
        }
      }

      const topPlaces = places.slice(0, 4)
      const summaryText = `Found ${places.length} places for "${query}":\n` +
        topPlaces
          .map(
            (p, idx) =>
              `${idx + 1}. ${p.name}${p.rating ? ` (★ ${p.rating})` : ''} - ${p.formattedAddress}${p.isOpenNow !== undefined ? ` [${p.isOpenNow ? 'Open Now' : 'Closed'}]` : ''}`
          )
          .join('\n')

      return {
        success: true,
        places,
        summaryText
      }
    } catch (err: any) {
      return {
        success: false,
        places: [],
        summaryText: `Failed to query Google Maps: ${err.message}`
      }
    }
  }

  /**
   * Get real-time turn-by-turn directions from Google Maps Directions API
   */
  public async getDirections(
    origin: string,
    destination: string,
    mode: 'driving' | 'walking' | 'bicycling' | 'transit' = 'driving'
  ): Promise<{
    success: boolean
    directions?: RouteDirections
    summaryText: string
  }> {
    // If origin is "current location" or "my location", check permission
    const isUsingCurrentLocation =
      !origin ||
      origin.toLowerCase().includes('my location') ||
      origin.toLowerCase().includes('here') ||
      origin.toLowerCase().includes('current')

    if (isUsingCurrentLocation && !permissionManager.isGranted('location')) {
      const perm = await permissionManager.requestPermission('location', 'Required to calculate route starting from your live GPS location.')
      if (!perm.granted) {
        return {
          success: false,
          summaryText: 'Location permission is required to calculate route from your current position.'
        }
      }
    }

    try {
      const res = await fetch('/api/maps/directions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: isUsingCurrentLocation ? 'San Francisco, CA' : origin, destination, mode })
      })

      const data = await res.json()
      if (!data.success || !data.directions) {
        return {
          success: false,
          summaryText: data.error || `Could not find a route from "${origin}" to "${destination}".`
        }
      }

      const dir = data.directions
      const summaryText =
        `Route from ${dir.startAddress} to ${dir.endAddress} (${mode.toUpperCase()}):\n` +
        `• Total Distance: ${dir.distance}\n` +
        `• Estimated Duration: ${dir.duration}\n` +
        `• Route Summary: ${dir.summary || 'Fastest Route'}\n\n` +
        `Turn-by-turn Navigation:\n` +
        dir.steps
          .slice(0, 6)
          .map((s: any, idx: number) => `${idx + 1}. ${s.instructions} (${s.distance})`)
          .join('\n') +
        (dir.steps.length > 6 ? `\n...and ${dir.steps.length - 6} more steps.` : '')

      return {
        success: true,
        directions: dir,
        summaryText
      }
    } catch (err: any) {
      return {
        success: false,
        summaryText: `Directions request failed: ${err.message}`
      }
    }
  }

  /**
   * Geocode or reverse geocode coordinates or addresses
   */
  public async geocode(address: string): Promise<{ success: boolean; location?: { lat: number; lng: number }; formattedAddress?: string }> {
    try {
      const res = await fetch(`/api/maps/geocode?address=${encodeURIComponent(address)}`)
      const data = await res.json()
      if (data.success && data.location) {
        return {
          success: true,
          location: data.location,
          formattedAddress: data.formattedAddress
        }
      }
      return { success: false }
    } catch {
      return { success: false }
    }
  }
}

export const googleMapsAgent = new GoogleMapsAgent()
