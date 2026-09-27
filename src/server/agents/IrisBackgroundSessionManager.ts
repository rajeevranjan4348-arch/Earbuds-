import { irisAgentRuntime } from './IrisAgentRuntime'

export interface BackgroundSession {
  id: string
  target: 'browser' | 'server' | 'android'
  startedAt: string
  lastHeartbeatAt: string
  active: boolean
}

class IrisBackgroundSessionManager {
  private sessions = new Map<string, BackgroundSession>()

  start(target: BackgroundSession['target']) {
    const id = 'bg_' + target + '_' + Date.now().toString(36)
    const timestamp = new Date().toISOString()
    const session: BackgroundSession = {
      id,
      target,
      startedAt: timestamp,
      lastHeartbeatAt: timestamp,
      active: true
    }
    this.sessions.set(id, session)
    return session
  }

  heartbeat(id: string) {
    const session = this.sessions.get(id)
    if (!session || !session.active) return null
    session.lastHeartbeatAt = new Date().toISOString()
    return session
  }

  stop(id: string) {
    const session = this.sessions.get(id)
    if (!session) return false
    session.active = false
    session.lastHeartbeatAt = new Date().toISOString()
    return true
  }

  stopAll() {
    for (const session of this.sessions.values()) session.active = false
    irisAgentRuntime.emergencyStop('Background sessions stopped by user')
    return this.getActive()
  }

  getActive() {
    return Array.from(this.sessions.values()).filter((session) => session.active)
  }

  getAll() {
    return Array.from(this.sessions.values())
  }
}

export const irisBackgroundSessionManager = new IrisBackgroundSessionManager()
