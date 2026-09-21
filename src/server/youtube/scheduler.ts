/**
 * Automation Scheduler for YouTube Production Pipeline
 * Handles automated daily cron schedules (Discovery, Research, Generation, QC, Publish).
 */

import { AutomationScheduleConfig } from './types'
import { channelMemoryStore } from './channelMemory'

export class ProductionScheduler {
  private timerId: NodeJS.Timeout | null = null
  private onTriggerCallback?: (step: string) => Promise<void>

  constructor() {
    this.startSchedulerDaemon()
  }

  public registerTriggerCallback(cb: (step: string) => Promise<void>) {
    this.onTriggerCallback = cb
  }

  public getSchedule(): AutomationScheduleConfig {
    return channelMemoryStore.getScheduleConfig()
  }

  public updateSchedule(config: Partial<AutomationScheduleConfig>): AutomationScheduleConfig {
    const updated = channelMemoryStore.updateScheduleConfig(config)
    return updated
  }

  private startSchedulerDaemon() {
    if (this.timerId) {
      clearInterval(this.timerId)
    }

    // Check schedule every 60 seconds
    this.timerId = setInterval(() => {
      this.checkScheduledTriggers()
    }, 60000)
  }

  private checkScheduledTriggers() {
    const config = channelMemoryStore.getScheduleConfig()
    if (!config.enabled) return

    const now = new Date()
    const currentHour = String(now.getUTCHours()).padStart(2, '0')
    const currentMin = String(now.getUTCMinutes()).padStart(2, '0')
    const currentTimeStr = `${currentHour}:${currentMin}`

    if (currentTimeStr === config.discoveryTime) {
      this.onTriggerCallback?.('DISCOVERY')
    } else if (currentTimeStr === config.researchTime) {
      this.onTriggerCallback?.('RESEARCH')
    } else if (currentTimeStr === config.generateTime) {
      this.onTriggerCallback?.('GENERATE')
    } else if (currentTimeStr === config.qcTime) {
      this.onTriggerCallback?.('QC')
    } else if (currentTimeStr === config.publishTime) {
      this.onTriggerCallback?.('PUBLISH')
    }
  }
}

export const productionScheduler = new ProductionScheduler()
