/*
 * AppUsageTracker.kt
 * Tracks app usage patterns and provides insights for better automation
 */

package com.iris.ai.appcontrol

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import java.util.concurrent.ConcurrentHashMap

/**
 * Tracks app usage patterns and provides insights
 * Helps Iris learn user preferences and optimize automation
 */
class AppUsageTracker(private val context: Context) {
    
    companion object {
        private const val TAG = "AppUsageTracker"
        private const val MAX_HISTORY_SIZE = 100
        private const val PREF_NAME = "IrisAppUsagePrefs"
        private const val KEY_USAGE_COUNT = "usage_count_v2"
        private const val KEY_LAST_USED = "last_used_v2"
        private const val KEY_FAVORITE_APPS = "favorite_apps_v2"
    }
    
    private val preferences by lazy {
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
    }
    
    private val usageHistory = ConcurrentHashMap<String, MutableList<UsageEntry>>()
    private val appStats = ConcurrentHashMap<String, AppStats>()
    
    // In-memory cache for quick access
    private var favoriteAppsCache: List<String> = emptyList()
    private var usageCountCache: Int = 0
    
    /**
     * Record app usage
     */
    fun recordUsage(appName: String, packageName: String, action: UsageAction) {
        val entry = UsageEntry(
            timestamp = System.currentTimeMillis(),
            appName = appName,
            packageName = packageName,
            action = action
        )
        
        // Add to history
        val history = usageHistory.getOrPut(packageName) { mutableListOf() }
        history.add(entry)
        
        // Limit history size
        if (history.size > MAX_HISTORY_SIZE) {
            history.removeAt(0)
        }
        
        // Update stats
        updateAppStats(packageName, appName, action)
        
        // Update usage count
        usageCountCache++
        preferences.edit().putInt(KEY_USAGE_COUNT, usageCountCache).apply()
        preferences.edit().putLong(KEY_LAST_USED, System.currentTimeMillis()).apply()
        
        Log.d(TAG, "Recorded usage: $appName ($packageName) - $action")
    }
    
    /**
     * Update app statistics
     */
    private fun updateAppStats(packageName: String, appName: String, action: UsageAction) {
        val stats = appStats.getOrPut(packageName) {
            AppStats(packageName, appName)
        }
        
        when (action) {
            UsageAction.OPEN -> {
                stats.openCount++
                stats.lastOpened = System.currentTimeMillis()
            }
            UsageAction.CLOSE -> {
                stats.closeCount++
            }
            UsageAction.SEARCH -> {
                stats.searchCount++
                stats.lastSearched = System.currentTimeMillis()
            }
            UsageAction.SEND_MESSAGE -> {
                stats.messageCount++
            }
            UsageAction.PLAY -> {
                stats.playCount++
            }
            UsageAction.PAUSE -> {
                stats.pauseCount++
            }
            UsageAction.NAVIGATE -> {
                stats.navigateCount++
            }
        }
        
        stats.totalUsage++
        stats.lastUsed = System.currentTimeMillis()
        
        // Update favorite apps cache if needed
        if (action == UsageAction.OPEN) {
            updateFavoriteApps()
        }
    }
    
    /**
     * Update favorite apps list
     */
    private fun updateFavoriteApps() {
        val sorted = appStats.values
            .sortedByDescending { it.totalUsage }
            .take(10)
            .map { it.packageName }
        
        favoriteAppsCache = sorted
        preferences.edit().putStringSet(KEY_FAVORITE_APPS, sorted.toSet()).apply()
    }
    
    /**
     * Get app statistics
     */
    fun getAppStats(packageName: String): AppStats? {
        return appStats[packageName]
    }
    
    /**
     * Get all app statistics
     */
    fun getAllStats(): Map<String, AppStats> {
        return appStats.toMap()
    }
    
    /**
     * Get usage history for an app
     */
    fun getUsageHistory(packageName: String): List<UsageEntry> {
        return usageHistory[packageName] ?: emptyList()
    }
    
    /**
     * Get all usage history
     */
    fun getAllHistory(): Map<String, List<UsageEntry>> {
        return usageHistory.toMap()
    }
    
    /**
     * Get favorite apps (most used)
     */
    fun getFavoriteApps(limit: Int = 10): List<AppStats> {
        return appStats.values
            .sortedByDescending { it.totalUsage }
            .take(limit)
    }
    
    /**
     * Get recently used apps
     */
    fun getRecentlyUsedApps(limit: Int = 10): List<AppStats> {
        return appStats.values
            .sortedByDescending { it.lastUsed }
            .take(limit)
    }
    
    /**
     * Get apps by usage frequency
     */
    fun getAppsByFrequency(): List<AppStats> {
        return appStats.values
            .sortedByDescending { it.totalUsage }
            .toList()
    }
    
    /**
     * Get most searched apps
     */
    fun getMostSearchedApps(limit: Int = 5): List<AppStats> {
        return appStats.values
            .filter { it.searchCount > 0 }
            .sortedByDescending { it.searchCount }
            .take(limit)
    }
    
    /**
     * Get apps with most messages sent
     */
    fun getMostMessagedApps(limit: Int = 5): List<AppStats> {
        return appStats.values
            .filter { it.messageCount > 0 }
            .sortedByDescending { it.messageCount }
            .take(limit)
    }
    
    /**
     * Get total usage count
     */
    fun getTotalUsageCount(): Int {
        return usageCountCache
    }
    
    /**
     * Get last used timestamp
     */
    fun getLastUsedTimestamp(): Long {
        return preferences.getLong(KEY_LAST_USED, 0L)
    }
    
    /**
     * Get app usage pattern
     */
    fun getUsagePattern(appName: String): UsagePattern {
        val stats = appStats.values.find { it.appName.equals(appName, ignoreCase = true) || it.packageName == appName }
        
        if (stats == null) {
            return UsagePattern(appName, 0, emptyList())
        }
        
        val history = usageHistory[stats.packageName] ?: emptyList()
        
        // Calculate time of day preferences
        val timeOfDay = mutableMapOf<String, Int>()
        history.forEach { entry ->
            val hour = java.util.Calendar.getInstance().apply {
                timeInMillis = entry.timestamp
            }.get(java.util.Calendar.HOUR_OF_DAY)
            
            val period = when (hour) {
                in 0..5 -> "night"
                in 6..11 -> "morning"
                in 12..17 -> "afternoon"
                else -> "evening"
            }
            timeOfDay[period] = (timeOfDay[period] ?: 0) + 1
        }
        
        // Calculate day of week preferences
        val dayOfWeek = mutableMapOf<String, Int>()
        history.forEach { entry ->
            val day = java.util.Calendar.getInstance().apply {
                timeInMillis = entry.timestamp
            }.get(java.util.Calendar.DAY_OF_WEEK)
            
            val dayName = when (day) {
                java.util.Calendar.MONDAY -> "monday"
                java.util.Calendar.TUESDAY -> "tuesday"
                java.util.Calendar.WEDNESDAY -> "wednesday"
                java.util.Calendar.THURSDAY -> "thursday"
                java.util.Calendar.FRIDAY -> "friday"
                java.util.Calendar.SATURDAY -> "saturday"
                else -> "sunday"
            }
            dayOfWeek[dayName] = (dayOfWeek[dayName] ?: 0) + 1
        }
        
        return UsagePattern(
            appName = stats.appName,
            totalUsage = stats.totalUsage,
            actions = listOf(
                ActionFrequency("open", stats.openCount),
                ActionFrequency("search", stats.searchCount),
                ActionFrequency("message", stats.messageCount),
                ActionFrequency("play", stats.playCount),
                ActionFrequency("navigate", stats.navigateCount)
            ).filter { it.count > 0 }
            .sortedByDescending { it.count },
            timeOfDayPreferences = timeOfDay.toList().sortedByDescending { it.second },
            dayOfWeekPreferences = dayOfWeek.toList().sortedByDescending { it.second }
        )
    }
    
    /**
     * Predict next likely app based on usage patterns
     */
    fun predictNextApp(currentApp: String? = null, timeOfDay: String? = null): AppStats? {
        val candidates = appStats.values.toList()
        
        if (candidates.isEmpty()) return null
        
        // If current app is provided, find apps commonly used after it
        currentApp?.let { current ->
            val currentStats = appStats.values.find { 
                it.appName.equals(current, ignoreCase = true) || it.packageName == current 
            }
            
            if (currentStats != null) {
                // Find apps that are commonly used after this one
                // This would need transition data - for now, return most used
                return candidates.maxByOrNull { it.totalUsage }
            }
        }
        
        // Filter by time of day if provided
        timeOfDay?.let { period ->
            val filtered = candidates.filter { stats ->
                val history = usageHistory[stats.packageName] ?: return@filter true
                history.any { entry ->
                    val hour = java.util.Calendar.getInstance().apply {
                        timeInMillis = entry.timestamp
                    }.get(java.util.Calendar.HOUR_OF_DAY)
                    
                    when (period) {
                        "morning" -> hour in 6..11
                        "afternoon" -> hour in 12..17
                        "evening" -> hour in 18..23
                        "night" -> hour in 0..5
                        else -> true
                    }
                }
            }
            
            return filtered.maxByOrNull { it.totalUsage }
        }
        
        // Return most used app overall
        return candidates.maxByOrNull { it.totalUsage }
    }
    
    /**
     * Get app usage suggestions based on context
     */
    fun getSuggestions(context: UsageContext): List<AppSuggestion> {
        val suggestions = mutableListOf<AppSuggestion>()
        
        // Always suggest favorite apps
        getFavoriteApps(5).forEachIndexed { index, stats ->
            suggestions.add(AppSuggestion(
                appName = stats.appName,
                packageName = stats.packageName,
                score = 100 - index * 10,
                reason = "Frequently used"
            ))
        }
        
        // Suggest based on time of day
        val hour = java.util.Calendar.getInstance().get(java.util.Calendar.HOUR_OF_DAY)
        val timeOfDay = when (hour) {
            in 0..5 -> "night"
            in 6..11 -> "morning"
            in 12..17 -> "afternoon"
            else -> "evening"
        }
        
        // Common time-based patterns
        when (timeOfDay) {
            "morning" -> {
                suggestions.add(AppSuggestion(
                    appName = "WhatsApp",
                    packageName = "com.whatsapp",
                    score = 85,
                    reason = "Commonly used in the morning"
                ))
                suggestions.add(AppSuggestion(
                    appName = "Gmail",
                    packageName = "com.google.android.gm",
                    score = 80,
                    reason = "Commonly used in the morning"
                ))
            }
            "afternoon" -> {
                suggestions.add(AppSuggestion(
                    appName = "Chrome",
                    packageName = "com.android.chrome",
                    score = 85,
                    reason = "Commonly used in the afternoon"
                ))
            }
            "evening" -> {
                suggestions.add(AppSuggestion(
                    appName = "YouTube",
                    packageName = "com.google.android.youtube",
                    score = 90,
                    reason = "Commonly used in the evening"
                ))
                suggestions.add(AppSuggestion(
                    appName = "Netflix",
                    packageName = "com.netflix.ninja",
                    score = 85,
                    reason = "Commonly used in the evening"
                ))
            }
            "night" -> {
                suggestions.add(AppSuggestion(
                    appName = "YouTube",
                    packageName = "com.google.android.youtube",
                    score = 80,
                    reason = "Commonly used at night"
                ))
            }
        }
        
        // Suggest based on user intent
        when (context.intent) {
            UsageIntent.WORK -> {
                suggestions.add(AppSuggestion(
                    appName = "Gmail",
                    packageName = "com.google.android.gm",
                    score = 90,
                    reason = "Work-related"
                ))
                suggestions.add(AppSuggestion(
                    appName = "Docs",
                    packageName = "com.google.android.apps.docs",
                    score = 85,
                    reason = "Work-related"
                ))
                suggestions.add(AppSuggestion(
                    appName = "Sheets",
                    packageName = "com.google.android.apps.sheets",
                    score = 80,
                    reason = "Work-related"
                ))
            }
            UsageIntent.ENTERTAINMENT -> {
                suggestions.add(AppSuggestion(
                    appName = "YouTube",
                    packageName = "com.google.android.youtube",
                    score = 95,
                    reason = "Entertainment"
                ))
                suggestions.add(AppSuggestion(
                    appName = "Netflix",
                    packageName = "com.netflix.ninja",
                    score = 90,
                    reason = "Entertainment"
                ))
                suggestions.add(AppSuggestion(
                    appName = "Spotify",
                    packageName = "com.spotify.music",
                    score = 85,
                    reason = "Entertainment"
                ))
            }
            UsageIntent.COMMUNICATION -> {
                suggestions.add(AppSuggestion(
                    appName = "WhatsApp",
                    packageName = "com.whatsapp",
                    score = 95,
                    reason = "Communication"
                ))
                suggestions.add(AppSuggestion(
                    appName = "Messages",
                    packageName = "com.google.android.apps.messaging",
                    score = 90,
                    reason = "Communication"
                ))
                suggestions.add(AppSuggestion(
                    appName = "Phone",
                    packageName = "com.android.phone",
                    score = 85,
                    reason = "Communication"
                ))
            }
            UsageIntent.PRODUCTIVITY -> {
                suggestions.add(AppSuggestion(
                    appName = "Google Keep",
                    packageName = "com.google.android.keep",
                    score = 90,
                    reason = "Productivity"
                ))
                suggestions.add(AppSuggestion(
                    appName = "Tasks",
                    packageName = "com.google.android.apps.tasks",
                    score = 85,
                    reason = "Productivity"
                ))
            }
            UsageIntent.NAVIGATION -> {
                suggestions.add(AppSuggestion(
                    appName = "Maps",
                    packageName = "com.google.android.apps.maps",
                    score = 95,
                    reason = "Navigation"
                ))
            }
            else -> {}
        }
        
        // Sort by score and limit
        return suggestions
            .sortedByDescending { it.score }
            .distinctBy { it.packageName }
            .take(10)
    }
    
    /**
     * Clear all tracking data
     */
    fun clearAll() {
        usageHistory.clear()
        appStats.clear()
        favoriteAppsCache = emptyList()
        usageCountCache = 0
        
        preferences.edit().clear().apply()
        
        Log.d(TAG, "Cleared all usage tracking data")
    }
    
    /**
     * Clear data for a specific app
     */
    fun clearAppData(packageName: String) {
        usageHistory.remove(packageName)
        appStats.remove(packageName)
        
        // Update favorite apps
        updateFavoriteApps()
        
        Log.d(TAG, "Cleared data for app: $packageName")
    }
    
    /**
     * Load saved data
     */
    fun loadSavedData() {
        usageCountCache = preferences.getInt(KEY_USAGE_COUNT, 0)
        favoriteAppsCache = preferences.getStringSet(KEY_FAVORITE_APPS, emptySet())?.toList() ?: emptyList()
        
        Log.d(TAG, "Loaded saved data: $usageCountCache usages, ${favoriteAppsCache.size} favorites")
    }
}

// ============================================================================
// Data Classes
// ============================================================================

data class UsageEntry(
    val timestamp: Long,
    val appName: String,
    val packageName: String,
    val action: UsageAction
)

enum class UsageAction {
    OPEN,
    CLOSE,
    SEARCH,
    SEND_MESSAGE,
    PLAY,
    PAUSE,
    NAVIGATE,
    UNKNOWN
}

data class AppStats(
    val packageName: String,
    val appName: String,
    var totalUsage: Int = 0,
    var openCount: Int = 0,
    var closeCount: Int = 0,
    var searchCount: Int = 0,
    var messageCount: Int = 0,
    var playCount: Int = 0,
    var pauseCount: Int = 0,
    var navigateCount: Int = 0,
    var lastUsed: Long = 0L,
    var lastOpened: Long = 0L,
    var lastSearched: Long = 0L
)

data class UsagePattern(
    val appName: String,
    val totalUsage: Int,
    val actions: List<ActionFrequency>,
    val timeOfDayPreferences: List<Pair<String, Int>>,
    val dayOfWeekPreferences: List<Pair<String, Int>>
)

data class ActionFrequency(
    val action: String,
    val count: Int
)

data class AppSuggestion(
    val appName: String,
    val packageName: String,
    val score: Int,
    val reason: String
)

enum class UsageIntent {
    WORK,
    ENTERTAINMENT,
    COMMUNICATION,
    PRODUCTIVITY,
    NAVIGATION,
    UNKNOWN
}

data class UsageContext(
    val intent: UsageIntent = UsageIntent.UNKNOWN,
    val timeOfDay: String? = null,
    val dayOfWeek: String? = null,
    val location: String? = null
)

// ============================================================================
// Singleton
// ============================================================================

object AppUsageTrackerSingleton {
    private var instance: AppUsageTracker? = null
    
    fun initialize(context: Context): AppUsageTracker {
        instance = AppUsageTracker(context).apply { loadSavedData() }
        return instance!!
    }
    
    fun getInstance(context: Context): AppUsageTracker {
        if (instance == null) {
            instance = AppUsageTracker(context).apply { loadSavedData() }
        }
        return instance!!
    }
    
    fun cleanup() {
        instance?.clearAll()
        instance = null
    }
}
