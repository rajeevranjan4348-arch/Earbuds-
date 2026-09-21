/**
 * Live Location & Spatial Telemetry Service
 * High-precision GPS tracking, Nominatim reverse geocoding, IP fallback,
 * and reactive telemetry stream.
 */

import { useState, useEffect } from 'react'

export interface LocationCoordinates {
  latitude: number
  longitude: number
  altitude: number | null
  accuracy: number | null
  altitudeAccuracy: number | null
  heading: number | null
  speed: number | null
}

export interface LiveLocationData extends LocationCoordinates {
  city?: string
  region?: string
  country?: string
  postcode?: string
  road?: string
  displayName?: string
  source: 'gps' | 'ip' | 'network' | 'manual'
  timestamp: number
}

export type LocationLockStatus = 'idle' | 'requesting' | 'active' | 'error' | 'denied'

export interface LocationState {
  location: LiveLocationData | null
  status: LocationLockStatus
  errorMessage: string | null
  isTracking: boolean
  lastUpdated: number | null
}

type Listener = (state: LocationState) => void

class LocationService {
  private state: LocationState = {
    location: null,
    status: 'idle',
    errorMessage: null,
    isTracking: false,
    lastUpdated: null
  }

  private watchId: number | null = null
  private listeners = new Set<Listener>()
  private syncTimer: any = null

  constructor() {
    this.loadCachedLocation()
  }

  private loadCachedLocation() {
    try {
      const saved = localStorage.getItem('iris_live_location')
      if (saved) {
        const parsed = JSON.parse(saved)
        this.state = {
          ...this.state,
          location: parsed,
          lastUpdated: parsed.timestamp || Date.now()
        }
      }
    } catch (_e) {}
  }

  private persistLocation(loc: LiveLocationData) {
    try {
      localStorage.setItem('iris_live_location', JSON.stringify(loc))
    } catch (_e) {}
  }

  private notify() {
    this.listeners.forEach((listener) => {
      try {
        listener({ ...this.state })
      } catch (_e) {}
    })
  }

  public getState(): LocationState {
    return { ...this.state }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    listener({ ...this.state })
    return () => this.listeners.delete(listener)
  }

  /**
   * Syncs position to backend /api/location/update
   */
  private async syncToServer(loc: LiveLocationData) {
    try {
      await fetch('/api/location/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loc)
      })
    } catch (_e) {}
  }

  /**
   * Reverse geocodes coordinates via backend proxy
   */
  public async reverseGeocode(
    latitude: number,
    longitude: number
  ): Promise<Partial<LiveLocationData>> {
    try {
      const res = await fetch(`/api/location/reverse?lat=${latitude}&lon=${longitude}`)
      if (res.ok) {
        const data = await res.json()
        return {
          city: data.city,
          region: data.region,
          country: data.country,
          postcode: data.postcode,
          road: data.road,
          displayName: data.displayName
        }
      }
    } catch (_e) {}
    return {}
  }

  /**
   * Requests single location fix with high accuracy
   */
  public async requestFix(): Promise<LiveLocationData | null> {
    this.state.status = 'requesting'
    this.state.errorMessage = null
    this.notify()

    if (!('geolocation' in navigator)) {
      return this.fallbackToIpLocation('Geolocation API not supported on this device')
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const coords = position.coords
          const baseLoc: LiveLocationData = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            altitude: coords.altitude,
            accuracy: coords.accuracy,
            altitudeAccuracy: coords.altitudeAccuracy,
            heading: coords.heading,
            speed: coords.speed,
            source: 'gps',
            timestamp: position.timestamp || Date.now()
          }

          // Resolve place details
          const details = await this.reverseGeocode(coords.latitude, coords.longitude)
          const finalLoc: LiveLocationData = {
            ...baseLoc,
            ...details,
            displayName:
              details.displayName ||
              `${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°`
          }

          this.state = {
            location: finalLoc,
            status: 'active',
            errorMessage: null,
            isTracking: this.state.isTracking,
            lastUpdated: Date.now()
          }
          this.persistLocation(finalLoc)
          this.syncToServer(finalLoc)
          this.notify()
          resolve(finalLoc)
        },
        async (error) => {
          console.warn('[LocationService] GPS fix error:', error.message)
          const reason =
            error.code === error.PERMISSION_DENIED
              ? 'GPS permission denied by user. Falling back to network IP telemetry.'
              : error.code === error.TIMEOUT
                ? 'GPS fix timed out. Falling back to network IP telemetry.'
                : 'Satellite signal unavailable. Falling back to network IP telemetry.'

          const fallback = await this.fallbackToIpLocation(reason)
          resolve(fallback)
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 10000
        }
      )
    })
  }

  /**
   * Starts live tracking stream
   */
  public startTracking() {
    if (this.state.isTracking) return

    this.state.isTracking = true
    this.state.status = 'requesting'
    this.state.errorMessage = null
    this.notify()

    if (!('geolocation' in navigator)) {
      this.fallbackToIpLocation('Geolocation API not supported')
      return
    }

    try {
      this.watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const coords = position.coords
          const baseLoc: LiveLocationData = {
            latitude: coords.latitude,
            longitude: coords.longitude,
            altitude: coords.altitude,
            accuracy: coords.accuracy,
            altitudeAccuracy: coords.altitudeAccuracy,
            heading: coords.heading,
            speed: coords.speed,
            source: 'gps',
            timestamp: position.timestamp || Date.now()
          }

          // If we haven't reverse-geocoded or moved significantly, resolve address
          let details: Partial<LiveLocationData> = {}
          const current = this.state.location
          const hasMoved =
            !current ||
            Math.abs(current.latitude - coords.latitude) > 0.002 ||
            Math.abs(current.longitude - coords.longitude) > 0.002

          if (hasMoved || !current.city) {
            details = await this.reverseGeocode(coords.latitude, coords.longitude)
          } else {
            details = {
              city: current.city,
              region: current.region,
              country: current.country,
              displayName: current.displayName
            }
          }

          const fullLoc: LiveLocationData = {
            ...baseLoc,
            ...details,
            displayName:
              details.displayName ||
              `${coords.latitude.toFixed(4)}°, ${coords.longitude.toFixed(4)}°`
          }

          this.state = {
            location: fullLoc,
            status: 'active',
            errorMessage: null,
            isTracking: true,
            lastUpdated: Date.now()
          }
          this.persistLocation(fullLoc)
          this.syncToServer(fullLoc)
          this.notify()
        },
        async (err) => {
          console.warn('[LocationService] Watch position error:', err.message)
          if (err.code === err.PERMISSION_DENIED) {
            this.state.status = 'denied'
            this.state.errorMessage = 'Location access denied. Enable GPS permissions in browser.'
            this.stopTracking()
            await this.fallbackToIpLocation('Location access denied. Using IP location.')
          } else {
            this.state.errorMessage = err.message
            this.notify()
          }
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 5000
        }
      )
    } catch (e: any) {
      this.state.status = 'error'
      this.state.errorMessage = e?.message || 'Failed to initialize live GPS watch'
      this.notify()
    }
  }

  /**
   * Stops live tracking
   */
  public stopTracking() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId)
      this.watchId = null
    }
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = null
    }
    this.state.isTracking = false
    this.notify()
  }

  /**
   * IP-based fallback lookup
   */
  public async fallbackToIpLocation(reason?: string): Promise<LiveLocationData | null> {
    try {
      const res = await fetch('/api/location/ip')
      if (res.ok) {
        const data = await res.json()
        if (data.success && data.location) {
          const loc: LiveLocationData = {
            latitude: data.location.latitude,
            longitude: data.location.longitude,
            altitude: null,
            accuracy: 1000,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
            city: data.location.city,
            region: data.location.region,
            country: data.location.country,
            postcode: data.location.postcode,
            displayName:
              data.location.displayName || `${data.location.city}, ${data.location.country}`,
            source: 'ip',
            timestamp: Date.now()
          }
          this.state = {
            location: loc,
            status: 'active',
            errorMessage: reason || null,
            isTracking: this.state.isTracking,
            lastUpdated: Date.now()
          }
          this.persistLocation(loc)
          this.notify()
          return loc
        }
      }
    } catch (_e) {}

    this.state.status = 'error'
    this.state.errorMessage = reason || 'Unable to obtain spatial coordinates'
    this.notify()
    return null
  }

  /**
   * Helper to format coordinates string
   */
  public formatCoordinates(lat: number, lon: number): string {
    const latDir = lat >= 0 ? 'N' : 'S'
    const lonDir = lon >= 0 ? 'E' : 'W'
    return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lon).toFixed(4)}° ${lonDir}`
  }

  /**
   * Returns Google Maps URL
   */
  public getMapsUrl(lat?: number, lon?: number): string {
    const targetLat = lat ?? this.state.location?.latitude
    const targetLon = lon ?? this.state.location?.longitude
    if (typeof targetLat !== 'number' || typeof targetLon !== 'number') return '#'
    return `https://www.google.com/maps?q=${targetLat},${targetLon}`
  }
}

export const locationService = new LocationService()

/**
 * Custom React Hook for live location in components
 */
export function useLiveLocation() {
  const [state, setState] = useState<LocationState>(locationService.getState())

  useEffect(() => {
    const unsubscribe = locationService.subscribe(setState)
    return () => unsubscribe()
  }, [])

  return {
    ...state,
    requestFix: () => locationService.requestFix(),
    startTracking: () => locationService.startTracking(),
    stopTracking: () => locationService.stopTracking(),
    formatCoordinates: locationService.formatCoordinates,
    getMapsUrl: locationService.getMapsUrl.bind(locationService)
  }
}
