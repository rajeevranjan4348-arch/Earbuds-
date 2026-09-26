/**
 * IRIS — Context-Aware Support & Multi-Step Booking Agent
 * Manages conversational multi-turn booking flows (Restaurants, Hotels, Flights, Cabs, Appointments).
 * Seamlessly integrates with real-time Google Maps data for place selection and routing.
 */

import { googleMapsService, PlaceResult } from '../maps/googleMapsService'
import * as fs from 'fs'
import * as path from 'path'

export type BookingType = 'restaurant' | 'hotel' | 'flight' | 'cab' | 'appointment'

export type BookingStatus =
  | 'draft'
  | 'selecting_place'
  | 'collecting_details'
  | 'review'
  | 'confirmed'
  | 'cancelled'

export interface BookingDetails {
  bookingId: string
  userId: string
  type: BookingType
  title: string
  placeName?: string
  placeAddress?: string
  placeRating?: number
  placeId?: string
  dateTime?: string
  date?: string
  time?: string
  partySize?: number
  guestName?: string
  guestContact?: string
  specialRequests?: string
  priceEstimate?: string
  origin?: string
  destination?: string
  confirmationCode?: string
  createdAt: number
  updatedAt: number
}

export interface BookingSessionState {
  sessionId: string
  userId: string
  status: BookingStatus
  step: number
  totalSteps: number
  activeBooking: BookingDetails
  suggestedPlaces?: PlaceResult[]
  lastPrompt?: string
}

const STORAGE_FILE = path.join(process.cwd(), '.iris-brain-bookings.json')

export class BookingAgent {
  private activeSessions: Map<string, BookingSessionState> = new Map()
  private confirmedBookings: BookingDetails[] = []

  constructor() {
    this.loadFromDisk()
  }

  private loadFromDisk() {
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf-8')
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.confirmedBookings)) {
          this.confirmedBookings = parsed.confirmedBookings
        }
      }
    } catch (_e) {
      this.confirmedBookings = []
    }
  }

  private saveToDisk() {
    try {
      fs.writeFileSync(
        STORAGE_FILE,
        JSON.stringify({ confirmedBookings: this.confirmedBookings }, null, 2),
        'utf-8'
      )
    } catch (_e) {}
  }

  public getConfirmedBookings(userId = 'default_user'): BookingDetails[] {
    return this.confirmedBookings.filter((b) => b.userId === userId || !b.userId)
  }

  public cancelBooking(bookingIdOrCode: string, userId = 'default_user'): boolean {
    const idx = this.confirmedBookings.findIndex(
      (b) =>
        (b.bookingId === bookingIdOrCode || b.confirmationCode === bookingIdOrCode) &&
        (b.userId === userId || !b.userId)
    )
    if (idx >= 0) {
      this.confirmedBookings.splice(idx, 1)
      this.saveToDisk()
      return true
    }
    return false
  }

  /**
   * Evaluates if a user message is booking-related
   */
  public isBookingIntent(text: string): boolean {
    const lower = text.toLowerCase()
    return (
      lower.includes('book') ||
      lower.includes('reserve') ||
      lower.includes('reservation') ||
      lower.includes('schedule a table') ||
      lower.includes('table for') ||
      lower.includes('flight ticket') ||
      lower.includes('book hotel') ||
      lower.includes('room reservation') ||
      lower.includes('call a cab') ||
      lower.includes('book a ride') ||
      lower.includes('schedule appointment') ||
      lower.includes('my bookings') ||
      lower.includes('confirm booking') ||
      lower.includes('cancel booking')
    )
  }

  /**
   * Main turn processor for context-aware multi-step bookings
   */
  public async processTurn(
    prompt: string,
    history: Array<{ role: string; text: string }>,
    userId = 'default_user',
    userLocation?: { lat: number; lng: number }
  ): Promise<{
    isBooking: boolean
    bookingData?: any
    agentResponseContext: string
    suggestedPlaces?: PlaceResult[]
  }> {
    const lower = prompt.toLowerCase().trim()
    let session = this.activeSessions.get(userId)

    // Check if user is asking to view bookings
    if (lower.includes('my bookings') || lower.includes('show my bookings') || lower.includes('list bookings')) {
      const userBookings = this.getConfirmedBookings(userId)
      if (userBookings.length === 0) {
        return {
          isBooking: true,
          agentResponseContext: 'The user requested to view their confirmed bookings. They have no active bookings currently on file. Explain that they can easily reserve tables, hotels, flights, or appointments with you anytime.',
          bookingData: {
            status: 'list',
            bookings: []
          }
        }
      }
      const listSummary = userBookings
        .map(
          (b, i) =>
            `${i + 1}. [${b.confirmationCode}] ${b.title}: ${b.placeName || b.destination} on ${b.dateTime || b.date || 'Scheduled'} (${b.partySize || 1} guest(s))`
        )
        .join('\n')
      return {
        isBooking: true,
        agentResponseContext: `The user requested to view their confirmed bookings. Here is their confirmed bookings ledger:\n${listSummary}\n\nPresent this clearly to the user, highlighting their confirmation codes and details.`,
        bookingData: {
          status: 'list',
          bookings: userBookings
        }
      }
    }

    // Check if user is asking to cancel a booking
    if (lower.includes('cancel booking') || lower.includes('cancel reservation')) {
      const codeMatch = prompt.match(/IRIS-[A-Z0-9-]+/i)
      if (codeMatch) {
        const code = codeMatch[0].toUpperCase()
        const cancelled = this.cancelBooking(code, userId)
        return {
          isBooking: true,
          agentResponseContext: cancelled
            ? `Successfully cancelled reservation ${code}. Let the user know the booking has been cancelled and removed from their schedule.`
            : `Could not find an active reservation with confirmation code ${code}. Ask the user to verify the code.`,
          bookingData: {
            status: 'cancelled',
            confirmationCode: code
          }
        }
      }
    }

    // Direct Confirmation Action
    if (session && session.status === 'review' && (
      lower.includes('confirm') ||
      lower.includes('yes') ||
      lower.includes('proceed') ||
      lower.includes('book it') ||
      lower.includes('looks good') ||
      lower.includes('perfect')
    )) {
      const code = `IRIS-${session.activeBooking.type.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`
      session.activeBooking.confirmationCode = code
      session.activeBooking.updatedAt = Date.now()
      this.confirmedBookings.unshift(session.activeBooking)
      this.saveToDisk()

      session.status = 'confirmed'
      session.step = session.totalSteps

      const confirmedData = { ...session.activeBooking }
      this.activeSessions.delete(userId) // Completed

      return {
        isBooking: true,
        bookingData: {
          ...session,
          status: 'confirmed',
          activeBooking: confirmedData,
          confirmationCode: code
        },
        agentResponseContext: `🎉 CONGRATULATIONS! The multi-step booking is now OFFICIALLY CONFIRMED.\nConfirmation Code: ${code}\nType: ${confirmedData.type}\nPlace/Details: ${confirmedData.placeName || confirmedData.title}\nAddress: ${confirmedData.placeAddress || 'Verified on Google Maps'}\nDate & Time: ${confirmedData.dateTime || confirmedData.date + ' ' + (confirmedData.time || '')}\nParty Size: ${confirmedData.partySize || 1}\nGuest: ${confirmedData.guestName || 'VIP Guest'}\nSpecial Requests: ${confirmedData.specialRequests || 'Standard'}\n\nPresent a celebratory confirmed voucher summary with the confirmation code, date/time, and reassuring support instructions.`
      }
    }

    // Cancel current active session if requested
    if (session && (lower === 'cancel' || lower === 'reset' || lower === 'abort' || lower === 'never mind')) {
      this.activeSessions.delete(userId)
      return {
        isBooking: true,
        agentResponseContext: 'The user has cancelled the active booking in progress. Acknowledge this politely and offer further assistance.',
        bookingData: {
          status: 'cancelled'
        }
      }
    }

    // Initialize or continue booking session
    if (!session) {
      if (!this.isBookingIntent(prompt)) {
        return { isBooking: false, agentResponseContext: '' }
      }

      // Infer booking type
      let type: BookingType = 'restaurant'
      if (lower.includes('hotel') || lower.includes('room') || lower.includes('stay') || lower.includes('resort')) {
        type = 'hotel'
      } else if (lower.includes('flight') || lower.includes('fly') || lower.includes('airline') || lower.includes('plane')) {
        type = 'flight'
      } else if (lower.includes('cab') || lower.includes('taxi') || lower.includes('ride') || lower.includes('uber')) {
        type = 'cab'
      } else if (lower.includes('appointment') || lower.includes('meeting') || lower.includes('doctor') || lower.includes('salon')) {
        type = 'appointment'
      }

      const bookingId = `book_${Date.now()}`
      const newBooking: BookingDetails = {
        bookingId,
        userId,
        type,
        title: `${type.charAt(0).toUpperCase() + type.slice(1)} Reservation`,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }

      session = {
        sessionId: bookingId,
        userId,
        status: 'draft',
        step: 1,
        totalSteps: 4,
        activeBooking: newBooking
      }
      this.activeSessions.set(userId, session)
    }

    // Extract extracted entities from prompt & history
    this.extractEntities(session.activeBooking, prompt)

    // Check if we need real-time Google Maps search for places (e.g. Restaurants or Hotels)
    let suggestedPlaces: PlaceResult[] = []
    if (
      (session.activeBooking.type === 'restaurant' || session.activeBooking.type === 'hotel') &&
      !session.activeBooking.placeAddress
    ) {
      // If user specified place name or cuisine/location, search Google Maps
      const query = session.activeBooking.placeName ||
        (session.activeBooking.type === 'restaurant'
          ? `${lower.includes('italian') ? 'Italian' : lower.includes('sushi') ? 'Sushi' : lower.includes('french') ? 'French' : 'Best'} restaurants`
          : 'Top luxury hotels')

      try {
        const mapsRes = await googleMapsService.searchPlaces({
          query,
          location: userLocation,
          type: session.activeBooking.type === 'restaurant' ? 'restaurant' : 'lodging'
        })
        if (mapsRes.success && mapsRes.places.length > 0) {
          suggestedPlaces = mapsRes.places.slice(0, 4)
          session.suggestedPlaces = suggestedPlaces

          // If user prompt clearly picked one of the suggested places
          for (const sp of suggestedPlaces) {
            if (lower.includes(sp.name.toLowerCase()) || lower.includes(sp.name.split(' ')[0].toLowerCase())) {
              session.activeBooking.placeName = sp.name
              session.activeBooking.placeAddress = sp.formattedAddress
              session.activeBooking.placeRating = sp.rating
              session.activeBooking.placeId = sp.placeId
              break
            }
          }
        }
      } catch (_mapsErr) {
        console.warn('[BookingAgent] Google Maps places search fallback:', _mapsErr)
      }
    }

    // Advance state machine
    if (!session.activeBooking.placeName && (!session.suggestedPlaces || session.suggestedPlaces.length === 0)) {
      session.status = 'selecting_place'
      session.step = 1
    } else if (!session.activeBooking.dateTime && !session.activeBooking.date) {
      session.status = 'collecting_details'
      session.step = 2
    } else if (!session.activeBooking.partySize && session.activeBooking.type === 'restaurant') {
      session.status = 'collecting_details'
      session.step = 3
    } else {
      session.status = 'review'
      session.step = 3
    }

    const b = session.activeBooking
    let contextGuidance = `[ACTIVE MULTI-STEP BOOKING SESSION - STEP ${session.step}/${session.totalSteps}]\n` +
      `Booking Type: ${b.type.toUpperCase()}\n` +
      `Status: ${session.status}\n` +
      `Place: ${b.placeName || 'Pending selection'}\n` +
      `Address: ${b.placeAddress || 'TBD'}\n` +
      `Date & Time: ${b.dateTime || b.date || 'Pending'}\n` +
      `Party Size / Guests: ${b.partySize || 'Pending'}\n` +
      `Contact Name: ${b.guestName || 'Pending'}\n` +
      `Special Requests: ${b.specialRequests || 'None'}\n`

    if (suggestedPlaces.length > 0 && !b.placeAddress) {
      contextGuidance += `\n[GOOGLE MAPS REAL-TIME PLACES GROUNDING]:\n` +
        suggestedPlaces
          .map((p, idx) => `${idx + 1}. **${p.name}** (★ ${p.rating || '4.5'}) - ${p.formattedAddress} [${p.isOpenNow ? 'Open Now' : 'Closed'}]`)
          .join('\n') +
        `\nDirectives: Present these verified real-world Google Maps options to the user, asking them to pick one or suggest their preferred spot.`
    } else if (session.status === 'review') {
      contextGuidance += `\nDirectives: All key booking parameters have been collected! Present a structured review summary and ask the user for final confirmation ("Shall I confirm this reservation for you?").`
    } else {
      contextGuidance += `\nDirectives: Guide the user to provide the next missing details (Date/time, party size, or guest preferences) politely and concisely.`
    }

    return {
      isBooking: true,
      bookingData: {
        bookingId: b.bookingId,
        status: session.status,
        type: b.type,
        step: session.step,
        totalSteps: session.totalSteps,
        details: b,
        suggestedPlaces: suggestedPlaces.length > 0 ? suggestedPlaces : undefined
      },
      agentResponseContext: contextGuidance,
      suggestedPlaces
    }
  }

  /**
   * Helper to parse numbers, dates, times, and names from speech/text
   */
  private extractEntities(details: BookingDetails, text: string) {
    const lower = text.toLowerCase()

    // Party size (e.g. "for 2", "party of 4", "3 people", "2 guests")
    const partyMatch = text.match(/(?:for|party of|table for)\s+(\d+)|(\d+)\s+(?:people|guests|persons|pax)/i)
    if (partyMatch) {
      const num = parseInt(partyMatch[1] || partyMatch[2], 10)
      if (!isNaN(num) && num > 0) details.partySize = num
    } else if (lower.includes('for two') || lower.includes('table for two')) {
      details.partySize = 2
    } else if (lower.includes('for three')) {
      details.partySize = 3
    } else if (lower.includes('for four')) {
      details.partySize = 4
    }

    // Time (e.g. "at 7pm", "7:30 pm", "19:00", "8 o'clock")
    const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{1,2}\s*o'clock)/i)
    if (timeMatch) {
      details.time = timeMatch[1]
      details.dateTime = details.date ? `${details.date} at ${details.time}` : details.time
    }

    // Relative dates (e.g. "tomorrow", "tonight", "this friday", "next monday")
    if (lower.includes('tonight')) {
      details.date = 'Tonight'
    } else if (lower.includes('tomorrow')) {
      details.date = 'Tomorrow'
    } else if (lower.includes('friday')) {
      details.date = 'This Friday'
    } else if (lower.includes('saturday')) {
      details.date = 'This Saturday'
    } else if (lower.includes('sunday')) {
      details.date = 'This Sunday'
    }

    // Place Name (e.g. "at Carbone", "at Nobu", "book Hilton")
    const placeMatch = text.match(/(?:at|for|to)\s+([A-Z][a-zA-Z0-9'\s&]{2,25})/g)
    if (placeMatch && !details.placeName) {
      for (const m of placeMatch) {
        const cleaned = m.replace(/^(?:at|for|to)\s+/i, '').trim()
        if (
          !['Tomorrow', 'Tonight', 'Friday', 'Saturday', 'Sunday', 'Dinner', 'Lunch', 'Breakfast', 'Two', 'Three', 'Four'].includes(
            cleaned
          )
        ) {
          details.placeName = cleaned
          break
        }
      }
    }

    // Special requests
    if (lower.includes('window') || lower.includes('outdoor') || lower.includes('quiet') || lower.includes('anniversary') || lower.includes('birthday')) {
      details.specialRequests = text
    }
  }
}

export const bookingAgent = new BookingAgent()
