/*
 * IRIS App Control - Transition Manager
 * Manages smooth transitions between app states and actions
 */

package com.iris.ai.appcontrol

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import android.view.animation.*
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Transition types between app states
 */
enum class TransitionType {
    NONE,
    FADE,
    SLIDE,
    SCALE,
    SLIDE_FADE,
    CROSSFADE,
    ZOOM,
    FLIP,
    CUSTOM
}

/**
 * Transition direction
 */
enum class TransitionDirection {
    IN,
    OUT,
    LEFT,
    RIGHT,
    UP,
    DOWN
}

/**
 * Transition configuration
 */
data class TransitionConfig(
    val type: TransitionType = TransitionType.FADE,
    val direction: TransitionDirection = TransitionDirection.IN,
    val duration: Long = 300L,
    val startDelay: Long = 0L,
    val interpolator: Interpolator = DecelerateInterpolator(),
    val overlap: Boolean = false,
    val overlapOffset: Long = 50L
)

/**
 * Transition callback
 */
interface TransitionCallback {
    fun onTransitionStart(from: View?, to: View?, config: TransitionConfig)
    fun onTransitionProgress(progress: Float, config: TransitionConfig)
    fun onTransitionEnd(from: View?, to: View?, config: TransitionConfig)
    fun onTransitionCancel(from: View?, to: View?, config: TransitionConfig)
}

/**
 * Transition Manager
 * Manages smooth transitions between views and app states
 */
class TransitionManager(private val context: Context) {
    private const val TAG = "TransitionManager"
    
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private val isTransitioning = AtomicBoolean(false)
    private var currentTransition: AnimatorSet? = null
    private var callback: TransitionCallback? = null
    private var transitionsEnabled = true
    private var smoothMode = SmoothMode.NATURAL

    /**
     * Perform a transition between views
     */
    fun transition(
        from: View?,
        to: View?,
        config: TransitionConfig = TransitionConfig(),
        callback: TransitionCallback? = null
    ): Boolean {
        if (!transitionsEnabled || isTransitioning.getAndSet(true)) {
            return false
        }
        
        this.callback = callback
        
        // Cancel any existing transition
        currentTransition?.cancel()
        
        mainHandler.post {
            this.callback?.onTransitionStart(from, to, config)
        }
        
        executor.execute {
            try {
                val transition = createTransition(from, to, config)
                currentTransition = transition
                
                transition.addListener(object : AnimatorListenerAdapter() {
                    override fun onAnimationStart(animation: Animator) {
                        super.onAnimationStart(animation)
                        mainHandler.post {
                            this@TransitionManager.callback?.onTransitionStart(from, to, config)
                        }
                    }
                    
                    override fun onAnimationEnd(animation: Animator) {
                        super.onAnimationEnd(animation)
                        mainHandler.post {
                            this@TransitionManager.callback?.onTransitionEnd(from, to, config)
                            isTransitioning.set(false)
                        }
                    }
                    
                    override fun onAnimationCancel(animation: Animator) {
                        super.onAnimationCancel(animation)
                        mainHandler.post {
                            this@TransitionManager.callback?.onTransitionCancel(from, to, config)
                            isTransitioning.set(false)
                        }
                    }
                })
                
                // Add progress updates
                if (config.duration > 100) {
                    val updateInterval = config.duration / 10
                    var elapsed = 0L
                    val startTime = System.currentTimeMillis()
                    
                    while (elapsed < config.duration && !Thread.currentThread().isInterrupted) {
                        Thread.sleep(updateInterval)
                        elapsed = System.currentTimeMillis() - startTime
                        val progress = (elapsed.toFloat() / config.duration).coerceAtMost(1.0f)
                        
                        mainHandler.post {
                            this@TransitionManager.callback?.onTransitionProgress(progress, config)
                        }
                    }
                }
                
                transition.start()
                
            } catch (e: Exception) {
                Log.e(TAG, "Error during transition", e)
                mainHandler.post {
                    isTransitioning.set(false)
                }
            }
        }
        
        return true
    }

    /**
     * Create transition between views
     */
    private fun createTransition(
        from: View?,
        to: View?,
        config: TransitionConfig
    ): AnimatorSet {
        val animators = mutableListOf<Animator>()
        
        when (config.type) {
            TransitionType.NONE -> {
                // No transition, just show/hide
                from?.visibility = View.GONE
                to?.visibility = View.VISIBLE
            }
            
            TransitionType.FADE -> {
                from?.let { f ->
                    animators.add(ObjectAnimator.ofFloat(f, "alpha", 1f, 0f).apply {
                        duration = config.duration
                        interpolator = config.interpolator
                    })
                }
                
                to?.let { t ->
                    t.alpha = 0f
                    t.visibility = View.VISIBLE
                    animators.add(ObjectAnimator.ofFloat(t, "alpha", 0f, 1f).apply {
                        duration = config.duration
                        startDelay = if (config.overlap) config.overlapOffset else config.duration
                        interpolator = config.interpolator
                    })
                }
            }
            
            TransitionType.SLIDE -> {
                val distance = context.resources.displayMetrics.widthPixels * 0.3f
                
                from?.let { f ->
                    val direction = if (config.direction == TransitionDirection.LEFT) -distance else distance
                    animators.add(ObjectAnimator.ofFloat(f, "translationX", 0f, direction).apply {
                        duration = config.duration
                        interpolator = config.interpolator
                    })
                    animators.add(ObjectAnimator.ofFloat(f, "alpha", 1f, 0f).apply {
                        duration = config.duration
                        interpolator = config.interpolator
                    })
                }
                
                to?.let { t ->
                    t.visibility = View.VISIBLE
                    val direction = if (config.direction == TransitionDirection.LEFT) distance else -distance
                    t.translationX = direction
                    t.alpha = 0f
                    animators.add(ObjectAnimator.ofFloat(t, "translationX", direction, 0f).apply {
                        duration = config.duration
                        startDelay = if (config.overlap) config.overlapOffset else config.duration
                        interpolator = config.interpolator
                    })
                    animators.add(ObjectAnimator.ofFloat(t, "alpha", 0f, 1f).apply {
                        duration = config.duration
                        startDelay = if (config.overlap) config.overlapOffset else config.duration
                        interpolator = config.interpolator
                    })
                }
            }
            
            TransitionType.SCALE -> {
                from?.let { f ->
                    animators.add(ObjectAnimator.ofFloat(f, "scaleX", 1f, 0.8f).apply {
                        duration = config.duration
                        interpolator = config.interpolator
                    })
                    animators.add(ObjectAnimator.ofFloat(f, "scaleY", 1f, 0.8f).apply {
                        duration = config.duration
                        interpolator = config.interpolator
                    })
                    animators.add(ObjectAnimator.ofFloat(f, "alpha", 1f, 0f).apply {
                        duration = config.duration
                        interpolator = config.interpolator
                    })
                }
                
                to?.let { t ->
                    t.visibility = View.VISIBLE
                    t.scaleX = 0.8f
                    t.scaleY = 0.8f
                    t.alpha = 0f
                    animators.add(ObjectAnimator.ofFloat(t, "scaleX", 0.8f, 1f).apply {
                        duration = config.duration
                        startDelay = if (config.overlap) config.overlapOffset else config.duration
                        interpolator = OvershootInterpolator()
                    })
                    animators.add(ObjectAnimator.ofFloat(t, "scaleY", 0.8f, 1f).apply {
                        duration = config.duration
                        startDelay = if (config.overlap) config.overlapOffset else config.duration
                        interpolator = OvershootInterpolator()
                    })
                    animators.add(ObjectAnimator.ofFloat(t, "alpha", 0f, 1f).apply {
                        duration = config.duration
                        startDelay = if (config.overlap) config.overlapOffset else config.duration
                        interpolator = config.interpolator
                    })
                }
            }
            
            TransitionType.SLIDE_FADE -> {
                val distance = context.resources.displayMetrics.widthPixels * 0.2f
                
                from?.let { f ->
                    val direction = if (config.direction == TransitionDirection.LEFT) -distance else distance
                    animators.add(ObjectAnimator.ofFloat(f, "translationX", 0f, direction).apply {
                        duration = config.duration
                        interpolator = config.interpolator
                    })
                    animators.add(ObjectAnimator.ofFloat(f, "alpha", 1f, 0f).apply {
                        duration = config.duration
                        interpolator = config.interpolator
                    })
                }
                
                to?.let { t ->
                    t.visibility = View.VISIBLE
                    val direction = if (config.direction == TransitionDirection.LEFT) distance else -distance
                    t.translationX = direction
                    t.alpha = 0f
                    animators.add(ObjectAnimator.ofFloat(t, "translationX", direction, 0f).apply {
                        duration = config.duration
                        startDelay = if (config.overlap) config.overlapOffset else config.duration
                        interpolator = DecelerateInterpolator()
                    })
                    animators.add(ObjectAnimator.ofFloat(t, "alpha", 0f, 1f).apply {
                        duration = config.duration
                        startDelay = if (config.overlap) config.overlapOffset else config.duration
                        interpolator = config.interpolator
                    })
                }
            }
            
            TransitionType.CROSSFADE -> {
                from?.let { f ->
                    animators.add(ObjectAnimator.ofFloat(f, "alpha", 1f, 0f).apply {
                        duration = config.duration
                        interpolator = config.interpolator
                    })
                }
                
                to?.let { t ->
                    t.alpha = 0f
                    t.visibility = View.VISIBLE
                    animators.add(ObjectAnimator.ofFloat(t, "alpha", 0f, 1f).apply {
                        duration = config.duration
                        startDelay = config.duration / 2
                        interpolator = config.interpolator
                    })
                }
            }
            
            TransitionType.ZOOM -> {
                from?.let { f ->
                    animators.add(ObjectAnimator.ofFloat(f, "scaleX", 1f, 0.5f).apply {
                        duration = config.duration
                        interpolator = AccelerateInterpolator()
                    })
                    animators.add(ObjectAnimator.ofFloat(f, "scaleY", 1f, 0.5f).apply {
                        duration = config.duration
                        interpolator = AccelerateInterpolator()
                    })
                    animators.add(ObjectAnimator.ofFloat(f, "alpha", 1f, 0f).apply {
                        duration = config.duration
                        interpolator = config.interpolator
                    })
                }
                
                to?.let { t ->
                    t.visibility = View.VISIBLE
                    t.scaleX = 1.5f
                    t.scaleY = 1.5f
                    t.alpha = 0f
                    animators.add(ObjectAnimator.ofFloat(t, "scaleX", 1.5f, 1f).apply {
                        duration = config.duration
                        startDelay = if (config.overlap) config.overlapOffset else config.duration
                        interpolator = DecelerateInterpolator()
                    })
                    animators.add(ObjectAnimator.ofFloat(t, "scaleY", 1.5f, 1f).apply {
                        duration = config.duration
                        startDelay = if (config.overlap) config.overlapOffset else config.duration
                        interpolator = DecelerateInterpolator()
                    })
                    animators.add(ObjectAnimator.ofFloat(t, "alpha", 0f, 1f).apply {
                        duration = config.duration
                        startDelay = if (config.overlap) config.overlapOffset else config.duration
                        interpolator = config.interpolator
                    })
                }
            }
            
            TransitionType.FLIP -> {
                from?.let { f ->
                    animators.add(ObjectAnimator.ofFloat(f, "rotationY", 0f, -90f).apply {
                        duration = config.duration / 2
                        interpolator = AccelerateInterpolator()
                    })
                    animators.add(ObjectAnimator.ofFloat(f, "alpha", 1f, 0f).apply {
                        duration = config.duration / 2
                        startDelay = config.duration / 2
                        interpolator = config.interpolator
                    })
                }
                
                to?.let { t ->
                    t.visibility = View.VISIBLE
                    t.rotationY = 90f
                    t.alpha = 0f
                    animators.add(ObjectAnimator.ofFloat(t, "rotationY", 90f, 0f).apply {
                        duration = config.duration / 2
                        startDelay = config.duration / 2
                        interpolator = DecelerateInterpolator()
                    })
                    animators.add(ObjectAnimator.ofFloat(t, "alpha", 0f, 1f).apply {
                        duration = config.duration / 2
                        startDelay = config.duration / 2
                        interpolator = config.interpolator
                    })
                }
            }
            
            TransitionType.CUSTOM -> {
                // Custom transition would be defined by subclasses
                from?.visibility = View.GONE
                to?.visibility = View.VISIBLE
            }
        }
        
        return AnimatorSet().apply {
            playTogether(*animators.toTypedArray())
            startDelay = config.startDelay
        }
    }

    /**
     * Transition to a new view with smooth animation
     */
    fun transitionTo(
        current: View,
        next: View,
        direction: TransitionDirection = TransitionDirection.RIGHT,
        duration: Long = 300L
    ): Boolean {
        return transition(
            from = current,
            to = next,
            config = TransitionConfig(
                type = TransitionType.SLIDE_FADE,
                direction = direction,
                duration = duration
            )
        )
    }

    /**
     * Fade between views
     */
    fun fadeTo(
        current: View,
        next: View,
        duration: Long = 300L
    ): Boolean {
        return transition(
            from = current,
            to = next,
            config = TransitionConfig(
                type = TransitionType.CROSSFADE,
                duration = duration
            )
        )
    }

    /**
     * Scale transition
     */
    fun scaleTo(
        current: View,
        next: View,
        duration: Long = 300L
    ): Boolean {
        return transition(
            from = current,
            to = next,
            config = TransitionConfig(
                type = TransitionType.SCALE,
                duration = duration
            )
        )
    }

    /**
     * Zoom transition
     */
    fun zoomTo(
        current: View,
        next: View,
        duration: Long = 400L
    ): Boolean {
        return transition(
            from = current,
            to = next,
            config = TransitionConfig(
                type = TransitionType.ZOOM,
                duration = duration
            )
        )
    }

    /**
     * Flip transition
     */
    fun flipTo(
        current: View,
        next: View,
        duration: Long = 500L
    ): Boolean {
        return transition(
            from = current,
            to = next,
            config = TransitionConfig(
                type = TransitionType.FLIP,
                duration = duration
            )
        )
    }

    /**
     * Cancel current transition
     */
    fun cancelTransition() {
        currentTransition?.cancel()
        isTransitioning.set(false)
    }

    /**
     * Enable/disable transitions
     */
    fun setTransitionsEnabled(enabled: Boolean) {
        this.transitionsEnabled = enabled
        if (!enabled) {
            cancelTransition()
        }
    }

    /**
     * Check if transitions are enabled
     */
    fun areTransitionsEnabled(): Boolean {
        return transitionsEnabled
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
     * Set callback
     */
    fun setCallback(callback: TransitionCallback) {
        this.callback = callback
    }

    /**
     * Clear callback
     */
    fun clearCallback() {
        this.callback = null
    }

    /**
     * Check if currently transitioning
     */
    fun isTransitioning(): Boolean {
        return isTransitioning.get()
    }

    /**
     * Get current transition
     */
    fun getCurrentTransition(): AnimatorSet? {
        return currentTransition
    }

    /**
     * Create transition preset for app opening
     */
    fun createAppOpenTransition(from: View?, to: View?): AnimatorSet? {
        return if (from != null && to != null) {
            createTransition(
                from, to,
                TransitionConfig(
                    type = TransitionType.SLIDE_FADE,
                    direction = TransitionDirection.LEFT,
                    duration = 400L,
                    interpolator = DecelerateInterpolator()
                )
            )
        } else {
            null
        }
    }

    /**
     * Create transition preset for app closing
     */
    fun createAppCloseTransition(from: View?, to: View?): AnimatorSet? {
        return if (from != null && to != null) {
            createTransition(
                from, to,
                TransitionConfig(
                    type = TransitionType.SLIDE_FADE,
                    direction = TransitionDirection.RIGHT,
                    duration = 300L,
                    interpolator = AccelerateInterpolator()
                )
            )
        } else {
            null
        }
    }

    /**
     * Create transition preset for action completion
     */
    fun createActionCompleteTransition(view: View, success: Boolean): Animator {
        return if (success) {
            ObjectAnimator.ofFloat(view, "scaleX", 1f, 1.1f, 1f).apply {
                duration = 200L
                interpolator = BounceInterpolator()
            }
        } else {
            ObjectAnimator.ofFloat(view, "translationX", 0f, -10f, 10f, -10f, 0f).apply {
                duration = 300L
                interpolator = LinearInterpolator()
            }
        }
    }

    /**
     * Create transition for loading state
     */
    fun createLoadingTransition(view: View, isLoading: Boolean): Animator {
        return if (isLoading) {
            ObjectAnimator.ofFloat(view, "rotation", 0f, 360f).apply {
                duration = 2000L
                repeatCount = ObjectAnimator.INFINITE
                interpolator = LinearInterpolator()
            }
        } else {
            ObjectAnimator.ofFloat(view, "rotation", view.rotation, 0f).apply {
                duration = 300L
                interpolator = DecelerateInterpolator()
            }
        }
    }

    /**
     * Create chain of transitions
     */
    fun createTransitionChain(
        transitions: List<Pair<View?, View?>>,
        config: TransitionConfig = TransitionConfig(),
        delayBetween: Long = 100L
    ): AnimatorSet {
        val sets = transitions.mapIndexed { index, (from, to) ->
            createTransition(from, to, config.copy(
                startDelay = index * delayBetween
            ))
        }
        
        return AnimatorSet().apply {
            playSequentially(*sets.toTypedArray())
        }
    }
}

/**
 * Predefined transition presets
 */
object TransitionPresets {
    fun slideLeft(context: Context, from: View, to: View, duration: Long = 300L): Boolean {
        return TransitionManager(context).transitionTo(from, to, TransitionDirection.LEFT, duration)
    }

    fun slideRight(context: Context, from: View, to: View, duration: Long = 300L): Boolean {
        return TransitionManager(context).transitionTo(from, to, TransitionDirection.RIGHT, duration)
    }

    fun slideUp(context: Context, from: View, to: View, duration: Long = 300L): Boolean {
        return TransitionManager(context).transition(
            from, to,
            TransitionConfig(
                type = TransitionType.SLIDE,
                direction = TransitionDirection.UP,
                duration = duration
            )
        )
    }

    fun slideDown(context: Context, from: View, to: View, duration: Long = 300L): Boolean {
        return TransitionManager(context).transition(
            from, to,
            TransitionConfig(
                type = TransitionType.SLIDE,
                direction = TransitionDirection.DOWN,
                duration = duration
            )
        )
    }

    fun fade(context: Context, from: View, to: View, duration: Long = 300L): Boolean {
        return TransitionManager(context).fadeTo(from, to, duration)
    }

    fun scale(context: Context, from: View, to: View, duration: Long = 300L): Boolean {
        return TransitionManager(context).scaleTo(from, to, duration)
    }

    fun zoom(context: Context, from: View, to: View, duration: Long = 400L): Boolean {
        return TransitionManager(context).zoomTo(from, to, duration)
    }

    fun flip(context: Context, from: View, to: View, duration: Long = 500L): Boolean {
        return TransitionManager(context).flipTo(from, to, duration)
    }
}
