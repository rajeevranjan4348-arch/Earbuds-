/**
 * Server-side Location & Geocoding Service
 * Performs reverse geocoding via OpenStreetMap Nominatim and IP-based location fallback
 * with strict caching and failure-safe fallbacks.
 */

import { ServerLocationData, setLatestLocation, getLatestLocation } from './locationState'

interface ReverseGeocodeResult {
  city?: string
  region?: string
  country?: string
  postcode?: string
  road?: string
  displayName?: string
}

const geocodeCache = new Map<string, { data: ReverseGeocodeResult; expiresAt: number }>()

export class LocationService {
  /**
   * Reverse geocodes latitude and longitude to street/city/country
   */
  public async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
    const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`
    const cached = geocodeCache.get(cacheKey)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'IRIS-AI-Operating-Layer/2.0 (Spatial Telemetry Engine)',
          'Accept-Language': 'en'
        },
        signal: AbortSignal.timeout(6000)
      })

      if (!res.ok) {
        throw new Error(`Nominatim reverse geocode responded with ${res.status}`)
      }

      const json = (await res.json()) as any
      const addr = json.address || {}

      const result: ReverseGeocodeResult = {
        city:
          addr.city || addr.town || addr.village || addr.municipality || addr.county || addr.suburb,
        region: addr.state || addr.region || addr.province,
        country: addr.country,
        postcode: addr.postcode,
        road: addr.road || addr.pedestrian || addr.street,
        displayName: json.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
      }

      // Cache for 1 hour
      geocodeCache.set(cacheKey, { data: result, expiresAt: Date.now() + 3600000 })
      return result
    } catch (err) {
      console.warn('[LocationService] Reverse geocode error, using coordinates fallback:', err)
      return {
        displayName: `Lat: ${latitude.toFixed(4)}°, Lon: ${longitude.toFixed(4)}°`
      }
    }
  }

  /**
   * IP-based fallback when browser GPS is blocked or unavailable
   */
  public async getIpLocation(): Promise<ServerLocationData | null> {
    try {
      // Primary: ipapi.co
      const res = await fetch('https://ipapi.co/json/', {
        headers: { 'User-Agent': 'IRIS-AI-Operating-Layer/2.0' },
        signal: AbortSignal.timeout(5000)
      })

      if (res.ok) {
        const d = (await res.json()) as any
        if (typeof d.latitude === 'number' && typeof d.longitude === 'number') {
          const loc: ServerLocationData = {
            latitude: d.latitude,
            longitude: d.longitude,
            city: d.city,
            region: d.region,
            country: d.country_name || d.country,
            postcode: d.postal,
            displayName: `${d.city || ''}, ${d.region || ''}, ${d.country_name || ''}`
              .trim()
              .replace(/^,\s*|,\s*$/g, ''),
            source: 'ip',
            updatedAt: new Date().toISOString()
          }
          setLatestLocation(loc)
          return loc
        }
      }
    } catch (_err) {
      // Fallback: ip-api.com
      try {
        const res2 = await fetch(
          'http://ip-api.com/json/?fields=status,country,regionName,city,zip,lat,lon,timezone,query',
          {
            signal: AbortSignal.timeout(4000)
          }
        )
        if (res2.ok) {
          const d2 = (await res2.json()) as any
          if (d2.status === 'success' && typeof d2.lat === 'number' && typeof d2.lon === 'number') {
            const loc: ServerLocationData = {
              latitude: d2.lat,
              longitude: d2.lon,
              city: d2.city,
              region: d2.regionName,
              country: d2.country,
              postcode: d2.zip,
              displayName: `${d2.city || ''}, ${d2.regionName || ''}, ${d2.country || ''}`
                .trim()
                .replace(/^,\s*|,\s*$/g, ''),
              source: 'ip',
              updatedAt: new Date().toISOString()
            }
            setLatestLocation(loc)
            return loc
          }
        }
      } catch (_e) {
        // Silent
      }
    }

    return null
  }
}

export const locationService = new LocationService()
export { getLatestLocation, setLatestLocation }
