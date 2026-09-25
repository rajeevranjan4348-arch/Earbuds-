/*
 * IRIS Integration - Connects App Control with existing Iris AI
 * Integration point between the new app control system and existing Iris
 */

package com.iris.ai

import android.content.Context
import android.util.Log
import com.iris.ai.accessibility.IrisAccessibilityService
import com.iris.ai.appcontrol.*

/**
 * Iris Integration Manager
 * Connects the app control system with the existing Iris AI pipeline
 */
class IrisIntegration(private val context: Context) {
    private const val TAG = "IrisIntegration"

    // App Control Manager
    private val appControlManager: IrisAppControlManager by lazy {
        IrisAppControlManager(context).apply { initialize() }
    }

    // State
    private var isProcessingCommand = false
    private var lastCommand: String? = null
    private var lastResult: String? = null

    init {
        Log.d(TAG, "IrisIntegration initialized")
    }

    /**
     * Process a command through the full Iris pipeline
     * This is the main entry point for integrating with existing Iris
     * 
     * @param command The natural language command
     * @param callback Optional callback for results
     * @return Result message
     */
    fun processCommand(command: String, callback: ((String, String?) -> Unit)? = null): String {
        lastCommand = command
        isProcessingCommand = true

        Log.d(TAG, "Processing command: $command")

        // Check if this is an app control command
        if (appControlManager.isAppControlCommand(command)) {
            val result = appControlManager.processCommand(command)
            lastResult = result.message
            isProcessingCommand = false
            
            callback?.invoke(result.message, result.spokenResponse)
            return result.message
        }

        // Not an app control command, pass through to existing Iris AI
        isProcessingCommand = false
        return "Command passed to Iris AI: $command"
    }

    /**
     * Process command and get spoken response
     */
    fun processCommandWithSpeech(command: String): String {
        if (appControlManager.isAppControlCommand(command)) {
            return appControlManager.processCommandWithSpeech(command)
        }
        return "Processing: $command"
    }

    /**
     * Check if command is for app control
     */
    fun isAppControlCommand(command: String): Boolean {
        return appControlManager.isAppControlCommand(command)
    }

    /**
     * Set up callbacks for app control events
     */
    fun setupAppControlCallbacks(
        onCommandParsed: (String, ParsedCommand) -> Unit = { _, _ -> },
        onPermissionRequired: (String, android.content.Intent?) -> Unit = { _, _ -> },
        onConfirmationRequired: (String, IrisAction) -> Unit = { _, _ -> },
        onProgress: (String, Int, Int) -> Unit = { _, _, _ -> },
        onActionStart: (String) -> Unit = { _ -> },
        onActionComplete: (String, Boolean) -> Unit = { _, _ -> },
        onSuccess: (String, String?) -> Unit = { _, _ -> },
        onError: (String, String?) -> Unit = { _, _ -> },
        onComplete: () -> Unit = { }
    ) {
        appControlManager.setCommandCallback(object : IrisAppControlManager.CommandCallback {
            override fun onCommandParsed(command: String, parsed: ParsedCommand) {
                onCommandParsed(command, parsed)
            }

            override fun onPermissionRequired(permission: String, intent: android.content.Intent?) {
                onPermissionRequired(permission, intent)
            }

            override fun onConfirmationRequired(command: String, action: IrisAction) {
                onConfirmationRequired(command, action)
            }
        })

        appControlManager.setProgressCallback(object : IrisAppControlManager.ProgressCallback {
            override fun onProgress(action: String, progress: Int, total: Int) {
                onProgress(action, progress, total)
            }

            override fun onActionStart(action: String) {
                onActionStart(action)
            }

            override fun onActionComplete(action: String, success: Boolean) {
                onActionComplete(action, success)
            }
        })

        appControlManager.setResultCallback(object : IrisAppControlManager.ResultCallback {
            override fun onSuccess(message: String, spokenResponse: String?) {
                onSuccess(message, spokenResponse)
            }

            override fun onError(message: String, error: String?) {
                onError(message, error)
            }

            override fun onComplete() {
                onComplete()
            }
        })
    }

    /**
     * Set accessibility service for app control
     */
    fun setAccessibilityService(service: IrisAccessibilityService) {
        appControlManager.setAccessibilityService(service)
    }

    /**
     * Confirm pending action
     */
    fun confirmPendingAction() {
        appControlManager.confirmPending()
    }

    /**
     * Cancel pending action
     */
    fun cancelPendingAction() {
        appControlManager.cancelPending()
    }

    /**
     * Stop current execution
     */
    fun stopExecution() {
        appControlManager.stopExecution()
        isProcessingCommand = false
    }

    /**
     * Check if accessibility service is enabled
     */
    fun isAccessibilityEnabled(): Boolean {
        return appControlManager.isAccessibilityEnabled()
    }

    /**
     * Get intent to enable accessibility service
     */
    fun getAccessibilityIntent(): android.content.Intent {
        return appControlManager.getAccessibilityIntent()
    }

    /**
     * Get list of installed apps
     */
    fun getInstalledApps(): List<AppInfo> {
        return appControlManager.getInstalledApps()
    }

    /**
     * Resolve app name to package name
     */
    fun resolveApp(appName: String): String? {
        return appControlManager.resolveApp(appName)
    }

    /**
     * Open an app directly
     */
    fun openApp(appName: String): AppControlResult {
        return appControlManager.openApp(appName)
    }

    /**
     * Execute a list of actions directly
     */
    fun executeActions(actions: List<IrisAction>): Boolean {
        return appControlManager.executeActionsDirect(actions)
    }

    /**
     * Plan and execute YouTube search
     */
    fun searchYouTube(query: String): String {
        val actions = appControlManager.planYouTubeSearch(query)
        return if (executeActions(actions)) {
            "Searching YouTube for: $query"
        } else {
            "Cannot search YouTube"
        }
    }

    /**
     * Plan and execute WhatsApp message
     */
    fun sendWhatsAppMessage(recipient: String, message: String): String {
        val actions = appControlManager.planWhatsAppMessage(recipient, message)
        return if (executeActions(actions)) {
            "Sending message to $recipient"
        } else {
            "Cannot send message"
        }
    }

    /**
     * Plan and execute Chrome search
     */
    fun searchChrome(query: String): String {
        val actions = appControlManager.planChromeSearch(query)
        return if (executeActions(actions)) {
            "Searching Chrome for: $query"
        } else {
            "Cannot search Chrome"
        }
    }

    /**
     * Plan and execute Maps search
     */
    fun searchMaps(query: String): String {
        val actions = appControlManager.planMapsSearch(query)
        return if (executeActions(actions)) {
            "Searching Maps for: $query"
        } else {
            "Cannot search Maps"
        }
    }

    /**
     * Get current execution state
     */
    fun isProcessing(): Boolean {
        return isProcessingCommand || appControlManager.isExecuting()
    }

    /**
     * Get last command
     */
    fun getLastCommand(): String? {
        return lastCommand
    }

    /**
     * Get last result
     */
    fun getLastResult(): String? {
        return lastResult
    }

    /**
     * Cleanup
     */
    fun cleanup() {
        appControlManager.cleanup()
        isProcessingCommand = false
        lastCommand = null
        lastResult = null
    }

    /**
     * Parse a command without executing
     */
    fun parseCommand(command: String): ParsedCommand {
        return IrisCommandParser.parse(command)
    }

    /**
     * Plan actions for a command without executing
     */
    fun planCommand(command: String): List<IrisAction> {
        val parsed = parseCommand(command)
        return appControlManager.actionPlanner.plan(parsed)
    }
}

/**
 * Singleton for easy access
 */
object IrisIntegrationManager {
    private var instance: IrisIntegration? = null

    fun initialize(context: Context): IrisIntegration {
        instance = IrisIntegration(context)
        return instance!!
    }

    fun getInstance(): IrisIntegration? {
        return instance
    }

    fun setInstance(integration: IrisIntegration) {
        instance = integration
    }

    fun cleanup() {
        instance?.cleanup()
        instance = null
    }
}

/**
 * Extension functions for easy integration with existing Iris
 */

/**
 * Check if MainActivity should handle app control commands
 */
fun com.example.iris.MainActivity.shouldHandleAppControl(command: String): Boolean {
    return IrisIntegrationManager.getInstance()?.isAppControlCommand(command) == true
}

/**
 * Process app control command in MainActivity
 */
fun com.example.iris.MainActivity.processAppControlCommand(command: String): String {
    return IrisIntegrationManager.getInstance()?.processCommand(command) ?: "App control not available"
}

/**
 * Process app control command with speech in MainActivity
 */
fun com.example.iris.MainActivity.processAppControlWithSpeech(command: String): String {
    return IrisIntegrationManager.getInstance()?.processCommandWithSpeech(command) ?: "App control not available"
}

/**
 * Setup app control in MainActivity
 */
fun com.example.iris.MainActivity.setupAppControl() {
    val integration = IrisIntegrationManager.initialize(this)
    
    // Set up callbacks
    integration.setupAppControlCallbacks(
        onCommandParsed = { command, parsed ->
            Log.d("IrisAppControl", "Parsed: $command -> ${parsed.intent}")
        },
        onPermissionRequired = { permission, intent ->
            // Show permission request to user
            android.widget.Toast.makeText(
                this,
                "Please enable $permission in settings",
                android.widget.Toast.LENGTH_LONG
            ).show()
            intent?.let { startActivity(it) }
        },
        onConfirmationRequired = { command, action ->
            // Show confirmation dialog
            android.app.AlertDialog.Builder(this)
                .setTitle("Confirm Action")
                .setMessage("Confirm: ${action.description}")
                .setPositiveButton("Confirm") { _, _ ->
                    integration.confirmPendingAction()
                }
                .setNegativeButton("Cancel") { _, _ ->
                    integration.cancelPendingAction()
                }
                .show()
        },
        onProgress = { action, progress, total ->
            // Update UI with progress
            Log.d("IrisAppControl", "Progress: $action ($progress/$total)")
        },
        onActionStart = { action ->
            // Update UI
            Log.d("IrisAppControl", "Action started: $action")
        },
        onActionComplete = { action, success ->
            // Update UI
            Log.d("IrisAppControl", "Action complete: $action, success=$success")
        },
        onSuccess = { message, spokenResponse ->
            // Speak response
            speakOut(spokenResponse ?: message)
        },
        onError = { message, error ->
            // Show error
            speakOut("Error: $message")
        },
        onComplete = {
            // Command complete
            Log.d("IrisAppControl", "Command complete")
        }
    )
}
