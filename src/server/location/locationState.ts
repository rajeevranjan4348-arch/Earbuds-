/**
 * Server-side Location & Spatial Telemetry State
 * Maintains verified user coordinates and reverse-geocoded spatial metadata
 */

export interface ServerLocationData {
  latitude: number
  longitude: number
  altitude?: number | null
  accuracy?: number | null
  speed?: number | null
  heading?: number | null
  city?: string
  region?: string
  country?: string
  postcode?: string
  road?: string
  displayName?: string
  source: 'gps' | 'ip' | 'network' | 'manual'
  updatedAt: string
}

let latestUserLocation: ServerLocationData | null = null

export function getLatestLocation(): ServerLocationData | null {
  return latestUserLocation
}

export function setLatestLocation(loc: ServerLocationData) {
  latestUserLocation = {
    ...loc,
    updatedAt: new Date().toISOString()
  }
}
