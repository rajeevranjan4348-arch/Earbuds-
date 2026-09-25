/*
 * IRIS App Control - Smoothness Enhancer
 * Enhances the overall smoothness of app control operations
 */

package com.iris.ai.appcontrol

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Smoothness level
 */
enum class SmoothnessLevel {
    LOW,
    MEDIUM,
    HIGH,
    ULTRA
}

/**
 * Smoothness metrics
 */
data class SmoothnessMetrics(
    val executionTime: Long = 0L,
    val actionCount: Int = 0,
    val successRate: Float = 1.0f,
    val averageDelay: Long = 0L,
    val smoothnessScore: Float = 0f,
    val userRating: Float = 0f
)

/**
 * Smoothness Enhancer
 * Provides advanced smoothness enhancements for app control
 */
class SmoothnessEnhancer(private val context: Context) {
    private const val TAG = "SmoothnessEnhancer"
    
    private val mainHandler = Handler(Looper.getMainLooper())
    private val smoothnessConfig = SmoothnessConfig(context)
    private val animationManager = AnimationManager(context)
    private val transitionManager = TransitionManager(context)
    
    private var currentSmoothMode: SmoothMode = SmoothMode.NATURAL
    private var smoothnessLevel: SmoothnessLevel = SmoothnessLevel.MEDIUM
    private var metrics = SmoothnessMetrics()
    private var isEnhanced = false

    // Smoothness profiles
    private val smoothnessProfiles = mapOf(
        SmoothnessLevel.LOW to SmoothConfig(
            mode = SmoothMode.INSTANT,
            baseDelay = 100L,
            actionDelay = 200L,
            scrollDelay = 150L,
            typeDelay = 250L,
            tapDelay = 100L
        ),
        SmoothnessLevel.MEDIUM to SmoothConfig(
            mode = SmoothMode.SMOOTH,
            baseDelay = 200L,
            actionDelay = 400L,
            scrollDelay = 300L,
            typeDelay = 500L,
            tapDelay = 200L
        ),
        SmoothnessLevel.HIGH to SmoothConfig(
            mode = SmoothMode.NATURAL,
            baseDelay = 300L,
            actionDelay = 600L,
            scrollDelay = 400L,
            typeDelay = 700L,
            tapDelay = 300L
        ),
        SmoothnessLevel.ULTRA to SmoothConfig(
            mode = SmoothMode.CINEMATIC,
            baseDelay = 400L,
            actionDelay = 800L,
            scrollDelay = 500L,
            typeDelay = 1000L,
            tapDelay = 400L
        )
    )

    /**
     * Initialize smoothness enhancer
     */
    fun initialize() {
        Log.d(TAG, "Initializing Smoothness Enhancer")
        currentSmoothMode = smoothnessConfig.getDefaultSmoothMode()
        isEnhanced = true
    }

    /**
     * Apply smoothness enhancements to action engine
     */
    fun createEnhancedSmoothEngine(appController: AppController): SmoothActionEngine {
        val config = getCurrentSmoothConfig()
        return SmoothActionEngine(appController, config)
    }

    /**
     * Get current smooth config based on level and mode
     */
    fun getCurrentSmoothConfig(): SmoothConfig {
        val profileConfig = smoothnessProfiles[smoothnessLevel] ?: smoothnessProfiles[SmoothnessLevel.MEDIUM]!!
        return profileConfig.copy(mode = currentSmoothMode)
    }

    /**
     * Set smooth mode
     */
    fun setSmoothMode(mode: SmoothMode) {
        currentSmoothMode = mode
        smoothnessConfig.setSmoothMode(mode)
    }

    /**
     * Set smoothness level
     */
    fun setSmoothnessLevel(level: SmoothnessLevel) {
        smoothnessLevel = level
    }

    /**
     * Enable/disable enhancements
     */
    fun setEnhanced(enabled: Boolean) {
        isEnhanced = enabled
    }

    /**
     * Check if enhanced
     */
    fun isEnhanced(): Boolean {
        return isEnhanced
    }

    /**
     * Enhance action execution with smoothness
     */
    fun enhanceActionExecution(
        actions: List<IrisAction>,
        engine: SmoothActionEngine,
        callback: SmoothActionCallback? = null
    ): Boolean {
        if (!isEnhanced) {
            return engine.executeSmoothly(actions, callback)
        }

        // Apply smoothness enhancements
        val enhancedActions = enhanceActions(actions)
        
        // Setup enhanced callbacks
        val enhancedCallback = object : SmoothActionCallback {
            override fun onSmoothStart(totalActions: Int, estimatedDuration: Long) {
                callback?.onSmoothStart(totalActions, estimatedDuration)
                trackExecutionStart(totalActions)
            }

            override fun onSmoothProgress(actionIndex: Int, action: IrisAction, progress: Float, total: Int) {
                callback?.onSmoothProgress(actionIndex, action, progress, total)
            }

            override fun onSmoothActionStart(action: IrisAction, index: Int) {
                callback?.onSmoothActionStart(action, index)
                playActionSound(action)
                playHapticFeedback(action)
            }

            override fun onSmoothActionComplete(result: SmoothResult, index: Int) {
                callback?.onSmoothActionComplete(result, index)
                trackActionComplete(result)
            }

            override fun onSmoothComplete(results: List<SmoothResult>, totalDuration: Long) {
                callback?.onSmoothComplete(results, totalDuration)
                trackExecutionComplete(results, totalDuration)
                updateSmoothnessScore(results, totalDuration)
            }

            override fun onSmoothError(action: IrisAction, error: String, index: Int) {
                callback?.onSmoothError(action, error, index)
                trackActionError(action, error, index)
            }

            override fun onSmoothInterruption() {
                callback?.onSmoothInterruption()
            }
        }

        return engine.executeSmoothly(enhancedActions, enhancedCallback)
    }

    /**
     * Enhance actions with smoothness improvements
     */
    private fun enhanceActions(actions: List<IrisAction>): List<IrisAction> {
        return actions.mapIndexed { index, action ->
            // Apply adaptive delays based on smoothness level
            val config = getCurrentSmoothConfig()
            val delay = when (smoothnessLevel) {
                SmoothnessLevel.LOW -> config.baseDelay / 2
                SmoothnessLevel.MEDIUM -> config.baseDelay
                SmoothnessLevel.HIGH -> config.baseDelay * 2
                SmoothnessLevel.ULTRA -> config.baseDelay * 3
            }
            
            // Apply smooth factor based on position
            val smoothFactor = calculateSmoothFactor(index, actions.size)
            
            // Adjust delays based on action type
            when (action.type) {
                ActionType.TYPE_TEXT -> {
                    val textLength = action.text?.length ?: 0
                    val typeDelay = config.typeDelay + (textLength * 20L).coerceAtMost(500L)
                    action.copy(timeout = typeDelay * smoothFactor.toLong())
                }
                ActionType.WAIT, ActionType.WAIT_FOR_ELEMENT -> {
                    action.copy(timeout = (action.timeout * smoothFactor).toLong())
                }
                else -> action
            }
        }
    }

    /**
     * Calculate smooth factor based on position
     */
    private fun calculateSmoothFactor(index: Int, total: Int): Float {
        val position = index.toFloat() / max(total, 1).toFloat()
        
        return when (currentSmoothMode) {
            SmoothMode.INSTANT -> 0.5f
            SmoothMode.SMOOTH -> 1.0f
            SmoothMode.NATURAL -> {
                // Natural curve
                val mid = 0.5f
                when {
                    position < mid -> 0.8f + (position / mid * 0.4f)
                    position > mid -> 1.2f - ((position - mid) / (1 - mid) * 0.4f)
                    else -> 1.0f
                }
            }
            SmoothMode.CINEMATIC -> {
                // Cinematic curve - very smooth
                val easeIn = 0.4f
                val easeOut = 0.6f
                when {
                    position < easeIn -> 0.6f + (position / easeIn * 0.4f)
                    position > easeOut -> 1.4f - ((position - easeOut) / (1 - easeOut) * 1.0f)
                    else -> 1.4f
                }
            }
        }
    }

    /**
     * Play action sound (if enabled)
     */
    private fun playActionSound(action: IrisAction) {
        if (!smoothnessConfig.getSettings().enableAudioFeedback) return
        
        // In a real implementation, play different sounds based on action type
        // For now, just log
        Log.d(TAG, "Playing sound for action: ${action.type}")
    }

    /**
     * Play haptic feedback (if enabled)
     */
    private fun playHapticFeedback(action: IrisAction) {
        if (!smoothnessConfig.getSettings().enableHapticFeedback) return
        
        // In a real implementation, trigger haptic feedback
        Log.d(TAG, "Playing haptic feedback for action: ${action.type}")
    }

    /**
     * Track execution start
     */
    private fun trackExecutionStart(totalActions: Int) {
        metrics = SmoothnessMetrics(
            executionTime = System.currentTimeMillis(),
            actionCount = totalActions,
            successRate = 1.0f,
            smoothnessScore = 0f
        )
    }

    /**
     * Track action complete
     */
    private fun trackActionComplete(result: SmoothResult) {
        // Update metrics
        if (result.success) {
            metrics = metrics.copy(
                successRate = metrics.successRate * 0.9f + 0.1f
            )
        } else {
            metrics = metrics.copy(
                successRate = metrics.successRate * 0.9f
            )
        }
    }

    /**
     * Track execution complete
     */
    private fun trackExecutionComplete(results: List<SmoothResult>, totalDuration: Long) {
        val successCount = results.count { it.success }
        val successRate = successCount.toFloat() / max(results.size, 1)
        
        metrics = metrics.copy(
            executionTime = totalDuration,
            successRate = successRate,
            averageDelay = if (results.isNotEmpty()) {
                results.map { it.duration }.average().toLong()
            } else {
                0L
            }
        )
    }

    /**
     * Track action error
     */
    private fun trackActionError(action: IrisAction, error: String, index: Int) {
        Log.e(TAG, "Action $index failed: ${action.description}, error: $error")
        metrics = metrics.copy(
            successRate = metrics.successRate * 0.8f
        )
    }

    /**
     * Update smoothness score
     */
    private fun updateSmoothnessScore(results: List<SmoothResult>, totalDuration: Long) {
        val successScore = metrics.successRate * 100f
        val timeScore = if (totalDuration > 0) {
            val expectedDuration = metrics.actionCount * 300L
            val ratio = expectedDuration.toFloat() / totalDuration
            (ratio * 50f).coerceAtMost(50f)
        } else {
            0f
        }
        
        val smoothnessScore = (successScore + timeScore).coerceAtMost(100f)
        metrics = metrics.copy(smoothnessScore = smoothnessScore)
    }

    /**
     * Get current metrics
     */
    fun getMetrics(): SmoothnessMetrics {
        return metrics
    }

    /**
     * Reset metrics
     */
    fun resetMetrics() {
        metrics = SmoothnessMetrics()
    }

    /**
     * Get smoothness recommendations
     */
    fun getRecommendations(): List<String> {
        val recommendations = mutableListOf<String>()
        
        if (metrics.successRate < 0.8f) {
            recommendations.add("Consider reducing action complexity for better success rate")
        }
        
        if (metrics.averageDelay > 500L) {
            recommendations.add("Actions are taking longer than expected, consider optimizing")
        }
        
        if (metrics.smoothnessScore < 70f) {
            recommendations.add("Try a lower smoothness level for better performance")
        } else if (metrics.smoothnessScore > 90f) {
            recommendations.add("Excellent smoothness! Consider trying a higher level")
        }
        
        return recommendations
    }

    /**
     * Auto-tune smoothness based on metrics
     */
    fun autoTune() {
        when {
            metrics.smoothnessScore < 60f && smoothnessLevel != SmoothnessLevel.LOW -> {
                setSmoothnessLevel(SmoothnessLevel.LOW)
            }
            metrics.smoothnessScore in 60f..79f && smoothnessLevel != SmoothnessLevel.MEDIUM -> {
                setSmoothnessLevel(SmoothnessLevel.MEDIUM)
            }
            metrics.smoothnessScore in 80f..94f && smoothnessLevel != SmoothnessLevel.HIGH -> {
                setSmoothnessLevel(SmoothnessLevel.HIGH)
            }
            metrics.smoothnessScore >= 95f && smoothnessLevel != SmoothnessLevel.ULTRA -> {
                setSmoothnessLevel(SmoothnessLevel.ULTRA)
            }
        }
    }

    /**
     * Get available smooth modes
     */
    fun getAvailableSmoothModes(): List<SmoothMode> {
        return smoothnessConfig.getAvailableSmoothModes()
    }

    /**
     * Get available smoothness levels
     */
    fun getAvailableSmoothnessLevels(): List<SmoothnessLevel> {
        return listOf(
            SmoothnessLevel.LOW,
            SmoothnessLevel.MEDIUM,
            SmoothnessLevel.HIGH,
            SmoothnessLevel.ULTRA
        )
    }

    /**
     * Get smoothness level display names
     */
    fun getSmoothnessLevelDisplayNames(): Map<SmoothnessLevel, String> {
        return mapOf(
            SmoothnessLevel.LOW to "Low",
            SmoothnessLevel.MEDIUM to "Medium",
            SmoothnessLevel.HIGH to "High",
            SmoothnessLevel.ULTRA to "Ultra"
        )
    }

    /**
     * Get smoothness level descriptions
     */
    fun getSmoothnessLevelDescriptions(): Map<SmoothnessLevel, String> {
        return mapOf(
            SmoothnessLevel.LOW to "Fast execution with minimal delays",
            SmoothnessLevel.MEDIUM to "Balanced smoothness and speed (recommended)",
            SmoothnessLevel.HIGH to "Very smooth with noticeable delays",
            SmoothnessLevel.ULTRA to "Cinematic smoothness with longest delays"
        )
    }

    /**
     * Create smoothness profile
     */
    fun createSmoothnessProfile(
        name: String,
        level: SmoothnessLevel,
        mode: SmoothMode,
        customDelays: Map<ActionType, Long> = emptyMap()
    ): SmoothConfig {
        val profile = smoothnessProfiles[level] ?: smoothnessProfiles[SmoothnessLevel.MEDIUM]!!
        return profile.copy(
            mode = mode,
            baseDelay = customDelays[ActionType.OPEN_APP] ?: profile.baseDelay,
            actionDelay = customDelays[ActionType.CLICK] ?: profile.actionDelay,
            scrollDelay = customDelays[ActionType.SCROLL] ?: profile.scrollDelay,
            typeDelay = customDelays[ActionType.TYPE_TEXT] ?: profile.typeDelay,
            tapDelay = customDelays[ActionType.TAP] ?: profile.tapDelay
        )
    }

    /**
     * Apply smoothness profile to engine
     */
    fun applyProfileToEngine(engine: SmoothActionEngine, profile: SmoothConfig) {
        engine.setConfig(profile)
    }

    /**
     * Get current profile
     */
    fun getCurrentProfile(): SmoothConfig {
        return getCurrentSmoothConfig()
    }

    /**
     * Cleanup
     */
    fun cleanup() {
        isEnhanced = false
        resetMetrics()
    }
}

/**
 * Singleton for global smoothness enhancer
 */
object GlobalSmoothnessEnhancer {
    private var instance: SmoothnessEnhancer? = null

    fun initialize(context: Context): SmoothnessEnhancer {
        instance = SmoothnessEnhancer(context).apply { initialize() }
        return instance!!
    }

    fun getInstance(): SmoothnessEnhancer? {
        return instance
    }

    fun setInstance(enhancer: SmoothnessEnhancer) {
        instance = enhancer
    }

    fun cleanup() {
        instance?.cleanup()
        instance = null
    }
}

/**
 * Extension functions for smoothness
 */

/**
 * Apply smoothness to action engine
 */
fun IrisAppControlManager.enableSmoothness(context: Context): SmoothActionEngine {
    val enhancer = GlobalSmoothnessEnhancer.initialize(context)
    val appController = this.appController ?: throw IllegalStateException("AppController not initialized")
    return enhancer.createEnhancedSmoothEngine(appController)
}

/**
 * Execute with smoothness
 */
fun IrisAppControlManager.executeSmoothly(
    command: String,
    smoothCallback: SmoothActionCallback? = null
): Boolean {
    val parsed = IrisCommandParser.parse(command)
    val actions = actionPlanner.plan(parsed)
    
    if (actions.isEmpty()) return false
    
    val appController = this.appController ?: return false
    val enhancer = GlobalSmoothnessEnhancer.getInstance() ?: return false
    val engine = enhancer.createEnhancedSmoothEngine(appController)
    
    return enhancer.enhanceActionExecution(actions, engine, smoothCallback)
}

/**
 * Set smooth mode
 */
fun IrisAppControlManager.setSmoothMode(mode: SmoothMode) {
    GlobalSmoothnessEnhancer.getInstance()?.setSmoothMode(mode)
}

/**
 * Set smoothness level
 */
fun IrisAppControlManager.setSmoothnessLevel(level: SmoothnessLevel) {
    GlobalSmoothnessEnhancer.getInstance()?.setSmoothnessLevel(level)
}

/**
 * Enable/disable smoothness
 */
fun IrisAppControlManager.setSmoothnessEnabled(enabled: Boolean) {
    GlobalSmoothnessEnhancer.getInstance()?.setEnhanced(enabled)
}
