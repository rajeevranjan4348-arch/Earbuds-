/*
 * IRIS App Control - App Resolver
 * Dynamic app name to package name resolution using Android PackageManager
 */

package com.iris.ai.appcontrol

import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ResolveInfo
import android.util.Log
import java.util.Locale

/**
 * App information data class
 */
data class AppInfo(
    val packageName: String,
    val appName: String,
    val activityName: String? = null,
    val isSystemApp: Boolean = false,
    val versionName: String? = null,
    val versionCode: Int = 0
)

/**
 * App Resolver
 * Resolves natural app names to installed package names
 * Handles aliases, Hindi/Hinglish names, and spelling mistakes
 */
class AppResolver(private val context: Context) {
    private const val TAG = "AppResolver"

    // Cache for resolved apps
    private val appCache = mutableMapOf<String, AppInfo>()
    private val packageToAppCache = mutableMapOf<String, AppInfo>()
    private var installedApps: List<AppInfo> = emptyList()

    init {
        loadInstalledApps()
    }

    /**
     * Load all installed applications
     */
    private fun loadInstalledApps() {
        try {
            val pm = context.packageManager
            val mainIntent = android.content.Intent(android.content.Intent.ACTION_MAIN, null)
            mainIntent.addCategory(android.content.Intent.CATEGORY_LAUNCHER)

            val apps = pm.queryIntentActivities(mainIntent, PackageManager.MATCH_ALL)
            installedApps = apps.mapNotNull { resolveInfo ->
                try {
                    val packageName = resolveInfo.activityInfo.packageName
                    val appName = resolveInfo.loadLabel(pm).toString()
                    val activityName = resolveInfo.activityInfo.name
                    val isSystemApp = (resolveInfo.activityInfo.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) != 0

                    AppInfo(
                        packageName = packageName,
                        appName = appName,
                        activityName = activityName,
                        isSystemApp = isSystemApp
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "Error loading app info", e)
                    null
                }
            }

            // Build caches
            installedApps.forEach { app ->
                packageToAppCache[app.packageName] = app
                // Cache by lowercase app name
                appCache[app.appName.lowercase(Locale.ROOT)] = app
                // Also cache by package name
                appCache[app.packageName.lowercase(Locale.ROOT)] = app
            }

            Log.d(TAG, "Loaded ${installedApps.size} installed apps")
        } catch (e: Exception) {
            Log.e(TAG, "Error loading installed apps", e)
        }
    }

    /**
     * Resolve app name to package name
     * Tries multiple strategies: exact match, partial match, fuzzy match
     */
    fun resolveApp(appName: String): AppInfo? {
        val lowerName = appName.lowercase(Locale.ROOT).trim()

        // Check cache first
        appCache[lowerName]?.let { return it }

        // Try exact match
        val exactMatch = findExactMatch(lowerName)
        if (exactMatch != null) {
            appCache[lowerName] = exactMatch
            return exactMatch
        }

        // Try partial match
        val partialMatch = findPartialMatch(lowerName)
        if (partialMatch != null) {
            appCache[lowerName] = partialMatch
            return partialMatch
        }

        // Try fuzzy match
        val fuzzyMatch = findFuzzyMatch(lowerName)
        if (fuzzyMatch != null) {
            appCache[lowerName] = fuzzyMatch
            return fuzzyMatch
        }

        return null
    }

    /**
     * Resolve app name to package name (returns package name string)
     */
    fun resolveToPackageName(appName: String): String? {
        return resolveApp(appName)?.packageName
    }

    /**
     * Check if app is installed
     */
    fun isAppInstalled(packageName: String): Boolean {
        return packageToAppCache.containsKey(packageName) ||
                resolveApp(packageName) != null
    }

    /**
     * Check if app is installed by app name
     */
    fun isAppInstalledByName(appName: String): Boolean {
        return resolveApp(appName) != null
    }

    /**
     * Get all installed apps
     */
    fun getInstalledApps(): List<AppInfo> {
        return installedApps
    }

    /**
     * Get launch intent for app
     */
    fun getLaunchIntent(appInfo: AppInfo): android.content.Intent? {
        return try {
            val pm = context.packageManager
            pm.getLaunchIntentForPackage(appInfo.packageName)?.apply {
                addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting launch intent for ${appInfo.packageName}", e)
            null
        }
    }

    /**
     * Find exact match
     */
    private fun findExactMatch(appName: String): AppInfo? {
        return installedApps.find { app ->
            app.appName.lowercase(Locale.ROOT) == appName ||
                    app.packageName.lowercase(Locale.ROOT) == appName
        }
    }

    /**
     * Find partial match
     */
    private fun findPartialMatch(appName: String): AppInfo? {
        return installedApps.find { app ->
            app.appName.lowercase(Locale.ROOT).contains(appName) ||
                    appName.contains(app.appName.lowercase(Locale.ROOT)) ||
                    app.packageName.lowercase(Locale.ROOT).contains(appName) ||
                    appName.contains(app.packageName.lowercase(Locale.ROOT))
        }
    }

    /**
     * Find fuzzy match using Levenshtein distance
     */
    private fun findFuzzyMatch(appName: String): AppInfo? {
        var bestMatch: AppInfo? = null
        var bestScore = Int.MAX_VALUE

        for (app in installedApps) {
            val appNameLower = app.appName.lowercase(Locale.ROOT)
            val distance = levenshteinDistance(appName, appNameLower)
            
            // If perfect match, return immediately
            if (distance == 0) {
                return app
            }

            // If good match (distance < 3), consider it
            if (distance < bestScore && distance <= 3) {
                bestScore = distance
                bestMatch = app
            }
        }

        return bestMatch
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    private fun levenshteinDistance(s1: String, s2: String): Int {
        val costs = IntArray(s2.length + 1)
        
        for (i in 0..s1.length) {
            var lastValue = i
            for (j in 0..s2.length) {
                if (i == 0) {
                    costs[j] = j
                } else if (j > 0) {
                    val newValue = costs[j - 1] +
                            (if (s1[i - 1] == s2[j - 1]) 0 else 1)
                    costs[j - 1] = lastValue
                    lastValue = minOf(
                        costs[j] + 1,
                        lastValue + 1,
                        newValue
                    )
                }
            }
            if (i > 0) {
                costs[s2.length] = lastValue
            }
        }
        
        return costs[s2.length]
    }

    /**
     * Get app info by package name
     */
    fun getAppInfoByPackage(packageName: String): AppInfo? {
        return packageToAppCache[packageName] ?: installedApps.find {
            it.packageName == packageName
        }
    }

    /**
     * Refresh installed apps cache
     */
    fun refresh() {
        appCache.clear()
        packageToAppCache.clear()
        installedApps = emptyList()
        loadInstalledApps()
    }

    /**
     * Get common apps with their package names
     */
    fun getCommonApps(): Map<String, String> {
        return mapOf(
            "youtube" to "com.google.android.youtube",
            "chrome" to "com.android.chrome",
            "whatsapp" to "com.whatsapp",
            "maps" to "com.google.android.apps.maps",
            "gmail" to "com.google.android.gm",
            "spotify" to "com.spotify.music",
            "instagram" to "com.instagram.android",
            "twitter" to "com.twitter.android",
            "settings" to "com.android.settings",
            "camera" to "com.google.android.GoogleCamera",
            "clock" to "com.google.android.deskclock",
            "photos" to "com.google.android.apps.photos",
            "messages" to "com.google.android.apps.messaging",
            "phone" to "com.google.android.dialer",
            "drive" to "com.google.android.apps.docs",
            "calendar" to "com.google.android.calendar",
            "play store" to "com.android.vending"
        )
    }

    /**
     * Get Hindi app name mappings
     */
    fun getHindiAppMappings(): Map<String, String> {
        return mapOf(
            "यूट्यूब" to "com.google.android.youtube",
            "व्हाट्सएप" to "com.whatsapp",
            "गूगल मैप्स" to "com.google.android.apps.maps",
            "नक्शा" to "com.google.android.apps.maps",
            "जीमेल" to "com.google.android.gm",
            "स्पॉटिफाई" to "com.spotify.music",
            "इंस्टाग्राम" to "com.instagram.android",
            "सेटिंग्स" to "com.android.settings",
            "कैमरा" to "com.google.android.GoogleCamera",
            "घड़ी" to "com.google.android.deskclock",
            "फोटो" to "com.google.android.apps.photos",
            "संदेश" to "com.google.android.apps.messaging",
            "फोन" to "com.google.android.dialer",
            "ड्राइव" to "com.google.android.apps.docs",
            "कैलेंडर" to "com.google.android.calendar",
            "प्ले स्टोर" to "com.android.vending"
        )
    }
}
