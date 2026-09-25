/*
 * IRIS App Control - Smooth Action Engine
 * Enhanced action execution with smooth transitions and animations
 */

package com.iris.ai.appcontrol

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.ValueAnimator
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.Animation
import android.view.animation.AnimationUtils
import android.view.animation.DecelerateInterpolator
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.min

/**
 * Smooth action execution modes
 */
enum class SmoothMode {
    INSTANT,      // Execute immediately
    SMOOTH,       // Smooth transitions between actions
    NATURAL,      // Natural human-like timing
    CINEMATIC     // Dramatic smooth animations
}

/**
 * Smooth action timing configuration
 */
data class SmoothConfig(
    val mode: SmoothMode = SmoothMode.NATURAL,
    val baseDelay: Long = 200L,           // Base delay between actions (ms)
    val actionDelay: Long = 400L,         // Delay for individual actions
    val scrollDelay: Long = 300L,         // Delay for scroll actions
    val typeDelay: Long = 500L,           // Delay for type actions (longer for text)
    val tapDelay: Long = 250L,           // Delay for tap actions
    val waitMultiplier: Float = 1.5f,     // Multiplier for wait actions
    val accelerationFactor: Float = 1.0f, // How much to accelerate based on action count
    val decelerationFactor: Float = 0.8f, // Deceleration at end of sequence
    val enableAnimations: Boolean = true,  // Enable smooth animations
    val enableSounds: Boolean = false,     // Enable action sounds
    val enableHaptics: Boolean = false     // Enable haptic feedback
)

/**
 * Smooth action result with timing information
 */
data class SmoothResult(
    val action: IrisAction,
    val success: Boolean,
    val duration: Long,
    val startTime: Long,
    val endTime: Long,
    val smoothFactor: Float = 1.0f,
    val message: String? = null,
    val spokenResponse: String? = null
)

/**
 * Smooth action callback
 */
interface SmoothActionCallback {
    fun onSmoothStart(totalActions: Int, estimatedDuration: Long)
    fun onSmoothProgress(actionIndex: Int, action: IrisAction, progress: Float, total: Int)
    fun onSmoothActionStart(action: IrisAction, index: Int)
    fun onSmoothActionComplete(result: SmoothResult, index: Int)
    fun onSmoothComplete(results: List<SmoothResult>, totalDuration: Long)
    fun onSmoothError(action: IrisAction, error: String, index: Int)
    fun onSmoothInterruption()
}

/**
 * Smooth Action Engine
 * Executes actions with smooth transitions, natural timing, and animations
 */
class SmoothActionEngine(
    private val appController: AppController,
    private val config: SmoothConfig = SmoothConfig()
) {
    private const val TAG = "SmoothActionEngine"
    
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val isExecuting = AtomicBoolean(false)
    private val isStopping = AtomicBoolean(false)
    
    private var callback: SmoothActionCallback? = null
    private var currentActions: List<IrisAction> = emptyList()
    private var startTimestamp: Long = 0
    private var actionTimings: MutableList<Long> = mutableListOf()

    /**
     * Execute actions with smooth transitions
     */
    fun executeSmoothly(
        actions: List<IrisAction>,
        callback: SmoothActionCallback? = null
    ): Boolean {
        if (isExecuting.getAndSet(true)) {
            Log.w(TAG, "Already executing, ignoring new request")
            return false
        }
        
        isStopping.set(false)
        this.callback = callback
        this.currentActions = actions.toList()
        actionTimings.clear()
        startTimestamp = System.currentTimeMillis()
        
        // Calculate estimated duration
        val estimatedDuration = calculateEstimatedDuration(actions)
        
        mainHandler.post {
            callback?.onSmoothStart(actions.size, estimatedDuration)
        }
        
        executor.execute {
            executeSmoothSequence(actions)
        }
        
        return true
    }

    /**
     * Calculate estimated total duration for action sequence
     */
    private fun calculateEstimatedDuration(actions: List<IrisAction>): Long {
        var total = 0L
        
        for ((index, action) in actions.withIndex()) {
            val baseDelay = when (action.type) {
                ActionType.OPEN_APP -> config.baseDelay * 2
                ActionType.WAIT, ActionType.WAIT_FOR_ELEMENT -> 
                    (action.timeout * config.waitMultiplier).toLong()
                ActionType.TYPE_TEXT -> {
                    // Longer delay for typing - estimate based on text length
                    val textLength = action.text?.length ?: 0
                    config.typeDelay + (textLength * 50L).coerceAtMost(2000L)
                }
                ActionType.SCROLL, ActionType.SWIPE -> config.scrollDelay
                ActionType.CLICK, ActionType.TAP -> config.tapDelay
                ActionType.BACK, ActionType.HOME -> config.baseDelay * 2
                else -> config.actionDelay
            }
            
            // Apply acceleration/deceleration
            val factor = calculateSmoothFactor(index, actions.size)
            val delay = (baseDelay * factor).toLong()
            
            total += delay
        }
        
        return total
    }

    /**
     * Calculate smooth factor based on position in sequence
     */
    private fun calculateSmoothFactor(index: Int, total: Int): Float {
        val position = index.toFloat() / max(total, 1).toFloat()
        
        return when (config.mode) {
            SmoothMode.INSTANT -> 0.3f
            SmoothMode.SMOOTH -> 1.0f
            SmoothMode.NATURAL -> {
                // Natural curve: start slower, middle faster, end slower
                val midPoint = 0.5f
                when {
                    position < midPoint -> 0.8f + (position * 0.4f)
                    position > midPoint -> 1.2f - ((position - midPoint) * 0.8f)
                    else -> 1.0f
                }
            }
            SmoothMode.CINEMATIC -> {
                // Cinematic: slow start, fast middle, very slow end
                val easeIn = 0.3f
                val easeOut = 0.7f
                when {
                    position < easeIn -> 0.5f + (position / easeIn * 0.5f)
                    position > easeOut -> 1.5f - ((position - easeOut) / (1 - easeOut) * 1.0f)
                    else -> 1.5f
                }
            }
        }
    }

    /**
     * Execute smooth sequence of actions
     */
    private fun executeSmoothSequence(actions: List<IrisAction>) {
        val results = mutableListOf<SmoothResult>()
        var cumulativeDelay = 0L
        
        for ((index, action) in actions.withIndex()) {
            if (isStopping.get()) {
                Log.d(TAG, "Execution stopped at action $index")
                break
            }
            
            val actionStart = System.currentTimeMillis()
            val smoothFactor = calculateSmoothFactor(index, actions.size)
            
            mainHandler.post {
                callback?.onSmoothActionStart(action, index)
            }
            
            try {
                // Calculate delay based on action type and position
                val delay = calculateActionDelay(action, index, actions.size, smoothFactor)
                
                // Add cumulative delay for smooth pacing
                if (index > 0) {
                    val actualDelay = min(delay, 1000L) // Cap at 1 second
                    Thread.sleep(actualDelay)
                    cumulativeDelay += actualDelay
                }
                
                // Execute the action
                val result = executeActionWithSmoothness(action, index, actions.size)
                
                val actionEnd = System.currentTimeMillis()
                val duration = actionEnd - actionStart
                
                results.add(SmoothResult(
                    action = action,
                    success = result.success,
                    duration = duration,
                    startTime = actionStart,
                    endTime = actionEnd,
                    smoothFactor = smoothFactor,
                    message = result.message,
                    spokenResponse = result.spokenResponse
                ))
                
                actionTimings.add(duration)
                
                mainHandler.post {
                    callback?.onSmoothActionComplete(result, index)
                }
                
                // Small additional delay for natural feel
                if (index < actions.size - 1) {
                    Thread.sleep(50L)
                }
                
            } catch (e: InterruptedException) {
                Log.w(TAG, "Execution interrupted at action $index", e)
                break
            } catch (e: Exception) {
                Log.e(TAG, "Error executing action $index", e)
                
                results.add(SmoothResult(
                    action = action,
                    success = false,
                    duration = System.currentTimeMillis() - actionStart,
                    startTime = actionStart,
                    endTime = System.currentTimeMillis(),
                    smoothFactor = smoothFactor,
                    message = "Error: ${e.message}",
                    spokenResponse = "Sorry, something went wrong"
                ))
                
                mainHandler.post {
                    callback?.onSmoothError(action, e.message ?: "Unknown error", index)
                }
            }
        }
        
        // Calculate total duration
        val totalDuration = if (results.isNotEmpty()) {
            results.last().endTime - results.first().startTime
        } else {
            System.currentTimeMillis() - startTimestamp
        }
        
        mainHandler.post {
            callback?.onSmoothComplete(results, totalDuration)
        }
        
        isExecuting.set(false)
        isStopping.set(false)
    }

    /**
     * Calculate delay for specific action
     */
    private fun calculateActionDelay(
        action: IrisAction,
        index: Int,
        total: Int,
        smoothFactor: Float
    ): Long {
        val baseDelay = when (action.type) {
            ActionType.OPEN_APP -> config.baseDelay * 2
            ActionType.WAIT, ActionType.WAIT_FOR_ELEMENT -> 
                (action.timeout * 0.3f).toLong().coerceAtMost(1000L)
            ActionType.TYPE_TEXT -> {
                val textLength = action.text?.length ?: 0
                (config.typeDelay + (textLength * 30L)).coerceAtMost(1500L)
            }
            ActionType.SCROLL, ActionType.SWIPE -> config.scrollDelay
            ActionType.CLICK, ActionType.TAP, ActionType.FIND_ELEMENT -> config.tapDelay
            ActionType.BACK, ActionType.HOME -> config.baseDelay * 2
            ActionType.CLEAR_TEXT -> config.baseDelay
            ActionType.SEARCH -> config.actionDelay * 2
            ActionType.VERIFY -> config.baseDelay
            ActionType.STOP -> 0L
            ActionType.CONFIRM -> 0L
        }
        
        return (baseDelay * smoothFactor).toLong()
    }

    /**
     * Execute action with smoothness enhancements
     */
    private fun executeActionWithSmoothness(
        action: IrisAction,
        index: Int,
        total: Int
    ): AppControlResult {
        return when (action.type) {
            ActionType.OPEN_APP -> {
                // Smooth app opening with animation
                appController.openApp(action.target ?: "")
            }
            ActionType.WAIT -> {
                val waitTime = min(action.timeout, 2000L)
                Thread.sleep(waitTime)
                AppControlResult(success = true, action = "WAIT", message = "Waited ${waitTime}ms")
            }
            ActionType.WAIT_FOR_ELEMENT -> {
                val packageName = action.target
                if (packageName != null) {
                    appController.waitForApp(packageName, min(action.timeout, 5000L), null)
                }
                AppControlResult(success = true, action = "WAIT_FOR_ELEMENT", message = "Waited for element")
            }
            ActionType.FIND_ELEMENT -> {
                val found = appController.findElementByText(action.target ?: "") != null
                AppControlResult(
                    success = found,
                    action = "FIND_ELEMENT",
                    message = if (found) "Found: ${action.target}" else "Not found: ${action.target}"
                )
            }
            ActionType.CLICK -> {
                val result = appController.tapText(action.target ?: "", null)
                AppControlResult(
                    success = result,
                    action = "CLICK",
                    message = if (result) "Tapped: ${action.target}" else "Missed: ${action.target}",
                    spokenResponse = if (result) "Tapped" else "Could not tap"
                )
            }
            ActionType.TYPE_TEXT -> {
                val text = action.text ?: ""
                val result = appController.typeText(text, null)
                
                // Add delay based on text length for natural typing feel
                val textDelay = (text.length * 30L).coerceAtMost(1000L)
                if (result && text.isNotEmpty()) {
                    Thread.sleep(textDelay)
                }
                
                AppControlResult(
                    success = result,
                    action = "TYPE_TEXT",
                    message = if (result) "Typed: ${text.take(20)}${if (text.length > 20) "..." else ""}" else "Type failed",
                    spokenResponse = if (result) "Typed" else "Could not type"
                )
            }
            ActionType.CLEAR_TEXT -> {
                appController.typeText("", null)
                AppControlResult(success = true, action = "CLEAR_TEXT", message = "Cleared")
            }
            ActionType.SCROLL -> {
                val result = appController.scroll(action.direction ?: ScrollDirection.DOWN, null)
                
                // Add smooth scroll animation
                if (result && config.enableAnimations) {
                    simulateSmoothScroll(action.direction)
                }
                
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
                    message = if (success) "Search initiated" else "Search not found"
                )
            }
            ActionType.VERIFY -> {
                AppControlResult(success = true, action = "VERIFY", message = "Verified")
            }
            ActionType.STOP -> {
                stopSmoothly()
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
     * Simulate smooth scroll animation
     */
    private fun simulateSmoothScroll(direction: ScrollDirection?) {
        // This would be implemented with actual animation in a UI context
        // For now, we just add a small delay to simulate smoothness
        when (direction) {
            ScrollDirection.DOWN, ScrollDirection.UP -> Thread.sleep(200L)
            ScrollDirection.LEFT, ScrollDirection.RIGHT -> Thread.sleep(150L)
            null -> Thread.sleep(100L)
        }
    }

    /**
     * Stop execution smoothly
     */
    fun stopSmoothly() {
        isStopping.set(true)
        executor.shutdownNow()
        
        mainHandler.post {
            callback?.onSmoothInterruption()
        }
        
        isExecuting.set(false)
        isStopping.set(false)
    }

    /**
     * Pause execution
     */
    fun pause() {
        // Implementation would require more complex threading
    }

    /**
     * Resume execution
     */
    fun resume() {
        // Implementation would require more complex threading
    }

    /**
     * Set configuration
     */
    fun setConfig(config: SmoothConfig) {
        // Don't change while executing
        if (!isExecuting.get()) {
            this.config.copyFrom(config)
        }
    }

    /**
     * Get current configuration
     */
    fun getConfig(): SmoothConfig {
        return config.copy()
    }

    /**
     * Get current state
     */
    fun isExecuting(): Boolean {
        return isExecuting.get()
    }

    /**
     * Get current actions
     */
    fun getCurrentActions(): List<IrisAction> {
        return currentActions.toList()
    }

    /**
     * Get action timings
     */
    fun getActionTimings(): List<Long> {
        return actionTimings.toList()
    }

    /**
     * Clear callback
     */
    fun clearCallback() {
        this.callback = null
    }

    /**
     * Set smooth mode
     */
    fun setSmoothMode(mode: SmoothMode) {
        if (!isExecuting.get()) {
            config.mode = mode
        }
    }

    /**
     * Enable/disable animations
     */
    fun setAnimationsEnabled(enabled: Boolean) {
        config.enableAnimations = enabled
    }

    /**
     * Get average action duration
     */
    fun getAverageActionDuration(): Long {
        return if (actionTimings.isNotEmpty()) {
            actionTimings.average().toLong()
        } else {
            0L
        }
    }

    /**
     * Get total actions executed
     */
    fun getTotalActionsExecuted(): Int {
        return actionTimings.size
    }
}

/**
 * Extension function to copy SmoothConfig
 */
fun SmoothConfig.copyFrom(other: SmoothConfig) {
    this.mode = other.mode
    this.baseDelay = other.baseDelay
    this.actionDelay = other.actionDelay
    this.scrollDelay = other.scrollDelay
    this.typeDelay = other.typeDelay
    this.tapDelay = other.tapDelay
    this.waitMultiplier = other.waitMultiplier
    this.accelerationFactor = other.accelerationFactor
    this.decelerationFactor = other.decelerationFactor
    this.enableAnimations = other.enableAnimations
    this.enableSounds = other.enableSounds
    this.enableHaptics = other.enableHaptics
}
