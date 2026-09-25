/*
 * IRIS Accessibility Service
 * Enhanced accessibility service for app control with better node finding
 */

package com.iris.ai.accessibility

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.graphics.Rect
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import com.iris.ai.appcontrol.ScrollDirection

/**
 * Iris Accessibility Service
 * Provides UI automation capabilities through AccessibilityService
 */
class IrisAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "IrisAccessibilityService"
        private var instance: IrisAccessibilityService? = null
        private val lock = Any()

        fun getInstance(): IrisAccessibilityService? {
            synchronized(lock) {
                return instance
            }
        }

        fun setInstance(service: IrisAccessibilityService?) {
            synchronized(lock) {
                instance = service
            }
        }
    }

    private var currentPackageName: String? = null
    private var lastEvent: AccessibilityEvent? = null
    private val eventHandlers = mutableListOf<(AccessibilityEvent) -> Unit>()
    private val nodeCache = mutableMapOf<String, AccessibilityNodeInfo>()
    private var isServiceConnected = false

    // Node search priorities
    private val nodeSearchPriorities = listOf(
        { node: AccessibilityNodeInfo, target: String ->
            node.viewIdResourceName?.contains(target, ignoreCase = true) ?: false
        },
        { node: AccessibilityNodeInfo, target: String ->
            node.contentDescription?.toString()?.contains(target, ignoreCase = true) ?: false
        },
        { node: AccessibilityNodeInfo, target: String ->
            node.text?.toString()?.equals(target, ignoreCase = true) ?: false
        },
        { node: AccessibilityNodeInfo, target: String ->
            node.text?.toString()?.contains(target, ignoreCase = true) ?: false
        }
    )

    override fun onServiceConnected() {
        super.onServiceConnected()
        isServiceConnected = true
        setInstance(this)
        Log.d(TAG, "Iris Accessibility Service connected")
        announce("IRIS Accessibility Service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return

        lastEvent = event
        currentPackageName = event.packageName?.toString()

        // Log important events
        when (event.eventType) {
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                Log.d(TAG, "Window changed: ${event.packageName}")
            }
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> {
                Log.d(TAG, "Content changed: ${event.packageName}")
            }
        }

        // Notify handlers
        for (handler in eventHandlers) {
            try {
                handler(event)
            } catch (e: Exception) {
                Log.e(TAG, "Error in event handler", e)
            }
        }
    }

    override fun onInterrupt() {
        Log.d(TAG, "Accessibility service interrupted")
        setInstance(null)
    }

    override fun onDestroy() {
        super.onDestroy()
        isServiceConnected = false
        setInstance(null)
        eventHandlers.clear()
        nodeCache.clear()
        Log.d(TAG, "Iris Accessibility Service destroyed")
    }

    // ============================================================
    // APPLICATION CONTROL
    // ============================================================

    /**
     * Get current foreground package name
     */
    fun getCurrentPackage(): String? {
        return currentPackageName ?: rootInActiveWindow?.packageName?.toString()
    }

    /**
     * Open an application by package name
     */
    fun openApplication(packageName: String): Boolean {
        return try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(launchIntent)
                true
            } else {
                Log.w(TAG, "App not installed: $packageName")
                announce("App not installed: $packageName")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error opening app: $packageName", e)
            false
        }
    }

    /**
     * Open URL
     */
    fun openUrl(url: String): Boolean {
        return try {
            var fullUrl = url
            if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
                fullUrl = "https://$fullUrl"
            }
            val intent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(fullUrl)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Error opening URL: $url", e)
            false
        }
    }

    // ============================================================
    // NODE FINDING & CLICKING
    // ============================================================

    /**
     * Click by text
     */
    fun clickText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        
        // Try different search strategies
        for (strategy in nodeSearchPriorities) {
            val node = findNode(root, text, strategy)
            if (node != null) {
                return clickNode(node)
            }
        }

        // Fallback: try clicking center of screen
        return clickTextFallback(text)
    }

    /**
     * Click by content description
     */
    fun clickDescription(description: String): Boolean {
        val root = rootInActiveWindow ?: return false
        
        for (strategy in nodeSearchPriorities) {
            val node = findNode(root, description, strategy)
            if (node != null) {
                return clickNode(node)
            }
        }

        return clickDescriptionFallback(description)
    }

    /**
     * Find node using a search strategy
     */
    private fun findNode(
        root: AccessibilityNodeInfo,
        target: String,
        strategy: (AccessibilityNodeInfo, String) -> Boolean
    ): AccessibilityNodeInfo? {
        val stack = mutableListOf(root)
        while (stack.isNotEmpty()) {
            val current = stack.removeAt(stack.size - 1)
            
            try {
                if (strategy(current, target)) {
                    return current
                }
            } catch (e: Exception) {
                // Node might be stale, continue
            }
            
            for (i in 0 until current.childCount) {
                val child = current.getChild(i)
                if (child != null) {
                    stack.add(child)
                }
            }
        }
        return null
    }

    /**
     * Click a node
     */
    private fun clickNode(node: AccessibilityNodeInfo): Boolean {
        return try {
            // Try clicking the node itself
            if (node.isClickable) {
                val result = node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                if (result) return true
            }
            
            // Try clicking parent if node is not clickable
            var parent = node.parent
            while (parent != null) {
                if (parent.isClickable) {
                    val result = parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    if (result) return true
                }
                parent = parent.parent
            }
            
            // Fallback: click at node center
            val rect = Rect()
            node.getBoundsInScreen(rect)
            if (rect.width() > 0 && rect.height() > 0) {
                return dispatchTap(rect.centerX().toFloat(), rect.centerY().toFloat())
            }
            
            false
        } catch (e: Exception) {
            Log.e(TAG, "Error clicking node", e)
            false
        }
    }

    /**
     * Fallback click by text using coordinates
     */
    private fun clickTextFallback(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val nodes = root.findAccessibilityNodeInfosByText(text)
        
        if (nodes != null && nodes.isNotEmpty()) {
            for (node in nodes) {
                val rect = Rect()
                node.getBoundsInScreen(rect)
                if (rect.width() > 0 && rect.height() > 0) {
                    return dispatchTap(rect.centerX().toFloat(), rect.centerY().toFloat())
                }
            }
        }
        return false
    }

    /**
     * Fallback click by description using coordinates
     */
    private fun clickDescriptionFallback(description: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val node = findNodeByDescription(root, description)
        
        node?.let {
            val rect = Rect()
            it.getBoundsInScreen(rect)
            if (rect.width() > 0 && rect.height() > 0) {
                return dispatchTap(rect.centerX().toFloat(), rect.centerY().toFloat())
            }
        }
        return false
    }

    /**
     * Find node by description recursively
     */
    private fun findNodeByDescription(root: AccessibilityNodeInfo, desc: String): AccessibilityNodeInfo? {
        val stack = mutableListOf(root)
        while (stack.isNotEmpty()) {
            val current = stack.removeAt(stack.size - 1)
            val nodeDesc = current.contentDescription?.toString()
            if (nodeDesc != null && nodeDesc.contains(desc, ignoreCase = true)) {
                return current
            }
            for (i in 0 until current.childCount) {
                val child = current.getChild(i)
                if (child != null) {
                    stack.add(child)
                }
            }
        }
        return null
    }

    // ============================================================
    // TEXT INPUT
    // ============================================================

    /**
     * Type text into focused or editable node
     */
    fun typeText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        
        // Try focused node first
        val focusedNode = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focusedNode != null && focusedNode.isEditable) {
            return setText(focusedNode, text)
        }
        
        // Try to find editable node
        val editableNode = findFirstEditableNode(root)
        if (editableNode != null) {
            // Click the node first to focus it
            clickNode(editableNode)
            Thread.sleep(200)
            return setText(editableNode, text)
        }
        
        // Fallback: use clipboard and paste
        return typeTextWithClipboard(text)
    }

    /**
     * Set text on a node
     */
    private fun setText(node: AccessibilityNodeInfo, text: String): Boolean {
        return try {
            val arguments = Bundle().apply {
                putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                    text
                )
            }
            node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
        } catch (e: Exception) {
            Log.e(TAG, "Error setting text", e)
            false
        }
    }

    /**
     * Find first editable node
     */
    private fun findFirstEditableNode(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val stack = mutableListOf(root)
        while (stack.isNotEmpty()) {
            val current = stack.removeAt(stack.size - 1)
            if (current.isEditable) {
                return current
            }
            for (i in 0 until current.childCount) {
                val child = current.getChild(i)
                if (child != null) {
                    stack.add(child)
                }
            }
        }
        return null
    }

    /**
     * Type text using clipboard paste
     */
    private fun typeTextWithClipboard(text: String): Boolean {
        return try {
            val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText("Iris text", text)
            clipboard.setPrimaryClip(clip)
            
            // Send paste key event
            val pasteEvent = KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_PASTE)
            val pasteEventUp = KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_PASTE)
            
            // Try to find a focused node to paste into
            val root = rootInActiveWindow ?: return false
            val focusedNode = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            
            if (focusedNode != null) {
                focusedNode.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
                Thread.sleep(100)
                
                // Try paste action
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    val bundle = Bundle().apply {
                        putInt(AccessibilityNodeInfo.ACTION_ARGUMENT_MOVEMENT_GRANULARITY_INT,
                            AccessibilityNodeInfo.MOVEMENT_GRANULARITY_WORD)
                    }
                    focusedNode.performAction(AccessibilityNodeInfo.ACTION_PASTE, bundle)
                }
                return true
            }
            
            false
        } catch (e: Exception) {
            Log.e(TAG, "Error typing with clipboard", e)
            false
        }
    }

    // ============================================================
    // SCROLLING & GESTURES
    // ============================================================

    /**
     * Scroll in a direction
     */
    fun scroll(direction: ScrollDirection): Boolean {
        val root = rootInActiveWindow ?: return false
        
        // Try to find scrollable node first
        val scrollableNode = findFirstScrollableNode(root)
        if (scrollableNode != null) {
            val action = when (direction) {
                ScrollDirection.DOWN, ScrollDirection.RIGHT ->
                    AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                ScrollDirection.UP, ScrollDirection.LEFT ->
                    AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            }
            if (scrollableNode.performAction(action)) {
                return true
            }
        }
        
        // Fallback to gesture
        return performScrollGesture(direction)
    }

    /**
     * Find first scrollable node
     */
    private fun findFirstScrollableNode(root: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        val stack = mutableListOf(root)
        while (stack.isNotEmpty()) {
            val current = stack.removeAt(stack.size - 1)
            if (current.isScrollable) {
                return current
            }
            for (i in 0 until current.childCount) {
                val child = current.getChild(i)
                if (child != null) {
                    stack.add(child)
                }
            }
        }
        return null
    }

    /**
     * Perform scroll gesture
     */
    private fun performScrollGesture(direction: ScrollDirection): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        
        val displayMetrics = resources.displayMetrics
        val width = displayMetrics.widthPixels.toFloat()
        val height = displayMetrics.heightPixels.toFloat()
        
        return when (direction) {
            ScrollDirection.DOWN -> dispatchSwipe(width / 2f, height * 0.7f, width / 2f, height * 0.3f)
            ScrollDirection.UP -> dispatchSwipe(width / 2f, height * 0.3f, width / 2f, height * 0.7f)
            ScrollDirection.RIGHT -> dispatchSwipe(width * 0.2f, height / 2f, width * 0.8f, height / 2f)
            ScrollDirection.LEFT -> dispatchSwipe(width * 0.8f, height / 2f, width * 0.2f, height / 2f)
        }
    }

    /**
     * Dispatch swipe gesture
     */
    fun dispatchSwipe(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Long = 300): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val path = Path().apply {
            moveTo(startX, startY)
            lineTo(endX, endY)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    /**
     * Dispatch tap gesture
     */
    fun dispatchTap(x: Float, y: Float): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val path = Path().apply {
            moveTo(x, y)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0, 100)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    // ============================================================
    // GLOBAL ACTIONS
    // ============================================================

    /**
     * Perform back action
     */
    fun performBack(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_BACK)
    }

    /**
     * Perform home action
     */
    fun performHome(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_HOME)
    }

    /**
     * Perform play action
     */
    fun performPlay(): Boolean {
        return clickDescription("Play") || clickText("Play") || sendMediaKeyEvent(KeyEvent.KEYCODE_MEDIA_PLAY)
    }

    /**
     * Perform pause action
     */
    fun performPause(): Boolean {
        return clickDescription("Pause") || clickText("Pause") || sendMediaKeyEvent(KeyEvent.KEYCODE_MEDIA_PAUSE)
    }

    /**
     * Send media key event
     */
    private fun sendMediaKeyEvent(keyCode: Int): Boolean {
        return try {
            val downIntent = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
                putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
            }
            sendOrderedBroadcast(downIntent, null)

            val upIntent = Intent(Intent.ACTION_MEDIA_BUTTON).apply {
                putExtra(Intent.EXTRA_KEY_EVENT, KeyEvent(KeyEvent.ACTION_UP, keyCode))
            }
            sendOrderedBroadcast(upIntent, null)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    // ============================================================
    // EVENT HANDLING
    // ============================================================

    /**
     * Add event handler
     */
    fun addEventHandler(handler: (AccessibilityEvent) -> Unit) {
        eventHandlers.add(handler)
    }

    /**
     * Remove event handler
     */
    fun removeEventHandler(handler: (AccessibilityEvent) -> Unit) {
        eventHandlers.remove(handler)
    }

    /**
     * Clear all event handlers
     */
    fun clearEventHandlers() {
        eventHandlers.clear()
    }

    // ============================================================
    // UTILITY
    // ============================================================

    /**
     * Announce message to user
     */
    fun announce(message: String) {
        Handler(Looper.getMainLooper()).post {
            android.widget.Toast.makeText(applicationContext, message, android.widget.Toast.LENGTH_SHORT).show()
        }
    }

    /**
     * Check if service is connected
     */
    fun isConnected(): Boolean {
        return isServiceConnected
    }

    /**
     * Get last accessibility event
     */
    fun getLastEvent(): AccessibilityEvent? {
        return lastEvent
    }

    /**
     * Get root node in active window
     */
    fun getRootNode(): AccessibilityNodeInfo? {
        return rootInActiveWindow
    }

    /**
     * Find all nodes by text
     */
    fun findAllNodesByText(text: String): List<AccessibilityNodeInfo>? {
        return rootInActiveWindow?.findAccessibilityNodeInfosByText(text)
    }

    /**
     * Find all nodes by view ID
     */
    fun findAllNodesByViewId(viewId: String): List<AccessibilityNodeInfo>? {
        return rootInActiveWindow?.findAccessibilityNodeInfosByViewId(viewId)
    }
}
