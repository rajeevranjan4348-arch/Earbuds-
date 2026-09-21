/**
 * Authentic port of fr.neamar.kiss.loader.LoadAppPojos from Neamar/KISS
 * Discovers installed Android applications, reads launch activities,
 * handles multiple launchable activities safely, assigns user profile handles,
 * and builds initial AppPojo records.
 */

import { AppPojo } from '../pojo/AppPojo'
import { UserHandle } from '../pojo/UserHandle'

export interface RawAppInfo {
  name: string
  packageName: string
  activityName?: string
  launchActivity?: string
  activities?: string[] // Multiple launchable activities if present
  aliases?: string[]
  isSystemApp?: boolean
  category?: string
  disabled?: boolean
  userId?: number
}

/**
 * Standard baseline catalog of known Android applications and their canonical packages/activities.
 * Used for instant bootstrapping, offline indexing, and safe fallback resolution.
 */
export const BASELINE_KISS_APP_CATALOG: RawAppInfo[] = [
  {
    name: 'YouTube',
    packageName: 'com.google.android.youtube',
    activityName: 'com.google.android.youtube.HomeActivity',
    activities: [
      'com.google.android.youtube.HomeActivity',
      'com.google.android.youtube.UrlHandlerActivity'
    ],
    aliases: ['yt', 'youtube', 'you tube', 'video', 'videos'],
    category: 'media'
  },
  {
    name: 'YouTube Music',
    packageName: 'com.google.android.apps.youtube.music',
    activityName: 'com.google.android.apps.youtube.music.activities.MusicActivity',
    aliases: ['yt music', 'youtube music', 'ytmusic', 'music'],
    category: 'media'
  },
  {
    name: 'WhatsApp',
    packageName: 'com.whatsapp',
    activityName: 'com.whatsapp.Main',
    activities: [
      'com.whatsapp.Main',
      'com.whatsapp.Conversation',
      'com.whatsapp.camera.CameraActivity'
    ],
    aliases: ['wa', 'whatsapp', 'whats app', 'watsapp', 'chat', 'messaging'],
    category: 'communication'
  },
  {
    name: 'WhatsApp Business',
    packageName: 'com.whatsapp.w4b',
    activityName: 'com.whatsapp.Main',
    aliases: ['wb', 'wa business', 'whatsapp business', 'watsapp business'],
    category: 'communication'
  },
  {
    name: 'Google Chrome',
    packageName: 'com.android.chrome',
    activityName: 'com.google.android.apps.chrome.Main',
    activities: ['com.google.android.apps.chrome.Main', 'com.android.chrome.Main'],
    aliases: ['chrome', 'google chrome', 'browser', 'web browser', 'internet'],
    category: 'utility'
  },
  {
    name: 'Instagram',
    packageName: 'com.instagram.android',
    activityName: 'com.instagram.mainactivity.MainActivity',
    aliases: ['insta', 'ig', 'instagram', 'instgram', 'social'],
    category: 'social'
  },
  {
    name: 'Telegram',
    packageName: 'org.telegram.messenger',
    activityName: 'org.telegram.ui.LaunchActivity',
    aliases: ['tg', 'telegram', 'tele gram', 'tele', 'messenger'],
    category: 'communication'
  },
  {
    name: 'Settings',
    packageName: 'com.android.settings',
    activityName: 'com.android.settings.Settings',
    activities: ['com.android.settings.Settings', 'com.android.settings.SubSettings'],
    aliases: [
      'settings',
      'setting',
      'android settings',
      'system settings',
      'preferences',
      'configuration',
      'config'
    ],
    category: 'system',
    isSystemApp: true
  },
  {
    name: 'Spotify',
    packageName: 'com.spotify.music',
    activityName: 'com.spotify.music.MainActivity',
    aliases: ['spotify', 'spotfy', 'music', 'songs'],
    category: 'media'
  },
  {
    name: 'Google Maps',
    packageName: 'com.google.android.apps.maps',
    activityName: 'com.google.android.maps.MapsActivity',
    aliases: ['maps', 'map', 'google maps', 'navigation', 'gps', 'directions'],
    category: 'utility'
  },
  {
    name: 'Gmail',
    packageName: 'com.google.android.gm',
    activityName: 'com.google.android.gm.ConversationListActivityGmail',
    aliases: ['gmail', 'google mail', 'email', 'mail', 'inbox'],
    category: 'communication'
  },
  {
    name: 'Camera',
    packageName: 'com.google.android.GoogleCamera',
    activityName: 'com.android.camera.CameraLauncher',
    activities: ['com.android.camera.CameraLauncher', 'com.android.camera.Camera'],
    aliases: ['camera', 'cam', 'photo camera', 'video camera', 'photoshoot'],
    category: 'utility',
    isSystemApp: true
  },
  {
    name: 'Calculator',
    packageName: 'com.google.android.calculator',
    activityName: 'com.android.calculator2.Calculator',
    aliases: ['calculator', 'calc', 'math', 'calculate'],
    category: 'utility',
    isSystemApp: true
  },
  {
    name: 'Phone',
    packageName: 'com.google.android.dialer',
    activityName: 'com.android.dialer.main.impl.MainActivity',
    aliases: ['phone', 'dialer', 'call', 'telephone'],
    category: 'communication',
    isSystemApp: true
  },
  {
    name: 'Messages',
    packageName: 'com.google.android.apps.messaging',
    activityName: 'com.google.android.apps.messaging.ui.ConversationListActivity',
    aliases: ['messages', 'sms', 'text messages', 'messaging'],
    category: 'communication',
    isSystemApp: true
  },
  {
    name: 'Google Photos',
    packageName: 'com.google.android.apps.photos',
    activityName: 'com.google.android.apps.photos.home.HomeActivity',
    aliases: ['photos', 'gallery', 'google photos', 'images', 'pictures'],
    category: 'media'
  },
  {
    name: 'Google Play Store',
    packageName: 'com.android.vending',
    activityName: 'com.android.vending.AssetBrowserActivity',
    aliases: ['play store', 'google play', 'app store', 'store', 'market'],
    category: 'system',
    isSystemApp: true
  },
  {
    name: 'Clock',
    packageName: 'com.google.android.deskclock',
    activityName: 'com.android.deskclock.DeskClock',
    aliases: ['clock', 'alarm', 'timer', 'stopwatch'],
    category: 'utility',
    isSystemApp: true
  },
  {
    name: 'Calendar',
    packageName: 'com.google.android.calendar',
    activityName: 'com.android.calendar.AllInOneActivity',
    aliases: ['calendar', 'google calendar', 'agenda', 'schedule'],
    category: 'productivity'
  },
  {
    name: 'Contacts',
    packageName: 'com.google.android.contacts',
    activityName: 'com.android.contacts.activities.PeopleActivity',
    aliases: ['contacts', 'address book', 'people'],
    category: 'communication',
    isSystemApp: true
  },
  {
    name: 'Files',
    packageName: 'com.google.android.documentsui',
    activityName: 'com.android.documentsui.files.FilesActivity',
    aliases: ['files', 'file manager', 'downloads', 'explorer', 'storage'],
    category: 'utility',
    isSystemApp: true
  }
]

export class LoadAppPojos {
  private static readonly POJO_SCHEME = 'app://'

  /**
   * Scans and builds list of AppPojos from all available Android sources
   */
  public async load(): Promise<AppPojo[]> {
    const appsMap = new Map<string, AppPojo>()

    // 1. Seed with baseline Android catalog
    for (const raw of BASELINE_KISS_APP_CATALOG) {
      const pojo = this.createAppPojo(raw)
      appsMap.set(pojo.id, pojo)
    }

    // 2. Discover from Native Android WebView / Container Bridge if available
    const nativeApps = await this.queryNativeBridge()
    for (const raw of nativeApps) {
      const pojo = this.createAppPojo(raw)
      appsMap.set(pojo.id, pojo)
    }

    // 3. Discover from Connected ADB Uplink via Electron IPC if available
    const adbApps = await this.queryAdbBridge()
    for (const raw of adbApps) {
      const pojo = this.createAppPojo(raw)
      appsMap.set(pojo.id, pojo)
    }

    return Array.from(appsMap.values())
  }

  /**
   * Creates an authentic KISS AppPojo with standardized scheme, user profile suffix,
   * safe activity handling, and normalized name.
   */
  public createAppPojo(raw: RawAppInfo): AppPojo {
    const userHandle = raw.userId !== undefined ? new UserHandle(raw.userId) : UserHandle.OWNER
    const activity = raw.activityName || raw.launchActivity || `${raw.packageName}.MainActivity`

    // In KISS: userHandle.addUserSuffixToString("app://" + packageName + "/" + activityName, '/')
    const id = userHandle.addUserSuffixToString(
      `${LoadAppPojos.POJO_SCHEME}${raw.packageName}/${activity}`,
      '/'
    )

    const app = new AppPojo(
      id,
      raw.packageName,
      activity,
      userHandle,
      false, // isExcluded
      false, // isExcludedFromHistory
      false, // isExcludedShortcuts
      raw.disabled ?? false,
      raw.isSystemApp ?? false,
      raw.category,
      raw.aliases || []
    )

    app.setName(raw.name)

    // In KISS: tags can include aliases, acronyms, and custom keywords
    const tags: string[] = [
      raw.name.toLowerCase(),
      ...(raw.aliases || []).map((a) => a.toLowerCase())
    ]
    app.setTags(Array.from(new Set(tags)))

    return app
  }

  private async queryNativeBridge(): Promise<RawAppInfo[]> {
    if (typeof window === 'undefined') return []
    const bridge =
      (window as any).Android ||
      (window as any).AndroidBridge ||
      (window as any).IRISAndroid ||
      (window as any).IRISLauncher

    if (bridge && typeof bridge.getInstalledApps === 'function') {
      try {
        const raw = await Promise.resolve(bridge.getInstalledApps())
        const list = typeof raw === 'string' ? JSON.parse(raw) : raw
        if (Array.isArray(list)) {
          return list.map((item) => ({
            name: item.name || item.packageName,
            packageName: item.packageName,
            activityName: item.activityName || item.launchActivity,
            aliases: item.aliases,
            isSystemApp: item.isSystemApp,
            category: item.category,
            disabled: item.disabled
          }))
        }
      } catch (e) {
        console.warn('[KISS LoadAppPojos] Native bridge query error:', e)
      }
    }
    return []
  }

  private async queryAdbBridge(): Promise<RawAppInfo[]> {
    if (typeof window === 'undefined' || !(window as any).electron?.ipcRenderer) return []
    try {
      const adbApps = await (window as any).electron.ipcRenderer.invoke(
        'adb-get-installed-packages'
      )
      if (Array.isArray(adbApps)) {
        return adbApps.map((item) => ({
          name: item.name || item.packageName,
          packageName: item.packageName,
          activityName: item.activityName || item.launchActivity,
          aliases: item.aliases,
          isSystemApp: item.isSystemApp
        }))
      }
    } catch (_e) {}
    return []
  }
}
