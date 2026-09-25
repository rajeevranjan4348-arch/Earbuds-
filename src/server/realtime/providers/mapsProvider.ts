/**
 * MapsProvider Implementation
 */

import { MapsProvider, PlaceResult } from '../types'
import { getLatestLocation } from '../../location/service'

export class DefaultMapsProvider implements MapsProvider {
  public name = 'DefaultMapsProvider'

  public async searchPlace(query: string, _location?: string): Promise<PlaceResult[]> {
    const loc = getLatestLocation()
    const baseLat = loc?.latitude || 37.7749
    const baseLng = loc?.longitude || -122.4194

    return [
      {
        name: query,
        address: `${query}, Near Current Location`,
        latitude: baseLat + 0.005,
        longitude: baseLng + 0.005,
        rating: 4.6,
        openNow: true,
        types: ['point_of_interest', 'establishment']
      }
    ]
  }

  public async getDirections(origin: string, destination: string): Promise<{ distance: string; duration: string; steps: string[] }> {
    return {
      distance: '4.2 km',
      duration: '12 mins',
      steps: [
        `Head north towards ${destination}`,
        `Turn right onto Main Street`,
        `Arrive at ${destination}`
      ]
    }
  }
}

export const defaultMapsProvider = new DefaultMapsProvider()
