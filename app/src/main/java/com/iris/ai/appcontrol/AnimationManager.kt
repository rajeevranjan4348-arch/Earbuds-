/*
 * IRIS App Control - Animation Manager
 * Manages smooth animations for app control actions
 */

package com.iris.ai.appcontrol

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.animation.*
import android.widget.TextView

/**
 * Animation types for different actions
 */
enum class AnimationType {
    FADE,
    SLIDE_IN,
    SLIDE_OUT,
    SLIDE_UP,
    SLIDE_DOWN,
    SCALE,
    SCALE_FADE,
    PULSE,
    SHAKE,
    BOUNCE,
    ROTATE,
    FLIP,
    ZOOM,
    WAVE,
    RIPPLE
}

/**
 * Animation direction
 */
enum class AnimationDirection {
    LEFT,
    RIGHT,
    UP,
    DOWN,
    IN,
    OUT
}

/**
 * Animation configuration
 */
data class AnimationConfig(
    val type: AnimationType = AnimationType.FADE,
    val direction: AnimationDirection = AnimationDirection.IN,
    val duration: Long = 300L,
    val startDelay: Long = 0L,
    val interpolator: Interpolator = DecelerateInterpolator(),
    val repeatCount: Int = 0,
    val repeatMode: Int = ValueAnimator.RESTART,
    val fillAfter: Boolean = false,
    val fillBefore: Boolean = false
)

/**
 * Animation callback
 */
interface AnimationCallback {
    fun onAnimationStart(animation: Animator, config: AnimationConfig)
    fun onAnimationEnd(animation: Animator, config: AnimationConfig)
    fun onAnimationRepeat(animation: Animator, config: AnimationConfig)
    fun onAnimationCancel(animation: Animator, config: AnimationConfig)
}

/**
 * Animation Manager
 * Provides smooth, polished animations for app control actions
 */
class AnimationManager(private val context: Context) {
    private const val TAG = "AnimationManager"
    
    private val mainHandler = Handler(Looper.getMainLooper())
    private val activeAnimations = mutableListOf<Animator>()
    private var globalCallback: AnimationCallback? = null
    private var animationsEnabled = true
    private var smoothMode = SmoothMode.NATURAL

    /**
     * Animate a view with specified configuration
     */
    fun animateView(
        view: View,
        config: AnimationConfig,
        callback: AnimationCallback? = null
    ): Animator? {
        if (!animationsEnabled) {
            return null
        }
        
        val animation = createAnimation(view, config)
        animation?.let { anim ->
            activeAnimations.add(anim)
            
            anim.addListener(object : AnimatorListenerAdapter() {
                override fun onAnimationStart(animation: Animator) {
                    super.onAnimationStart(animation)
                    callback?.onAnimationStart(animation, config)
                    globalCallback?.onAnimationStart(animation, config)
                }
                
                override fun onAnimationEnd(animation: Animator) {
                    super.onAnimationEnd(animation)
                    activeAnimations.remove(animation)
                    callback?.onAnimationEnd(animation, config)
                    globalCallback?.onAnimationEnd(animation, config)
                }
                
                override fun onAnimationRepeat(animation: Animator) {
                    super.onAnimationRepeat(animation)
                    callback?.onAnimationRepeat(animation, config)
                    globalCallback?.onAnimationRepeat(animation, config)
                }
                
                override fun onAnimationCancel(animation: Animator) {
                    super.onAnimationCancel(animation)
                    activeAnimations.remove(animation)
                    callback?.onAnimationCancel(animation, config)
                    globalCallback?.onAnimationCancel(animation, config)
                }
            })
            
            anim.start()
        }
        
        return animation
    }

    /**
     * Create animation based on configuration
     */
    private fun createAnimation(view: View, config: AnimationConfig): Animator? {
        return when (config.type) {
            AnimationType.FADE -> createFadeAnimation(view, config)
            AnimationType.SLIDE_IN -> createSlideAnimation(view, config, true)
            AnimationType.SLIDE_OUT -> createSlideAnimation(view, config, false)
            AnimationType.SLIDE_UP -> createSlideAnimation(view, config.copy(direction = AnimationDirection.UP), true)
            AnimationType.SLIDE_DOWN -> createSlideAnimation(view, config.copy(direction = AnimationDirection.DOWN), true)
            AnimationType.SCALE -> createScaleAnimation(view, config)
            AnimationType.SCALE_FADE -> createScaleFadeAnimation(view, config)
            AnimationType.PULSE -> createPulseAnimation(view, config)
            AnimationType.SHAKE -> createShakeAnimation(view, config)
            AnimationType.BOUNCE -> createBounceAnimation(view, config)
            AnimationType.ROTATE -> createRotateAnimation(view, config)
            AnimationType.FLIP -> createFlipAnimation(view, config)
            AnimationType.ZOOM -> createZoomAnimation(view, config)
            AnimationType.WAVE -> createWaveAnimation(view, config)
            AnimationType.RIPPLE -> createRippleAnimation(view, config)
        }
    }

    /**
     * Create fade animation
     */
    private fun createFadeAnimation(view: View, config: AnimationConfig): Animator {
        val startAlpha = if (config.direction == AnimationDirection.IN) 0f else 1f
        val endAlpha = if (config.direction == AnimationDirection.IN) 1f else 0f
        
        return ObjectAnimator.ofFloat(view, "alpha", startAlpha, endAlpha).apply {
            duration = config.duration
            startDelay = config.startDelay
            interpolator = config.interpolator
            repeatCount = config.repeatCount
            repeatMode = config.repeatMode
        }
    }

    /**
     * Create slide animation
     */
    private fun createSlideAnimation(
        view: View,
        config: AnimationConfig,
        isIn: Boolean
    ): Animator {
        val distance = view.context.resources.displayMetrics.widthPixels * 0.3f
        
        val startX = when (config.direction) {
            AnimationDirection.LEFT -> if (isIn) -distance else 0f
            AnimationDirection.RIGHT -> if (isIn) distance else 0f
            AnimationDirection.UP -> 0f
            AnimationDirection.DOWN -> 0f
            else -> if (isIn) -distance else 0f
        }
        
        val endX = when (config.direction) {
            AnimationDirection.LEFT -> if (isIn) 0f else -distance
            AnimationDirection.RIGHT -> if (isIn) 0f else distance
            AnimationDirection.UP -> 0f
            AnimationDirection.DOWN -> 0f
            else -> if (isIn) 0f else -distance
        }
        
        val startY = when (config.direction) {
            AnimationDirection.UP -> if (isIn) -distance else 0f
            AnimationDirection.DOWN -> if (isIn) distance else 0f
            else -> 0f
        }
        
        val endY = when (config.direction) {
            AnimationDirection.UP -> if (isIn) 0f else -distance
            AnimationDirection.DOWN -> if (isIn) 0f else distance
            else -> 0f
        }
        
        val animatorX = ObjectAnimator.ofFloat(view, "translationX", startX, endX)
        val animatorY = ObjectAnimator.ofFloat(view, "translationY", startY, endY)
        
        return AnimatorSet().apply {
            playTogether(animatorX, animatorY)
            duration = config.duration
            startDelay = config.startDelay
            interpolator = config.interpolator
        }
    }

    /**
     * Create scale animation
     */
    private fun createScaleAnimation(view: View, config: AnimationConfig): Animator {
        val startScale = if (config.direction == AnimationDirection.IN) 0.8f else 1.2f
        val endScale = if (config.direction == AnimationDirection.IN) 1.2f else 0.8f
        
        return ObjectAnimator.ofFloat(view, "scaleX", startScale, endScale).apply {
            duration = config.duration
            startDelay = config.startDelay
            interpolator = BounceInterpolator()
        }
    }

    /**
     * Create scale fade animation
     */
    private fun createScaleFadeAnimation(view: View, config: AnimationConfig): Animator {
        val scaleX = ObjectAnimator.ofFloat(view, "scaleX", 0.8f, 1.0f)
        val scaleY = ObjectAnimator.ofFloat(view, "scaleY", 0.8f, 1.0f)
        val alpha = ObjectAnimator.ofFloat(view, "alpha", 0f, 1f)
        
        return AnimatorSet().apply {
            playTogether(scaleX, scaleY, alpha)
            duration = config.duration
            startDelay = config.startDelay
            interpolator = DecelerateInterpolator()
        }
    }

    /**
     * Create pulse animation
     */
    private fun createPulseAnimation(view: View, config: AnimationConfig): Animator {
        val scaleX = ObjectAnimator.ofFloat(view, "scaleX", 1.0f, 1.1f, 1.0f)
        val scaleY = ObjectAnimator.ofFloat(view, "scaleY", 1.0f, 1.1f, 1.0f)
        
        return AnimatorSet().apply {
            playTogether(scaleX, scaleY)
            duration = config.duration
            startDelay = config.startDelay
            interpolator = AccelerateDecelerateInterpolator()
            repeatCount = ValueAnimator.INFINITE
        }
    }

    /**
     * Create shake animation
     */
    private fun createShakeAnimation(view: View, config: AnimationConfig): Animator {
        val distance = 10f
        val cycles = 5
        
        val keyframes = KeyframeSet().apply {
            addKeyframe(Keyframe.ofFloat(0f, 0f))
            addKeyframe(Keyframe.ofFloat(0.1f, distance))
            addKeyframe(Keyframe.ofFloat(0.2f, -distance))
            addKeyframe(Keyframe.ofFloat(0.3f, distance))
            addKeyframe(Keyframe.ofFloat(0.4f, -distance))
            addKeyframe(Keyframe.ofFloat(0.5f, distance))
            addKeyframe(Keyframe.ofFloat(0.6f, -distance))
            addKeyframe(Keyframe.ofFloat(0.7f, distance))
            addKeyframe(Keyframe.ofFloat(0.8f, -distance))
            addKeyframe(Keyframe.ofFloat(0.9f, distance))
            addKeyframe(Keyframe.ofFloat(1.0f, 0f))
        }
        
        return ObjectAnimator.ofFloat(view, "translationX", keyframes).apply {
            duration = config.duration
            startDelay = config.startDelay
            interpolator = LinearInterpolator()
        }
    }

    /**
     * Create bounce animation
     */
    private fun createBounceAnimation(view: View, config: AnimationConfig): Animator {
        val distance = view.context.resources.displayMetrics.heightPixels * 0.2f
        
        val animator = ObjectAnimator.ofFloat(view, "translationY", 0f, -distance, 0f).apply {
            duration = config.duration
            startDelay = config.startDelay
            interpolator = BounceInterpolator()
        }
        
        return animator
    }

    /**
     * Create rotate animation
     */
    private fun createRotateAnimation(view: View, config: AnimationConfig): Animator {
        val start = 0f
        val end = if (config.direction == AnimationDirection.IN) 360f else -360f
        
        return ObjectAnimator.ofFloat(view, "rotation", start, end).apply {
            duration = config.duration
            startDelay = config.startDelay
            interpolator = LinearInterpolator()
        }
    }

    /**
     * Create flip animation
     */
    private fun createFlipAnimation(view: View, config: AnimationConfig): Animator {
        val animator = ObjectAnimator.ofFloat(view, "rotationY", 0f, 180f).apply {
            duration = config.duration / 2
            startDelay = config.startDelay
            interpolator = AccelerateInterpolator()
        }
        
        val animator2 = ObjectAnimator.ofFloat(view, "rotationY", 180f, 360f).apply {
            duration = config.duration / 2
            startDelay = config.startDelay + (config.duration / 2)
            interpolator = DecelerateInterpolator()
        }
        
        return AnimatorSet().apply {
            playSequentially(animator, animator2)
        }
    }

    /**
     * Create zoom animation
     */
    private fun createZoomAnimation(view: View, config: AnimationConfig): Animator {
        val scaleX = ObjectAnimator.ofFloat(view, "scaleX", 1.0f, 1.5f, 1.0f)
        val scaleY = ObjectAnimator.ofFloat(view, "scaleY", 1.0f, 1.5f, 1.0f)
        
        return AnimatorSet().apply {
            playTogether(scaleX, scaleY)
            duration = config.duration
            startDelay = config.startDelay
            interpolator = AccelerateDecelerateInterpolator()
        }
    }

    /**
     * Create wave animation (for text views)
     */
    private fun createWaveAnimation(view: View, config: AnimationConfig): Animator {
        if (view !is TextView) {
            return createPulseAnimation(view, config)
        }
        
        // Wave effect for text - animate character by character
        val text = view.text.toString()
        val durationPerChar = config.duration / max(text.length, 1).toLong()
        
        // This is a simplified wave - in practice would need more complex implementation
        return createPulseAnimation(view, config.copy(duration = durationPerChar * text.length))
    }

    /**
     * Create ripple animation
     */
    private fun createRippleAnimation(view: View, config: AnimationConfig): Animator {
        // Simulate ripple with scale and alpha
        val scaleX = ObjectAnimator.ofFloat(view, "scaleX", 1.0f, 1.3f, 1.0f)
        val scaleY = ObjectAnimator.ofFloat(view, "scaleY", 1.0f, 1.3f, 1.0f)
        val alpha = ObjectAnimator.ofFloat(view, "alpha", 1.0f, 0.7f, 1.0f)
        
        return AnimatorSet().apply {
            playTogether(scaleX, scaleY, alpha)
            duration = config.duration
            startDelay = config.startDelay
            interpolator = DecelerateInterpolator()
        }
    }

    /**
     * Animate action completion with smooth feedback
     */
    fun animateActionCompletion(
        view: View,
        action: IrisAction,
        success: Boolean,
        callback: AnimationCallback? = null
    ) {
        val config = when {
            success -> AnimationConfig(
                type = AnimationType.SCALE_FADE,
                duration = 200L,
                interpolator = BounceInterpolator()
            )
            else -> AnimationConfig(
                type = AnimationType.SHAKE,
                duration = 300L,
                interpolator = LinearInterpolator()
            )
        }
        
        animateView(view, config, callback)
    }

    /**
     * Animate action sequence start
     */
    fun animateSequenceStart(view: View, totalActions: Int, callback: AnimationCallback? = null) {
        val config = AnimationConfig(
            type = AnimationType.SCALE_FADE,
            duration = 300L,
            interpolator = OvershootInterpolator(),
            callback = callback
        )
        
        animateView(view, config, callback)
    }

    /**
     * Animate action sequence complete
     */
    fun animateSequenceComplete(view: View, allSuccess: Boolean, callback: AnimationCallback? = null) {
        val config = if (allSuccess) {
            AnimationConfig(
                type = AnimationType.BOUNCE,
                duration = 500L,
                interpolator = BounceInterpolator()
            )
        } else {
            AnimationConfig(
                type = AnimationType.SHAKE,
                duration = 400L,
                interpolator = LinearInterpolator()
            )
        }
        
        animateView(view, config, callback)
    }

    /**
     * Animate progress update
     */
    fun animateProgress(view: View, progress: Float, total: Int, callback: AnimationCallback? = null) {
        // Scale based on progress
        val scale = 1.0f + (0.1f * (progress / total))
        
        val config = AnimationConfig(
            type = AnimationType.SCALE,
            duration = 150L,
            interpolator = DecelerateInterpolator()
        )
        
        animateView(view, config, callback)
    }

    /**
     * Animate typing indicator
     */
    fun animateTyping(view: View, isTyping: Boolean, callback: AnimationCallback? = null) {
        if (isTyping) {
            val config = AnimationConfig(
                type = AnimationType.PULSE,
                duration = 1000L,
                repeatCount = ValueAnimator.INFINITE,
                interpolator = AccelerateDecelerateInterpolator()
            )
            animateView(view, config, callback)
        } else {
            // Stop any existing typing animation
            cancelAnimations(view)
        }
    }

    /**
     * Animate loading state
     */
    fun animateLoading(view: View, isLoading: Boolean, callback: AnimationCallback? = null) {
        if (isLoading) {
            val config = AnimationConfig(
                type = AnimationType.ROTATE,
                duration = 2000L,
                repeatCount = ValueAnimator.INFINITE,
                interpolator = LinearInterpolator()
            )
            animateView(view, config, callback)
        } else {
            cancelAnimations(view)
        }
    }

    /**
     * Animate success feedback
     */
    fun animateSuccess(view: View, callback: AnimationCallback? = null) {
        val config = AnimationConfig(
            type = AnimationType.BOUNCE,
            duration = 500L,
            interpolator = BounceInterpolator()
        )
        animateView(view, config, callback)
    }

    /**
     * Animate error feedback
     */
    fun animateError(view: View, callback: AnimationCallback? = null) {
        val config = AnimationConfig(
            type = AnimationType.SHAKE,
            duration = 400L,
            interpolator = LinearInterpolator()
        )
        animateView(view, config, callback)
    }

    /**
     * Animate confirmation required
     */
    fun animateConfirmationRequired(view: View, callback: AnimationCallback? = null) {
        val config = AnimationConfig(
            type = AnimationType.PULSE,
            duration = 1500L,
            repeatCount = ValueAnimator.INFINITE,
            interpolator = AccelerateDecelerateInterpolator()
        )
        animateView(view, config, callback)
    }

    /**
     * Cancel all animations on a view
     */
    fun cancelAnimations(view: View) {
        val animationsToRemove = activeAnimations.filter { anim ->
            anim.target == view
        }
        
        for (anim in animationsToRemove) {
            anim.cancel()
            activeAnimations.remove(anim)
        }
    }

    /**
     * Cancel all active animations
     */
    fun cancelAllAnimations() {
        for (anim in activeAnimations) {
            anim.cancel()
        }
        activeAnimations.clear()
    }

    /**
     * Set global callback
     */
    fun setGlobalCallback(callback: AnimationCallback) {
        this.globalCallback = callback
    }

    /**
     * Clear global callback
     */
    fun clearGlobalCallback() {
        this.globalCallback = null
    }

    /**
     * Enable/disable animations
     */
    fun setAnimationsEnabled(enabled: Boolean) {
        this.animationsEnabled = enabled
        if (!enabled) {
            cancelAllAnimations()
        }
    }

    /**
     * Check if animations are enabled
     */
    fun areAnimationsEnabled(): Boolean {
        return animationsEnabled
    }

    /**
     * Set smooth mode
     */
    fun setSmoothMode(mode: SmoothMode) {
        this.smoothMode = mode
    }

    /**
     * Get smooth mode
     */
    fun getSmoothMode(): SmoothMode {
        return smoothMode
    }

    /**
     * Get active animation count
     */
    fun getActiveAnimationCount(): Int {
        return activeAnimations.size
    }

    /**
     * Create animation preset for app opening
     */
    fun createAppOpenAnimation(view: View): AnimatorSet {
        val fadeIn = ObjectAnimator.ofFloat(view, "alpha", 0f, 1f)
        val slideUp = ObjectAnimator.ofFloat(view, "translationY", 50f, 0f)
        
        return AnimatorSet().apply {
            playTogether(fadeIn, slideUp)
            duration = 400L
            interpolator = DecelerateInterpolator()
        }
    }

    /**
     * Create animation preset for action execution
     */
    fun createActionAnimation(view: View, actionType: ActionType): Animator {
        return when (actionType) {
            ActionType.OPEN_APP -> createAppOpenAnimation(view)
            ActionType.CLICK, ActionType.TAP -> createPulseAnimation(view, AnimationConfig(duration = 200L))
            ActionType.TYPE_TEXT -> createWaveAnimation(view, AnimationConfig(duration = 500L))
            ActionType.SCROLL -> createSlideAnimation(view, AnimationConfig(type = AnimationType.SLIDE_UP, duration = 300L), true)
            ActionType.BACK -> createSlideAnimation(view, AnimationConfig(type = AnimationType.SLIDE_OUT, direction = AnimationDirection.RIGHT, duration = 300L), true)
            ActionType.HOME -> createScaleFadeAnimation(view, AnimationConfig(duration = 300L))
            else -> createFadeAnimation(view, AnimationConfig(duration = 200L))
        }
    }
}

/**
 * Predefined animation presets
 */
object AnimationPresets {
    fun fadeIn(context: Context, view: View, duration: Long = 300L): Animator {
        return AnimationManager(context).createFadeAnimation(view, AnimationConfig(
            type = AnimationType.FADE,
            direction = AnimationDirection.IN,
            duration = duration
        ))
    }

    fun fadeOut(context: Context, view: View, duration: Long = 300L): Animator {
        return AnimationManager(context).createFadeAnimation(view, AnimationConfig(
            type = AnimationType.FADE,
            direction = AnimationDirection.OUT,
            duration = duration
        ))
    }

    fun slideInLeft(context: Context, view: View, duration: Long = 400L): Animator {
        return AnimationManager(context).createSlideAnimation(view, AnimationConfig(
            type = AnimationType.SLIDE_IN,
            direction = AnimationDirection.LEFT,
            duration = duration,
            interpolator = DecelerateInterpolator()
        ), true)
    }

    fun slideInRight(context: Context, view: View, duration: Long = 400L): Animator {
        return AnimationManager(context).createSlideAnimation(view, AnimationConfig(
            type = AnimationType.SLIDE_IN,
            direction = AnimationDirection.RIGHT,
            duration = duration,
            interpolator = DecelerateInterpolator()
        ), true)
    }

    fun scaleIn(context: Context, view: View, duration: Long = 300L): Animator {
        return AnimationManager(context).createScaleFadeAnimation(view, AnimationConfig(
            type = AnimationType.SCALE_FADE,
            duration = duration,
            interpolator = OvershootInterpolator()
        ))
    }

    fun bounce(context: Context, view: View, duration: Long = 500L): Animator {
        return AnimationManager(context).createBounceAnimation(view, AnimationConfig(
            type = AnimationType.BOUNCE,
            duration = duration
        ))
    }

    fun shake(context: Context, view: View, duration: Long = 400L): Animator {
        return AnimationManager(context).createShakeAnimation(view, AnimationConfig(
            type = AnimationType.SHAKE,
            duration = duration
        ))
    }

    fun pulse(context: Context, view: View, duration: Long = 1000L): Animator {
        return AnimationManager(context).createPulseAnimation(view, AnimationConfig(
            type = AnimationType.PULSE,
            duration = duration
        ))
    }
}
