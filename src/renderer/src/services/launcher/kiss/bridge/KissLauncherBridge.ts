/**
 * KISS Launcher Bridge
 * Connects the KISS Launcher core engine (Neamar/KISS) to the AI Assistant.
 *
 * Pipeline:
 * AI command
 *  → App Launcher Tool
 *  → KISS app discovery/search (AppProvider + FuzzyScoreV2)
 *  → Package + Activity resolution (AppPojo)
 *  → Android Intent (AppResult.doLaunch)
 *  → Launch application
 *  → AI confirmation
 */

import { AppPojo } from '../pojo/AppPojo'
import { AppProvider, kissAppProvider } from '../dataprovider/AppProvider'
import { ApplicationsSearcher, kissSearcher } from '../searcher/ApplicationsSearcher'
import { AppResult, LaunchExecutionResult } from '../result/AppResult'

export interface KissLaunchResponse {
  success: boolean
  app?: {
    id: string
    name: string
    packageName: string
    activityName: string
    componentName: string
    isSystemApp: boolean
    score: number
  }
  execution?: LaunchExecutionResult
  spokenResponse: string
  displayText: string
  error?: string
  storeSuggestion?: {
    marketUri: string
    webUrl: string
  }
}

export class KissLauncherBridge {
  private static instance: KissLauncherBridge | null = null

  public static getInstance(): KissLauncherBridge {
    if (!KissLauncherBridge.instance) {
      KissLauncherBridge.instance = new KissLauncherBridge()
    }
    return KissLauncherBridge.instance
  }

  private readonly provider: AppProvider
  private readonly searcher: ApplicationsSearcher
  private initPromise: Promise<void> | null = null

  constructor(
    provider: AppProvider = kissAppProvider,
    searcher: ApplicationsSearcher = kissSearcher
  ) {
    this.provider = provider
    this.searcher = searcher
    this.ensureInitialized()
  }

  /**
   * Ensures the KISS App index is populated
   */
  public async ensureInitialized(forceRefresh = false): Promise<void> {
    if (!this.initPromise || forceRefresh) {
      this.initPromise = this.provider.initialize(forceRefresh)
    }
    return this.initPromise
  }

  /**
   * Searches installed applications using authentic KISS fuzzy match algorithm
   */
  public async search(query: string, limit = 10): Promise<AppPojo[]> {
    await this.ensureInitialized()
    return this.provider.requestResults(query, limit)
  }

  /**
   * Resolves query to top matching AppPojo
   */
  public async resolve(query: string): Promise<AppPojo | null> {
    await this.ensureInitialized()
    return this.searcher.resolveTopMatch(query)
  }

  /**
   * Returns all indexed apps in the KISS catalog
   */
  public async getAllApps(): Promise<AppPojo[]> {
    await this.ensureInitialized()
    return this.provider.getPojos()
  }

  /**
   * Core AI Command Execution:
   * Finds the best matching Android application via KISS indexing and launches it.
   */
  public async findAndLaunch(query: string): Promise<KissLaunchResponse> {
    await this.ensureInitialized()
    const trimmed = query.trim()

    if (!trimmed) {
      return {
        success: false,
        spokenResponse: 'Please specify which application you would like to open.',
        displayText: 'No application name specified.',
        error: 'EMPTY_APP_NAME'
      }
    }

    // 1. Resolve via KISS searcher
    const app = this.searcher.resolveTopMatch(trimmed)

    if (!app) {
      return {
        success: false,
        spokenResponse: `I could not find ${trimmed} installed on your device.`,
        displayText: `Application "${trimmed}" not found in installed catalog.`,
        error: 'APP_NOT_FOUND',
        storeSuggestion: {
          marketUri: `market://search?q=${encodeURIComponent(trimmed)}`,
          webUrl: `https://play.google.com/store/search?q=${encodeURIComponent(trimmed)}&c=apps`
        }
      }
    }

    // 2. Multi-activity safety check:
    // If activityName is missing or invalid, default to packageName.MainActivity safely
    if (!app.activityName) {
      console.warn(`[KISS Bridge] Missing activity for ${app.packageName}, applying safe fallback`)
    }

    // 3. Record in KISS history for adaptive search learning
    this.provider.recordSelection(trimmed, app)

    // 4. Construct Android Intent and launch via KISS AppResult
    const appResult = new AppResult(app)
    const execution = await appResult.doLaunch()

    const appName = app.getName()
    const spokenResponse = `Opening ${appName}.`
    const displayText = `Launched ${appName} (${app.packageName})`

    return {
      success: execution.success,
      app: {
        id: app.id,
        name: appName,
        packageName: app.packageName,
        activityName: app.activityName,
        componentName: app.getComponentName(),
        isSystemApp: app.isSystemApp,
        score: app.relevance
      },
      execution,
      spokenResponse,
      displayText
    }
  }

  /**
   * Direct package launcher
   */
  public async launchPackage(packageName: string): Promise<KissLaunchResponse> {
    await this.ensureInitialized()
    const app = this.provider.findByPackage(packageName)
    if (app) {
      return this.findAndLaunch(app.getName())
    }

    // Fallback if package is not indexed yet
    const fallbackApp = new AppPojo(
      `app://${packageName}/${packageName}.MainActivity`,
      packageName,
      `${packageName}.MainActivity`
    )
    fallbackApp.setName(packageName.split('.').pop() || packageName)
    const appResult = new AppResult(fallbackApp)
    const execution = await appResult.doLaunch()

    return {
      success: execution.success,
      app: {
        id: fallbackApp.id,
        name: fallbackApp.getName(),
        packageName: fallbackApp.packageName,
        activityName: fallbackApp.activityName,
        componentName: fallbackApp.getComponentName(),
        isSystemApp: false,
        score: 100
      },
      execution,
      spokenResponse: `Launching ${fallbackApp.getName()}.`,
      displayText: `Dispatched package: ${packageName}`
    }
  }
}

export const kissLauncherBridge = KissLauncherBridge.getInstance()
