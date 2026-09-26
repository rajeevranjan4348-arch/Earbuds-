/*
 * VoiceCommandHandler.kt
 * Handles voice commands specifically for app control
 * Integrates with Iris voice system
 */

package com.iris.ai.appcontrol

import android.content.Context
import android.util.Log
import java.util.regex.Pattern

/**
 * Handles voice commands for app control
 * This class processes voice input and converts it to app control actions
 */
class VoiceCommandHandler(private val context: Context) {
    
    companion object {
        private const val TAG = "VoiceCommandHandler"
        
        // Common voice command patterns
        private val OPEN_PATTERNS = listOf(
            Pattern.compile("(open|kholo|khola|start|launch|run)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(open|kholo|khola)", Pattern.CASE_INSENSITIVE)
        )
        
        private val SEARCH_PATTERNS = listOf(
            Pattern.compile("(search|dhoondo|dhundho|find|look for|khojo)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(search|dhoondo|dhundho|khojo)", Pattern.CASE_INSENSITIVE)
        )
        
        private val SEND_PATTERNS = listOf(
            Pattern.compile("(send|bhejo|bhej|message|msg)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(send|bhejo|bhej)", Pattern.CASE_INSENSITIVE)
        )
        
        private val STOP_PATTERNS = listOf(
            Pattern.compile("(stop|ruko|bas|cancel|tham|band|roko)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(stop|ruko|bas|cancel)", Pattern.CASE_INSENSITIVE)
        )
        
        private val PLAY_PATTERNS = listOf(
            Pattern.compile("(play|chalao|bajao|start)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(play|chalao|bajao)", Pattern.CASE_INSENSITIVE)
        )
        
        private val PAUSE_PATTERNS = listOf(
            Pattern.compile("(pause|roko|thamo|hold)", Pattern.CASE_INSENSITIVE),
            Pattern.compile("(pause|roko|thamo)", Pattern.CASE_INSENSITIVE)
        )
        
        // App name mappings (Hindi/English)
        private val APP_NAMES = mapOf(
            "youtube" to listOf("YouTube", "youtube", "यूट्यूब", "yutub"),
            "whatsapp" to listOf("WhatsApp", "whatsapp", "व्हाट्सएप", "whatsapp"),
            "chrome" to listOf("Chrome", "chrome", "क्रोम", "krom"),
            "maps" to listOf("Maps", "maps", "मैप्स", "नक्शा", "map"),
            "gmail" to listOf("Gmail", "gmail", "जीमेल", "gamil"),
            "instagram" to listOf("Instagram", "instagram", "इंस्टाग्राम", "insta"),
            "facebook" to listOf("Facebook", "facebook", "फेसबुक", "fb"),
            "twitter" to listOf("Twitter", "twitter", "ट्विटर", "x"),
            "settings" to listOf("Settings", "settings", "सेटिंग्स", "सेटिंग"),
            "camera" to listOf("Camera", "camera", "कैमरा", "कैमरा"),
            "gallery" to listOf("Gallery", "gallery", "गैलरी", "फोटो"),
            "messages" to listOf("Messages", "messages", "संदेश", "मेसेज"),
            "phone" to listOf("Phone", "phone", "फोन", "कॉल"),
            "contacts" to listOf("Contacts", "contacts", "संपर्क", "कॉन्टेक्ट्स"),
            "calendar" to listOf("Calendar", "calendar", "कैलेंडर", "तारीख"),
            "calculator" to listOf("Calculator", "calculator", "कैलकुलेटर", "हिसाब"),
            "clock" to listOf("Clock", "clock", "घड़ी", "टाइम"),
            "weather" to listOf("Weather", "weather", "मौसम", "बारिश"),
            "music" to listOf("Music", "music", "संगीत", "गाना", "म्यूजिक"),
            "spotify" to listOf("Spotify", "spotify", "स्पॉटिफाई"),
            "netflix" to listOf("Netflix", "netflix", "नेटफ्लिक्स"),
            "amazon" to listOf("Amazon", "amazon", "अमेज़न"),
            "flipkart" to listOf("Flipkart", "flipkart", "फ्लिपकार्ट"),
            "paytm" to listOf("Paytm", "paytm", "पेटीएम"),
            "phonepe" to listOf("PhonePe", "phonepe", "फोनपे"),
            "google" to listOf("Google", "google", "गूगल"),
            "drive" to listOf("Drive", "drive", "ड्राइव"),
            "docs" to listOf("Docs", "docs", "दस्तावेज़", "डॉक"),
            "sheets" to listOf("Sheets", "sheets", "शीट", "एक्सेल"),
            "slides" to listOf("Slides", "slides", "प्रेजेंटेशन", "पावरपॉइंट")
        )
    }
    
    private val appResolver: AppResolver by lazy { AppResolver(context) }
    private val appController: AppController by lazy { AppController(context) }
    private val commandParser: IrisCommandParser by lazy { IrisCommandParser }
    private val actionPlanner: IrisActionPlanner by lazy { IrisActionPlanner(appController, appResolver) }
    private val permissionManager: PermissionManager by lazy { PermissionManager(context) }
    
    private var isProcessing = false
    private var pendingCommand: String? = null
    
    /**
     * Process voice command
     * Handles Hindi, English, and Hinglish
     */
    fun processVoiceCommand(command: String, callback: VoiceCommandCallback? = null): VoiceCommandResult {
        Log.d(TAG, "Processing voice command: $command")
        
        // Normalize command
        val normalized = normalizeCommand(command)
        
        // Check for stop command first
        if (isStopCommand(normalized)) {
            return handleStopCommand(callback)
        }
        
        // Check if we're already processing
        if (isProcessing) {
            pendingCommand = normalized
            return VoiceCommandResult(
                success = false,
                message = "Already processing a command",
                action = VoiceCommandAction.QUEUE
            )
        }
        
        isProcessing = true
        
        try {
            // Parse the command
            val parsed = commandParser.parse(normalized)
            
            when (parsed) {
                is ParsedCommand.OpenApp -> {
                    return handleOpenApp(parsed, callback)
                }
                is ParsedCommand.CloseApp -> {
                    return handleCloseApp(parsed, callback)
                }
                is ParsedCommand.Search -> {
                    return handleSearch(parsed, callback)
                }
                is ParsedCommand.SendMessage -> {
                    return handleSendMessage(parsed, callback)
                }
                is ParsedCommand.Play -> {
                    return handlePlay(parsed, callback)
                }
                is ParsedCommand.Pause -> {
                    return handlePause(parsed, callback)
                }
                is ParsedCommand.Navigate -> {
                    return handleNavigate(parsed, callback)
                }
                is ParsedCommand.MultiStep -> {
                    return handleMultiStep(parsed, callback)
                }
                else -> {
                    return VoiceCommandResult(
                        success = false,
                        message = "Command not understood",
                        action = VoiceCommandAction.UNKNOWN
                    )
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error processing command", e)
            return VoiceCommandResult(
                success = false,
                message = "Error: ${e.message}",
                action = VoiceCommandAction.ERROR
            )
        } finally {
            isProcessing = false
            // Process pending command if any
            pendingCommand?.let { cmd ->
                pendingCommand = null
                // Process with delay to avoid rapid commands
                android.os.Handler().postDelayed({
                    processVoiceCommand(cmd, callback)
                }, 500)
            }
        }
    }
    
    /**
     * Normalize command (remove extra spaces, fix encoding)
     */
    private fun normalizeCommand(command: String): String {
        return command
            .trim()
            .replace("\\s+".toRegex(), " ")
            .lowercase()
    }
    
    /**
     * Check if command is a stop command
     */
    private fun isStopCommand(command: String): Boolean {
        return STOP_PATTERNS.any { pattern ->
            pattern.matcher(command).find()
        }
    }
    
    /**
     * Handle stop command
     */
    private fun handleStopCommand(callback: VoiceCommandCallback?): VoiceCommandResult {
        val manager = IrisAppControlManager.getInstance(context)
        manager.stopExecution()
        
        callback?.onCommandProcessed(
            VoiceCommandResult(
                success = true,
                message = "Stopped",
                action = VoiceCommandAction.STOP
            )
        )
        
        return VoiceCommandResult(
            success = true,
            message = "Stopped all actions",
            action = VoiceCommandAction.STOP
        )
    }
    
    /**
     * Handle open app command
     */
    private fun handleOpenApp(
        command: ParsedCommand.OpenApp,
        callback: VoiceCommandCallback?
    ): VoiceCommandResult {
        val appName = command.appName
        val resolved = resolveAppName(appName)
        
        Log.d(TAG, "Opening app: $resolved")
        
        if (resolved == null) {
            callback?.onCommandFailed("App not found: $appName")
            return VoiceCommandResult(
                success = false,
                message = "App not found: $appName",
                action = VoiceCommandAction.OPEN_APP
            )
        }
        
        // Check permissions
        if (!permissionManager.checkAccessibilityEnabled()) {
            callback?.onPermissionRequired("Accessibility service must be enabled")
            return VoiceCommandResult(
                success = false,
                message = "Accessibility service must be enabled",
                action = VoiceCommandAction.PERMISSION_REQUIRED
            )
        }
        
        val result = appController.openApp(resolved)
        
        if (result.success) {
            callback?.onCommandProcessed(
                VoiceCommandResult(
                    success = true,
                    message = "Opening $resolved",
                    action = VoiceCommandAction.OPEN_APP,
                    spokenResponse = "Opening $resolved"
                )
            )
        } else {
            callback?.onCommandFailed(result.message)
        }
        
        return VoiceCommandResult(
            success = result.success,
            message = result.message,
            action = VoiceCommandAction.OPEN_APP,
            spokenResponse = if (result.success) "Opening $resolved" else result.message
        )
    }
    
    /**
     * Handle close app command
     */
    private fun handleCloseApp(
        command: ParsedCommand.CloseApp,
        callback: VoiceCommandCallback?
    ): VoiceCommandResult {
        val appName = command.appName
        val resolved = resolveAppName(appName)
        
        if (resolved == null) {
            return VoiceCommandResult(
                success = false,
                message = "App not found: $appName",
                action = VoiceCommandAction.CLOSE_APP
            )
        }
        
        val result = appController.closeApp(resolved)
        
        return VoiceCommandResult(
            success = result.success,
            message = result.message,
            action = VoiceCommandAction.CLOSE_APP,
            spokenResponse = if (result.success) "Closing $resolved" else result.message
        )
    }
    
    /**
     * Handle search command
     */
    private fun handleSearch(
        command: ParsedCommand.Search,
        callback: VoiceCommandCallback?
    ): VoiceCommandResult {
        val query = command.query
        val appName = command.appName
        
        // If no app specified, use Chrome
        val targetApp = appName ?: "Chrome"
        
        val actions = actionPlanner.planSearch(targetApp, query)
        val manager = IrisAppControlManager.getInstance(context)
        
        val success = manager.executeActionsDirect(actions)
        
        return VoiceCommandResult(
            success = success,
            message = "Searching $targetApp for: $query",
            action = VoiceCommandAction.SEARCH,
            spokenResponse = "Searching $targetApp for ${formatQuery(query)}"
        )
    }
    
    /**
     * Handle send message command
     */
    private fun handleSendMessage(
        command: ParsedCommand.SendMessage,
        callback: VoiceCommandCallback?
    ): VoiceCommandResult {
        val recipient = command.recipient
        val message = command.message
        val appName = command.appName ?: "WhatsApp"
        
        // For WhatsApp, check if we need confirmation
        if (permissionManager.requiresConfirmation(appName, IrisActionType.SEND_MESSAGE)) {
            callback?.onConfirmationRequired("Send message to $recipient?")
            return VoiceCommandResult(
                success = false,
                message = "Confirmation required",
                action = VoiceCommandAction.CONFIRMATION_REQUIRED
            )
        }
        
        val actions = actionPlanner.planSendMessage(appName, recipient, message)
        val manager = IrisAppControlManager.getInstance(context)
        
        val success = manager.executeActionsDirect(actions)
        
        return VoiceCommandResult(
            success = success,
            message = "Sending message to $recipient",
            action = VoiceCommandAction.SEND_MESSAGE,
            spokenResponse = "Message sent to $recipient"
        )
    }
    
    /**
     * Handle play command
     */
    private fun handlePlay(
        command: ParsedCommand.Play,
        callback: VoiceCommandCallback?
    ): VoiceCommandResult {
        val content = command.content
        val appName = command.appName ?: "YouTube"
        
        val actions = actionPlanner.planPlay(appName, content)
        val manager = IrisAppControlManager.getInstance(context)
        
        val success = manager.executeActionsDirect(actions)
        
        return VoiceCommandResult(
            success = success,
            message = "Playing $content on $appName",
            action = VoiceCommandAction.PLAY,
            spokenResponse = "Playing $content on $appName"
        )
    }
    
    /**
     * Handle pause command
     */
    private fun handlePause(
        command: ParsedCommand.Pause,
        callback: VoiceCommandCallback?
    ): VoiceCommandResult {
        val appName = command.appName ?: "YouTube"
        
        val actions = actionPlanner.planPause(appName)
        val manager = IrisAppControlManager.getInstance(context)
        
        val success = manager.executeActionsDirect(actions)
        
        return VoiceCommandResult(
            success = success,
            message = "Paused $appName",
            action = VoiceCommandAction.PAUSE,
            spokenResponse = "Paused"
        )
    }
    
    /**
     * Handle navigate command
     */
    private fun handleNavigate(
        command: ParsedCommand.Navigate,
        callback: VoiceCommandCallback?
    ): VoiceCommandResult {
        val target = command.target
        val appName = command.appName
        
        val actions = actionPlanner.planNavigate(appName, target)
        val manager = IrisAppControlManager.getInstance(context)
        
        val success = manager.executeActionsDirect(actions)
        
        return VoiceCommandResult(
            success = success,
            message = "Navigating to $target",
            action = VoiceCommandAction.NAVIGATE,
            spokenResponse = "Navigating to $target"
        )
    }
    
    /**
     * Handle multi-step command
     */
    private fun handleMultiStep(
        command: ParsedCommand.MultiStep,
        callback: VoiceCommandCallback?
    ): VoiceCommandResult {
        val steps = command.steps
        val manager = IrisAppControlManager.getInstance(context)
        
        // Plan all steps
        val allActions = steps.flatMap { step ->
            actionPlanner.planFromCommand(step)
        }
        
        // Check if any step requires confirmation
        val requiresConfirmation = allActions.any { action ->
            permissionManager.requiresConfirmation("", action.type)
        }
        
        if (requiresConfirmation) {
            callback?.onConfirmationRequired("Confirm multi-step action?")
            return VoiceCommandResult(
                success = false,
                message = "Confirmation required for multi-step action",
                action = VoiceCommandAction.CONFIRMATION_REQUIRED
            )
        }
        
        val success = manager.executeActionsDirect(allActions)
        
        return VoiceCommandResult(
            success = success,
            message = "Executing ${steps.size} actions",
            action = VoiceCommandAction.MULTI_STEP,
            spokenResponse = "Executing your command"
        )
    }
    
    /**
     * Resolve app name (handles aliases, Hindi names, etc.)
     */
    private fun resolveAppName(appName: String): String? {
        // Check if it's already a package name
        if (appName.contains(".")) {
            return appResolver.resolveApp(appName)
        }
        
        // Check all known names for this app
        for ((key, names) in APP_NAMES) {
            if (names.any { it.lowercase() == appName.lowercase() }) {
                return appResolver.resolveApp(key)
            }
        }
        
        // Try direct resolution
        return appResolver.resolveApp(appName)
    }
    
    /**
     * Format query for speech
     */
    private fun formatQuery(query: String): String {
        return query
            .replaceFirstChar { it.uppercase() }
            .replace(" ".toRegex(), " ")
    }
    
    /**
     * Confirm pending action
     */
    fun confirmPendingAction() {
        pendingCommand?.let { cmd ->
            pendingCommand = null
            processVoiceCommand(cmd)
        }
    }
    
    /**
     * Cancel pending action
     */
    fun cancelPendingAction() {
        pendingCommand = null
        isProcessing = false
    }
    
    /**
     * Check if processing
     */
    fun isProcessing(): Boolean {
        return isProcessing
    }
    
    /**
     * Get pending command
     */
    fun getPendingCommand(): String? {
        return pendingCommand
    }
}

// ============================================================================
// Data Classes
// ============================================================================

enum class VoiceCommandAction {
    OPEN_APP,
    CLOSE_APP,
    SEARCH,
    SEND_MESSAGE,
    PLAY,
    PAUSE,
    NAVIGATE,
    MULTI_STEP,
    STOP,
    QUEUE,
    CONFIRMATION_REQUIRED,
    PERMISSION_REQUIRED,
    UNKNOWN,
    ERROR
}

data class VoiceCommandResult(
    val success: Boolean,
    val message: String,
    val action: VoiceCommandAction,
    val spokenResponse: String? = null,
    val data: Map<String, Any>? = null
)

interface VoiceCommandCallback {
    fun onCommandProcessed(result: VoiceCommandResult) {}
    fun onCommandFailed(message: String) {}
    fun onPermissionRequired(message: String) {}
    fun onConfirmationRequired(message: String) {}
}

// ============================================================================
// Singleton
// ============================================================================

object VoiceCommandHandlerSingleton {
    private var instance: VoiceCommandHandler? = null
    
    fun initialize(context: Context): VoiceCommandHandler {
        instance = VoiceCommandHandler(context)
        return instance!!
    }
    
    fun getInstance(context: Context): VoiceCommandHandler {
        if (instance == null) {
            instance = VoiceCommandHandler(context)
        }
        return instance!!
    }
    
    fun cleanup() {
        instance = null
    }
}

// ============================================================================
// Extension Functions
// ============================================================================

/**
 * Check if a command string is a stop command
 */
fun String.isStopCommand(): Boolean {
    val patterns = listOf(
        Pattern.compile("(stop|ruko|bas|cancel|tham|band|roko|band karo|band karo)", Pattern.CASE_INSENSITIVE)
    )
    return patterns.any { it.matcher(this).find() }
}

/**
 * Check if a command string is an open command
 */
fun String.isOpenCommand(): Boolean {
    val patterns = listOf(
        Pattern.compile("(open|kholo|khola|chalo|start|launch|run)", Pattern.CASE_INSENSITIVE)
    )
    return patterns.any { it.matcher(this).find() }
}

/**
 * Check if a command string is a search command
 */
fun String.isSearchCommand(): Boolean {
    val patterns = listOf(
        Pattern.compile("(search|dhoondo|dhundho|find|look for|khojo)", Pattern.CASE_INSENSITIVE)
    )
    return patterns.any { it.matcher(this).find() }
}

/**
 * Extract app name from command
 */
fun String.extractAppName(): String? {
    val appNames = listOf(
        "youtube", "whatsapp", "chrome", "maps", "gmail", "instagram", "facebook",
        "settings", "camera", "gallery", "messages", "phone", "contacts",
        "calendar", "calculator", "clock", "weather", "music", "spotify"
    )
    
    val lower = this.lowercase()
    return appNames.find { lower.contains(it) }
}

/**
 * Extract query from command
 */
fun String.extractQuery(): String? {
    val patterns = listOf(
        Pattern.compile("(search|dhoondo|dhundho|find|look for|khojo)\\s+(.+)", Pattern.CASE_INSENSITIVE),
        Pattern.compile("(.+)\\$", Pattern.CASE_INSENSITIVE)
    )
    
    for (pattern in patterns) {
        val matcher = pattern.matcher(this)
        if (matcher.find()) {
            return matcher.group(1)?.trim()
        }
    }
    
    return null
}
