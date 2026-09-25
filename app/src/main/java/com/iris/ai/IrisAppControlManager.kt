/*
 * IRIS App Control - Main Integration Manager
 * Connects app control system with existing Iris AI pipeline
 */

package com.iris.ai

import android.content.Context
import android.util.Log
import com.iris.ai.accessibility.IrisAccessibilityService
import com.iris.ai.appcontrol.*

/**
 * Main App Control Manager
 * Integrates all app control components with Iris AI
 */
class IrisAppControlManager(private val context: Context) {
    private const val TAG = "IrisAppControlManager"

    // Core components
    private val appResolver: AppResolver by lazy { AppResolver(context) }
    private val permissionManager: PermissionManager by lazy { PermissionManager(context) }
    private val commandParser: IrisCommandParser = IrisCommandParser
    private val actionPlanner: IrisActionPlanner by lazy { IrisActionPlanner(appResolver) }
    private var appController: AppController? = null
    private var actionEngine: IrisActionEngine? = null
    private var accessibilityService: IrisAccessibilityService? = null

    // State
    private var isInitialized = false
    private var isExecuting = false
    private var currentCommand: String? = null
    private var currentActions: List<IrisAction> = emptyList()

    // Callbacks
    private var commandCallback: CommandCallback? = null
    private var progressCallback: ProgressCallback? = null
    private var resultCallback: ResultCallback? = null

    /**
     * Callback interfaces
     */
    interface CommandCallback {
        fun onCommandParsed(command: String, parsed: ParsedCommand)
        fun onPermissionRequired(permission: String, intent: android.content.Intent?)
        fun onConfirmationRequired(command: String, action: IrisAction)
    }

    interface ProgressCallback {
        fun onProgress(action: String, progress: Int, total: Int)
        fun onActionStart(action: String)
        fun onActionComplete(action: String, success: Boolean)
    }

    interface ResultCallback {
        fun onSuccess(message: String, spokenResponse: String?)
        fun onError(message: String, error: String?)
        fun onComplete()
    }

    /**
     * Initialize the app control manager
     */
    fun initialize() {
        if (isInitialized) return

        Log.d(TAG, "Initializing Iris App Control Manager")

        // Initialize components
        appResolver.refresh()

        // Check accessibility service
        val accessibilityEnabled = checkAccessibilityService()
        Log.d(TAG, "Accessibility Service enabled: $accessibilityEnabled")

        isInitialized = true
        Log.d(TAG, "Iris App Control Manager initialized")
    }

    /**
     * Set accessibility service reference
     */
    fun setAccessibilityService(service: IrisAccessibilityService) {
        this.accessibilityService = service
        this.appController = AppController(context, appResolver, service)
        this.actionEngine = IrisActionEngine(appController!!)
        
        // Update app controller with service reference
        appController?.let { controller ->
            // Controller already has service reference
        }
    }

    /**
     * Check if accessibility service is enabled
     */
    private fun checkAccessibilityService(): Boolean {
        return permissionManager.isAccessibilityServiceEnabled(IrisAccessibilityService::class.java)
    }

    /**
     * Process a command through the full pipeline
     * 
     * Pipeline:
     * 1. Parse command
     * 2. Check permissions
     * 3. Plan actions
     * 4. Check safety
     * 5. Execute actions
     * 6. Return result
     */
    fun processCommand(command: String): AppControlResult {
        currentCommand = command
        Log.d(TAG, "Processing command: $command")

        // Step 1: Parse command
        val parsed = commandParser.parse(command)
        Log.d(TAG, "Parsed command: intent=${parsed.intent}, targetApp=${parsed.targetApp}, actions=${parsed.actions.size}")
        commandCallback?.onCommandParsed(command, parsed)

        // Handle stop command immediately
        if (parsed.intent == CommandType.STOP || 
            parsed.actions.any { it.type == ActionType.STOP }) {
            stopExecution()
            return AppControlResult(
                success = true,
                action = "STOP",
                message = "Command stopped",
                spokenResponse = "Stopped"
            )
        }

        // Step 2: Check permissions
        if (!checkPermissions(parsed)) {
            val missing = permissionManager.getMissingPermissions()
            if (missing.isNotEmpty()) {
                val intent = permissionManager.getAccessibilityIntent()
                commandCallback?.onPermissionRequired("Accessibility Service", intent)
            }
            return AppControlResult(
                success = false,
                action = "PERMISSION_CHECK",
                message = "Permissions not granted",
                spokenResponse = "Please enable required permissions"
            )
        }

        // Step 3: Plan actions
        val plannedActions = if (parsed.actions.isNotEmpty()) {
            parsed.actions
        } else {
            actionPlanner.plan(parsed)
        }
        currentActions = plannedActions
        Log.d(TAG, "Planned ${plannedActions.size} actions")

        // Step 4: Check safety and confirmation
        val (safeActions, needsConfirmation) = checkSafety(plannedActions)
        if (needsConfirmation) {
            val confirmAction = safeActions.find { it.requiresConfirmation }
            if (confirmAction != null) {
                commandCallback?.onConfirmationRequired(command, confirmAction)
                return AppControlResult(
                    success = false,
                    action = "CONFIRMATION_REQUIRED",
                    message = "Confirmation required",
                    requiresConfirmation = true,
                    spokenResponse = "Please confirm this action"
                )
            }
        }

        // Step 5: Execute actions
        isExecuting = true
        return executeActions(safeActions, command, parsed)
    }

    /**
     * Check permissions for parsed command
     */
    private fun checkPermissions(parsed: ParsedCommand): Boolean {
        // Check accessibility service
        if (!permissionManager.isAccessibilityServiceEnabled(IrisAccessibilityService::class.java)) {
            return false
        }

        // Check if target app is installed
        if (parsed.targetApp != null && !appResolver.isAppInstalledByName(parsed.targetApp!!)) {
            return false
        }

        return true
    }

    /**
     * Check safety of actions
     */
    private fun checkSafety(actions: List<IrisAction>): Pair<List<IrisAction>, Boolean> {
        val safeActions = mutableListOf<IrisAction>()
        var needsConfirmation = false

        for (action in actions) {
            val requiresConfirm = permissionManager.requiresConfirmation(action)
            if (requiresConfirm) {
                needsConfirmation = true
            }
            safeActions.add(action.copy(requiresConfirmation = requiresConfirm))
        }

        return Pair(safeActions, needsConfirmation)
    }

    /**
     * Execute a list of actions
     */
    private fun executeActions(actions: List<IrisAction>, command: String, parsed: ParsedCommand): AppControlResult {
        if (actionEngine == null || appController == null) {
            return AppControlResult(
                success = false,
                action = "EXECUTE",
                message = "App Control not initialized",
                spokenResponse = "App control is not ready"
            )
        }

        // Setup callbacks for action engine
        val engineCallback = object : ActionEngineCallback {
            override fun onActionStart(action: EngineAction) {
                val desc = action.action.description ?: "Unknown"
                Log.d(TAG, "Starting action: $desc")
                progressCallback?.onActionStart(desc)
            }

            override fun onActionProgress(action: EngineAction, progress: Int) {
                progressCallback?.onProgress(
                    action.action.description ?: "",
                    progress,
                    actions.size
                )
            }

            override fun onActionComplete(result: EngineResult) {
                val desc = result.action.action.description ?: ""
                Log.d(TAG, "Action complete: $desc, success=${result.success}")
                progressCallback?.onActionComplete(desc, result.success)
            }

            override fun onActionError(action: EngineAction, error: String) {
                Log.e(TAG, "Action error: ${action.action.description}: $error")
            }

            override fun onEngineComplete(results: List<EngineResult>) {
                val allSuccess = results.all { it.success }
                val lastResult = results.lastOrNull()
                
                Log.d(TAG, "Engine complete, all success: $allSuccess")
                
                isExecuting = false
                currentCommand = null
                currentActions = emptyList()

                if (allSuccess) {
                    resultCallback?.onSuccess(
                        "Command completed successfully",
                        lastResult?.spokenResponse ?: "Done"
                    )
                } else {
                    val errorMsg = lastResult?.message ?: "Some actions failed"
                    resultCallback?.onError(errorMsg, null)
                }
                
                resultCallback?.onComplete()
            }

            override fun onConfirmationRequired(action: EngineAction) {
                commandCallback?.onConfirmationRequired(currentCommand ?: "", action.action)
            }
        }

        actionEngine?.setCallback(engineCallback)

        // Execute actions
        actionEngine?.execute(actions)

        // Return initial result
        return AppControlResult(
            success = true,
            action = "EXECUTE",
            message = "Executing ${actions.size} actions",
            spokenResponse = "Working on it"
        )
    }

    /**
     * Process natural language command (main entry point)
     */
    fun processNaturalCommand(command: String): String {
        val result = processCommand(command)
        return result.message
    }

    /**
     * Process command and get spoken response
     */
    fun processCommandWithSpeech(command: String): String {
        val result = processCommand(command)
        return result.spokenResponse ?: result.message
    }

    /**
     * Confirm pending action
     */
    fun confirmPending() {
        actionEngine?.confirmAndContinue()
    }

    /**
     * Cancel pending action
     */
    fun cancelPending() {
        actionEngine?.cancelConfirmation()
    }

    /**
     * Stop current execution
     */
    fun stopExecution() {
        isExecuting = false
        currentCommand = null
        currentActions = emptyList()
        actionEngine?.cancel()
        appController?.stopAutomation()
    }

    /**
     * Check if command is an app control command
     */
    fun isAppControlCommand(command: String): Boolean {
        return commandParser.isAppControlCommand(command)
    }

    /**
     * Get list of installed apps
     */
    fun getInstalledApps(): List<AppInfo> {
        return appResolver.getInstalledApps()
    }

    /**
     * Get common apps
     */
    fun getCommonApps(): Map<String, String> {
        return appResolver.getCommonApps()
    }

    /**
     * Resolve app name to package name
     */
    fun resolveApp(appName: String): String? {
        return appResolver.resolveToPackageName(appName)
    }

    /**
     * Check if accessibility service is enabled
     */
    fun isAccessibilityEnabled(): Boolean {
        return permissionManager.isAccessibilityServiceEnabled(IrisAccessibilityService::class.java)
    }

    /**
     * Get intent to enable accessibility service
     */
    fun getAccessibilityIntent(): android.content.Intent {
        return permissionManager.getAccessibilityIntent()
    }

    /**
     * Check if all permissions are granted
     */
    fun areAllPermissionsGranted(): Boolean {
        return permissionManager.areAllPermissionsGranted()
    }

    /**
     * Set callbacks
     */
    fun setCommandCallback(callback: CommandCallback) {
        this.commandCallback = callback
    }

    fun setProgressCallback(callback: ProgressCallback) {
        this.progressCallback = callback
    }

    fun setResultCallback(callback: ResultCallback) {
        this.resultCallback = callback
    }

    /**
     * Clear callbacks
     */
    fun clearCallbacks() {
        commandCallback = null
        progressCallback = null
        resultCallback = null
    }

    /**
     * Get current execution state
     */
    fun isExecuting(): Boolean {
        return isExecuting
    }

    /**
     * Get current command
     */
    fun getCurrentCommand(): String? {
        return currentCommand
    }

    /**
     * Get current actions
     */
    fun getCurrentActions(): List<IrisAction> {
        return currentActions
    }

    /**
     * Cleanup
     */
    fun cleanup() {
        stopExecution()
        clearCallbacks()
        accessibilityService = null
        appController = null
        actionEngine = null
        isInitialized = false
    }

    /**
     * Parse and plan YouTube search
     */
    fun planYouTubeSearch(query: String): List<IrisAction> {
        return actionPlanner.planYouTubeSearch(query)
    }

    /**
     * Parse and plan WhatsApp message
     */
    fun planWhatsAppMessage(recipient: String, message: String): List<IrisAction> {
        return actionPlanner.planWhatsAppMessage(recipient, message)
    }

    /**
     * Parse and plan Chrome search
     */
    fun planChromeSearch(query: String): List<IrisAction> {
        return actionPlanner.planChromeSearch(query)
    }

    /**
     * Parse and plan Maps search
     */
    fun planMapsSearch(query: String): List<IrisAction> {
        return actionPlanner.planMapsSearch(query)
    }

    /**
     * Directly open an app
     */
    fun openApp(appName: String): AppControlResult {
        return appController?.openApp(appName) ?: AppControlResult(
            success = false,
            action = "OPEN_APP",
            message = "App Controller not initialized"
        )
    }

    /**
     * Directly execute actions
     */
    fun executeActionsDirect(actions: List<IrisAction>): Boolean {
        if (actionEngine == null) return false
        actionEngine?.execute(actions)
        return true
    }
}

/**
 * Singleton instance for easy access
 */
object IrisAppControl {
    private var manager: IrisAppControlManager? = null

    fun initialize(context: Context): IrisAppControlManager {
        manager = IrisAppControlManager(context).apply { initialize() }
        return manager!!
    }

    fun getInstance(): IrisAppControlManager? {
        return manager
    }

    fun setInstance(manager: IrisAppControlManager) {
        this.manager = manager
    }
}
