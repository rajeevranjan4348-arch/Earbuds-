import { useEffect } from 'react'

/**
 * App-wide buttery-smooth wheel scrolling.
 *
 * Instead of letting the browser jump scrollTop by the raw wheel delta each
 * tick (which feels stepped, especially on 120Hz+ trackpads/mice), this
 * intercepts wheel events, finds the nearest scrollable ancestor under the
 * cursor, and eases that element's native `scrollTop` toward the accumulated
 * target every animation frame using delta-time normalized interpolation —
 * identical perceived speed at 60/90/120/144/240Hz.
 *
 * Native scrollbars, drag-to-scroll, and touch/trackpad momentum are left
 * completely alone (only `wheel` is intercepted), so nothing about existing
 * scroll containers needs to change.
 */

const BASE_EASE = 0.22 // higher = snappier, lower = floatier
const SNAP_EPSILON = 0.5
const MAX_DT_MS = 50 // clamp huge frame gaps (tab switches, GC pauses)

interface ScrollState {
  target: number
  current: number
  raf: number | null
  lastTime: number
}

function isScrollable(el: Element): boolean {
  const style = window.getComputedStyle(el)
  const overflowY = style.overflowY
  if (overflowY !== 'auto' && overflowY !== 'scroll') return false
  return el.scrollHeight > el.clientHeight + 1
}

function findScrollableAncestor(start: EventTarget | null): HTMLElement | null {
  let el = start as HTMLElement | null
  while (el && el !== document.body && el !== document.documentElement) {
    if (isScrollable(el)) return el
    el = el.parentElement
  }
  return null
}

export function useGlobalSmoothScroll(enabled: boolean = true): void {
  useEffect(() => {
    if (!enabled) return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReducedMotion) return

    const states = new WeakMap<HTMLElement, ScrollState>()

    const tick = (el: HTMLElement, state: ScrollState, now: number) => {
      const dt = Math.min(now - state.lastTime, MAX_DT_MS)
      state.lastTime = now

      const dtEase = 1 - Math.pow(1 - BASE_EASE, dt / (1000 / 60))
      state.current += (state.target - state.current) * dtEase

      if (Math.abs(state.target - state.current) < SNAP_EPSILON) {
        state.current = state.target
        el.scrollTop = state.current
        state.raf = null
        return
      }

      el.scrollTop = state.current
      state.raf = requestAnimationFrame((t) => tick(el, state, t))
    }

    const onWheel = (e: WheelEvent) => {
      // Let modifier-key zoom/native gestures pass through untouched
      if (e.ctrlKey || e.metaKey) return

      const target = findScrollableAncestor(e.target)
      if (!target) return

      // Normalize line/page delta modes to pixels roughly
      let delta = e.deltaY
      if (e.deltaMode === 1) delta *= 16
      else if (e.deltaMode === 2) delta *= target.clientHeight

      const maxScroll = target.scrollHeight - target.clientHeight
      let state = states.get(target)
      if (!state) {
        state = { target: target.scrollTop, current: target.scrollTop, raf: null, lastTime: performance.now() }
        states.set(target, state)
      }

      const nextTarget = Math.max(0, Math.min(maxScroll, state.target + delta))

      // If already at an edge and trying to go further, let the event
      // bubble so parent scrollables (or nothing) can handle it.
      if (nextTarget === state.target && (nextTarget === 0 || nextTarget === maxScroll)) {
        return
      }

      e.preventDefault()
      state.target = nextTarget

      if (state.raf == null) {
        state.lastTime = performance.now()
        state.raf = requestAnimationFrame((t) => tick(target, state!, t))
      }
    }

    window.addEventListener('wheel', onWheel, { passive: false, capture: true })
    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions)
    }
  }, [enabled])
}
