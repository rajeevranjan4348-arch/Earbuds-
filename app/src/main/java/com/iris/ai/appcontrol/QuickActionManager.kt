/*
 * QuickActionManager.kt
 * Manages quick actions for rapid app control
 * Provides one-tap access to common tasks
 */

package com.iris.ai.appcontrol

import android.content.Context
import android.util.Log

/**
 * Manages quick actions for rapid app control
 * Provides predefined actions that can be executed with minimal input
 */
class QuickActionManager(private val context: Context) {
    
    companion object {
        private const val TAG = "QuickActionManager"
    }
    
    private val appResolver: AppResolver by lazy { AppResolver(context) }
    private val appController: AppController by lazy { AppController(context) }
    private val actionPlanner: IrisActionPlanner by lazy { IrisActionPlanner(appController, appResolver) }
    private val permissionManager: PermissionManager by lazy { PermissionManager(context) }
    private val usageTracker: AppUsageTracker by lazy { AppUsageTracker(context) }
    
    // Quick action registry
    private val quickActions = mutableMapOf<String, QuickAction>()
    
    // Quick action categories
    private val categories = mutableMapOf<String, List<String>>()
    
    init {
        initializeDefaultActions()
    }
    
    /**
     * Initialize default quick actions
     */
    private fun initializeDefaultActions() {
        // Social Media Actions
        registerQuickAction(QuickAction(
            id = "open_whatsapp",
            name = "Open WhatsApp",
            nameHindi = "व्हाट्सएप खोलो",
            description = "Open WhatsApp messaging app",
            descriptionHindi = "व्हाट्सएप मैसेजिंग ऐप खोलें",
            category = "Social",
            iconResId = android.R.drawable.ic_dialog_email,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "WhatsApp",
            parameters = emptyMap(),
            requiresConfirmation = false,
            requiresAccessibility = true,
            priority = 10
        ))
        
        registerQuickAction(QuickAction(
            id = "open_instagram",
            name = "Open Instagram",
            nameHindi = "इंस्टाग्राम खोलो",
            description = "Open Instagram app",
            descriptionHindi = "इंस्टाग्राम ऐप खोलें",
            category = "Social",
            iconResId = android.R.drawable.ic_dialog_email,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Instagram",
            priority = 9
        ))
        
        registerQuickAction(QuickAction(
            id = "open_facebook",
            name = "Open Facebook",
            nameHindi = "फेसबुक खोलो",
            description = "Open Facebook app",
            descriptionHindi = "फेसबुक ऐप खोलें",
            category = "Social",
            iconResId = android.R.drawable.ic_dialog_email,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Facebook",
            priority = 8
        ))
        
        registerQuickAction(QuickAction(
            id = "open_twitter",
            name = "Open Twitter",
            nameHindi = "ट्विटर खोलो",
            description = "Open Twitter app",
            descriptionHindi = "ट्विटर ऐप खोलें",
            category = "Social",
            iconResId = android.R.drawable.ic_dialog_email,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Twitter",
            priority = 7
        ))
        
        // Communication Actions
        registerQuickAction(QuickAction(
            id = "open_gmail",
            name = "Open Gmail",
            nameHindi = "जीमेल खोलो",
            description = "Open Gmail for emails",
            descriptionHindi = "ईमेल के लिए जीमेल खोलें",
            category = "Communication",
            iconResId = android.R.drawable.ic_dialog_email,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Gmail",
            priority = 10
        ))
        
        registerQuickAction(QuickAction(
            id = "open_phone",
            name = "Open Phone",
            nameHindi = "फोन खोलो",
            description = "Open Phone app",
            descriptionHindi = "फोन ऐप खोलें",
            category = "Communication",
            iconResId = android.R.drawable.ic_dialog_phone,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Phone",
            priority = 9
        ))
        
        registerQuickAction(QuickAction(
            id = "open_contacts",
            name = "Open Contacts",
            nameHindi = "संपर्क खोलो",
            description = "Open Contacts app",
            descriptionHindi = "संपर्क ऐप खोलें",
            category = "Communication",
            iconResId = android.R.drawable.ic_dialog_info,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Contacts",
            priority = 8
        ))
        
        // Media Actions
        registerQuickAction(QuickAction(
            id = "open_youtube",
            name = "Open YouTube",
            nameHindi = "यूट्यूब खोलो",
            description = "Open YouTube for videos",
            descriptionHindi = "वीडियो के लिए यूट्यूब खोलें",
            category = "Media",
            iconResId = android.R.drawable.ic_media_play,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "YouTube",
            priority = 10
        ))
        
        registerQuickAction(QuickAction(
            id = "open_spotify",
            name = "Open Spotify",
            nameHindi = "स्पॉटिफाई खोलो",
            description = "Open Spotify for music",
            descriptionHindi = "संगीत के लिए स्पॉटिफाई खोलें",
            category = "Media",
            iconResId = android.R.drawable.ic_media_play,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Spotify",
            priority = 9
        ))
        
        registerQuickAction(QuickAction(
            id = "open_netflix",
            name = "Open Netflix",
            nameHindi = "नेटफ्लिक्स खोलो",
            description = "Open Netflix for movies and shows",
            descriptionHindi = "मूवीज और शोज के लिए नेटफ्लिक्स खोलें",
            category = "Media",
            iconResId = android.R.drawable.ic_media_play,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Netflix",
            priority = 8
        ))
        
        // Productivity Actions
        registerQuickAction(QuickAction(
            id = "open_chrome",
            name = "Open Chrome",
            nameHindi = "क्रोम खोलो",
            description = "Open Chrome browser",
            descriptionHindi = "क्रोम ब्राउज़र खोलें",
            category = "Productivity",
            iconResId = android.R.drawable.ic_menu_compass,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Chrome",
            priority = 10
        ))
        
        registerQuickAction(QuickAction(
            id = "open_drive",
            name = "Open Drive",
            nameHindi = "ड्राइव खोलो",
            description = "Open Google Drive",
            descriptionHindi = "गूगल ड्राइव खोलें",
            category = "Productivity",
            iconResId = android.R.drawable.ic_menu_save,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Drive",
            priority = 9
        ))
        
        registerQuickAction(QuickAction(
            id = "open_calendar",
            name = "Open Calendar",
            nameHindi = "कैलेंडर खोलो",
            description = "Open Calendar app",
            descriptionHindi = "कैलेंडर ऐप खोलें",
            category = "Productivity",
            iconResId = android.R.drawable.ic_menu_agenda,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Calendar",
            priority = 8
        ))
        
        registerQuickAction(QuickAction(
            id = "open_maps",
            name = "Open Maps",
            nameHindi = "नक्शा खोलो",
            description = "Open Google Maps",
            descriptionHindi = "गूगल नक्शा खोलें",
            category = "Navigation",
            iconResId = android.R.drawable.ic_menu_mapmode,
            actionType = QuickActionType.OPEN_APP,
            targetApp = "Maps",
            priority = 10
        ))
        
        // Search Actions
        registerQuickAction(QuickAction(
            id = "youtube_search",
            name = "YouTube Search",
            nameHindi = "यूट्यूब सर्च",
            description = "Search on YouTube",
            descriptionHindi = "यूट्यूब पर सर्च करें",
            category = "Search",
            iconResId = android.R.drawable.ic_menu_search,
            actionType = QuickActionType.SEARCH,
            targetApp = "YouTube",
            parameters = mapOf("query" to ""),
            requiresAccessibility = true,
            priority = 10
        ))
        
        registerQuickAction(QuickAction(
            id = "chrome_search",
            name = "Chrome Search",
            nameHindi = "क्रोम सर्च",
            description = "Search on Chrome",
            descriptionHindi = "क्रोम पर सर्च करें",
            category = "Search",
            iconResId = android.R.drawable.ic_menu_search,
            actionType = QuickActionType.SEARCH,
            targetApp = "Chrome",
            parameters = mapOf("query" to ""),
            requiresAccessibility = true,
            priority = 9
        ))
        
        registerQuickAction(QuickAction(
            id = "maps_search",
            name = "Maps Search",
            nameHindi = "नक्शा सर्च",
            description = "Search on Maps",
            descriptionHindi = "नक्शा पर सर्च करें",
            category = "Search",
            iconResId = android.R.drawable.ic_menu_search,
            actionType = QuickActionType.SEARCH,
            targetApp = "Maps",
            parameters = mapOf("query" to ""),
            requiresAccessibility = true,
            priority = 8
        ))
        
        // Message Actions
        registerQuickAction(QuickAction(
            id = "whatsapp_message",
            name = "WhatsApp Message",
            nameHindi = "व्हाट्सएप मैसेज",
            description = "Send a WhatsApp message",
            descriptionHindi = "व्हाट्सएप मैसेज भेजें",
            category = "Messages",
            iconResId = android.R.drawable.ic_dialog_email,
            actionType = QuickActionType.SEND_MESSAGE,
            targetApp = "WhatsApp",
            parameters = mapOf("recipient" to "", "message" to ""),
            requiresConfirmation = true,
            requiresAccessibility = true,
            priority = 10
        ))
        
        // Utility Actions
        registerQuickAction(QuickAction(
            id = "stop_all",
            name = "Stop All",
            nameHindi = "सभी रोकें",
            description = "Stop all current actions",
            descriptionHindi = "सभी क्रियाएं रोकें",
            category = "Utility",
            iconResId = android.R.drawable.ic_media_pause,
            actionType = QuickActionType.STOP,
            priority = 10
        ))
        
        registerQuickAction(QuickAction(
            id = "go_back",
            name = "Go Back",
            nameHindi = "वापस जाओ",
            description = "Navigate back",
            descriptionHindi = "वापस नविगेट करें",
            category = "Utility",
            iconResId = android.R.drawable.ic_media_previous,
            actionType = QuickActionType.NAVIGATE,
            parameters = mapOf("direction" to "back"),
            requiresAccessibility = true,
            priority = 9
        ))
        
        registerQuickAction(QuickAction(
            id = "go_home",
            name = "Go Home",
            nameHindi = "होम पर जाओ",
            description = "Go to home screen",
            descriptionHindi = "होम स्क्रीन पर जाएं",
            category = "Utility",
            iconResId = android.R.drawable.ic_menu_myplaces,
            actionType = QuickActionType.NAVIGATE,
            parameters = mapOf("direction" to "home"),
            requiresAccessibility = true,
            priority = 8
        ))
        
        // Organize categories
        organizeCategories()
        
        Log.d(TAG, "Initialized ${quickActions.size} default quick actions")
    }
    
    /**
     * Organize actions into categories
     */
    private fun organizeCategories() {
        categories.clear()
        
        quickActions.values
            .groupBy { it.category }
            .forEach { (category, actions) ->
                categories[category] = actions
                    .sortedByDescending { it.priority }
                    .map { it.id }
            }
    }
    
    /**
     * Register a quick action
     */
    fun registerQuickAction(action: QuickAction) {
        quickActions[action.id] = action
        organizeCategories()
        Log.d(TAG, "Registered quick action: ${action.id}")
    }
    
    /**
     * Unregister a quick action
     */
    fun unregisterQuickAction(id: String): Boolean {
        val removed = quickActions.remove(id) != null
        if (removed) {
            organizeCategories()
            Log.d(TAG, "Unregistered quick action: $id")
        }
        return removed
    }
    
    /**
     * Get quick action by ID
     */
    fun getQuickAction(id: String): QuickAction? {
        return quickActions[id]
    }
    
    /**
     * Get all quick actions
     */
    fun getAllQuickActions(): List<QuickAction> {
        return quickActions.values
            .sortedByDescending { it.priority }
            .toList()
    }
    
    /**
     * Get quick actions by category
     */
    fun getQuickActionsByCategory(category: String): List<QuickAction> {
        return categories[category]
            ?.mapNotNull { id -> quickActions[id] }
            ?.sortedByDescending { it.priority }
            ?: emptyList()
    }
    
    /**
     * Get all categories
     */
    fun getCategories(): List<String> {
        return categories.keys.sorted()
    }
    
    /**
     * Execute a quick action by ID
     */
    fun executeQuickAction(id: String): QuickActionResult {
        val action = quickActions[id] ?: return QuickActionResult(
            success = false,
            message = "Quick action not found: $id",
            actionId = id
        )
        
        return executeQuickAction(action)
    }
    
    /**
     * Execute a quick action
     */
    fun executeQuickAction(action: QuickAction): QuickActionResult {
        Log.d(TAG, "Executing quick action: ${action.id}")
        
        // Check accessibility requirement
        if (action.requiresAccessibility && !permissionManager.checkAccessibilityEnabled()) {
            return QuickActionResult(
                success = false,
                message = "Accessibility service must be enabled",
                actionId = action.id,
                requiresAccessibility = true
            )
        }
        
        // Check confirmation requirement
        if (action.requiresConfirmation) {
            return QuickActionResult(
                success = false,
                message = "Confirmation required",
                actionId = action.id,
                requiresConfirmation = true,
                confirmationMessage = "Are you sure you want to ${action.name.lowercase()}?"
            )
        }
        
        return when (action.actionType) {
            QuickActionType.OPEN_APP -> {
                val packageName = appResolver.resolveApp(action.targetApp)
                if (packageName == null) {
                    QuickActionResult(
                        success = false,
                        message = "App not found: ${action.targetApp}",
                        actionId = action.id
                    )
                } else {
                    val result = appController.openApp(packageName)
                    usageTracker.recordUsage(action.targetApp, packageName, UsageAction.OPEN)
                    QuickActionResult(
                        success = result.success,
                        message = result.message,
                        actionId = action.id,
                        spokenResponse = "Opening ${action.targetApp}"
                    )
                }
            }
            
            QuickActionType.CLOSE_APP -> {
                val packageName = appResolver.resolveApp(action.targetApp)
                if (packageName == null) {
                    QuickActionResult(
                        success = false,
                        message = "App not found: ${action.targetApp}",
                        actionId = action.id
                    )
                } else {
                    val result = appController.closeApp(packageName)
                    QuickActionResult(
                        success = result.success,
                        message = result.message,
                        actionId = action.id,
                        spokenResponse = "Closing ${action.targetApp}"
                    )
                }
            }
            
            QuickActionType.SEARCH -> {
                val query = action.parameters["query"] as? String ?: ""
                val actions = actionPlanner.planSearch(action.targetApp, query)
                val manager = IrisAppControlManager.getInstance(context)
                val success = manager.executeActionsDirect(actions)
                
                if (success) {
                    usageTracker.recordUsage(action.targetApp, "", UsageAction.SEARCH)
                }
                
                QuickActionResult(
                    success = success,
                    message = "Searching ${action.targetApp} for: $query",
                    actionId = action.id,
                    spokenResponse = "Searching ${action.targetApp}"
                )
            }
            
            QuickActionType.SEND_MESSAGE -> {
                val recipient = action.parameters["recipient"] as? String ?: ""
                val message = action.parameters["message"] as? String ?: ""
                
                if (recipient.isEmpty() || message.isEmpty()) {
                    QuickActionResult(
                        success = false,
                        message = "Recipient and message required",
                        actionId = action.id,
                        requiresConfirmation = true
                    )
                } else {
                    val actions = actionPlanner.planSendMessage(action.targetApp, recipient, message)
                    val manager = IrisAppControlManager.getInstance(context)
                    val success = manager.executeActionsDirect(actions)
                    
                    if (success) {
                        usageTracker.recordUsage(action.targetApp, "", UsageAction.SEND_MESSAGE)
                    }
                    
                    QuickActionResult(
                        success = success,
                        message = "Sending message to $recipient",
                        actionId = action.id,
                        spokenResponse = "Message sent"
                    )
                }
            }
            
            QuickActionType.NAVIGATE -> {
                val direction = action.parameters["direction"] as? String ?: "back"
                val actions = when (direction) {
                    "back" -> actionPlanner.planBack()
                    "home" -> actionPlanner.planHome()
                    else -> actionPlanner.planBack()
                }
                val manager = IrisAppControlManager.getInstance(context)
                val success = manager.executeActionsDirect(actions)
                
                QuickActionResult(
                    success = success,
                    message = "Navigating $direction",
                    actionId = action.id,
                    spokenResponse = "Navigated $direction"
                )
            }
            
            QuickActionType.STOP -> {
                val manager = IrisAppControlManager.getInstance(context)
                manager.stopExecution()
                QuickActionResult(
                    success = true,
                    message = "Stopped all actions",
                    actionId = action.id,
                    spokenResponse = "Stopped"
                )
            }
            
            QuickActionType.CUSTOM -> {
                // Execute custom action
                val customActions = actionPlanner.planCustomAction(action.parameters)
                val manager = IrisAppControlManager.getInstance(context)
                val success = manager.executeActionsDirect(customActions)
                
                QuickActionResult(
                    success = success,
                    message = "Executed custom action",
                    actionId = action.id
                )
            }
        }
    }
    
    /**
     * Execute quick action with parameters
     */
    fun executeQuickActionWithParams(
        id: String,
        parameters: Map<String, Any>
    ): QuickActionResult {
        val action = quickActions[id] ?: return QuickActionResult(
            success = false,
            message = "Quick action not found: $id",
            actionId = id
        )
        
        // Create a copy with updated parameters
        val actionWithParams = action.copy(
            parameters = action.parameters + parameters
        )
        
        return executeQuickAction(actionWithParams)
    }
    
    /**
     * Search for quick actions
     */
    fun searchQuickActions(query: String, limit: Int = 10): List<QuickAction> {
        return quickActions.values
            .filter { action ->
                action.name.contains(query, ignoreCase = true) ||
                action.nameHindi.contains(query, ignoreCase = true) ||
                action.description.contains(query, ignoreCase = true) ||
                action.descriptionHindi.contains(query, ignoreCase = true) ||
                action.targetApp.contains(query, ignoreCase = true)
            }
            .sortedByDescending { it.priority }
            .take(limit)
    }
    
    /**
     * Get popular quick actions (based on usage)
     */
    fun getPopularQuickActions(limit: Int = 10): List<QuickAction> {
        val usageTracker = AppUsageTrackerSingleton.getInstance(context)
        val popularApps = usageTracker.getFavoriteApps(limit)
        
        return popularApps
            .mapNotNull { stats ->
                quickActions.values.find { action ->
                    action.targetApp.equals(stats.appName, ignoreCase = true) ||
                    action.targetApp.equals(stats.packageName, ignoreCase = true)
                }
            }
            .distinctBy { it.id }
            .take(limit)
    }
    
    /**
     * Get recently used quick actions
     */
    fun getRecentlyUsedQuickActions(limit: Int = 5): List<QuickAction> {
        // This would need usage tracking for quick actions
        // For now, return top priority actions
        return quickActions.values
            .sortedByDescending { it.priority }
            .take(limit)
    }
    
    /**
     * Create a custom quick action
     */
    fun createCustomQuickAction(
        id: String,
        name: String,
        nameHindi: String,
        description: String,
        descriptionHindi: String,
        category: String,
        actionType: QuickActionType,
        targetApp: String,
        parameters: Map<String, Any> = emptyMap(),
        requiresConfirmation: Boolean = false,
        requiresAccessibility: Boolean = false,
        priority: Int = 5
    ): QuickAction {
        val action = QuickAction(
            id = id,
            name = name,
            nameHindi = nameHindi,
            description = description,
            descriptionHindi = descriptionHindi,
            category = category,
            iconResId = android.R.drawable.ic_menu_myplaces,
            actionType = actionType,
            targetApp = targetApp,
            parameters = parameters,
            requiresConfirmation = requiresConfirmation,
            requiresAccessibility = requiresAccessibility,
            priority = priority
        )
        
        registerQuickAction(action)
        return action
    }
}

// ============================================================================
// Data Classes
// ============================================================================

data class QuickAction(
    val id: String,
    val name: String,
    val nameHindi: String,
    val description: String,
    val descriptionHindi: String,
    val category: String,
    val iconResId: Int,
    val actionType: QuickActionType,
    val targetApp: String,
    val parameters: Map<String, Any> = emptyMap(),
    val requiresConfirmation: Boolean = false,
    val requiresAccessibility: Boolean = false,
    val priority: Int = 5
)

enum class QuickActionType {
    OPEN_APP,
    CLOSE_APP,
    SEARCH,
    SEND_MESSAGE,
    PLAY,
    PAUSE,
    NAVIGATE,
    STOP,
    CUSTOM
}

data class QuickActionResult(
    val success: Boolean,
    val message: String,
    val actionId: String,
    val spokenResponse: String? = null,
    val requiresConfirmation: Boolean = false,
    val confirmationMessage: String? = null,
    val requiresAccessibility: Boolean = false,
    val data: Map<String, Any>? = null
)

// ============================================================================
// Singleton
// ============================================================================

object QuickActionManagerSingleton {
    private var instance: QuickActionManager? = null
    
    fun initialize(context: Context): QuickActionManager {
        instance = QuickActionManager(context)
        return instance!!
    }
    
    fun getInstance(context: Context): QuickActionManager {
        if (instance == null) {
            instance = QuickActionManager(context)
        }
        return instance!!
    }
    
    fun cleanup() {
        instance = null
    }
}
