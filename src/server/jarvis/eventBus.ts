/**
 * JARVIS Observability Event Bus
 * Dispatches structured lifecycle events across agents, tools, permissions, and voice.
 */

import { AgentEventPayload, AgentEventType } from './types'

export type AgentEventListener = (event: AgentEventPayload) => void

export class AgentEventBus {
  private listeners: Map<AgentEventType | '*', Set<AgentEventListener>> = new Map()
  private recentEvents: AgentEventPayload[] = []
  private readonly maxRecent = 150

  public on(type: AgentEventType | '*', listener: AgentEventListener): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type)!.add(listener)

    return () => {
      this.listeners.get(type)?.delete(listener)
    }
  }

  public emit(type: AgentEventType, message: string, extra?: Partial<AgentEventPayload>): AgentEventPayload {
    const payload: AgentEventPayload = {
      type,
      message,
      timestamp: Date.now(),
      ...extra
    }

    this.recentEvents.push(payload)
    if (this.recentEvents.length > this.maxRecent) {
      this.recentEvents.shift()
    }

    // Specific listeners
    const specific = this.listeners.get(type)
    if (specific) {
      specific.forEach((fn) => {
        try {
          fn(payload)
        } catch (_e) {}
      })
    }

    // Wildcard listeners
    const wildcard = this.listeners.get('*')
    if (wildcard) {
      wildcard.forEach((fn) => {
        try {
          fn(payload)
        } catch (_e) {}
      })
    }

    return payload
  }

  public getRecentEvents(limit: number = 50): AgentEventPayload[] {
    return this.recentEvents.slice(-limit)
  }

  public clear() {
    this.recentEvents = []
  }
}

export const agentEventBus = new AgentEventBus()
