package com.example.iris

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityNodeInfo

class IrisAccessibilityService : AccessibilityService() {
    companion object {
        @Volatile private var instance: IrisAccessibilityService? = null
        fun performGlobalBack() = instance?.performGlobalAction(GLOBAL_ACTION_BACK) == true
        fun performGlobalHome() = instance?.performGlobalAction(GLOBAL_ACTION_HOME) == true
        fun performGlobalRecents() = instance?.performGlobalAction(GLOBAL_ACTION_RECENTS) == true
        fun tapText(text: String) = instance?.tapTextInternal(text) == true
        fun scrollForward() = instance?.scrollInternal(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD) == true
        fun scrollBackward() = instance?.scrollInternal(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD) == true
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        serviceInfo = (serviceInfo ?: AccessibilityServiceInfo()).apply {
            eventTypes = AccessibilityServiceInfo.TYPE_WINDOW_STATE_CHANGED or AccessibilityServiceInfo.TYPE_WINDOW_CONTENT_CHANGED
            feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            notificationTimeout = 100
            flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
        }
    }

    override fun onAccessibilityEvent(event: android.view.accessibility.AccessibilityEvent?) = Unit
    override fun onInterrupt() = Unit
    override fun onDestroy() { instance = null; super.onDestroy() }

    private fun tapTextInternal(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val node = root.findAccessibilityNodeInfosByText(text).firstOrNull() ?: return false
        return clickNode(node)
    }

    private fun clickNode(node: AccessibilityNodeInfo): Boolean {
        if (node.isClickable && node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
        var parent = node.parent
        while (parent != null) {
            if (parent.isClickable && parent.performAction(AccessibilityNodeInfo.ACTION_CLICK)) return true
            parent = parent.parent
        }
        return false
    }

    private fun scrollInternal(action: Int): Boolean {
        val root = rootInActiveWindow ?: return false
        return scrollNode(root, action)
    }

    private fun scrollNode(node: AccessibilityNodeInfo, action: Int): Boolean {
        if (node.isScrollable && node.performAction(action)) return true
        for (i in 0 until node.childCount) {
            val child = node.getChild(i) ?: continue
            if (scrollNode(child, action)) return true
        }
        return false
    }
}
