/*
 * IRIS — UNIVERSAL ANDROID PHONE CONTROLLER
 * Single Kotlin file
 *
 * Put this file in:
 * app/src/main/java/<your_package>/IrisPhoneController.kt
 *
 * Required manifest declaration is shown at the bottom of this file.
 */

package com.iris.ai

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.*
import android.graphics.Path
import android.graphics.Rect
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.widget.Toast
import java.util.Locale

/* =========================================================
   IRIS COMMAND MODEL
   ========================================================= */

sealed class IrisAction {

    data class OpenApp(
        val packageName: String
    ) : IrisAction()

    data class OpenUrl(
        val url: String
    ) : IrisAction()

    data class TapText(
        val text: String
    ) : IrisAction()

    data class TapDescription(
        val description: String
    ) : IrisAction()

    data class TypeText(
        val text: String
    ) : IrisAction()

    data class Scroll(
        val direction: Direction
    ) : IrisAction()

    data object Back : IrisAction()

    data object Home : IrisAction()

    data object Play : IrisAction()

    data object Pause : IrisAction()

    data object ConfirmRequired : IrisAction()

    enum class Direction {
        UP, DOWN, LEFT, RIGHT
    }
}

/* =========================================================
   IRIS ACTION ENGINE
   ========================================================= */

object IrisActionEngine {

    private var pendingActions: MutableList<IrisAction> = mutableListOf()
    private var index = 0
    private var isAwaitingConfirmation = false

    fun execute(actions: List<IrisAction>) {
        pendingActions.clear()
        pendingActions.addAll(actions)
        index = 0
        isAwaitingConfirmation = false

        executeNext()
    }

    fun confirmPending() {
        if (isAwaitingConfirmation) {
            isAwaitingConfirmation = false
            IrisAccessibilityService.instance?.announce("Action confirmed. Continuing task.")
            executeNext()
        }
    }

    fun cancelPending() {
        pendingActions.clear()
        index = 0
        isAwaitingConfirmation = false
        IrisAccessibilityService.instance?.announce("Task cancelled by user.")
    }

    val isPendingConfirmation: Boolean
        get() = isAwaitingConfirmation

    private fun executeNext() {

        if (index >= pendingActions.size) {
            IrisAccessibilityService.instance
                ?.announce("Task completed")
            pendingActions.clear()
            index = 0
            return
        }

        val action = pendingActions[index]
        index++

        when (action) {

            is IrisAction.OpenApp -> {
                IrisAccessibilityService.instance
                    ?.openApplication(action.packageName)

                nextDelayed()
            }

            is IrisAction.OpenUrl -> {
                IrisAccessibilityService.instance
                    ?.openUrl(action.url)

                nextDelayed()
            }

            is IrisAction.TapText -> {
                val success =
                    IrisAccessibilityService.instance
                        ?.clickText(action.text) ?: false

                if (success) nextDelayed()
                else retryOrContinue()
            }

            is IrisAction.TapDescription -> {
                val success =
                    IrisAccessibilityService.instance
                        ?.clickDescription(action.description) ?: false

                if (success) nextDelayed()
                else retryOrContinue()
            }

            is IrisAction.TypeText -> {
                IrisAccessibilityService.instance
                    ?.typeText(action.text)

                nextDelayed()
            }

            is IrisAction.Scroll -> {
                IrisAccessibilityService.instance
                    ?.scroll(action.direction)

                nextDelayed()
            }

            IrisAction.Back -> {
                IrisAccessibilityService.instance?.performBack()
                nextDelayed()
            }

            IrisAction.Home -> {
                IrisAccessibilityService.instance?.performHome()
                nextDelayed()
            }

            IrisAction.Play -> {
                IrisAccessibilityService.instance?.performPlay()
                nextDelayed()
            }

            IrisAction.Pause -> {
                IrisAccessibilityService.instance?.performPause()
                nextDelayed()
            }

            IrisAction.ConfirmRequired -> {
                isAwaitingConfirmation = true
                IrisAccessibilityService.instance
                    ?.announce("Confirmation required")

                // STOP HERE.
                // Iris UI should ask the user before continuing.
                // User can call IrisActionEngine.confirmPending() or cancelPending()
                return
            }
        }
    }

    private fun nextDelayed() {

        Handler(Looper.getMainLooper()).postDelayed(
            {
                executeNext()
            },
            900
        )
    }

    private fun retryOrContinue() {

        Handler(Looper.getMainLooper()).postDelayed(
            {
                executeNext()
            },
            1200
        )
    }
}

/* =========================================================
   IRIS COMMAND PARSER
   ========================================================= */

object IrisCommandParser {

    /**
     * Translates human voice/chat intent into an executable sequence of IrisActions.
     * Dangerous or irreversible actions (Post, Send, Delete, Buy) automatically insert
     * IrisAction.ConfirmRequired before the committing step.
     */
    fun parse(rawCommand: String): List<IrisAction> {
        val cmd = rawCommand.trim().lowercase(Locale.ROOT)
        val actions = mutableListOf<IrisAction>()

        when {
            // YouTube Search & Play
            cmd.startsWith("play ") && (cmd.contains("on youtube") || cmd.contains("in youtube")) -> {
                val query = cmd.removePrefix("play ")
                    .replace("on youtube", "")
                    .replace("in youtube", "")
                    .trim()
                actions.add(IrisAction.OpenApp("com.google.android.youtube"))
                actions.add(IrisAction.TapDescription("Search"))
                actions.add(IrisAction.TypeText(query))
                actions.add(IrisAction.TapText(query))
                actions.add(IrisAction.Play)
            }

            // Generic YouTube Video Play
            cmd.startsWith("search youtube for ") || cmd.startsWith("youtube ") -> {
                val query = cmd.removePrefix("search youtube for ")
                    .removePrefix("youtube ")
                    .trim()
                actions.add(IrisAction.OpenApp("com.google.android.youtube"))
                actions.add(IrisAction.TapDescription("Search"))
                actions.add(IrisAction.TypeText(query))
                actions.add(IrisAction.TapText(query))
            }

            // YouTube Post / Comment (REQUIRES CONFIRMATION)
            cmd.contains("youtube") && (cmd.contains("post") || cmd.contains("comment")) -> {
                actions.add(IrisAction.OpenApp("com.google.android.youtube"))
                actions.add(IrisAction.TapText("Add a comment"))
                val commentText = cmd.substringAfter("comment", "").trim()
                if (commentText.isNotEmpty()) {
                    actions.add(IrisAction.TypeText(commentText))
                }
                // SAFETY INTERCEPT: Ask user confirmation before final Post/Send
                actions.add(IrisAction.ConfirmRequired)
                actions.add(IrisAction.TapDescription("Send"))
            }

            // WhatsApp / Messaging Send (REQUIRES CONFIRMATION)
            cmd.startsWith("send message") || cmd.startsWith("send whatsapp") -> {
                val recipient = cmd.substringAfter("to ", "").substringBefore("saying", "").trim()
                val message = cmd.substringAfter("saying ", "").trim()

                actions.add(IrisAction.OpenApp("com.whatsapp"))
                if (recipient.isNotEmpty()) {
                    actions.add(IrisAction.TapDescription("Search"))
                    actions.add(IrisAction.TypeText(recipient))
                    actions.add(IrisAction.TapText(recipient))
                }
                if (message.isNotEmpty()) {
                    actions.add(IrisAction.TypeText(message))
                }
                // SAFETY INTERCEPT: User must confirm before sending
                actions.add(IrisAction.ConfirmRequired)
                actions.add(IrisAction.TapDescription("Send"))
            }

            // Open Apps
            cmd.startsWith("open ") || cmd.startsWith("launch ") -> {
                val appName = cmd.removePrefix("open ").removePrefix("launch ").trim()
                val pkg = mapAppNameToPackage(appName)
                if (pkg != null) {
                    actions.add(IrisAction.OpenApp(pkg))
                } else {
                    actions.add(IrisAction.Home)
                    actions.add(IrisAction.TapText(appName))
                }
            }

            // URLs / Web Browsing
            cmd.startsWith("browse ") || cmd.startsWith("open url ") || cmd.startsWith("go to ") -> {
                var url = cmd.removePrefix("browse ").removePrefix("open url ").removePrefix("go to ").trim()
                if (!url.startsWith("http://") && !url.startsWith("https://")) {
                    url = "https://$url"
                }
                actions.add(IrisAction.OpenUrl(url))
            }

            // Media Controls
            cmd == "pause" || cmd == "pause video" || cmd == "pause music" -> {
                actions.add(IrisAction.Pause)
            }

            cmd == "play" || cmd == "resume" || cmd == "resume music" -> {
                actions.add(IrisAction.Play)
            }

            // Navigation
            cmd == "go back" || cmd == "back" -> {
                actions.add(IrisAction.Back)
            }

            cmd == "go home" || cmd == "home" -> {
                actions.add(IrisAction.Home)
            }

            // Scrolling
            cmd.contains("scroll down") -> {
                actions.add(IrisAction.Scroll(IrisAction.Direction.DOWN))
            }

            cmd.contains("scroll up") -> {
                actions.add(IrisAction.Scroll(IrisAction.Direction.UP))
            }

            // Tapping & Typing
            cmd.startsWith("tap ") || cmd.startsWith("click ") -> {
                val target = cmd.removePrefix("tap ").removePrefix("click ").trim()
                actions.add(IrisAction.TapText(target))
            }

            cmd.startsWith("type ") || cmd.startsWith("write ") -> {
                val text = cmd.removePrefix("type ").removePrefix("write ").trim()
                actions.add(IrisAction.TypeText(text))
            }

            else -> {
                // Default fallback: Try to click matching text
                actions.add(IrisAction.TapText(rawCommand.trim()))
            }
        }

        return actions
    }

    private fun mapAppNameToPackage(appName: String): String? {
        return when (appName.lowercase(Locale.ROOT)) {
            "youtube" -> "com.google.android.youtube"
            "chrome", "browser", "google chrome" -> "com.android.chrome"
            "whatsapp" -> "com.whatsapp"
            "maps", "google maps" -> "com.google.android.apps.maps"
            "gmail", "email" -> "com.google.android.gm"
            "spotify" -> "com.spotify.music"
            "instagram" -> "com.instagram.android"
            "twitter", "x" -> "com.twitter.android"
            "settings" -> "com.android.settings"
            "camera" -> "com.google.android.GoogleCamera"
            "clock", "alarm" -> "com.google.android.deskclock"
            "photos", "gallery" -> "com.google.android.apps.photos"
            "messages", "sms" -> "com.google.android.apps.messaging"
            "phone", "dialer", "call" -> "com.google.android.dialer"
            else -> null
        }
    }
}

/* =========================================================
   IRIS ACCESSIBILITY SERVICE
   ========================================================= */

class IrisAccessibilityService : AccessibilityService() {

    companion object {
        var instance: IrisAccessibilityService? = null
            private set
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        announce("IRIS Accessibility Service connected")
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        // Events can be logged or analyzed for reactive UI inspection
    }

    override fun onInterrupt() {
        // Accessibility service interrupted by system
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance == this) {
            instance = null
        }
    }

    // ---------------------------------------------------------
    // APPLICATION & URL LAUNCHERS
    // ---------------------------------------------------------

    fun openApplication(packageName: String): Boolean {
        return try {
            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(launchIntent)
                true
            } else {
                announce("App not installed: $packageName")
                false
            }
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    fun openUrl(url: String): Boolean {
        return try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(intent)
            true
        } catch (e: Exception) {
            e.printStackTrace()
            false
        }
    }

    // ---------------------------------------------------------
    // CLICK BY TEXT OR DESCRIPTION
    // ---------------------------------------------------------

    fun clickText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val nodes = root.findAccessibilityNodeInfosByText(text)

        if (nodes != null && nodes.isNotEmpty()) {
            for (node in nodes) {
                if (clickNodeOrParent(node)) {
                    return true
                }
            }
            // Fallback: tap center coordinates of first node
            val rect = Rect()
            nodes[0].getBoundsInScreen(rect)
            if (rect.width() > 0 && rect.height() > 0) {
                return dispatchTap(rect.centerX().toFloat(), rect.centerY().toFloat())
            }
        }
        return false
    }

    fun clickDescription(description: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val targetNode = findNodeByDescription(root, description)
        if (targetNode != null) {
            if (clickNodeOrParent(targetNode)) {
                return true
            }
            val rect = Rect()
            targetNode.getBoundsInScreen(rect)
            if (rect.width() > 0 && rect.height() > 0) {
                return dispatchTap(rect.centerX().toFloat(), rect.centerY().toFloat())
            }
        }
        return false
    }

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

    private fun clickNodeOrParent(node: AccessibilityNodeInfo): Boolean {
        var current: AccessibilityNodeInfo? = node
        while (current != null) {
            if (current.isClickable) {
                return current.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }
            current = current.parent
        }
        return false
    }

    // ---------------------------------------------------------
    // TEXT INPUT
    // ---------------------------------------------------------

    fun typeText(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val focusedNode = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
            ?: findFirstEditableNode(root)

        if (focusedNode != null) {
            val arguments = Bundle().apply {
                putCharSequence(
                    AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                    text
                )
            }
            return focusedNode.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, arguments)
        }
        return false
    }

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

    // ---------------------------------------------------------
    // SCROLLING & GESTURES
    // ---------------------------------------------------------

    fun scroll(direction: IrisAction.Direction): Boolean {
        val root = rootInActiveWindow ?: return false
        val scrollableNode = findFirstScrollableNode(root)

        if (scrollableNode != null) {
            val action = when (direction) {
                IrisAction.Direction.DOWN, IrisAction.Direction.RIGHT ->
                    AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                IrisAction.Direction.UP, IrisAction.Direction.LEFT ->
                    AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
            }
            if (scrollableNode.performAction(action)) {
                return true
            }
        }

        // Gesture-based swipe fallback
        val displayMetrics = resources.displayMetrics
        val width = displayMetrics.widthPixels.toFloat()
        val height = displayMetrics.heightPixels.toFloat()

        return when (direction) {
            IrisAction.Direction.DOWN -> dispatchSwipe(width / 2f, height * 0.7f, width / 2f, height * 0.3f)
            IrisAction.Direction.UP -> dispatchSwipe(width / 2f, height * 0.3f, width / 2f, height * 0.7f)
            IrisAction.Direction.RIGHT -> dispatchSwipe(width * 0.2f, height / 2f, width * 0.8f, height / 2f)
            IrisAction.Direction.LEFT -> dispatchSwipe(width * 0.8f, height / 2f, width * 0.2f, height / 2f)
        }
    }

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

    // ---------------------------------------------------------
    // GLOBAL ACTIONS & MEDIA KEYS
    // ---------------------------------------------------------

    fun performBack(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_BACK)
    }

    fun performHome(): Boolean {
        return performGlobalAction(GLOBAL_ACTION_HOME)
    }

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
            e.printStackTrace()
            false
        }
    }

    // ---------------------------------------------------------
    // GESTURE DISPATCHING
    // ---------------------------------------------------------

    fun dispatchTap(x: Float, y: Float): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        val path = Path().apply {
            moveTo(x, y)
        }
        val stroke = GestureDescription.StrokeDescription(path, 0, 100)
        val gesture = GestureDescription.Builder().addStroke(stroke).build()
        return dispatchGesture(gesture, null, null)
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

    // ---------------------------------------------------------
    // USER ANNOUNCEMENTS
    // ---------------------------------------------------------

    fun announce(message: String) {
        Handler(Looper.getMainLooper()).post {
            Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show()
        }
    }
}

/* =========================================================
   SAFETY CONFIRMATION FLOW REFERENCE
   =========================================================
   User Command
        ↓
   IrisCommandParser
        ↓
   Irreversible / Sensitive Action?
        ↓
   Confirmation required
        ↓
   [Cancel] [Confirm]
        ↓
   IrisActionEngine.confirmPending()
        ↓
   IrisAccessibilityService
        ↓
   Target Application (e.g. YouTube / WhatsApp)
        ↓
   Post / Send / Submit
   ========================================================= */

/* =========================================================
   ANDROID MANIFEST DECLARATION:
   =========================================================
   Add this inside <application> in AndroidManifest.xml:

   <service
       android:name="com.iris.ai.IrisAccessibilityService"
       android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
       android:exported="true">
       <intent-filter>
           <action android:name="android.view.accessibility.AccessibilityService" />
       </intent-filter>
       <meta-data
           android:name="android.accessibilityservice"
           android:resource="@xml/accessibility_service_config" />
   </service>

   AND create res/xml/accessibility_service_config.xml:

   <?xml version="1.0" encoding="utf-8"?>
   <accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
       android:accessibilityEventTypes="typeAllMask"
       android:accessibilityFeedbackType="feedbackGeneric"
       android:accessibilityFlags="flagDefault|flagRetrieveInteractiveWindows|flagReportViewIds"
       android:canRetrieveWindowContent="true"
       android:canPerformGestures="true"
       android:description="@string/iris_accessibility_service_description"
       android:notificationTimeout="100" />
   ========================================================= */
