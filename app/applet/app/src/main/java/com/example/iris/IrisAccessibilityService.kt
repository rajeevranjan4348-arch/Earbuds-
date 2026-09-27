package com.example.iris

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.accessibilityservice.GestureDescription
import android.graphics.Path
import android.graphics.Rect
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import org.json.JSONArray
import org.json.JSONObject

/**
 * IrisAccessibilityService
 *
 * Provides system-level Android UI event interception, screen node inspection,
 * gesture dispatching, and system action execution for Iris AI.
 */
class IrisAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "IrisAccessibility"
        @Volatile
        private var instance: IrisAccessibilityService? = null

        fun getInstance(): IrisAccessibilityService? = instance

        fun isServiceRunning(): Boolean = instance != null
    }

    private var currentPackageName: String = ""
    private var currentClassName: String = ""
    private var lastEventTimestamp: Long = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "IrisAccessibilityService connected and initialized.")

        val info = serviceInfo ?: AccessibilityServiceInfo()
        info.eventTypes = AccessibilityEvent.TYPES_ALL_MASK
        info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
        info.flags = (AccessibilityServiceInfo.FLAG_DEFAULT
                or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
                or AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS
                or AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS)
        info.notificationTimeout = 100
        serviceInfo = info
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return

        val pkgName = event.packageName?.toString() ?: ""
        val clsName = event.className?.toString() ?: ""

        if (pkgName.isNotEmpty()) {
            currentPackageName = pkgName
        }
        if (clsName.isNotEmpty()) {
            currentClassName = clsName
        }
        lastEventTimestamp = System.currentTimeMillis()
    }

    override fun onInterrupt() {
        Log.w(TAG, "IrisAccessibilityService interrupted.")
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
        Log.i(TAG, "IrisAccessibilityService destroyed.")
    }

    fun dumpScreenHierarchy(): JSONObject {
        val root = JSONObject()
        val rootNode = rootInActiveWindow

        root.put("packageName", currentPackageName)
        root.put("className", currentClassName)
        root.put("timestamp", lastEventTimestamp)
        root.put("accessibilityActive", true)

        if (rootNode == null) {
            root.put("nodes", JSONArray())
            root.put("hasRootNode", false)
            return root
        }

        root.put("hasRootNode", true)
        val nodeArray = JSONArray()
        traverseNodeHierarchy(rootNode, nodeArray, 0)
        root.put("nodes", nodeArray)
        return root
    }

    private fun traverseNodeHierarchy(node: AccessibilityNodeInfo?, outputArray: JSONArray, depth: Int) {
        if (node == null || depth > 12) return

        val nodeObj = JSONObject()
        val rect = Rect()
        node.getBoundsInScreen(rect)

        nodeObj.put("id", node.viewIdResourceName ?: "")
        nodeObj.put("text", node.text?.toString() ?: "")
        nodeObj.put("contentDescription", node.contentDescription?.toString() ?: "")
        nodeObj.put("className", node.className?.toString() ?: "")
        nodeObj.put("packageName", node.packageName?.toString() ?: "")
        nodeObj.put("clickable", node.isClickable)
        nodeObj.put("editable", node.isEditable)
        nodeObj.put("scrollable", node.isScrollable)
        nodeObj.put("checkable", node.isCheckable)
        nodeObj.put("checked", node.isChecked)
        nodeObj.put("enabled", node.isEnabled)
        nodeObj.put("visible", node.isVisibleToUser)

        val boundsObj = JSONObject()
        boundsObj.put("left", rect.left)
        boundsObj.put("top", rect.top)
        boundsObj.put("right", rect.right)
        boundsObj.put("bottom", rect.bottom)
        boundsObj.put("width", rect.width())
        boundsObj.put("height", rect.height())
        boundsObj.put("centerX", rect.centerX())
        boundsObj.put("centerY", rect.centerY())
        nodeObj.put("bounds", boundsObj)

        outputArray.put(nodeObj)

        for (i in 0 until node.childCount) {
            val child = node.getChild(i)
            traverseNodeHierarchy(child, outputArray, depth + 1)
        }
    }

    fun findNodeById(viewId: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val nodes = root.findAccessibilityNodeInfosByViewId(viewId)
        return nodes?.firstOrNull()
    }

    fun findNodeByText(text: String): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        val nodes = root.findAccessibilityNodeInfosByText(text)
        return nodes?.firstOrNull()
    }

    fun clickById(viewId: String): Boolean {
        val node = findNodeById(viewId) ?: return false
        return performNodeClick(node)
    }

    fun clickByText(text: String): Boolean {
        val node = findNodeByText(text) ?: return false
        return performNodeClick(node)
    }

    private fun performNodeClick(node: AccessibilityNodeInfo): Boolean {
        var curr: AccessibilityNodeInfo? = node
        while (curr != null) {
            if (curr.isClickable) {
                return curr.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }
            curr = curr.parent
        }
        val rect = Rect()
        node.getBoundsInScreen(rect)
        if (rect.width() > 0 && rect.height() > 0) {
            return tapAtCoordinates(rect.centerX().toFloat(), rect.centerY().toFloat())
        }
        return false
    }

    fun typeText(text: String, viewId: String? = null): Boolean {
        val node = if (!viewId.isNullOrEmpty()) findNodeById(viewId) else findFocusedInputNode()
        if (node != null && node.isEditable) {
            val arguments = Bundle()
            arguments.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
        }
        return false
    }

    private fun findFocusedInputNode(): AccessibilityNodeInfo? {
        val root = rootInActiveWindow ?: return null
        return root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
    }

    fun tapAtCoordinates(x: Float, y: Float, durationMs: Long = 100): Boolean {
        val path = Path()
        path.moveTo(x, y)
        val gestureBuilder = GestureDescription.Builder()
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        gestureBuilder.addStroke(stroke)
        return dispatchGesture(gestureBuilder.build(), null, null)
    }

    fun performSwipe(startX: Float, startY: Float, endX: Float, endY: Float, durationMs: Long = 300): Boolean {
        val path = Path()
        path.moveTo(startX, startY)
        path.lineTo(endX, endY)
        val gestureBuilder = GestureDescription.Builder()
        val stroke = GestureDescription.StrokeDescription(path, 0, durationMs)
        gestureBuilder.addStroke(stroke)
        return dispatchGesture(gestureBuilder.build(), null, null)
    }

    fun performSystemAction(actionName: String): Boolean {
        val action = when (actionName.lowercase()) {
            "back" -> GLOBAL_ACTION_BACK
            "home" -> GLOBAL_ACTION_HOME
            "recents" -> GLOBAL_ACTION_RECENTS
            "notifications" -> GLOBAL_ACTION_NOTIFICATIONS
            "quick_settings" -> GLOBAL_ACTION_QUICK_SETTINGS
            "lock" -> GLOBAL_ACTION_LOCK_SCREEN
            "screenshot" -> GLOBAL_ACTION_TAKE_SCREENSHOT
            else -> return false
        }
        return performGlobalAction(action)
    }
}
