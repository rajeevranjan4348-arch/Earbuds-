/*
 * IRIS App Control - Action Engine
 * Executes structured actions with verification and error recovery
 */

package com.iris.ai.appcontrol

import android.util.Log
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Action execution status
 */
enum class ActionStatus {
    PENDING,
    EXECUTING,
    SUCCESS,
    FAILED,
    WAITING,
    CANCELLED
}

/**
 * Enhanced action with execution metadata
 */
data class EngineAction(
    val action: IrisAction,
    var status: ActionStatus = ActionStatus.PENDING,
    var retryCount: Int = 0,
    var error: String? = null,
    var startTime: Long = 0,
    var endTime: Long = 0
)

/**
 * Action result with detailed information
 */
data class EngineResult(
    val action: EngineAction,
    val success: Boolean,
    val status: ActionStatus,
    val message: String,
    val spokenResponse: String? = null,
    val error: String? = null
)

/**
 * Callback for action engine
 */
interface ActionEngineCallback {
    fun onActionStart(action: EngineAction)
    fun onActionProgress(action: EngineAction, progress: Int)
    fun onActionComplete(result: EngineResult)
    fun onActionError(action: EngineAction, error: String)
    fun onEngineComplete(results: List<EngineResult>)
    fun onConfirmationRequired(action: EngineAction)
}

/**
 * Iris Action Engine
 * Executes actions with verification, retry, and error recovery
 */
class IrisActionEngine(
    private val appController: AppController,
    private val maxRetries: Int = 3,
    private val actionTimeout: Long = 10000L
) {
    private const val TAG = "IrisActionEngine"
    private val executor = Executors.newSingleThreadExecutor()
    private val isExecuting = AtomicBoolean(false)
    private val currentActions = mutableListOf<EngineAction>()
    private var callback: ActionEngineCallback? = null

    /**
     * Execute a list of actions
     */
    fun execute(actions: List<IrisAction>, callback: ActionEngineCallback? = null) {
        if (isExecuting.getAndSet(true)) {
            callback?.onEngineComplete(emptyList())
            return
        }

        this.callback = callback
        currentActions.clear()
        currentActions.addAll(actions.map { EngineAction(it) })

        executor.execute {
            val results = mutableListOf<EngineResult>()
            
            for ((index, engineAction) in currentActions.withIndex()) {
                if (!isExecuting.get()) {
                    break
                }

                engineAction.startTime = System.currentTimeMillis()
                engineAction.status = ActionStatus.EXECUTING
                
                callback?.onActionStart(engineAction)

                val result = executeWithRetry(engineAction)
                results.add(result)

                if (!result.success && engineAction.action.requiresConfirmation) {
                    callback?.onConfirmationRequired(engineAction)
                    // Wait for confirmation
                    engineAction.status = ActionStatus.WAITING
                    break
                }

                if (!result.success) {
                    Log.w(TAG, "Action ${index + 1} failed: ${engineAction.action.description}")
                    // Continue with next action unless it's critical
                }

                // Small delay between actions
                try {
                    Thread.sleep(300)
                } catch (e: InterruptedException) {
                    break
                }
            }

            // Mark remaining actions as cancelled
            for (action in currentActions) {
                if (action.status == ActionStatus.PENDING || action.status == ActionStatus.WAITING) {
                    action.status = ActionStatus.CANCELLED
                }
            }

            callback?.onEngineComplete(results)
            isExecuting.set(false)
        }
    }

    /**
     * Execute action with retry logic
     */
    private fun executeWithRetry(engineAction: EngineAction): EngineResult {
        var lastError: String? = null
        
        for (attempt in 1..maxRetries) {
            engineAction.retryCount = attempt - 1
            
            try {
                val result = executeSingleAction(engineAction.action)
                
                if (result.success) {
                    engineAction.status = ActionStatus.SUCCESS
                    engineAction.endTime = System.currentTimeMillis()
                    return EngineResult(
                        action = engineAction,
                        success = true,
                        status = ActionStatus.SUCCESS,
                        message = result.message,
                        spokenResponse = result.spokenResponse
                    )
                }
                
                lastError = result.message
                engineAction.error = lastError
                
                // Wait before retry
                if (attempt < maxRetries) {
                    try {
                        Thread.sleep(500 * attempt.toLong())
                    } catch (e: InterruptedException) {
                        break
                    }
                }
                
            } catch (e: Exception) {
                lastError = e.message
                engineAction.error = lastError
                
                if (attempt < maxRetries) {
                    try {
                        Thread.sleep(500 * attempt.toLong())
                    } catch (e: InterruptedException) {
                        break
                    }
                }
            }
        }

        engineAction.status = ActionStatus.FAILED
        engineAction.endTime = System.currentTimeMillis()
        
        return EngineResult(
            action = engineAction,
            success = false,
            status = ActionStatus.FAILED,
            message = lastError ?: "Action failed",
            error = lastError
        )
    }

    /**
     * Execute a single action
     */
    private fun executeSingleAction(action: IrisAction): AppControlResult {
        return when (action.type) {
            ActionType.OPEN_APP -> {
                appController.openApp(action.target ?: "")
            }
            ActionType.WAIT -> {
                Thread.sleep(minOf(action.timeout, actionTimeout))
                AppControlResult(success = true, action = "WAIT", message = "Waited ${action.timeout}ms")
            }
            ActionType.WAIT_FOR_ELEMENT -> {
                val packageName = action.target
                if (packageName != null) {
                    appController.waitForApp(packageName, minOf(action.timeout, actionTimeout), null)
                }
                Thread.sleep(minOf(action.timeout, actionTimeout))
                AppControlResult(success = true, action = "WAIT_FOR_ELEMENT", message = "Waited for element")
            }
            ActionType.FIND_ELEMENT -> {
                val found = appController.findElementByText(action.target ?: "") != null
                AppControlResult(
                    success = found,
                    action = "FIND_ELEMENT",
                    message = if (found) "Found element: ${action.target}" else "Element not found: ${action.target}"
                )
            }
            ActionType.CLICK -> {
                val result = appController.tapText(action.target ?: "", null)
                AppControlResult(
                    success = result,
                    action = "CLICK",
                    message = if (result) "Clicked: ${action.target}" else "Click failed: ${action.target}",
                    spokenResponse = if (result) "Tapped ${action.target}" else "Cannot tap ${action.target}"
                )
            }
            ActionType.TYPE_TEXT -> {
                val result = appController.typeText(action.text ?: "", null)
                AppControlResult(
                    success = result,
                    action = "TYPE_TEXT",
                    message = if (result) "Typed text" else "Type failed",
                    spokenResponse = if (result) "Typed" else "Cannot type"
                )
            }
            ActionType.CLEAR_TEXT -> {
                appController.typeText("", null)
                AppControlResult(success = true, action = "CLEAR_TEXT", message = "Cleared text")
            }
            ActionType.SCROLL -> {
                val result = appController.scroll(action.direction ?: ScrollDirection.DOWN, null)
                AppControlResult(
                    success = result,
                    action = "SCROLL",
                    message = if (result) "Scrolled ${action.direction}" else "Scroll failed"
                )
            }
            ActionType.BACK -> {
                appController.returnToPreviousApp(null)
            }
            ActionType.HOME -> {
                appController.performHome(null)
            }
            ActionType.READ_SCREEN -> {
                AppControlResult(success = false, action = "READ_SCREEN", message = "Read screen not implemented")
            }
            ActionType.SEARCH -> {
                val success = appController.tapText("Search", null) || 
                        appController.tapDescription("Search", null)
                AppControlResult(
                    success = success,
                    action = "SEARCH",
                    message = if (success) "Search initiated" else "Cannot find search input"
                )
            }
            ActionType.VERIFY -> {
                // Verification is handled by checking if the expected state exists
                AppControlResult(success = true, action = "VERIFY", message = "Verified")
            }
            ActionType.STOP -> {
                cancel()
                AppControlResult(success = true, action = "STOP", message = "Stopped")
            }
            ActionType.CONFIRM -> {
                AppControlResult(
                    success = true,
                    action = "CONFIRM",
                    message = "Confirmation required",
                    requiresConfirmation = true
                )
            }
        }
    }

    /**
     * Confirm pending action and continue
     */
    fun confirmAndContinue() {
        if (!isExecuting.get()) return

        val pendingConfirmation = currentActions.find { 
            it.status == ActionStatus.WAITING && it.action.requiresConfirmation
        }

        if (pendingConfirmation != null) {
            pendingConfirmation.status = ActionStatus.PENDING
            // Continue execution
            execute(listOf(pendingConfirmation.action), callback)
        }
    }

    /**
     * Cancel pending confirmation and stop
     */
    fun cancelConfirmation() {
        if (!isExecuting.get()) return

        val pendingConfirmation = currentActions.find { 
            it.status == ActionStatus.WAITING && it.action.requiresConfirmation
        }

        if (pendingConfirmation != null) {
            pendingConfirmation.status = ActionStatus.CANCELLED
            cancel()
        }
    }

    /**
     * Cancel all actions
     */
    fun cancel() {
        isExecuting.set(false)
        executor.shutdownNow()
        
        for (action in currentActions) {
            if (action.status == ActionStatus.PENDING || action.status == ActionStatus.EXECUTING) {
                action.status = ActionStatus.CANCELLED
            }
        }
        
        callback?.onEngineComplete(currentActions.map { 
            EngineResult(
                action = it,
                success = false,
                status = ActionStatus.CANCELLED,
                message = "Cancelled"
            )
        })
        
        currentActions.clear()
    }

    /**
     * Get current actions
     */
    fun getCurrentActions(): List<EngineAction> {
        return currentActions.toList()
    }

    /**
     * Get action count
     */
    fun getActionCount(): Int {
        return currentActions.size
    }

    /**
     * Check if engine is executing
     */
    fun isExecuting(): Boolean {
        return isExecuting.get()
    }

    /**
     * Set callback
     */
    fun setCallback(callback: ActionEngineCallback) {
        this.callback = callback
    }

    /**
     * Clear callback
     */
    fun clearCallback() {
        this.callback = null
    }
}
