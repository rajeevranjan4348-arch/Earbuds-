/**
 * Android Package & Deep Link Resolver
 * Synthesizes Deft (#10) + AutoDroid (#11) + KISS discovery
 * Resolves app names, packages, deep links, and fallback schemes with high accuracy.
 */

export interface ResolvedAndroidApp {
  name: string
  packageName: string
  activityName?: string
  deepLink?: string
  category: 'social' | 'media' | 'utility' | 'browser' | 'system' | 'productivity' | 'messaging'
  aliases: string[]
}

export const KNOWN_ANDROID_REGISTRY: ResolvedAndroidApp[] = [
  {
    name: 'WhatsApp',
    packageName: 'com.whatsapp',
    activityName: 'com.whatsapp.Main',
    deepLink: 'whatsapp://send',
    category: 'messaging',
    aliases: ['whatsapp', 'wa', 'whats app']
  },
  {
    name: 'YouTube',
    packageName: 'com.google.android.youtube',
    activityName: 'com.google.android.apps.youtube.app.WatchWhileActivity',
    deepLink: 'vnd.youtube://',
    category: 'media',
    aliases: ['youtube', 'yt', 'you tube']
  },
  {
    name: 'Google Chrome',
    packageName: 'com.android.chrome',
    activityName: 'com.google.android.apps.chrome.Main',
    deepLink: 'googlechrome://',
    category: 'browser',
    aliases: ['chrome', 'google chrome', 'browser', 'web browser']
  },
  {
    name: 'Telegram',
    packageName: 'org.telegram.messenger',
    activityName: 'org.telegram.ui.LaunchActivity',
    deepLink: 'tg://',
    category: 'messaging',
    aliases: ['telegram', 'tg']
  },
  {
    name: 'Spotify',
    packageName: 'com.spotify.music',
    activityName: 'com.spotify.music.MainActivity',
    deepLink: 'spotify://',
    category: 'media',
    aliases: ['spotify', 'music']
  },
  {
    name: 'Settings',
    packageName: 'com.android.settings',
    activityName: 'com.android.settings.Settings',
    category: 'system',
    aliases: ['settings', 'preferences', 'system settings', 'config']
  },
  {
    name: 'Calculator',
    packageName: 'com.google.android.calculator',
    activityName: 'com.android.calculator2.Calculator',
    category: 'utility',
    aliases: ['calculator', 'calc']
  },
  {
    name: 'Camera',
    packageName: 'com.google.android.GoogleCamera',
    activityName: 'com.android.camera.CameraLauncher',
    category: 'system',
    aliases: ['camera', 'cam', 'take photo']
  },
  {
    name: 'Google Maps',
    packageName: 'com.google.android.apps.maps',
    activityName: 'com.google.android.maps.MapsActivity',
    deepLink: 'geo:0,0',
    category: 'utility',
    aliases: ['maps', 'google maps', 'navigation', 'gps']
  },
  {
    name: 'Gmail',
    packageName: 'com.google.android.gm',
    activityName: 'com.google.android.gm.ConversationListActivityGmail',
    deepLink: 'googlegmail://',
    category: 'productivity',
    aliases: ['gmail', 'google mail', 'email', 'mail']
  },
  {
    name: 'Clock',
    packageName: 'com.google.android.deskclock',
    activityName: 'com.android.deskclock.DeskClock',
    category: 'utility',
    aliases: ['clock', 'alarm', 'timer', 'stopwatch']
  },
  {
    name: 'Phone',
    packageName: 'com.google.android.dialer',
    activityName: 'com.google.android.dialer.extensions.GoogleDialtactsActivity',
    deepLink: 'tel:',
    category: 'system',
    aliases: ['phone', 'dialer', 'call', 'telephone']
  }
]

export class AndroidPackageResolver {
  public resolveApp(query: string): ResolvedAndroidApp | null {
    const q = query.toLowerCase().trim()
    for (const app of KNOWN_ANDROID_REGISTRY) {
      if (app.name.toLowerCase() === q || app.packageName.toLowerCase() === q) {
        return app
      }
      if (app.aliases.some((a) => a.toLowerCase() === q || q.includes(a.toLowerCase()))) {
        return app
      }
    }
    return null
  }
}

export const androidPackageResolver = new AndroidPackageResolver()
