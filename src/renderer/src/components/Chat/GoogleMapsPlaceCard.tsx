import React from 'react'
import { motion } from 'framer-motion'
import {
  MapPin,
  Star,
  Clock,
  ExternalLink,
  Navigation,
  Calendar,
  CheckCircle2,
  BookmarkCheck
} from 'lucide-react'

export interface PlaceItem {
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

interface GoogleMapsPlaceCardProps {
  places: PlaceItem[]
  onSelectDirections?: (place: PlaceItem) => void
  onSelectBooking?: (place: PlaceItem) => void
}

export const GoogleMapsPlaceCard: React.FC<GoogleMapsPlaceCardProps> = ({
  places,
  onSelectDirections,
  onSelectBooking
}) => {
  if (!places || places.length === 0) return null

  return (
    <div className="flex flex-col gap-2.5 my-2.5 w-full">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-emerald-400">
          <MapPin size={13} className="text-emerald-400" />
          <span>Google Maps Places ({places.length} Verified)</span>
        </div>
        <span className="text-[10px] font-mono text-zinc-500">Live API</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
        {places.map((place, idx) => {
          const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            place.name + ' ' + place.formattedAddress
          )}&query_place_id=${place.placeId}`

          return (
            <motion.div
              key={place.placeId || idx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="flex flex-col justify-between p-3 rounded-xl bg-zinc-900/90 border border-emerald-500/20 hover:border-emerald-500/40 transition-all shadow-md group relative overflow-hidden"
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-1.5">
                  <h4 className="font-semibold text-xs sm:text-sm text-zinc-100 group-hover:text-emerald-300 transition-colors line-clamp-1">
                    {place.name}
                  </h4>
                  {place.isOpenNow !== undefined && (
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded-full shrink-0 font-medium ${
                        place.isOpenNow
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {place.isOpenNow ? 'Open Now' : 'Closed'}
                    </span>
                  )}
                </div>

                {place.rating !== undefined && (
                  <div className="flex items-center gap-1 text-[11px] font-mono text-amber-400">
                    <Star size={11} className="fill-amber-400 text-amber-400" />
                    <span className="font-bold">{place.rating.toFixed(1)}</span>
                    {place.userRatingsTotal && (
                      <span className="text-zinc-500 text-[10px]">
                        ({place.userRatingsTotal.toLocaleString()})
                      </span>
                    )}
                  </div>
                )}

                <p className="text-[11px] text-zinc-400 leading-snug line-clamp-2">
                  {place.formattedAddress}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="pt-2.5 mt-2 border-t border-white/5 flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  {onSelectDirections && (
                    <button
                      type="button"
                      onClick={() => onSelectDirections(place)}
                      className="px-2 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] font-mono flex items-center gap-1 transition-colors cursor-pointer border border-emerald-500/20"
                      title="Calculate route & directions to this place"
                    >
                      <Navigation size={10} />
                      <span>Directions</span>
                    </button>
                  )}

                  {onSelectBooking && (
                    <button
                      type="button"
                      onClick={() => onSelectBooking(place)}
                      className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold flex items-center gap-1 transition-colors cursor-pointer border border-emerald-500/35 shadow-sm"
                      title="Reserve table or book this location"
                    >
                      <BookmarkCheck size={10} />
                      <span>Book Here</span>
                    </button>
                  )}
                </div>

                <a
                  href={mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 rounded-lg text-zinc-500 hover:text-emerald-400 hover:bg-white/5 transition-colors"
                  title="View on Google Maps"
                >
                  <ExternalLink size={12} />
                </a>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

export default GoogleMapsPlaceCard
