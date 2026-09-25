/*
 * IRIS App Control - Command Parser
 * Natural language command understanding for Android app automation
 * Supports Hindi, English, and Hinglish
 */

package com.iris.ai.appcontrol

import android.util.Log
import java.util.Locale
import java.util.regex.Pattern

/**
 * Command classification types
 */
enum class CommandType {
    OPEN_APP,
    CLOSE_APP,
    SEARCH,
    NAVIGATE,
    TAP,
    TYPE,
    SCROLL,
    SWIPE,
    BACK,
    HOME,
    READ_SCREEN,
    APP_ACTION,
    MULTI_STEP_ACTION,
    UNKNOWN
}

/**
 * Action types for execution
 */
enum class ActionType {
    OPEN_APP,
    WAIT,
    WAIT_FOR_ELEMENT,
    FIND_ELEMENT,
    CLICK,
    TYPE_TEXT,
    CLEAR_TEXT,
    SCROLL,
    SWIPE,
    BACK,
    READ_SCREEN,
    SEARCH,
    VERIFY,
    STOP,
    CONFIRM
}

/**
 * Represents a single action to be executed
 */
data class IrisAction(
    val type: ActionType,
    val target: String? = null,
    val text: String? = null,
    val direction: ScrollDirection? = null,
    val timeout: Long = 5000L,
    val requiresConfirmation: Boolean = false,
    val description: String? = null
)

/**
 * Scroll direction
 */
enum class ScrollDirection {
    UP, DOWN, LEFT, RIGHT
}

/**
 * Parsed command result containing intent and actions
 */
data class ParsedCommand(
    val intent: CommandType,
    val targetApp: String? = null,
    val actions: List<IrisAction> = emptyList(),
    val requiresConfirmation: Boolean = false,
    val confidence: Float = 1.0f
)

/**
 * Iris Command Parser
 * Translates natural language commands into structured actions
 * Supports Hindi, English, and Hinglish
 */
object IrisCommandParser {
    private const val TAG = "IrisCommandParser"

    // Hindi/English app name mappings
    private val appAliases = mapOf(
        // English
        "youtube" to listOf("com.google.android.youtube", "YouTube", "youtube"),
        "chrome" to listOf("com.android.chrome", "Chrome", "browser", "google chrome"),
        "whatsapp" to listOf("com.whatsapp", "WhatsApp", "whatsapp"),
        "maps" to listOf("com.google.android.apps.maps", "Maps", "Google Maps", "maps"),
        "gmail" to listOf("com.google.android.gm", "Gmail", "Email", "gmail"),
        "spotify" to listOf("com.spotify.music", "Spotify", "spotify"),
        "instagram" to listOf("com.instagram.android", "Instagram", "instagram", "insta"),
        "twitter" to listOf("com.twitter.android", "Twitter", "X", "twitter", "x"),
        "settings" to listOf("com.android.settings", "Settings", "settings"),
        "camera" to listOf("com.google.android.GoogleCamera", "Camera", "camera"),
        "clock" to listOf("com.google.android.deskclock", "Clock", "Alarm", "clock", "alarm"),
        "photos" to listOf("com.google.android.apps.photos", "Photos", "Gallery", "photos", "gallery"),
        "messages" to listOf("com.google.android.apps.messaging", "Messages", "SMS", "messages", "sms"),
        "phone" to listOf("com.google.android.dialer", "Phone", "Dialer", "Call", "phone", "dialer", "call"),
        "drive" to listOf("com.google.android.apps.docs", "Drive", "Google Drive", "drive"),
        "calendar" to listOf("com.google.android.calendar", "Calendar", "calendar"),
        "play store" to listOf("com.android.vending", "Play Store", "play store"),
        "files" to listOf("com.google.android.apps.nbu.files", "Files", "files"),

        // Hindi
        "यूट्यूब" to listOf("com.google.android.youtube", "YouTube", "youtube"),
        "यूटयूब" to listOf("com.google.android.youtube", "YouTube", "youtube"),
        "व्हाट्सएप" to listOf("com.whatsapp", "WhatsApp", "whatsapp"),
        "व्हाट्सअप" to listOf("com.whatsapp", "WhatsApp", "whatsapp"),
        "गूगल मैप्स" to listOf("com.google.android.apps.maps", "Maps", "Google Maps"),
        "नक्शा" to listOf("com.google.android.apps.maps", "Maps", "Google Maps"),
        "जीमेल" to listOf("com.google.android.gm", "Gmail", "Email"),
        "स्पॉटिफाई" to listOf("com.spotify.music", "Spotify"),
        "इंस्टाग्राम" to listOf("com.instagram.android", "Instagram", "insta"),
        "सेटिंग्स" to listOf("com.android.settings", "Settings"),
        "कैमरा" to listOf("com.google.android.GoogleCamera", "Camera"),
        "घड़ी" to listOf("com.google.android.deskclock", "Clock", "Alarm"),
        "फोटो" to listOf("com.google.android.apps.photos", "Photos", "Gallery"),
        "संदेश" to listOf("com.google.android.apps.messaging", "Messages", "SMS"),
        "फोन" to listOf("com.google.android.dialer", "Phone", "Dialer", "Call"),
        "ड्राइव" to listOf("com.google.android.apps.docs", "Drive", "Google Drive"),
        "कैलेंडर" to listOf("com.google.android.calendar", "Calendar"),
        "प्ले स्टोर" to listOf("com.android.vending", "Play Store"),

        // Hinglish
        "youtube kholo" to listOf("com.google.android.youtube", "YouTube"),
        "whatsapp kholo" to listOf("com.whatsapp", "WhatsApp"),
        "chrome kholo" to listOf("com.android.chrome", "Chrome"),
        "maps kholo" to listOf("com.google.android.apps.maps", "Maps"),
        "gmail kholo" to listOf("com.google.android.gm", "Gmail"),
        "instagram kholo" to listOf("com.instagram.android", "Instagram"),
        "settings kholo" to listOf("com.android.settings", "Settings")
    )

    // Sensitive actions that require confirmation
    private val sensitiveActions = listOf(
        "send", "post", "submit", "delete", "remove", "buy", "purchase",
        "share", "forward", "reply", "call", "dial", "install", "uninstall",
        "logout", "sign out", "change password", "update", "pay"
    )

    // Patterns for detecting commands
    private val openPatterns = listOf(
        Pattern.compile("(open|launch|start|run|fire up|bring up|switch to|go to|show me)\s+(.+)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("kholo\s+(.+)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("khol\s+(.+)", Pattern.CASE_INSENSITIVE)
    )

    private val searchPatterns = listOf(
        Pattern.compile("(search|search for|look for|find|find out)\s+(?:on|in|for)?\s*(.+)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("search\s+(.+)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("karo\s+(.+)", Pattern.CASE_INSENSITIVE)
    )

    private val closePatterns = listOf(
        Pattern.compile("(close|exit|quit|leave|band)\s+(.+)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("band\s+kar\s+(.+)", Pattern.CASE_INSENSITIVE)
    )

    private val backPatterns = listOf(
        Pattern.compile("go back|back|waapas|piche", Pattern.CASE_INSENSITIVE)
    )

    private val homePatterns = listOf(
        Pattern.compile("go home|home|home screen|main screen", Pattern.CASE_INSENSITIVE)
    )

    private val scrollPatterns = listOf(
        Pattern.compile("(scroll|swipe)\s+(up|down|left|right|upar|niche)", Pattern.CASE_INSENSITIVE)
    )

    private val tapPatterns = listOf(
        Pattern.compile("(tap|click|press|touch|chhoo)\s+(.+)", Pattern.CASE_INSENSITIVE)
    )

    private val typePatterns = listOf(
        Pattern.compile("(type|write|enter|likh)\s+(.+)", Pattern.CASE_INSENSITIVE)
    )

    private val navigatePatterns = listOf(
        Pattern.compile("(go to|navigate to|jao)\s+(.+)", Pattern.CASE_INSENSITIVE)
    )

    /**
     * Parse natural language command into structured actions
     */
    fun parse(command: String): ParsedCommand {
        val cleanCommand = command.trim()
        if (cleanCommand.isEmpty()) {
            return ParsedCommand(CommandType.UNKNOWN, confidence = 0f)
        }

        val lowerCommand = cleanCommand.lowercase(Locale.ROOT)

        // Check for stop/cancel commands first
        if (isStopCommand(lowerCommand)) {
            return ParsedCommand(
                intent = CommandType.APP_ACTION,
                actions = listOf(IrisAction(ActionType.STOP, description = "User requested stop"))
            )
        }

        // Try to detect multi-step commands
        val multiStepResult = parseMultiStepCommand(cleanCommand, lowerCommand)
        if (multiStepResult != null) {
            return multiStepResult
        }

        // Parse single commands
        return parseSingleCommand(cleanCommand, lowerCommand)
    }

    /**
     * Check if command is a stop/cancel command
     */
    private fun isStopCommand(command: String): Boolean {
        val stopKeywords = listOf(
            "stop", "cancel", "ruko", "bas", "band karo", "roko", "tham",
            "cancel this", "stop this", "roko", "band kar"
        )
        return stopKeywords.any { command.contains(it, ignoreCase = true) }
    }

    /**
     * Parse multi-step commands (e.g., "Open YouTube and search for Hindi songs")
     */
    private fun parseMultiStepCommand(cleanCommand: String, lowerCommand: String): ParsedCommand? {
        // Pattern: "Open [App] and [action]"
        val openAndPattern = Pattern.compile(
            "(open|launch|kholo|khol)\s+([^\\s]+)\s+(and|aur|or|phir)\s+(.+)",
            Pattern.CASE_INSENSITIVE
        )
        val matcher = openAndPattern.matcher(lowerCommand)
        if (matcher.find()) {
            val openVerb = matcher.group(1)
            val appName = matcher.group(2)
            val connector = matcher.group(3)
            val actionPart = matcher.group(4)

            val appPackage = resolveAppName(appName)
            if (appPackage != null) {
                val actions = mutableListOf<IrisAction>(
                    IrisAction(ActionType.OPEN_APP, target = appPackage, description = "Open $appName"),
                    IrisAction(ActionType.WAIT_FOR_ELEMENT, target = appPackage, timeout = 5000L)
                )

                // Parse the second part of the command
                val searchAction = parseActionPart(actionPart, appName)
                actions.addAll(searchAction)

                return ParsedCommand(
                    intent = CommandType.MULTI_STEP_ACTION,
                    targetApp = appPackage,
                    actions = actions,
                    confidence = 0.95f
                )
            }
        }

        // Pattern: "[App] kholo aur [action]"
        val appKholoAurPattern = Pattern.compile(
            "([^\\s]+)\s+(kholo|khol)\s+(aur|or|phir)\s+(.+)",
            Pattern.CASE_INSENSITIVE
        )
        val matcher2 = appKholoAurPattern.matcher(lowerCommand)
        if (matcher2.find()) {
            val appName = matcher2.group(1)
            val actionPart = matcher2.group(4)

            val appPackage = resolveAppName(appName)
            if (appPackage != null) {
                val actions = mutableListOf<IrisAction>(
                    IrisAction(ActionType.OPEN_APP, target = appPackage, description = "Open $appName"),
                    IrisAction(ActionType.WAIT_FOR_ELEMENT, target = appPackage, timeout = 5000L)
                )

                val searchAction = parseActionPart(actionPart, appName)
                actions.addAll(searchAction)

                return ParsedCommand(
                    intent = CommandType.MULTI_STEP_ACTION,
                    targetApp = appPackage,
                    actions = actions
                )
            }
        }

        return null
    }

    /**
     * Parse the action part after "and" or "aur"
     */
    private fun parseActionPart(actionPart: String, appName: String): List<IrisAction> {
        val actions = mutableListOf<IrisAction>()
        val lowerAction = actionPart.lowercase(Locale.ROOT)

        // Search action
        if (lowerAction.contains("search") || lowerAction.contains("karo") || lowerAction.contains("dhoond")) {
            val searchQuery = extractSearchQuery(actionPart)
            if (searchQuery.isNotEmpty()) {
                actions.add(IrisAction(ActionType.FIND_ELEMENT, target = "Search", description = "Find search input"))
                actions.add(IrisAction(ActionType.CLICK, description = "Click search"))
                actions.add(IrisAction(ActionType.TYPE_TEXT, text = searchQuery, description = "Type search query"))
                actions.add(IrisAction(ActionType.CLICK, description = "Submit search"))
                actions.add(IrisAction(ActionType.WAIT, timeout = 2000L, description = "Wait for results"))
            }
        }
        // Navigate action
        else if (lowerAction.contains("open") || lowerAction.contains("kholo") || lowerAction.contains("jao")) {
            val target = extractNavigationTarget(actionPart)
            if (target.isNotEmpty()) {
                actions.add(IrisAction(ActionType.FIND_ELEMENT, target = target, description = "Find $target"))
                actions.add(IrisAction(ActionType.CLICK, description = "Click $target"))
            }
        }
        // Type message action
        else if (lowerAction.contains("message") || lowerAction.contains("likh") || lowerAction.contains("send")) {
            val message = extractMessageText(actionPart)
            if (message.isNotEmpty()) {
                actions.add(IrisAction(ActionType.FIND_ELEMENT, target = "Message", description = "Find message input"))
                actions.add(IrisAction(ActionType.CLICK, description = "Click message input"))
                actions.add(IrisAction(ActionType.TYPE_TEXT, text = message, description = "Type message"))
                // Requires confirmation for sending
                actions.add(IrisAction(ActionType.CONFIRM, requiresConfirmation = true, description = "Confirm before sending"))
                actions.add(IrisAction(ActionType.CLICK, description = "Send message"))
            }
        }

        return actions
    }

    /**
     * Extract search query from action part
     */
    private fun extractSearchQuery(actionPart: String): String {
        val lower = actionPart.lowercase(Locale.ROOT)
        return when {
            lower.contains("search for") -> actionPart.substringAfter("search for", "").trim()
            lower.contains("karo") -> actionPart.substringAfter("karo", "").trim()
            lower.contains("search") -> actionPart.substringAfter("search", "").trim()
            lower.contains("dhoond") -> actionPart.substringAfter("dhoond", "").trim()
            else -> actionPart.trim()
        }
    }

    /**
     * Extract navigation target
     */
    private fun extractNavigationTarget(actionPart: String): String {
        val lower = actionPart.lowercase(Locale.ROOT)
        return when {
            lower.contains("open") -> actionPart.substringAfter("open", "").trim()
            lower.contains("kholo") -> actionPart.substringAfter("kholo", "").trim()
            lower.contains("jao") -> actionPart.substringAfter("jao", "").trim()
            else -> actionPart.trim()
        }
    }

    /**
     * Extract message text
     */
    private fun extractMessageText(actionPart: String): String {
        val lower = actionPart.lowercase(Locale.ROOT)
        return when {
            lower.contains("message") -> actionPart.substringAfter("message", "").trim()
            lower.contains("likh") -> actionPart.substringAfter("likh", "").trim()
            else -> actionPart.trim()
        }
    }

    /**
     * Parse single command
     */
    private fun parseSingleCommand(cleanCommand: String, lowerCommand: String): ParsedCommand {
        // Try open patterns
        for (pattern in openPatterns) {
            val matcher = pattern.matcher(lowerCommand)
            if (matcher.find()) {
                val appName = matcher.group(2)
                val appPackage = resolveAppName(appName)
                if (appPackage != null) {
                    return ParsedCommand(
                        intent = CommandType.OPEN_APP,
                        targetApp = appPackage,
                        actions = listOf(
                            IrisAction(ActionType.OPEN_APP, target = appPackage, description = "Open $appName")
                        )
                    )
                }
            }
        }

        // Try search patterns
        for (pattern in searchPatterns) {
            val matcher = pattern.matcher(lowerCommand)
            if (matcher.find()) {
                val query = matcher.group(1)
                return ParsedCommand(
                    intent = CommandType.SEARCH,
                    actions = listOf(
                        IrisAction(ActionType.SEARCH, text = query, description = "Search for $query")
                    )
                )
            }
        }

        // Try close patterns
        for (pattern in closePatterns) {
            val matcher = pattern.matcher(lowerCommand)
            if (matcher.find()) {
                val appName = matcher.group(2)
                return ParsedCommand(
                    intent = CommandType.CLOSE_APP,
                    targetApp = appName,
                    actions = listOf(
                        IrisAction(ActionType.BACK, description = "Close $appName")
                    )
                )
            }
        }

        // Try back patterns
        for (pattern in backPatterns) {
            if (pattern.matcher(lowerCommand).find()) {
                return ParsedCommand(
                    intent = CommandType.BACK,
                    actions = listOf(
                        IrisAction(ActionType.BACK, description = "Go back")
                    )
                )
            }
        }

        // Try home patterns
        for (pattern in homePatterns) {
            if (pattern.matcher(lowerCommand).find()) {
                return ParsedCommand(
                    intent = CommandType.HOME,
                    actions = listOf(
                        IrisAction(ActionType.HOME, description = "Go home")
                    )
                )
            }
        }

        // Try scroll patterns
        for (pattern in scrollPatterns) {
            val matcher = pattern.matcher(lowerCommand)
            if (matcher.find()) {
                val direction = matcher.group(2)
                val scrollDir = when (direction.lowercase(Locale.ROOT)) {
                    "up", "upar" -> ScrollDirection.UP
                    "down", "niche" -> ScrollDirection.DOWN
                    "left" -> ScrollDirection.LEFT
                    "right" -> ScrollDirection.RIGHT
                    else -> ScrollDirection.DOWN
                }
                return ParsedCommand(
                    intent = CommandType.SCROLL,
                    actions = listOf(
                        IrisAction(ActionType.SCROLL, direction = scrollDir, description = "Scroll $direction")
                    )
                )
            }
        }

        // Try tap patterns
        for (pattern in tapPatterns) {
            val matcher = pattern.matcher(lowerCommand)
            if (matcher.find()) {
                val target = matcher.group(2)
                return ParsedCommand(
                    intent = CommandType.TAP,
                    actions = listOf(
                        IrisAction(ActionType.CLICK, target = target, description = "Tap $target")
                    )
                )
            }
        }

        // Try type patterns
        for (pattern in typePatterns) {
            val matcher = pattern.matcher(lowerCommand)
            if (matcher.find()) {
                val text = matcher.group(2)
                return ParsedCommand(
                    intent = CommandType.TYPE,
                    actions = listOf(
                        IrisAction(ActionType.TYPE_TEXT, text = text, description = "Type $text")
                    )
                )
            }
        }

        // Try navigate patterns
        for (pattern in navigatePatterns) {
            val matcher = pattern.matcher(lowerCommand)
            if (matcher.find()) {
                val target = matcher.group(2)
                return ParsedCommand(
                    intent = CommandType.NAVIGATE,
                    actions = listOf(
                        IrisAction(ActionType.FIND_ELEMENT, target = target, description = "Navigate to $target"),
                        IrisAction(ActionType.CLICK, description = "Click $target")
                    )
                )
            }
        }

        // Default: try to find matching app
        val appPackage = resolveAppName(cleanCommand)
        if (appPackage != null) {
            return ParsedCommand(
                intent = CommandType.OPEN_APP,
                targetApp = appPackage,
                actions = listOf(
                    IrisAction(ActionType.OPEN_APP, target = appPackage, description = "Open $cleanCommand")
                )
            )
        }

        return ParsedCommand(CommandType.UNKNOWN, confidence = 0.5f)
    }

    /**
     * Resolve app name to package name using aliases
     */
    fun resolveAppName(appName: String): String? {
        val lowerName = appName.lowercase(Locale.ROOT)
        
        // Direct match
        for ((key, value) in appAliases) {
            if (key.lowercase(Locale.ROOT) == lowerName) {
                return value[0]
            }
        }

        // Check aliases
        for ((key, aliases) in appAliases) {
            for (alias in aliases.drop(1)) {
                if (alias.lowercase(Locale.ROOT) == lowerName) {
                    return appAliases[key]?.get(0)
                }
            }
        }

        return null
    }

    /**
     * Check if action requires confirmation
     */
    fun requiresConfirmation(command: String): Boolean {
        val lower = command.lowercase(Locale.ROOT)
        return sensitiveActions.any { lower.contains(it, ignoreCase = true) }
    }

    /**
     * Check if command is an app control command
     */
    fun isAppControlCommand(command: String): Boolean {
        val parsed = parse(command)
        return parsed.intent != CommandType.UNKNOWN
    }
}
