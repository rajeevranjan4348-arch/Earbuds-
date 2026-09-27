/*
 * IRIS — ANDROID ACCESSIBILITY SERVICE
 * Package: com.iris.ai
 *
 * PURPOSE:
 * 1. UI Event Interception: Intercept active window state changes, content changes,
 *    clicks, scrolls, and notification events.
 * 2. Screen Node Inspection: Enable Iris AI to inspect active UI view hierarchies,
 *    extract node attributes (text, IDs, bounds, accessibility descriptions), and
 *    format structured JSON / prompt summaries for agent tool calling.
 * 3. System-Level Interactions: Dispatch gestures (click, tap, swipe, scroll, pinch,
 *    drag & drop), handle text input/paste, and trigger system actions (Back, Home,
 *    Recents, Notifications, Quick Settings, Power, Lock Screen, Screenshot).
 */

package com.iris.ai

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Path
import android.graphics.Rect
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.DisplayMetrics
import android.util.Log
import android.view.Display
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import android.widget.Toast
import org.json.JSONArray
import org.json.JSONObject
import java.util.Collections
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.atomic.AtomicInteger

class IrisAccessibilityService : AccessibilityService() {

    companion object {
        const val TAG = "IrisAccessibility"

        @Volatile
        var instance: IrisAccessibilityService? = null
            private set

        fun isServiceRunning(): Boolean = instance != null
    }

    // Direction enum for scroll & swipe actions
    enum class Direction {
        UP, DOWN, LEFT, RIGHT
    }

    // Data class representing an inspected screen node
    data class ScreenNode(
        val index: Int,
        val text: String,
        val contentDescription: String,
        val viewId: String,
        val className: String,
        val packageName: String,
        val bounds: Rect,
        val isClickable: Boolean,
        val isLongClickable: Boolean,
        val isEditable: Boolean,
        val isScrollable: Boolean,
        val isCheckable: Boolean,
        val isChecked: Boolean,
        val isEnabled: Boolean,
        val isFocused: Boolean,
        val isVisible: Boolean,
        val children: MutableList<ScreenNode> = mutableListOf()
    ) {
        fun toJson(): JSONObject {
            return JSONObject().apply {
                put("index", index)
                put("text", text)
                put("contentDescription", contentDescription)
                put("viewId", viewId)
                put("className", className)
                put("packageName", packageName)
                put("bounds", JSONObject().apply {
                    put("left", bounds.left)
                    put("top", bounds.top)
                    put("right", bounds.right)
                    put("bottom", bounds.bottom)
                    put("centerX", bounds.centerX())
                    put("centerY", bounds.centerY())
                    put("width", bounds.width())
                    put("height", bounds.height())
                })
                put("isClickable", isClickable)
                put("isLongClickable", isLongClickable)
                put("isEditable", isEditable)
                put("isScrollable", isScrollable)
                put("isCheckable", isCheckable)
                put("isChecked", isChecked)
                put("isEnabled", isEnabled)
                put("isFocused", isFocused)
                put("isVisible", isVisible)
                if (children.isNotEmpty()) {
                    val childArray = JSONArray()
                    children.forEach { childArray.put(it.toJson()) }
                    put("children", childArray)
                }
            }
        }

        fun toPromptRepresentation(): String {
            val parts = mutableListOf<String>()
            parts.add("[#$index]")
            val simpleClass = className.substringAfterLast('.')
            parts.add(simpleClass)

            if (text.isNotBlank()) parts.add("\"$text\"")
            if (contentDescription.isNotBlank() && contentDescription != text) {
                parts.add("desc=\"$contentDescription\"")
            }
            if (viewId.isNotBlank()) {
                val shortId = viewId.substringAfter(":id/")
                parts.add("id=\"$shortId\"")
            }

            val flags = mutableListOf<String>()
            if (isClickable) flags.add("clickable")
            if (isEditable) flags.add("editable")
            if (isScrollable) flags.add("scrollable")
            if (isCheckable) flags.add(if (isChecked) "checked" else "unchecked")
            if (isFocused) flags.add("focused")

            if (flags.isNotEmpty()) {
                parts.add("(${flags.joinToString(",")})")
            }

            parts.add("at (${bounds.centerX()}, ${bounds.centerY()})")
            return parts.joinToString(" ")
        }
    }

    // Screen hierarchy container
    data class ScreenHierarchy(
        val packageName: String,
        val activityName: String,
        val timestamp: Long,
        val rootNodes: List<ScreenNode>,
        val interactiveNodes: List<ScreenNode>
    ) {
        fun toJson(): JSONObject {
            return JSONObject().apply {
                put("packageName", packageName)
                put("activityName", activityName)
                put("timestamp", timestamp)
                put("interactiveCount", interactiveNodes.size)

                val interactiveArray = JSONArray()
                interactiveNodes.forEach { interactiveArray.put(it.toJson()) }
                put("interactiveNodes", interactiveArray)

                val rootsArray = JSONArray()
                rootNodes.forEach { rootsArray.put(it.toJson()) }
                put("rootNodes", rootsArray)
            }
        }

        fun toPromptSummary(): String {
            val sb = StringBuilder()
            sb.appendLine("=== CURRENT FOREGROUND SCREEN ===")
            sb.appendLine("Package: $packageName")
            if (activityName.isNotBlank()) sb.appendLine("Activity: $activityName")
            sb.appendLine("Interactive Elements (${interactiveNodes.size}):")

            if (interactiveNodes.isEmpty()) {
                sb.appendLine("  (No interactive elements detected on active window)")
            } else {
                interactiveNodes.take(50).forEach { node ->
                    sb.appendLine("  " + node.toPromptRepresentation())
                }
            }
            return sb.toString().trimEnd()
        }
    }

    // Intercepted UI Event model
    data class InterceptedUiEvent(
        val eventType: Int,
        val eventTypeName: String,
        val packageName: String,
        val className: String,
        val text: List<String>,
        val contentDescription: String,
        val timestamp: Long,
        val isWindowChange: Boolean
    ) {
        fun toJson(): JSONObject {
            return JSONObject().apply {
                put("eventType", eventType)
                put("eventTypeName", eventTypeName)
                put("packageName", packageName)
                put("className", className)
                put("text", JSONArray(text))
                put("contentDescription", contentDescription)
                put("timestamp", timestamp)
                put("isWindowChange", isWindowChange)
            }
        }
    }

    // Listener for reactive AI loops
    interface UiEventListener {
        fun onUiEvent(event: InterceptedUiEvent)
        fun onWindowStateChanged(packageName: String, className: String)
        fun onContentChanged(packageName: String)
    }

    // State tracking
    var currentPackageName: String = ""
        private set
    var currentActivityName: String = ""
        private set
    var lastEventTimestamp: Long = 0L
        private set

    private val eventHistory = CopyOnWriteArrayList<InterceptedUiEvent>()
    private val maxEventHistory = 50
    private val listeners = CopyOnWriteArrayList<UiEventListener>()
    private val mainHandler = Handler(Looper.getMainLooper())

    // Node index lookup cache for fast AI index click
    private val nodeIndexCache = Collections.synchronizedMap(mutableMapOf<Int, Rect>())

    // ============================================================
    // SERVICE LIFECYCLE
    // ============================================================

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this

        val info = serviceInfo ?: AccessibilityServiceInfo()
        info.eventTypes = AccessibilityEvent.TYPES_ALL_MASK
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
        info.flags = info.flags or
                AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            info.flags = info.flags or AccessibilityServiceInfo.FLAG_ENABLE_ACCESSIBILITY_VOLUME
        }

        info.notificationTimeout = 50
        serviceInfo = info

        Log.i(TAG, "IRIS Accessibility Service successfully connected and configured.")
        announce("Iris Accessibility Service connected")
    }

    override fun onInterrupt() {
        Log.w(TAG, "IRIS Accessibility Service interrupted by system.")
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
        listeners.clear()
        eventHistory.clear()
        nodeIndexCache.clear()
        Log.i(TAG, "IRIS Accessibility Service destroyed.")
    }

    // ============================================================
    // 1. UI EVENT INTERCEPTION
    // ============================================================

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val pkg = event.packageName?.toString().orEmpty()
        val cls = event.className?.toString().orEmpty()
        val textList = event.text?.map { it.toString() } ?: emptyList()
        val desc = event.contentDescription?.toString().orEmpty()
        val now = SystemClock.uptimeMillis()
        val eventType = event.eventType
        val isWindowChange = (eventType == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED)

        if (pkg.isNotBlank()) {
            currentPackageName = pkg
        }
        if (isWindowChange && cls.isNotBlank()) {
            currentActivityName = cls
        }
        lastEventTimestamp = now

        val typeName = getEventTypeName(eventType)
        val intercepted = InterceptedUiEvent(
            eventType = eventType,
            eventTypeName = typeName,
            packageName = pkg,
            className = cls,
            text = textList,
            contentDescription = desc,
            timestamp = now,
            isWindowChange = isWindowChange
        )

        // Maintain ring-buffer
        eventHistory.add(intercepted)
        while (eventHistory.size > maxEventHistory) {
            eventHistory.removeAt(0)
        }

        // Notify listeners
        for (listener in listeners) {
            try {
                listener.onUiEvent(intercepted)
                if (isWindowChange) {
                    listener.onWindowStateChanged(pkg, cls)
                } else if (eventType == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED) {
                    listener.onContentChanged(pkg)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error notifying UI event listener", e)
            }
        }
    }

    private fun getEventTypeName(eventType: Int): String {
        return when (eventType) {
            AccessibilityEvent.TYPE_VIEW_CLICKED -> "VIEW_CLICKED"
            AccessibilityEvent.TYPE_VIEW_LONG_CLICKED -> "VIEW_LONG_CLICKED"
            AccessibilityEvent.TYPE_VIEW_FOCUSED -> "VIEW_FOCUSED"
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> "VIEW_TEXT_CHANGED"
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> "WINDOW_STATE_CHANGED"
            AccessibilityEvent.TYPE_NOTIFICATION_STATE_CHANGED -> "NOTIFICATION_STATE_CHANGED"
            AccessibilityEvent.TYPE_VIEW_SCROLLED -> "VIEW_SCROLLED"
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> "WINDOW_CONTENT_CHANGED"
            AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED -> "VIEW_TEXT_SELECTION_CHANGED"
            else -> "EVENT_$eventType"
        }
    }

    fun addListener(listener: UiEventListener) {
        if (!listeners.contains(listener)) {
            listeners.add(listener)
        }
    }

    fun removeListener(listener: UiEventListener) {
        listeners.remove(listener)
    }

    fun getRecentEvents(limit: Int = 10): List<InterceptedUiEvent> {
        return eventHistory.takeLast(limit)
    }

    // ============================================================
    // 2. SCREEN NODE INSPECTION (AI BRAIN INTEGRATION)
    // ============================================================

    /**
     * Traverses the active window hierarchy and returns a complete, structured
     * ScreenHierarchy model suitable for AI processing.
     */
    fun getScreenHierarchy(maxDepth: Int = 15): ScreenHierarchy {
        val root = rootInActiveWindow
        val rootNodes = mutableListOf<ScreenNode>()
        val interactiveNodes = mutableListOf<ScreenNode>()
        val indexCounter = AtomicInteger(1)

        nodeIndexCache.clear()

        if (root != null) {
            val traversed = inspectNode(root, 0, maxDepth, indexCounter, interactiveNodes)
            if (traversed != null) {
                rootNodes.add(traversed)
            }
        }

        return ScreenHierarchy(
            packageName = currentPackageName.ifBlank { root?.packageName?.toString().orEmpty() },
            activityName = currentActivityName,
            timestamp = System.currentTimeMillis(),
            rootNodes = rootNodes,
            interactiveNodes = interactiveNodes
        )
    }

    private fun inspectNode(
        info: AccessibilityNodeInfo,
        depth: Int,
        maxDepth: Int,
        counter: AtomicInteger,
        interactiveCollector: MutableList<ScreenNode>
    ): ScreenNode? {
        if (depth > maxDepth) return null

        val bounds = Rect()
        info.getBoundsInScreen(bounds)

        val isVisible = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            info.isVisibleToUser
        } else {
            bounds.width() > 0 && bounds.height() > 0
        }

        val text = info.text?.toString().orEmpty().trim()
        val desc = info.contentDescription?.toString().orEmpty().trim()
        val viewId = info.viewIdResourceName.orEmpty()
        val className = info.className?.toString().orEmpty()
        val pkg = info.packageName?.toString().orEmpty()

        val isClickable = info.isClickable
        val isLongClickable = info.isLongClickable
        val isEditable = info.isEditable
        val isScrollable = info.isScrollable
        val isCheckable = info.isCheckable
        val isChecked = info.isChecked
        val isEnabled = info.isEnabled
        val isFocused = info.isFocused

        val isInteractive = isClickable || isLongClickable || isEditable || isScrollable || isCheckable

        val idx = counter.getAndIncrement()
        nodeIndexCache[idx] = Rect(bounds)

        val node = ScreenNode(
            index = idx,
            text = text,
            contentDescription = desc,
            viewId = viewId,
            className = className,
            packageName = pkg,
            bounds = bounds,
            isClickable = isClickable,
            isLongClickable = isLongClickable,
            isEditable = isEditable,
            isScrollable = isScrollable,
            isCheckable = isCheckable,
            isChecked = isChecked,
            isEnabled = isEnabled,
            isFocused = isFocused,
            isVisible = isVisible
        )

        if (isVisible && isInteractive && (text.isNotBlank() || desc.isNotBlank() || isEditable || viewId.isNotBlank())) {
            interactiveCollector.add(node)
        }

        for (i in 0 until info.childCount) {
            val child = info.getChild(i) ?: continue
            val childNode = inspectNode(child, depth + 1, maxDepth, counter, interactiveCollector)
            if (childNode != null) {
                node.children.add(childNode)
            }
        }

        return node
    }

    /**
     * Dumps the screen hierarchy as a JSON string for tool calls.
     */
    fun dumpScreenJson(): String {
        return getScreenHierarchy().toJson().toString(2)
    }

    /**
     * Dumps the screen hierarchy as a concise token-efficient string representation
     * formatted specifically for LLM prompt context.
     */
    fun dumpScreenForAgentPrompt(): String {
        return getScreenHierarchy().toPromptSummary()
    }

    // ------------------------------------------------------------
    // Node Search Helpers
    // ------------------------------------------------------------

    fun findNodeByText(text: String, exact: Boolean = false): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val candidates = root.findAccessibilityNodeInfosByText(text) ?: return null

        if (exact) {
            for (node in candidates) {
                if (node.text?.toString().equals(text, ignoreCase = true) ||
                    node.contentDescription?.toString().equals(text, ignoreCase = true)
                ) {
                    return node
                }
            }
        }
        return candidates.firstOrNull()
    }

    fun findNodesByText(text: String): List<AccessibilityNodeInfo> {
        val root = rootInActiveWindow ?: return emptyList()
        return root.findAccessibilityNodeInfosByText(text) ?: emptyList()
    }

    fun findNodeByDescription(description: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val stack = mutableListOf(root)

        while (stack.isNotEmpty()) {
            val current = stack.removeAt(stack.size - 1)
            val desc = current.contentDescription?.toString()
            if (desc != null && desc.contains(description, ignoreCase = true)) {
                return current
            }
            for (i in 0 until current.childCount) {
                val child = current.getChild(i)
                if (child != null) stack.add(child)
            }
        }
        return null
    }

    fun findNodeById(viewId: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val nodes = root.findAccessibilityNodeInfosByViewId(viewId)
        return nodes?.firstOrNull()
    }

    fun findNodeAt(x: Int, y: Int): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val stack = mutableListOf(root)
        var bestMatch: AccessibilityNodeInfo? = null
        val bounds = Rect()

        while (stack.isNotEmpty()) {
            val current = stack.removeAt(stack.size - 1)
            current.getBoundsInScreen(bounds)
            if (bounds.contains(x, y)) {
                if (current.isClickable || current.isEditable) {
                    bestMatch = current
                }
                for (i in 0 until current.childCount) {
                    val child = current.getChild(i)
                    if (child != null) stack.add(child)
                }
            }
        }
        return bestMatch
    }

    fun findFirstEditableNode(): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focused != null && focused.isEditable) return focused

        val stack = mutableListOf(root)
        while (stack.isNotEmpty()) {
            val current = stack.removeAt(stack.size - 1)
            if (current.isEditable) return current
            for (i in 0 until current.childCount) {
                val child = current.getChild(i)
                if (child != null) stack.add(child)
            }
        }
        return null
    }

    fun findFirstScrollableNode(): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val stack = mutableListOf(root)
        while (stack.isNotEmpty()) {
            val current = stack.removeAt(stack.size - 1)
            if (current.isScrollable) return current
            for (i in 0 until current.childCount) {
                val child = current.getChild(i)
                if (child != null) stack.add(child)
            }
        }
        return null
    }

    // ============================================================
    // 3. SYSTEM-LEVEL INTERACTIONS & DEVICE AUTOMATION
    // ============================================================

    // ------------------------------------------------------------
    // Gestures & Tapping
    // ------------------------------------------------------------

    fun clickNode(node: AccessibilityNodeInfo): Boolean {
        var current: AccessibilityNodeInfo? = node
        while (current != null) {
            if (current.isClickable && current.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                return true
            }
            current = current.parent
        }

        // Coordinate fallback
        val bounds = Rect()
        node.getBoundsInScreen(bounds)
        if (bounds.width() > 0 && bounds.height() > 0) {
            return dispatchTap(bounds.centerX().toFloat(), bounds.centerY().toFloat())
        }
        return false
    }

    /**
     * Clicks an element by its synthetic index assigned in [dumpScreenForAgentPrompt].
     */
    fun clickIndex(index: Int): Boolean {
        val bounds = nodeIndexCache[index] ?: return false
        return dispatchTap(bounds.centerX().toFloat(), bounds.centerY().toFloat())
    }

    fun clickText(text: String, exact: Boolean = false): Boolean {
        val node = findNodeByText(text, exact) ?: return false
        return clickNode(node)
    }

    fun clickDescription(description: String): Boolean {
        val node = findNodeByDescription(description) ?: return false
        return clickNode(node)
    }

    fun clickId(viewId: String): Boolean {
        val node = findNodeById(viewId) ?: return false
        return clickNode(node)
    }

    fun dispatchTap(x: Float, y: Float): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, 100)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    fun dispatchLongPress(x: Float, y: Float, durationMs: Long = 1000): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val path = Path().apply { moveTo(x, y) }
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
    }

    fun dispatchDoubleClick(x: Float, y: Float): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val tap1 = dispatchTap(x, y)
        mainHandler.postDelayed({ dispatchTap(x, y) }, 150)
        return tap1
    }

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

    fun dispatchDragAndDrop(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Long = 600): Boolean {
        return dispatchSwipe(startX, startY, endX, endY, durationMs)
    }

    fun scroll(direction: Direction): Boolean {
        val scrollableNode = findFirstScrollableNode()
        if (scrollableNode != null) {
            val action = when (direction) {
                Direction.DOWN, Direction.RIGHT -> AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                Direction.UP, Direction.LEFT -> AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            }
            if (scrollableNode.performAction(action)) {
                return true
            }
        }

        // Gesture swipe fallback
        val dm = resources.displayMetrics
        val width = dm.widthPixels.toFloat()
        val height = dm.heightPixels.toFloat()

        return when (direction) {
            Direction.DOWN -> dispatchSwipe(width / 2f, height * 0.75f, width / 2f, height * 0.25f)
            Direction.UP -> dispatchSwipe(width / 2f, height * 0.25f, width / 2f, height * 0.75f)
            Direction.RIGHT -> dispatchSwipe(width * 0.2f, height / 2f, width * 0.8f, height / 2f)
            Direction.LEFT -> dispatchSwipe(width * 0.8f, height / 2f, width * 0.2f, height / 2f)
        }
    }

    // ------------------------------------------------------------
    // Text Input & Clipboard
    // ------------------------------------------------------------

    fun typeText(text: String): Boolean {
        val node = findFirstEditableNode() ?: return false
        return typeTextIntoNode(node, text)
    }

    fun typeTextIntoNode(node: AccessibilityNodeInfo, text: String): Boolean {
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    fun clearText(node: AccessibilityNodeInfo? = null): Boolean {
        val target = node ?: findFirstEditableNode() ?: return false
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, "")
        }
        return target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    fun copyToClipboard(label: String = "Iris", text: String): Boolean {
        return try {
            val cm = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            val clip = ClipData.newPlainText(label, text)
            cm.setPrimaryClip(clip)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to copy to clipboard", e)
            false
        }
    }

    fun pasteFromClipboard(): Boolean {
        val node = findFirstEditableNode() ?: return false
        return node.performAction(AccessibilityNodeInfo.ACTION_PASTE)
    }

    // ------------------------------------------------------------
    // System Navigation & Hardware Control
    // ------------------------------------------------------------

    fun performBack(): Boolean = performGlobalAction(GLOBAL_ACTION_BACK)

    fun performHome(): Boolean = performGlobalAction(GLOBAL_ACTION_HOME)

    fun performRecents(): Boolean = performGlobalAction(GLOBAL_ACTION_RECENTS)

    fun performNotifications(): Boolean = performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)

    fun performQuickSettings(): Boolean = performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)

    fun performPowerDialog(): Boolean = performGlobalAction(GLOBAL_ACTION_POWER_DIALOG)

    fun performLockScreen(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            performGlobalAction(GLOBAL_ACTION_LOCK_SCREEN)
        } else {
            false
        }
    }

    fun performSplitScreen(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            performGlobalAction(GLOBAL_ACTION_TOGGLE_SPLIT_SCREEN)
        } else {
            false
        }
    }

    fun takeSystemScreenshot(callback: ((Boolean) -> Unit)? = null): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            takeScreenshot(
                Display.DEFAULT_DISPLAY,
                mainExecutor,
                object : TakeScreenshotCallback {
                    override fun onSuccess(screenshotResult: ScreenshotResult) {
                        Log.i(TAG, "Screenshot captured successfully via Accessibility API.")
                        callback?.invoke(true)
                    }

                    override fun onFailure(errorCode: Int) {
                        Log.w(TAG, "takeScreenshot failed with code: $errorCode")
                        callback?.invoke(false)
                    }
                }
            )
            return true
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val res = performGlobalAction(GLOBAL_ACTION_TAKE_SCREENSHOT)
            callback?.invoke(res)
            return res
        }
        callback?.invoke(false)
        return false
    }

    // ------------------------------------------------------------
    // App & URL Launching
    // ------------------------------------------------------------

    fun openApplication(packageName: String): Boolean {
        return try {
            val intent = packageManager.getLaunchIntentForPackage(packageName)
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(intent)
                true
            } else {
                announce("App not installed: $packageName")
                false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to launch app: $packageName", e)
            false
        }
    }

    fun openUrl(url: String): Boolean {
        return try {
            val fixedUrl = if (!url.startsWith("http://") && !url.startsWith("https://")) {
                "https://$url"
            } else {
                url
            }
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fixedUrl)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
            true
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open URL: $url", e)
            false
        }
    }

    // ------------------------------------------------------------
    // Media Playback Controls
    // ------------------------------------------------------------

    fun performPlay(): Boolean {
        return clickDescription("Play") || clickText("Play") || sendMediaKeyEvent(KeyEvent.KEYCODE_MEDIA_PLAY)
    }

    fun performPause(): Boolean {
        return clickDescription("Pause") || clickText("Pause") || sendMediaKeyEvent(KeyEvent.KEYCODE_MEDIA_PAUSE)
    }

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
            Log.e(TAG, "Failed to dispatch media key event", e)
            false
        }
    }

    // ------------------------------------------------------------
    // Announcements & Feedback
    // ------------------------------------------------------------

    fun announce(message: String) {
        mainHandler.post {
            Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show()
        }
    }
}
