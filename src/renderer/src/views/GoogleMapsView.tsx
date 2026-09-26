import React, { useState, useEffect, useCallback, useRef } from 'react'
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps'
import { motion } from 'framer-motion'
import {
  RiCompass3Line,
  RiMapPin2Line,
  RiCrosshair2Line,
  RiDatabase2Line,
  RiAddLine,
  RiRefreshLine,
  RiCheckLine,
  RiAlertLine
} from 'react-icons/ri'

interface MarkerItem {
  id?: number
  title: string
  latitude: number
  longitude: number
  category?: string
  notes?: string
  createdAt?: string
}

const DEFAULT_CENTER = { lat: 1.3521, lng: 103.8198 } // Default: Singapore / Southeast Asia region

export const GoogleMapsView = ({ glassPanel }: { glassPanel?: string }) => {
  const [apiKey, setApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || 'AIzaSyDwkI0b4rxHK22fKRtKwsJniLNI_pJjveM'
  )
  const [center, setCenter] = useState<{ lat: number; lng: number }>(DEFAULT_CENTER)
  const [zoom, setZoom] = useState<number>(13)
  const [mapTypeId, setMapTypeId] = useState<string>('hybrid')
  const [markers, setMarkers] = useState<MarkerItem[]>([])
  const [isLoadingMarkers, setIsLoadingMarkers] = useState(false)
  const [selectedMarker, setSelectedMarker] = useState<MarkerItem | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [newCategory, setNewCategory] = useState('waypoint')
  const [isSaving, setIsSaving] = useState(false)
  const [statusNotice, setStatusNotice] = useState<string | null>(null)
  const [userCoord, setUserCoord] = useState<{ lat: number; lng: number } | null>(null)

  // Fetch API key from server if needed
  useEffect(() => {
    if (!apiKey) {
      fetch('/api/maps/config')
        .then((r) => r.json())
        .then((d) => {
          if (d.apiKey) setApiKey(d.apiKey)
        })
        .catch(() => {})
    }
  }, [apiKey])

  // Get user browser live location
  const locateUser = useCallback(() => {
    if ('geolocation' in navigator) {
      setStatusNotice('Acquiring live GPS fix...')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude }
          setUserCoord(loc)
          setCenter(loc)
          setZoom(16)
          setStatusNotice(`Live coordinates locked: ${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)}`)
          setTimeout(() => setStatusNotice(null), 3500)
        },
        (err) => {
          console.warn('Geolocation error:', err)
          setStatusNotice('GPS access restricted or unavailable.')
          setTimeout(() => setStatusNotice(null), 3000)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }
  }, [])

  // Load Cloud SQL markers
  const loadMarkers = useCallback(async () => {
    setIsLoadingMarkers(true)
    try {
      const res = await fetch('/api/db/markers')
      const data = await res.json()
      if (data.success && Array.isArray(data.markers)) {
        setMarkers(data.markers)
      }
    } catch (e) {
      console.warn('Failed to load markers from Cloud SQL:', e)
    } finally {
      setIsLoadingMarkers(false)
    }
  }, [])

  useEffect(() => {
    loadMarkers()
    locateUser()
  }, [loadMarkers, locateUser])

  // Save marker to Cloud SQL
  const handleSaveMarker = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    setIsSaving(true)
    try {
      const payload = {
        uid: 'usr_kumarimamta87565',
        title: newTitle.trim(),
        latitude: center.lat,
        longitude: center.lng,
        category: newCategory,
        notes: newNotes.trim()
      }

      const res = await fetch('/api/db/markers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (data.success && data.marker) {
        setMarkers((prev) => [data.marker, ...prev])
        setNewTitle('')
        setNewNotes('')
        setStatusNotice('Waypoint committed to Cloud SQL database.')
        setTimeout(() => setStatusNotice(null), 3000)
      }
    } catch (err) {
      console.error('Failed saving marker:', err)
      setStatusNotice('Error writing to Cloud SQL.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full w-full gap-3 overflow-hidden text-zinc-100 font-mono">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-zinc-950/80 border border-white/10 rounded-xl backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <RiCompass3Line size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs tracking-wider uppercase text-zinc-100">
                Google Maps Spatial Engine
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                GHP PROVISIONED
              </span>
            </div>
            <p className="text-[10px] text-zinc-400">
              Live GIS telemetry, satellite overlays & Cloud SQL waypoint sync (asia-southeast1)
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {/* Map Type toggle */}
          <div className="flex bg-zinc-900 border border-white/10 rounded-lg p-0.5 text-[10px]">
            {['hybrid', 'roadmap', 'satellite', 'terrain'].map((type) => (
              <button
                key={type}
                onClick={() => setMapTypeId(type)}
                className={`px-2 py-1 rounded capitalize transition-colors ${
                  mapTypeId === type
                    ? 'bg-emerald-500/20 text-emerald-300 font-bold'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          <button
            onClick={locateUser}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-emerald-400 text-xs rounded-lg transition-colors"
            title="Lock Current Live GPS"
          >
            <RiCrosshair2Line size={14} />
            <span className="hidden sm:inline text-[11px]">GPS Fix</span>
          </button>

          <button
            onClick={loadMarkers}
            disabled={isLoadingMarkers}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 text-xs rounded-lg transition-colors"
            title="Refresh Cloud SQL Markers"
          >
            <RiRefreshLine size={14} className={isLoadingMarkers ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {statusNotice && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 rounded-lg animate-fade-in">
          <RiCheckLine size={14} />
          <span>{statusNotice}</span>
        </div>
      )}

      {/* Main Map & HUD Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-4 gap-3 overflow-hidden">
        {/* Map Canvas - 3 Cols on LG */}
        <div className="lg:col-span-3 h-full min-h-[350px] relative rounded-xl overflow-hidden border border-white/10 bg-zinc-950 shadow-2xl">
          {apiKey ? (
            <APIProvider apiKey={apiKey}>
              <Map
                center={center}
                zoom={zoom}
                mapTypeId={mapTypeId}
                onCenterChanged={(e) => setCenter(e.detail.center)}
                onZoomChanged={(e) => setZoom(e.detail.zoom)}
                className="w-full h-full"
                gestureHandling="greedy"
                disableDefaultUI={false}
              >
                {/* Live GPS Marker */}
                {userCoord && <Marker position={userCoord} title="Current Verified GPS Location" />}

                {/* Cloud SQL Waypoints */}
                {markers.map((m, idx) => (
                  <Marker
                    key={m.id || idx}
                    position={{ lat: Number(m.latitude), lng: Number(m.longitude) }}
                    title={m.title}
                    onClick={() => setSelectedMarker(m)}
                  />
                ))}
              </Map>
            </APIProvider>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 gap-2 p-6">
              <RiAlertLine size={24} className="text-yellow-400" />
              <p className="text-xs">Google Maps API key initializing...</p>
            </div>
          )}

          {/* Floating Telemetry Crosshair Badge */}
          <div className="absolute bottom-3 left-3 bg-black/80 backdrop-blur-md border border-white/10 rounded-lg p-2 text-[10px] space-y-0.5 pointer-events-none">
            <div className="text-zinc-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>LAT: {center.lat.toFixed(5)}</span>
              <span>LNG: {center.lng.toFixed(5)}</span>
            </div>
            <div className="text-zinc-500">
              ZOOM: {zoom}x | PROJECTION: WGS-84 | REGION: ASIA-SOUTHEAST1
            </div>
          </div>
        </div>

        {/* Sidebar: Cloud SQL Waypoints & Creation */}
        <div className="flex flex-col gap-3 h-full overflow-hidden">
          {/* Add Waypoint Form */}
          <div className="p-3 bg-zinc-950/80 border border-white/10 rounded-xl space-y-2 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold uppercase tracking-wider">
              <RiAddLine size={14} />
              <span>Record Waypoint</span>
            </div>

            <form onSubmit={handleSaveMarker} className="space-y-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Waypoint Label / Name"
                className="w-full bg-zinc-900 border border-white/10 rounded px-2.5 py-1.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                required
              />

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-[11px] text-zinc-200 focus:outline-none focus:border-emerald-500"
                >
                  <option value="waypoint">Waypoint</option>
                  <option value="base">Command Base</option>
                  <option value="anomaly">Spatial Anomaly</option>
                  <option value="poi">Point of Interest</option>
                </select>

                <input
                  type="text"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Notes / intel"
                  className="bg-zinc-900 border border-white/10 rounded px-2 py-1.5 text-[11px] text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="text-[10px] text-zinc-500 flex justify-between">
                <span>Targets Crosshair:</span>
                <span>
                  {center.lat.toFixed(4)}, {center.lng.toFixed(4)}
                </span>
              </div>

              <button
                type="submit"
                disabled={isSaving || !newTitle.trim()}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold rounded uppercase tracking-wider transition-colors"
              >
                <RiDatabase2Line size={13} />
                <span>{isSaving ? 'Writing to SQL...' : 'Commit to Cloud SQL'}</span>
              </button>
            </form>
          </div>

          {/* Markers List */}
          <div className="flex-1 min-h-0 bg-zinc-950/80 border border-white/10 rounded-xl p-3 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between pb-2 border-b border-white/5 shrink-0">
              <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider">
                Waypoints ({markers.length})
              </span>
              <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                PostgreSQL Cloud SQL
              </span>
            </div>

            <div className="flex-1 overflow-y-auto mt-2 space-y-1.5 pr-1 text-xs">
              {markers.length === 0 ? (
                <div className="text-center py-6 text-zinc-500 text-[11px]">
                  No saved waypoints in Cloud SQL database. Pan map and click 'Commit to Cloud SQL'.
                </div>
              ) : (
                markers.map((m) => (
                  <div
                    key={m.id}
                    onClick={() => {
                      setCenter({ lat: Number(m.latitude), lng: Number(m.longitude) })
                      setZoom(16)
                      setSelectedMarker(m)
                    }}
                    className={`p-2 rounded-lg border cursor-pointer transition-all ${
                      selectedMarker?.id === m.id
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-zinc-900/60 border-white/5 hover:border-white/20 text-zinc-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[11px] text-zinc-100">{m.title}</span>
                      <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
                        {m.category || 'waypoint'}
                      </span>
                    </div>
                    <div className="text-[10px] text-zinc-400 mt-1">
                      {Number(m.latitude).toFixed(4)}, {Number(m.longitude).toFixed(4)}
                    </div>
                    {m.notes && <div className="text-[10px] text-zinc-500 mt-0.5">{m.notes}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default GoogleMapsView
