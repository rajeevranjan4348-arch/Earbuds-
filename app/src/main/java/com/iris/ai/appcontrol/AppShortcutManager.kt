/*
 * AppShortcutManager.kt
 * Manages app shortcuts and quick actions for Iris
 * Provides fast access to common app control actions
 */

package com.iris.ai.appcontrol

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ShortcutInfo
import android.content.pm.ShortcutManager
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * Manages dynamic app shortcuts for quick access to common actions
 */
class AppShortcutManager(private val context: Context) {
    
    companion object {
        private const val TAG = "AppShortcutManager"
        
        // Shortcut IDs
        const val SHORTCUT_YOUTUBE = "iris_youtube_search"
        const val SHORTCUT_WHATSAPP = "iris_whatsapp_message"
        const val SHORTCUT_CHROME = "iris_chrome_search"
        const val SHORTCUT_MAPS = "iris_maps_search"
        const val SHORTCUT_OPEN_APP = "iris_open_app"
        const val SHORTCUT_SEARCH = "iris_search"
        const val SHORTCUT_SEND_MESSAGE = "iris_send_message"
        
        // Maximum number of shortcuts
        private const val MAX_SHORTCUTS = 4
    }
    
    private val shortcutManager: ShortcutManager? by lazy {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            context.getSystemService(ShortcutManager::class.java)
        } else {
            null
        }
    }
    
    private val appResolver: AppResolver by lazy {
        AppResolver(context)
    }
    
    private val appController: AppController by lazy {
        AppController(context)
    }
    
    /**
     * Initialize default shortcuts
     */
    @RequiresApi(Build.VERSION_CODES.N)
    fun initializeDefaultShortcuts() {
        if (shortcutManager == null) {
            Log.w(TAG, "ShortcutManager not available (API < 24)")
            return
        }
        
        try {
            // Check if shortcuts already exist
            val existingShortcuts = shortcutManager?.dynamicShortcuts ?: emptyList()
            if (existingShortcuts.isNotEmpty()) {
                Log.d(TAG, "Shortcuts already exist, skipping initialization")
                return
            }
            
            // Create default shortcuts
            val shortcuts = mutableListOf<ShortcutInfo>()
            
            // YouTube Search shortcut
            if (appResolver.isAppInstalled("YouTube", "com.google.android.youtube")) {
                shortcuts.add(createShortcut(
                    SHORTCUT_YOUTUBE,
                    "YouTube Search",
                    "Search on YouTube",
                    Intent(context, IrisAppControlActivity::class.java).apply {
                        action = "com.iris.ai.ACTION_YOUTUBE_SEARCH"
                    }
                ))
            }
            
            // WhatsApp Message shortcut
            if (appResolver.isAppInstalled("WhatsApp", "com.whatsapp")) {
                shortcuts.add(createShortcut(
                    SHORTCUT_WHATSAPP,
                    "WhatsApp Message",
                    "Send a WhatsApp message",
                    Intent(context, IrisAppControlActivity::class.java).apply {
                        action = "com.iris.ai.ACTION_WHATSAPP_MESSAGE"
                    }
                ))
            }
            
            // Chrome Search shortcut
            if (appResolver.isAppInstalled("Chrome", "com.android.chrome")) {
                shortcuts.add(createShortcut(
                    SHORTCUT_CHROME,
                    "Chrome Search",
                    "Search on Chrome",
                    Intent(context, IrisAppControlActivity::class.java).apply {
                        action = "com.iris.ai.ACTION_CHROME_SEARCH"
                    }
                ))
            }
            
            // Maps Search shortcut
            if (appResolver.isAppInstalled("Maps", "com.google.android.apps.maps")) {
                shortcuts.add(createShortcut(
                    SHORTCUT_MAPS,
                    "Maps Search",
                    "Search on Maps",
                    Intent(context, IrisAppControlActivity::class.java).apply {
                        action = "com.iris.ai.ACTION_MAPS_SEARCH"
                    }
                ))
            }
            
            // Limit to max shortcuts
            if (shortcuts.size > MAX_SHORTCUTS) {
                shortcuts.subList(0, MAX_SHORTCUTS)
            }
            
            if (shortcuts.isNotEmpty()) {
                shortcutManager?.dynamicShortcuts = shortcuts
                Log.d(TAG, "Initialized ${shortcuts.size} default shortcuts")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to initialize shortcuts", e)
        }
    }
    
    /**
     * Create a shortcut
     */
    @RequiresApi(Build.VERSION_CODES.N)
    private fun createShortcut(
        id: String,
        shortLabel: String,
        longLabel: String,
        intent: Intent
    ): ShortcutInfo {
        return ShortcutInfo.Builder(context, id)
            .setShortLabel(shortLabel)
            .setLongLabel(longLabel)
            .setIcon(Icon.createWithResource(context, android.R.drawable.ic_dialog_info))
            .setIntent(intent)
            .build()
    }
    
    /**
     * Create a shortcut with custom icon
     */
    @RequiresApi(Build.VERSION_CODES.N)
    fun createCustomShortcut(
        id: String,
        shortLabel: String,
        longLabel: String,
        intent: Intent,
        iconResId: Int
    ): ShortcutInfo {
        return ShortcutInfo.Builder(context, id)
            .setShortLabel(shortLabel)
            .setLongLabel(longLabel)
            .setIcon(Icon.createWithResource(context, iconResId))
            .setIntent(intent)
            .build()
    }
    
    /**
     * Add a custom shortcut
     */
    @RequiresApi(Build.VERSION_CODES.N)
    fun addShortcut(
        id: String,
        shortLabel: String,
        longLabel: String,
        intent: Intent,
        iconResId: Int? = null
    ): Boolean {
        if (shortcutManager == null) return false
        
        try {
            val existing = shortcutManager?.dynamicShortcuts?.find { it.id == id }
            if (existing != null) {
                Log.d(TAG, "Shortcut $id already exists")
                return false
            }
            
            val shortcut = if (iconResId != null) {
                createCustomShortcut(id, shortLabel, longLabel, intent, iconResId)
            } else {
                createShortcut(id, shortLabel, longLabel, intent)
            }
            
            val currentShortcuts = shortcutManager?.dynamicShortcuts?.toMutableList() ?: mutableListOf()
            
            // Remove oldest if at max
            if (currentShortcuts.size >= MAX_SHORTCUTS) {
                currentShortcuts.removeAt(0)
            }
            
            currentShortcuts.add(shortcut)
            shortcutManager?.dynamicShortcuts = currentShortcuts
            
            Log.d(TAG, "Added shortcut: $id")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to add shortcut", e)
            return false
        }
    }
    
    /**
     * Remove a shortcut
     */
    @RequiresApi(Build.VERSION_CODES.N)
    fun removeShortcut(id: String): Boolean {
        if (shortcutManager == null) return false
        
        try {
            val currentShortcuts = shortcutManager?.dynamicShortcuts?.toMutableList() ?: mutableListOf()
            val removed = currentShortcuts.removeIf { it.id == id }
            
            if (removed) {
                shortcutManager?.dynamicShortcuts = currentShortcuts
                Log.d(TAG, "Removed shortcut: $id")
            }
            
            return removed
        } catch (e: Exception) {
            Log.e(TAG, "Failed to remove shortcut", e)
            return false
        }
    }
    
    /**
     * Update an existing shortcut
     */
    @RequiresApi(Build.VERSION_CODES.N)
    fun updateShortcut(
        id: String,
        shortLabel: String? = null,
        longLabel: String? = null,
        intent: Intent? = null
    ): Boolean {
        if (shortcutManager == null) return false
        
        try {
            val currentShortcuts = shortcutManager?.dynamicShortcuts?.toMutableList() ?: mutableListOf()
            val index = currentShortcuts.indexOfFirst { it.id == id }
            
            if (index == -1) return false
            
            val existing = currentShortcuts[index]
            val builder = ShortcutInfo.Builder(context, id)
                .setShortLabel(shortLabel ?: existing.shortLabel)
                .setLongLabel(longLabel ?: existing.longLabel)
                .setIcon(existing.icon)
                .setIntent(intent ?: existing.intent)
            
            currentShortcuts[index] = builder.build()
            shortcutManager?.dynamicShortcuts = currentShortcuts
            
            Log.d(TAG, "Updated shortcut: $id")
            return true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to update shortcut", e)
            return false
        }
    }
    
    /**
     * Get all shortcuts
     */
    fun getShortcuts(): List<ShortcutInfo> {
        return shortcutManager?.dynamicShortcuts ?: emptyList()
    }
    
    /**
     * Get shortcut by ID
     */
    fun getShortcut(id: String): ShortcutInfo? {
        return shortcutManager?.dynamicShortcuts?.find { it.id == id }
    }
    
    /**
     * Clear all shortcuts
     */
    @RequiresApi(Build.VERSION_CODES.N)
    fun clearAllShortcuts() {
        try {
            shortcutManager?.dynamicShortcuts = emptyList()
            Log.d(TAG, "Cleared all shortcuts")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear shortcuts", e)
        }
    }
    
    /**
     * Handle shortcut click
     */
    fun handleShortcutClick(shortcutId: String): Boolean {
        return when (shortcutId) {
            SHORTCUT_YOUTUBE -> {
                // Open YouTube search
                val actions = appController.planYouTubeSearch("")
                IrisAppControlManager.getInstance(context).executeActionsDirect(actions)
                true
            }
            SHORTCUT_WHATSAPP -> {
                // Open WhatsApp
                appController.openApp("WhatsApp")
                true
            }
            SHORTCUT_CHROME -> {
                // Open Chrome search
                val actions = appController.planChromeSearch("")
                IrisAppControlManager.getInstance(context).executeActionsDirect(actions)
                true
            }
            SHORTCUT_MAPS -> {
                // Open Maps
                appController.openApp("Maps")
                true
            }
            else -> false
        }
    }
    
    /**
     * Create shortcut for a specific app
     */
    @RequiresApi(Build.VERSION_CODES.N)
    fun createAppShortcut(appName: String): Boolean {
        val packageName = appResolver.resolveApp(appName) ?: return false
        
        if (!appResolver.isAppInstalled(appName, packageName)) {
            Log.w(TAG, "App $appName not installed")
            return false
        }
        
        val intent = context.packageManager.getLaunchIntentForPackage(packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        } ?: return false
        
        return addShortcut(
            "iris_open_${appName.lowercase().replace(" ", "_")}",
            "Open $appName",
            "Launch $appName",
            intent
        )
    }
    
    /**
     * Check if shortcuts are supported on this device
     */
    fun isSupported(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.N && shortcutManager != null
    }
}

/**
 * Singleton for easy access
 */
object AppShortcutManagerSingleton {
    private var instance: AppShortcutManager? = null
    
    fun initialize(context: Context): AppShortcutManager {
        instance = AppShortcutManager(context)
        return instance!!
    }
    
    fun getInstance(context: Context): AppShortcutManager {
        if (instance == null) {
            instance = AppShortcutManager(context)
        }
        return instance!!
    }
    
    fun cleanup() {
        instance = null
    }
}

/**
 * App control activity for handling shortcut intents
 */
class IrisAppControlActivity : android.app.Activity() {
    
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        
        handleIntent(intent)
        finish()
    }
    
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
        finish()
    }
    
    private fun handleIntent(intent: Intent) {
        val action = intent.action
        val appControlManager = IrisAppControlManager.getInstance(this)
        
        when (action) {
            "com.iris.ai.ACTION_YOUTUBE_SEARCH" -> {
                val query = intent.getStringExtra("query") ?: ""
                val actions = appControlManager.planYouTubeSearch(query)
                appControlManager.executeActionsDirect(actions)
            }
            "com.iris.ai.ACTION_WHATSAPP_MESSAGE" -> {
                appControlManager.openApp("WhatsApp")
            }
            "com.iris.ai.ACTION_CHROME_SEARCH" -> {
                val query = intent.getStringExtra("query") ?: ""
                val actions = appControlManager.planChromeSearch(query)
                appControlManager.executeActionsDirect(actions)
            }
            "com.iris.ai.ACTION_MAPS_SEARCH" -> {
                val query = intent.getStringExtra("query") ?: ""
                val actions = appControlManager.planMapsSearch(query)
                appControlManager.executeActionsDirect(actions)
            }
        }
    }
}
