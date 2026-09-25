/**
 * TimeProvider Implementation
 * Real-time time, timezone, date, and UTC offset calculations.
 */

import { TimeData, TimeProvider } from '../types'

export class DefaultTimeProvider implements TimeProvider {
  public name = 'DefaultTimeProvider'

  public async getTime(locationStr?: string): Promise<TimeData> {
    const now = new Date()

    if (!locationStr || locationStr.toLowerCase().includes('local') || locationStr.toLowerCase().includes('here')) {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
      return {
        location: 'Local Time',
        timezone: timeZone,
        localTime: now.toLocaleTimeString('en-US', { timeZone, hour12: true }),
        date: now.toLocaleDateString('en-US', { timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        utcOffset: `UTC${this.getUtcOffsetString(now, timeZone)}`
      }
    }

    // Common global timezone mapping
    const target = locationStr.trim().toLowerCase()
    let timeZone = 'UTC'

    if (target.includes('tokyo') || target.includes('japan')) timeZone = 'Asia/Tokyo'
    else if (target.includes('london') || target.includes('uk')) timeZone = 'Europe/London'
    else if (target.includes('new york') || target.includes('nyc')) timeZone = 'America/New_York'
    else if (target.includes('paris') || target.includes('france')) timeZone = 'Europe/Paris'
    else if (target.includes('sydney') || target.includes('australia')) timeZone = 'Australia/Sydney'
    else if (target.includes('india') || target.includes('delhi') || target.includes('mumbai')) timeZone = 'Asia/Kolkata'
    else if (target.includes('san francisco') || target.includes('california')) timeZone = 'America/Los_Angeles'

    try {
      return {
        location: locationStr,
        timezone: timeZone,
        localTime: now.toLocaleTimeString('en-US', { timeZone, hour12: true }),
        date: now.toLocaleDateString('en-US', { timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        utcOffset: `UTC${this.getUtcOffsetString(now, timeZone)}`
      }
    } catch (_e) {
      return {
        location: locationStr,
        timezone: 'UTC',
        localTime: now.toUTCString(),
        date: now.toISOString().split('T')[0],
        utcOffset: 'UTC+0'
      }
    }
  }

  private getUtcOffsetString(date: Date, timeZone: string): string {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        timeZoneName: 'shortOffset'
      }).formatToParts(date)
      const tzPart = parts.find((p) => p.type === 'timeZoneName')
      return tzPart ? tzPart.value.replace('GMT', '') : ''
    } catch (_e) {
      return ''
    }
  }
}

export const defaultTimeProvider = new DefaultTimeProvider()
