import React, { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Calendar,
  Clock,
  Users,
  MapPin,
  CheckCircle,
  AlertCircle,
  Check,
  X,
  FileCheck,
  Navigation,
  Utensils,
  Hotel,
  Plane,
  Car,
  CalendarDays
} from 'lucide-react'

export interface BookingData {
  bookingId: string
  status: 'draft' | 'selecting_place' | 'collecting_details' | 'review' | 'confirmed' | 'cancelled' | 'list'
  type: 'restaurant' | 'hotel' | 'flight' | 'cab' | 'appointment'
  step?: number
  totalSteps?: number
  details?: {
    title?: string
    placeName?: string
    placeAddress?: string
    dateTime?: string
    partySize?: number
    guestName?: string
    guestContact?: string
    specialRequests?: string
    confirmationCode?: string
  }
  bookings?: any[]
  confirmationCode?: string
}

interface BookingCardProps {
  data: BookingData
  onAction?: (actionText: string) => void
}

export const BookingCard: React.FC<BookingCardProps> = ({ data, onAction }) => {
  const [isConfirming, setIsConfirming] = useState(false)

  if (!data) return null

  const isConfirmed = data.status === 'confirmed' || Boolean(data.confirmationCode)
  const isReview = data.status === 'review'
  const isCancelled = data.status === 'cancelled'
  const d = data.details || {}
  const code = data.confirmationCode || d.confirmationCode

  const getTypeIcon = () => {
    switch (data.type) {
      case 'hotel':
        return <Hotel size={14} />
      case 'flight':
        return <Plane size={14} />
      case 'cab':
        return <Car size={14} />
      case 'appointment':
        return <CalendarDays size={14} />
      default:
        return <Utensils size={14} />
    }
  }

  // If this is a list of bookings
  if (data.status === 'list' && Array.isArray(data.bookings)) {
    return (
      <div className="flex flex-col gap-2 my-2.5 w-full rounded-2xl bg-zinc-900/90 border border-emerald-500/25 p-3.5 shadow-lg">
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400">
            <Calendar size={13} />
            <span>Active Reservations & Bookings ({data.bookings.length})</span>
          </div>
        </div>
        <div className="space-y-2 mt-1">
          {data.bookings.map((b, idx) => (
            <div
              key={b.bookingId || idx}
              className="p-2.5 rounded-xl bg-black/40 border border-white/5 flex flex-col gap-1 text-[11px]"
            >
              <div className="flex items-center justify-between font-mono">
                <span className="text-emerald-400 font-bold">{b.confirmationCode}</span>
                <span className="text-zinc-500 capitalize">{b.type}</span>
              </div>
              <div className="font-semibold text-zinc-100">{b.placeName || b.title}</div>
              <div className="text-zinc-400 flex items-center gap-2">
                <span>{b.dateTime || b.date}</span>
                {b.partySize && <span>• {b.partySize} guests</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      className={`flex flex-col gap-2.5 my-2.5 w-full rounded-2xl p-4 shadow-xl border relative overflow-hidden ${
        isConfirmed
          ? 'bg-gradient-to-br from-emerald-950/60 via-zinc-900/90 to-zinc-950 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
          : isCancelled
            ? 'bg-zinc-900/80 border-rose-500/30'
            : 'bg-zinc-900/95 border-emerald-500/25'
      }`}
    >
      {/* Header & Step Tracker */}
      <div className="flex items-center justify-between pb-2.5 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded-xl border ${
              isConfirmed
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                : 'bg-white/5 text-zinc-300 border-white/10'
            }`}
          >
            {getTypeIcon()}
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-white tracking-wide">
              {d.placeName || d.title || 'Multi-Step Reservation'}
            </h4>
            <span className="text-[10px] font-mono text-emerald-400 capitalize">
              {isConfirmed ? 'Verified Booking Voucher' : `${data.type} Booking Workflow`}
            </span>
          </div>
        </div>

        {/* Step pill or Confirmation Badge */}
        {isConfirmed ? (
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold animate-pulse">
            <CheckCircle size={11} />
            <span>CONFIRMED</span>
          </div>
        ) : isCancelled ? (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-mono">
            <span>CANCELLED</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 text-zinc-300 border border-white/10 text-[10px] font-mono">
            <span>Step {data.step || 1} of {data.totalSteps || 4}</span>
          </div>
        )}
      </div>

      {/* Booking Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
        {d.placeAddress && (
          <div className="flex items-start gap-1.5 text-zinc-300 col-span-1 sm:col-span-2">
            <MapPin size={12} className="text-emerald-400 mt-0.5 shrink-0" />
            <span className="text-[11px] leading-snug">{d.placeAddress}</span>
          </div>
        )}

        {(d.dateTime || (d as any).date) && (
          <div className="flex items-center gap-1.5 text-zinc-300 bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5">
            <Clock size={12} className="text-emerald-400 shrink-0" />
            <span className="truncate">{d.dateTime || (d as any).date}</span>
          </div>
        )}

        {d.partySize !== undefined && (
          <div className="flex items-center gap-1.5 text-zinc-300 bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5">
            <Users size={12} className="text-emerald-400 shrink-0" />
            <span>{d.partySize} {d.partySize === 1 ? 'Guest' : 'Guests'}</span>
          </div>
        )}

        {d.guestName && (
          <div className="flex items-center gap-1.5 text-zinc-300 bg-black/40 px-2.5 py-1.5 rounded-lg border border-white/5">
            <span className="text-zinc-500 text-[10px]">Guest:</span>
            <span className="font-semibold text-white">{d.guestName}</span>
          </div>
        )}

        {d.specialRequests && (
          <div className="text-[11px] text-zinc-400 col-span-1 sm:col-span-2 italic">
            Note: "{d.specialRequests}"
          </div>
        )}
      </div>

      {/* Confirmed Code Display */}
      {isConfirmed && code && (
        <div className="mt-1 p-3 rounded-xl bg-black/60 border border-emerald-500/30 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-wider">
              Booking Reference
            </span>
            <span className="text-sm sm:text-base font-mono font-black text-emerald-400 tracking-widest">
              {code}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {d.placeName && onAction && (
              <button
                type="button"
                onClick={() => onAction(`directions to ${d.placeName}`)}
                className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 text-[10px] font-mono flex items-center gap-1 transition-all cursor-pointer border border-emerald-500/30"
              >
                <Navigation size={11} />
                <span>Navigate</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Interactive Action Buttons for Review / Confirmation */}
      {isReview && !isConfirmed && onAction && (
        <div className="pt-2 mt-1 border-t border-white/10 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onAction('Cancel reservation')}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-rose-500/15 text-zinc-400 hover:text-rose-300 border border-white/10 hover:border-rose-500/30 text-xs font-mono transition-all cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={() => {
              setIsConfirming(true)
              onAction('Confirm reservation')
            }}
            disabled={isConfirming}
            className="flex-1 px-4 py-2 rounded-xl bg-emerald-500 text-black hover:bg-emerald-400 font-mono font-bold text-xs flex items-center justify-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all cursor-pointer active:scale-95"
          >
            <Check size={13} strokeWidth={3} />
            <span>Confirm Reservation</span>
          </button>
        </div>
      )}
    </motion.div>
  )
}

export default BookingCard
