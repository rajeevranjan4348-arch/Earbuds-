/*
 * IRIS App Control - Action Planner
 * Plans multi-step actions from parsed commands
 */

package com.iris.ai.appcontrol

import android.util.Log

/**
 * Action Planner
 * Creates detailed action sequences from parsed commands
 */
class IrisActionPlanner(
    private val appResolver: AppResolver
) {
    private const val TAG = "IrisActionPlanner"

    /**
     * Plan actions for a parsed command
     */
    fun plan(parsedCommand: ParsedCommand): List<IrisAction> {
        return when (parsedCommand.intent) {
            CommandType.OPEN_APP -> planOpenApp(parsedCommand)
            CommandType.CLOSE_APP -> planCloseApp(parsedCommand)
            CommandType.SEARCH -> planSearch(parsedCommand)
            CommandType.NAVIGATE -> planNavigate(parsedCommand)
            CommandType.TAP -> planTap(parsedCommand)
            CommandType.TYPE -> planType(parsedCommand)
            CommandType.SCROLL -> planScroll(parsedCommand)
            CommandType.SWIPE -> planSwipe(parsedCommand)
            CommandType.BACK -> listOf(IrisAction(ActionType.BACK, description = "Go back"))
            CommandType.HOME -> listOf(IrisAction(ActionType.HOME, description = "Go home"))
            CommandType.READ_SCREEN -> listOf(IrisAction(ActionType.READ_SCREEN, description = "Read screen"))
            CommandType.APP_ACTION -> planAppAction(parsedCommand)
            CommandType.MULTI_STEP_ACTION -> parsedCommand.actions
            CommandType.UNKNOWN -> listOf(IrisAction(ActionType.STOP, description = "Unknown command"))
        }
    }

    /**
     * Plan open app action
     */
    private fun planOpenApp(parsedCommand: ParsedCommand): List<IrisAction> {
        val appName = parsedCommand.targetApp ?: return emptyList()
        val packageName = appResolver.resolveToPackageName(appName)
        
        if (packageName == null) {
            Log.w(TAG, "Cannot resolve app: $appName")
            return listOf(
                IrisAction(
                    ActionType.STOP,
                    description = "App not found: $appName"
                )
            )
        }

        return listOf(
            IrisAction(
                ActionType.OPEN_APP,
                target = packageName,
                description = "Open $appName"
            ),
            IrisAction(
                ActionType.WAIT_FOR_ELEMENT,
                target = packageName,
                timeout = 5000L,
                description = "Wait for $appName to open"
            ),
            IrisAction(
                ActionType.VERIFY,
                description = "Verify $appName is open"
            )
        )
    }

    /**
     * Plan close app action
     */
    private fun planCloseApp(parsedCommand: ParsedCommand): List<IrisAction> {
        return listOf(
            IrisAction(
                ActionType.BACK,
                description = "Close app"
            )
        )
    }

    /**
     * Plan search action
     */
    private fun planSearch(parsedCommand: ParsedCommand): List<IrisAction> {
        val actions = mutableListOf<IrisAction>()
        
        // If we have a target app, open it first
        if (!parsedCommand.targetApp.isNullOrEmpty()) {
            val packageName = appResolver.resolveToPackageName(parsedCommand.targetApp!!)
            if (packageName != null) {
                actions.add(IrisAction(ActionType.OPEN_APP, target = packageName, description = "Open ${parsedCommand.targetApp}"))
                actions.add(IrisAction(ActionType.WAIT_FOR_ELEMENT, target = packageName, timeout = 5000L, description = "Wait for app"))
            }
        }

        // Find and click search
        actions.add(IrisAction(ActionType.FIND_ELEMENT, target = "Search", description = "Find search input"))
        actions.add(IrisAction(ActionType.CLICK, description = "Click search"))
        
        // Type search query
        // Try to extract query from actions or use a default
        val searchQuery = parsedCommand.actions
            .firstOrNull { it.type == ActionType.SEARCH }?.text
            ?: parsedCommand.actions
                .firstOrNull { it.type == ActionType.TYPE_TEXT }?.text
            ?: ""
        
        if (searchQuery.isNotEmpty()) {
            actions.add(IrisAction(ActionType.TYPE_TEXT, text = searchQuery, description = "Type search query"))
        }
        
        // Submit search
        actions.add(IrisAction(ActionType.CLICK, description = "Submit search"))
        actions.add(IrisAction(ActionType.WAIT, timeout = 2000L, description = "Wait for results"))
        actions.add(IrisAction(ActionType.VERIFY, description = "Verify search results"))

        return actions
    }

    /**
     * Plan navigate action
     */
    private fun planNavigate(parsedCommand: ParsedCommand): List<IrisAction> {
        val actions = mutableListOf<IrisAction>()
        
        // Extract target from actions
        val target = parsedCommand.actions
            .firstOrNull { it.type == ActionType.FIND_ELEMENT }?.target
            ?: parsedCommand.targetApp

        if (target != null) {
            actions.add(IrisAction(ActionType.FIND_ELEMENT, target = target, description = "Find $target"))
            actions.add(IrisAction(ActionType.CLICK, description = "Click $target"))
            actions.add(IrisAction(ActionType.WAIT, timeout = 1000L, description = "Wait for navigation"))
            actions.add(IrisAction(ActionType.VERIFY, description = "Verify navigation"))
        }

        return actions
    }

    /**
     * Plan tap action
     */
    private fun planTap(parsedCommand: ParsedCommand): List<IrisAction> {
        val target = parsedCommand.actions
            .firstOrNull { it.type == ActionType.CLICK }?.target
            ?: parsedCommand.targetApp

        return listOf(
            IrisAction(ActionType.FIND_ELEMENT, target = target, description = "Find $target"),
            IrisAction(ActionType.CLICK, target = target, description = "Tap $target"),
            IrisAction(ActionType.VERIFY, description = "Verify tap")
        )
    }

    /**
     * Plan type action
     */
    private fun planType(parsedCommand: ParsedCommand): List<IrisAction> {
        val text = parsedCommand.actions
            .firstOrNull { it.type == ActionType.TYPE_TEXT }?.text
            ?: ""

        return listOf(
            IrisAction(ActionType.FIND_ELEMENT, target = "Input", description = "Find input field"),
            IrisAction(ActionType.CLICK, description = "Click input"),
            IrisAction(ActionType.TYPE_TEXT, text = text, description = "Type text"),
            IrisAction(ActionType.VERIFY, description = "Verify text typed")
        )
    }

    /**
     * Plan scroll action
     */
    private fun planScroll(parsedCommand: ParsedCommand): List<IrisAction> {
        val direction = parsedCommand.actions
            .firstOrNull { it.type == ActionType.SCROLL }?.direction
            ?: ScrollDirection.DOWN

        return listOf(
            IrisAction(ActionType.SCROLL, direction = direction, description = "Scroll ${direction.name}")
        )
    }

    /**
     * Plan swipe action (converted to scroll)
     */
    private fun planSwipe(parsedCommand: ParsedCommand): List<IrisAction> {
        val direction = parsedCommand.actions
            .firstOrNull { it.type == ActionType.SWIPE || it.type == ActionType.SCROLL }?.direction
            ?: ScrollDirection.DOWN

        return listOf(
            IrisAction(ActionType.SCROLL, direction = direction, description = "Swipe ${direction.name}")
        )
    }

    /**
     * Plan app-specific action
     */
    private fun planAppAction(parsedCommand: ParsedCommand): List<IrisAction> {
        val appName = parsedCommand.targetApp ?: return emptyList()
        
        // Try to use app-specific adapter if available
        val adapter = AppAdapterFactory.getAdapter(appName, appResolver)
        if (adapter != null) {
            return adapter.createActions(parsedCommand)
        }

        // Fallback to generic actions
        return parsedCommand.actions
    }

    /**
     * Create a plan for a YouTube search command
     */
    fun planYouTubeSearch(query: String): List<IrisAction> {
        val packageName = appResolver.resolveToPackageName("YouTube") ?: "com.google.android.youtube"
        
        return listOf(
            IrisAction(ActionType.OPEN_APP, target = packageName, description = "Open YouTube"),
            IrisAction(ActionType.WAIT_FOR_ELEMENT, target = packageName, timeout = 5000L, description = "Wait for YouTube"),
            IrisAction(ActionType.FIND_ELEMENT, target = "Search", description = "Find search button"),
            IrisAction(ActionType.CLICK, description = "Click search"),
            IrisAction(ActionType.WAIT, timeout = 1000L, description = "Wait for search input"),
            IrisAction(ActionType.TYPE_TEXT, text = query, description = "Type query: $query"),
            IrisAction(ActionType.CLICK, description = "Submit search"),
            IrisAction(ActionType.WAIT, timeout = 3000L, description = "Wait for results"),
            IrisAction(ActionType.VERIFY, description = "Verify results")
        )
    }

    /**
     * Create a plan for a WhatsApp message command
     */
    fun planWhatsAppMessage(recipient: String, message: String): List<IrisAction> {
        val packageName = appResolver.resolveToPackageName("WhatsApp") ?: "com.whatsapp"
        
        return listOf(
            IrisAction(ActionType.OPEN_APP, target = packageName, description = "Open WhatsApp"),
            IrisAction(ActionType.WAIT_FOR_ELEMENT, target = packageName, timeout = 5000L, description = "Wait for WhatsApp"),
            IrisAction(ActionType.FIND_ELEMENT, target = "Search", description = "Find search"),
            IrisAction(ActionType.CLICK, description = "Click search"),
            IrisAction(ActionType.TYPE_TEXT, text = recipient, description = "Type recipient: $recipient"),
            IrisAction(ActionType.CLICK, description = "Select recipient"),
            IrisAction(ActionType.WAIT, timeout = 1000L, description = "Wait for chat"),
            IrisAction(ActionType.FIND_ELEMENT, target = "Message", description = "Find message input"),
            IrisAction(ActionType.CLICK, description = "Click message input"),
            IrisAction(ActionType.TYPE_TEXT, text = message, description = "Type message: $message"),
            IrisAction(ActionType.CONFIRM, requiresConfirmation = true, description = "Confirm before sending"),
            IrisAction(ActionType.CLICK, description = "Send message")
        )
    }

    /**
     * Create a plan for Chrome search
     */
    fun planChromeSearch(query: String): List<IrisAction> {
        val packageName = appResolver.resolveToPackageName("Chrome") ?: "com.android.chrome"
        
        return listOf(
            IrisAction(ActionType.OPEN_APP, target = packageName, description = "Open Chrome"),
            IrisAction(ActionType.WAIT_FOR_ELEMENT, target = packageName, timeout = 5000L, description = "Wait for Chrome"),
            IrisAction(ActionType.FIND_ELEMENT, target = "Search", description = "Find search bar"),
            IrisAction(ActionType.CLICK, description = "Click search bar"),
            IrisAction(ActionType.TYPE_TEXT, text = query, description = "Type query: $query"),
            IrisAction(ActionType.CLICK, description = "Submit search"),
            IrisAction(ActionType.WAIT, timeout = 3000L, description = "Wait for results"),
            IrisAction(ActionType.VERIFY, description = "Verify results")
        )
    }

    /**
     * Create a plan for Maps search
     */
    fun planMapsSearch(query: String): List<IrisAction> {
        val packageName = appResolver.resolveToPackageName("Maps") ?: "com.google.android.apps.maps"
        
        return listOf(
            IrisAction(ActionType.OPEN_APP, target = packageName, description = "Open Maps"),
            IrisAction(ActionType.WAIT_FOR_ELEMENT, target = packageName, timeout = 5000L, description = "Wait for Maps"),
            IrisAction(ActionType.FIND_ELEMENT, target = "Search", description = "Find search"),
            IrisAction(ActionType.CLICK, description = "Click search"),
            IrisAction(ActionType.TYPE_TEXT, text = query, description = "Type query: $query"),
            IrisAction(ActionType.CLICK, description = "Submit search"),
            IrisAction(ActionType.WAIT, timeout = 3000L, description = "Wait for results"),
            IrisAction(ActionType.VERIFY, description = "Verify results")
        )
    }
}

/**
 * App Adapter Factory
 * Creates app-specific adapters
 */
object AppAdapterFactory {
    private val adapters = mutableMapOf<String, AppAdapter>()

    init {
        // Register built-in adapters
        registerAdapter(YouTubeAdapter())
        registerAdapter(WhatsAppAdapter())
        registerAdapter(ChromeAdapter())
        registerAdapter(MapsAdapter())
        registerAdapter(GmailAdapter())
    }

    fun registerAdapter(adapter: AppAdapter) {
        adapter.getAppNames().forEach { appName ->
            adapters[appName.lowercase()] = adapter
        }
    }

    fun getAdapter(appName: String, appResolver: AppResolver): AppAdapter? {
        val lowerName = appName.lowercase()
        
        // Try direct match
        adapters[lowerName]?.let { return it }

        // Try resolving package name
        val packageName = appResolver.resolveToPackageName(appName)
        packageName?.let { pkg ->
            adapters[pkg.lowercase()]?.let { return it }
        }

        return null
    }
}

/**
 * App Adapter interface
 */
interface AppAdapter {
    fun getAppNames(): List<String>
    fun createActions(parsedCommand: ParsedCommand): List<IrisAction>
}

/**
 * YouTube Adapter
 */
class YouTubeAdapter : AppAdapter {
    override fun getAppNames(): List<String> {
        return listOf("YouTube", "youtube", "com.google.android.youtube")
    }

    override fun createActions(parsedCommand: ParsedCommand): List<IrisAction> {
        val planner = IrisActionPlanner(AppResolver(null)) // Context not available here
        return when (parsedCommand.intent) {
            CommandType.SEARCH -> {
                val query = parsedCommand.actions
                    .firstOrNull { it.type == ActionType.SEARCH }?.text
                    ?: parsedCommand.actions
                        .firstOrNull { it.type == ActionType.TYPE_TEXT }?.text
                    ?: ""
                planner.planYouTubeSearch(query)
            }
            else -> parsedCommand.actions
        }
    }
}

/**
 * WhatsApp Adapter
 */
class WhatsAppAdapter : AppAdapter {
    override fun getAppNames(): List<String> {
        return listOf("WhatsApp", "whatsapp", "com.whatsapp")
    }

    override fun createActions(parsedCommand: ParsedCommand): List<IrisAction> {
        val planner = IrisActionPlanner(AppResolver(null))
        
        // Check for message sending
        val typeAction = parsedCommand.actions.firstOrNull { it.type == ActionType.TYPE_TEXT }
        val recipient = parsedCommand.targetApp ?: ""
        val message = typeAction?.text ?: ""
        
        if (message.isNotEmpty()) {
            return planner.planWhatsAppMessage(recipient, message)
        }
        
        return parsedCommand.actions
    }
}

/**
 * Chrome Adapter
 */
class ChromeAdapter : AppAdapter {
    override fun getAppNames(): List<String> {
        return listOf("Chrome", "chrome", "browser", "com.android.chrome")
    }

    override fun createActions(parsedCommand: ParsedCommand): List<IrisAction> {
        val planner = IrisActionPlanner(AppResolver(null))
        
        val query = parsedCommand.actions
            .firstOrNull { it.type == ActionType.SEARCH }?.text
            ?: parsedCommand.actions
                .firstOrNull { it.type == ActionType.TYPE_TEXT }?.text
            ?: ""
        
        if (query.isNotEmpty()) {
            return planner.planChromeSearch(query)
        }
        
        return parsedCommand.actions
    }
}

/**
 * Maps Adapter
 */
class MapsAdapter : AppAdapter {
    override fun getAppNames(): List<String> {
        return listOf("Maps", "maps", "Google Maps", "com.google.android.apps.maps")
    }

    override fun createActions(parsedCommand: ParsedCommand): List<IrisAction> {
        val planner = IrisActionPlanner(AppResolver(null))
        
        val query = parsedCommand.actions
            .firstOrNull { it.type == ActionType.SEARCH }?.text
            ?: parsedCommand.actions
                .firstOrNull { it.type == ActionType.TYPE_TEXT }?.text
            ?: ""
        
        if (query.isNotEmpty()) {
            return planner.planMapsSearch(query)
        }
        
        return parsedCommand.actions
    }
}

/**
 * Gmail Adapter
 */
class GmailAdapter : AppAdapter {
    override fun getAppNames(): List<String> {
        return listOf("Gmail", "gmail", "Email", "com.google.android.gm")
    }

    override fun createActions(parsedCommand: ParsedCommand): List<IrisAction> {
        return parsedCommand.actions
    }
}
