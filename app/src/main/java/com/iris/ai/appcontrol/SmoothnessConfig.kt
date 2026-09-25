/*
 * IRIS App Control - Smoothness Configuration
 * Global configuration for smooth app control experience
 */

package com.iris.ai.appcontrol

import android.content.Context
import android.content.SharedPreferences
import android.util.Log

/**
 * Smoothness settings for different action types
 */
data class SmoothnessSettings(
    // Timing settings
    val baseDelayMs: Long = 200L,
    val minDelayMs: Long = 100L,
    val maxDelayMs: Long = 1000L,
    
    // Action-specific delays
    val openAppDelayMs: Long = 500L,
    val closeAppDelayMs: Long = 300L,
    val tapDelayMs: Long = 200L,
    val typeDelayMs: Long = 300L,
    val scrollDelayMs: Long = 250L,
    val swipeDelayMs: Long = 250L,
    val searchDelayMs: Long = 400L,
    val navigateDelayMs: Long = 350L,
    
    // Acceleration/deceleration
    val accelerationFactor: Float = 1.2f,
    val decelerationFactor: Float = 0.8f,
    val easeInDuration: Float = 0.3f,
    val easeOutDuration: Float = 0.7f,
    
    // Animation settings
    val enableAnimations: Boolean = true,
    val animationDurationMs: Long = 300L,
    val animationInterpolator: String = "decelerate",
    
    // Visual feedback
    val enableVisualFeedback: Boolean = true,
    val visualFeedbackDurationMs: Long = 200L,
    val successColor: Int = 0xFF4CAF50.toInt(),
    val errorColor: Int = 0xFFF44336.toInt(),
    val warningColor: Int = 0xFFFFC107.toInt(),
    
    // Audio feedback
    val enableAudioFeedback: Boolean = false,
    val successSound: String? = null,
    val errorSound: String? = null,
    
    // Haptic feedback
    val enableHapticFeedback: Boolean = false,
    val hapticDurationMs: Long = 50L,
    
    // Adaptive timing
    val adaptiveTiming: Boolean = true,
    val adaptToDeviceSpeed: Boolean = true,
    val adaptToActionComplexity: Boolean = true,
    
    // Smooth mode
    val defaultSmoothMode: String = "NATURAL"
)

/**
 * Smoothness configuration manager
 */
class SmoothnessConfig(private val context: Context) {
    private const val TAG = "SmoothnessConfig"
    private const val PREFS_NAME = "IrisSmoothnessPrefs"
    private const val KEY_SETTINGS = "smoothness_settings"
    
    private var settings: SmoothnessSettings = SmoothnessSettings()
    private var prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    
    init {
        loadSettings()
    }

    /**
     * Load settings from preferences
     */
    private fun loadSettings() {
        try {
            val json = prefs.getString(KEY_SETTINGS, null)
            if (json != null) {
                // In a real implementation, use Gson or similar to deserialize
                // For now, use defaults
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error loading smoothness settings", e)
        }
    }

    /**
     * Save settings to preferences
     */
    fun saveSettings() {
        try {
            val editor = prefs.edit()
            // In a real implementation, serialize to JSON
            editor.putString(KEY_SETTINGS, "smoothness_config")
            editor.apply()
        } catch (e: Exception) {
            Log.e(TAG, "Error saving smoothness settings", e)
        }
    }

    /**
     * Get current settings
     */
    fun getSettings(): SmoothnessSettings {
        return settings
    }

    /**
     * Update settings
     */
    fun updateSettings(block: SmoothnessSettings.() -> Unit) {
        val newSettings = settings.copy()
        block(newSettings)
        settings = newSettings
        saveSettings()
    }

    /**
     * Get delay for specific action type
     */
    fun getActionDelay(actionType: ActionType): Long {
        return when (actionType) {
            ActionType.OPEN_APP -> settings.openAppDelayMs
            ActionType.CLOSE_APP -> settings.closeAppDelayMs
            ActionType.CLICK, ActionType.TAP, ActionType.FIND_ELEMENT -> settings.tapDelayMs
            ActionType.TYPE_TEXT -> settings.typeDelayMs
            ActionType.SCROLL, ActionType.SWIPE -> settings.scrollDelayMs
            ActionType.SEARCH -> settings.searchDelayMs
            ActionType.NAVIGATE -> settings.navigateDelayMs
            else -> settings.baseDelayMs
        }
    }

    /**
     * Calculate adaptive delay based on context
     */
    fun calculateAdaptiveDelay(
        actionType: ActionType,
        actionIndex: Int,
        totalActions: Int,
        actionComplexity: Float = 1.0f
    ): Long {
        val baseDelay = getActionDelay(actionType)
        
        // Adapt to position in sequence
        val positionFactor = when {
            !settings.adaptiveTiming -> 1.0f
            actionIndex < totalActions * 0.3f -> settings.easeInDuration
            actionIndex > totalActions * 0.7f -> settings.easeOutDuration
            else -> 1.0f
        }
        
        // Adapt to complexity
        val complexityFactor = if (settings.adaptToActionComplexity) {
            actionComplexity.coerceIn(0.5f, 2.0f)
        } else {
            1.0f
        }
        
        val delay = (baseDelay * positionFactor * complexityFactor).toLong()
        
        return delay.coerceIn(settings.minDelayMs, settings.maxDelayMs)
    }

    /**
     * Calculate action complexity (0-2 scale)
     */
    fun calculateActionComplexity(action: IrisAction): Float {
        return when (action.type) {
            ActionType.OPEN_APP -> 1.5f
            ActionType.WAIT, ActionType.WAIT_FOR_ELEMENT -> 0.5f
            ActionType.TYPE_TEXT -> {
                val textLength = action.text?.length ?: 0
                (0.8f + (textLength * 0.01f)).coerceAtMost(2.0f)
            }
            ActionType.SCROLL, ActionType.SWIPE -> 0.7f
            ActionType.CLICK, ActionType.TAP, ActionType.FIND_ELEMENT -> 0.6f
            ActionType.SEARCH -> 1.2f
            ActionType.NAVIGATE -> 1.0f
            ActionType.BACK, ActionType.HOME -> 0.5f
            else -> 1.0f
        }
    }

    /**
     * Get smooth mode from string
     */
    fun getSmoothMode(modeString: String): SmoothMode {
        return when (modeString.uppercase()) {
            "INSTANT" -> SmoothMode.INSTANT
            "SMOOTH" -> SmoothMode.SMOOTH
            "CINEMATIC" -> SmoothMode.CINEMATIC
            else -> SmoothMode.NATURAL
        }
    }

    /**
     * Get smooth mode string
     */
    fun getSmoothModeString(mode: SmoothMode): String {
        return mode.name.lowercase()
    }

    /**
     * Set smooth mode
     */
    fun setSmoothMode(mode: SmoothMode) {
        updateSettings { defaultSmoothMode = getSmoothModeString(mode) }
    }

    /**
     * Get default smooth mode
     */
    fun getDefaultSmoothMode(): SmoothMode {
        return getSmoothMode(settings.defaultSmoothMode)
    }

    /**
     * Enable/disable animations
     */
    fun setAnimationsEnabled(enabled: Boolean) {
        updateSettings { enableAnimations = enabled }
    }

    /**
     * Enable/disable visual feedback
     */
    fun setVisualFeedbackEnabled(enabled: Boolean) {
        updateSettings { enableVisualFeedback = enabled }
    }

    /**
     * Enable/disable audio feedback
     */
    fun setAudioFeedbackEnabled(enabled: Boolean) {
        updateSettings { enableAudioFeedback = enabled }
    }

    /**
     * Enable/disable haptic feedback
     */
    fun setHapticFeedbackEnabled(enabled: Boolean) {
        updateSettings { enableHapticFeedback = enabled }
    }

    /**
     * Enable/disable adaptive timing
     */
    fun setAdaptiveTimingEnabled(enabled: Boolean) {
        updateSettings { adaptiveTiming = enabled }
    }

    /**
     * Set base delay
     */
    fun setBaseDelay(delayMs: Long) {
        updateSettings { baseDelayMs = delayMs.coerceAtLeast(50L).coerceAtMost(2000L) }
    }

    /**
     * Set acceleration factor
     */
    fun setAccelerationFactor(factor: Float) {
        updateSettings { accelerationFactor = factor.coerceIn(0.5f, 3.0f) }
    }

    /**
     * Set deceleration factor
     */
    fun setDecelerationFactor(factor: Float) {
        updateSettings { decelerationFactor = factor.coerceIn(0.5f, 3.0f) }
    }

    /**
     * Reset to defaults
     */
    fun resetToDefaults() {
        settings = SmoothnessSettings()
        saveSettings()
    }

    /**
     * Get all available smooth modes
     */
    fun getAvailableSmoothModes(): List<SmoothMode> {
        return listOf(
            SmoothMode.INSTANT,
            SmoothMode.SMOOTH,
            SmoothMode.NATURAL,
            SmoothMode.CINEMATIC
        )
    }

    /**
     * Get smooth mode display names
     */
    fun getSmoothModeDisplayNames(): Map<SmoothMode, String> {
        return mapOf(
            SmoothMode.INSTANT to "Instant",
            SmoothMode.SMOOTH to "Smooth",
            SmoothMode.NATURAL to "Natural",
            SmoothMode.CINEMATIC to "Cinematic"
        )
    }

    /**
     * Get smooth mode descriptions
     */
    fun getSmoothModeDescriptions(): Map<SmoothMode, String> {
        return mapOf(
            SmoothMode.INSTANT to "Execute actions immediately with no delay",
            SmoothMode.SMOOTH to "Smooth transitions between actions",
            SmoothMode.NATURAL to "Natural human-like timing (recommended)",
            SmoothMode.CINEMATIC to "Dramatic smooth animations with longer delays"
        )
    }
}

/**
 * Singleton for global smoothness configuration
 */
object GlobalSmoothnessConfig {
    private var instance: SmoothnessConfig? = null

    fun initialize(context: Context): SmoothnessConfig {
        instance = SmoothnessConfig(context)
        return instance!!
    }

    fun getInstance(): SmoothnessConfig? {
        return instance
    }

    fun setInstance(config: SmoothnessConfig) {
        instance = config
    }

    fun cleanup() {
        instance = null
    }
}

/**
 * Extension functions for easy smoothness configuration
 */

/**
 * Apply smooth delay to action
 */
fun IrisAction.applySmoothDelay(
    index: Int,
    total: Int,
    config: SmoothnessConfig
): IrisAction {
    val delay = config.calculateAdaptiveDelay(
        this.type,
        index,
        total,
        config.calculateActionComplexity(this)
    )
    
    return when (this.type) {
        ActionType.WAIT, ActionType.WAIT_FOR_ELEMENT -> {
            this.copy(timeout = maxOf(this.timeout, delay))
        }
        else -> this
    }
}

/**
 * Create smooth config from smoothness settings
 */
fun SmoothnessSettings.toSmoothConfig(): SmoothConfig {
    return SmoothConfig(
        mode = GlobalSmoothnessConfig.getInstance()?.getDefaultSmoothMode() ?: SmoothMode.NATURAL,
        baseDelay = this.baseDelayMs,
        actionDelay = this.baseDelayMs * 2,
        scrollDelay = this.scrollDelayMs,
        typeDelay = this.typeDelayMs,
        tapDelay = this.tapDelayMs,
        waitMultiplier = 1.5f,
        accelerationFactor = this.accelerationFactor,
        decelerationFactor = this.decelerationFactor,
        enableAnimations = this.enableAnimations,
        enableSounds = this.enableAudioFeedback,
        enableHaptics = this.enableHapticFeedback
    )
}
