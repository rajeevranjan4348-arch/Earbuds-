/**
 * IRIS — Real-Time Google Maps Platform Service
 * Integrates with Google Maps Geocoding, Places (Text & Nearby Search), and Directions APIs.
 * Supports primary custom key with automatic fallback to GHP demo key.
 */

const PRIMARY_KEY = process.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyDwkI0b4rxHK22fKRtKwsJniLNI_pJjveM'
const FALLBACK_KEY = 'AIzaSyBpZJtNMY11VDNpQ905P_6RccN_83R0J6A'

export interface PlaceResult {
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

export interface RouteStep {
  instructions: string
  distance: string
  duration: string
  travelMode: string
  startLocation: { lat: number; lng: number }
  endLocation: { lat: number; lng: number }
}

export interface DirectionsResult {
  summary: string
  distance: string
  duration: string
  durationValueSeconds: number
  distanceValueMeters: number
  startAddress: string
  endAddress: string
  startLocation: { lat: number; lng: number }
  endLocation: { lat: number; lng: number }
  steps: RouteStep[]
  overviewPolyline?: string
  warnings: string[]
}

class GoogleMapsService {
  private getKeys(): string[] {
    const keys = [PRIMARY_KEY]
    if (FALLBACK_KEY && !keys.includes(FALLBACK_KEY)) {
      keys.push(FALLBACK_KEY)
    }
    return keys
  }

  private async fetchWithKeyFallback(urlBuilder: (key: string) => string): Promise<any> {
    const keys = this.getKeys()
    let lastError: any = null

    for (const key of keys) {
      try {
        const url = urlBuilder(key)
        const res = await fetch(url)
        if (!res.ok) {
          lastError = new Error(`HTTP ${res.status}: ${res.statusText}`)
          continue
        }
        const data = await res.json()
        if (data.status === 'OK' || data.status === 'ZERO_RESULTS') {
          return data
        }
        // If billing error or request denied, try fallback key
        if (data.status === 'REQUEST_DENIED' || data.status === 'OVER_QUERY_LIMIT') {
          lastError = new Error(data.error_message || data.status)
          continue
        }
        return data
      } catch (err) {
        lastError = err
      }
    }

    throw lastError || new Error('Google Maps API request failed across all keys.')
  }

  /**
   * Search places via Google Places Text Search API
   */
  public async searchPlaces(params: {
    query: string
    location?: { lat: number; lng: number }
    radius?: number
    type?: string
  }): Promise<{ success: boolean; places: PlaceResult[]; rawCount: number }> {
    const { query, location, radius = 5000, type } = params

    const data = await this.fetchWithKeyFallback((key) => {
      let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`
      if (location) {
        url += `&location=${location.lat},${location.lng}&radius=${radius}`
      }
      if (type) {
        url += `&type=${encodeURIComponent(type)}`
      }
      return url
    })

    const results: any[] = data.results || []
    const places: PlaceResult[] = results.map((r) => ({
      placeId: r.place_id,
      name: r.name,
      formattedAddress: r.formatted_address || '',
      latitude: r.geometry?.location?.lat || 0,
      longitude: r.geometry?.location?.lng || 0,
      rating: r.rating,
      userRatingsTotal: r.user_ratings_total,
      types: r.types || [],
      isOpenNow: r.opening_hours?.open_now,
      icon: r.icon
    }))

    return {
      success: true,
      places,
      rawCount: places.length
    }
  }

  /**
   * Get real-time turn-by-turn directions via Google Directions API
   */
  public async getDirections(params: {
    origin: string
    destination: string
    mode?: 'driving' | 'walking' | 'bicycling' | 'transit'
  }): Promise<{ success: boolean; directions: DirectionsResult }> {
    const { origin, destination, mode = 'driving' } = params

    const data = await this.fetchWithKeyFallback((key) => {
      return `https://maps.googleapis.com/maps/api/directions/json?origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=${mode}&key=${key}`
    })

    if (!data.routes || data.routes.length === 0) {
      throw new Error(`No route found from "${origin}" to "${destination}".`)
    }

    const route = data.routes[0]
    const leg = route.legs?.[0] || {}

    const steps: RouteStep[] = (leg.steps || []).map((s: any) => ({
      instructions: s.html_instructions ? s.html_instructions.replace(/<[^>]*>/g, '') : '',
      distance: s.distance?.text || '',
      duration: s.duration?.text || '',
      travelMode: s.travel_mode || mode.toUpperCase(),
      startLocation: s.start_location,
      endLocation: s.end_location
    }))

    const directions: DirectionsResult = {
      summary: route.summary || '',
      distance: leg.distance?.text || '',
      duration: leg.duration?.text || '',
      durationValueSeconds: leg.duration?.value || 0,
      distanceValueMeters: leg.distance?.value || 0,
      startAddress: leg.start_address || origin,
      endAddress: leg.end_address || destination,
      startLocation: leg.start_location || { lat: 0, lng: 0 },
      endLocation: leg.end_location || { lat: 0, lng: 0 },
      steps,
      overviewPolyline: route.overview_polyline?.points,
      warnings: route.warnings || []
    }

    return {
      success: true,
      directions
    }
  }

  /**
   * Geocode an address to lat/lng coordinates
   */
  public async geocode(address: string): Promise<{
    success: boolean
    location: { lat: number; lng: number }
    formattedAddress: string
    placeId: string
  }> {
    const data = await this.fetchWithKeyFallback((key) => {
      return `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${key}`
    })

    if (!data.results || data.results.length === 0) {
      throw new Error(`Location "${address}" could not be geocoded.`)
    }

    const first = data.results[0]
    return {
      success: true,
      location: first.geometry.location,
      formattedAddress: first.formatted_address,
      placeId: first.place_id
    }
  }

  /**
   * Reverse geocode lat/lng to address
   */
  public async reverseGeocode(lat: number, lng: number): Promise<{
    success: boolean
    formattedAddress: string
    city: string
    country: string
  }> {
    const data = await this.fetchWithKeyFallback((key) => {
      return `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`
    })

    if (!data.results || data.results.length === 0) {
      return {
        success: true,
        formattedAddress: `Coordinates: ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
        city: 'Unknown',
        country: 'Unknown'
      }
    }

    const first = data.results[0]
    let city = 'Unknown'
    let country = 'Unknown'

    for (const comp of first.address_components || []) {
      if (comp.types.includes('locality')) city = comp.long_name
      if (comp.types.includes('country')) country = comp.long_name
    }

    return {
      success: true,
      formattedAddress: first.formatted_address,
      city,
      country
    }
  }

  /**
   * Get detailed place information (phone, rating, website, hours)
   */
  public async getPlaceDetails(placeId: string): Promise<{
    success: boolean
    place?: any
  }> {
    const data = await this.fetchWithKeyFallback((key) => {
      return `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=name,rating,formatted_address,formatted_phone_number,geometry,opening_hours,website,price_level,user_ratings_total,types&key=${key}`
    })
    return {
      success: true,
      place: data.result
    }
  }
}

export const googleMapsService = new GoogleMapsService()
