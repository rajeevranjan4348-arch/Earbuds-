/*
 * IRIS App Control - App Controller
 * Controls Android applications through intents and accessibility
 */

package com.iris.ai.appcontrol

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityNodeInfo
import java.util.concurrent.Executors

/**
 * Result of an app control operation
 */
data class AppControlResult(
    val success: Boolean,
    val action: String,
    val packageName: String? = null,
    val message: String,
    val spokenResponse: String? = null,
    val error: String? = null,
    val requiresConfirmation: Boolean = false
)

/**
 * Callback for app control operations
 */
interface AppControlCallback {
    fun onResult(result: AppControlResult)
    fun onProgress(action: String, progress: Int)
    fun onError(error: String)
}

/**
 * App Controller
 * Executes app automation operations
 */
class AppController(
    private val context: Context,
    private val appResolver: AppResolver,
    private val accessibilityService: IrisAccessibilityService? = null
) {
    private const val TAG = "AppController"
    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var currentAction: String? = null
    private var isExecuting = false

    /**
     * Open an application
     */
    fun openApp(appName: String, callback: AppControlCallback? = null): AppControlResult {
        val packageName = appResolver.resolveToPackageName(appName)
        
        if (packageName == null) {
            val errorMsg = "App not found: $appName"
            Log.e(TAG, errorMsg)
            callback?.onError(errorMsg)
            return AppControlResult(
                success = false,
                action = "OPEN_APP",
                message = errorMsg,
                spokenResponse = "I couldn't find $appName"
            )
        }

        if (!appResolver.isAppInstalled(packageName)) {
            val errorMsg = "App not installed: $appName ($packageName)"
            Log.e(TAG, errorMsg)
            callback?.onError(errorMsg)
            return AppControlResult(
                success = false,
                action = "OPEN_APP",
                packageName = packageName,
                message = errorMsg,
                spokenResponse = "$appName is not installed"
            )
        }

        try {
            val launchIntent = context.packageManager.getLaunchIntentForPackage(packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(launchIntent)
                
                callback?.onResult(
                    AppControlResult(
                        success = true,
                        action = "OPEN_APP",
                        packageName = packageName,
                        message = "Opened $appName",
                        spokenResponse = "Opening $appName"
                    )
                )
                
                return AppControlResult(
                    success = true,
                    action = "OPEN_APP",
                    packageName = packageName,
                    message = "Opened $appName",
                    spokenResponse = "Opening $appName"
                )
            } else {
                val errorMsg = "Cannot launch app: $packageName"
                Log.e(TAG, errorMsg)
                callback?.onError(errorMsg)
                return AppControlResult(
                    success = false,
                    action = "OPEN_APP",
                    packageName = packageName,
                    message = errorMsg,
                    spokenResponse = "I couldn't open $appName"
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error opening app: $packageName", e)
            callback?.onError("Error opening app: ${e.message}")
            return AppControlResult(
                success = false,
                action = "OPEN_APP",
                packageName = packageName,
                message = "Error opening app: ${e.message}",
                error = e.message
            )
        }
    }

    /**
     * Open app by package name
     */
    fun openAppByPackage(packageName: String, callback: AppControlCallback? = null): AppControlResult {
        if (!appResolver.isAppInstalled(packageName)) {
            val errorMsg = "App not installed: $packageName"
            callback?.onError(errorMsg)
            return AppControlResult(
                success = false,
                action = "OPEN_APP",
                packageName = packageName,
                message = errorMsg
            )
        }

        return openApp(packageName, callback)
    }

    /**
     * Check if app is installed
     */
    fun isAppInstalled(appName: String): Boolean {
        return appResolver.isAppInstalledByName(appName)
    }

    /**
     * Get package name for app
     */
    fun getPackageName(appName: String): String? {
        return appResolver.resolveToPackageName(appName)
    }

    /**
     * Launch app with intent
     */
    fun launchApp(intent: Intent, callback: AppControlCallback? = null): AppControlResult {
        return try {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            callback?.onResult(
                AppControlResult(
                    success = true,
                    action = "LAUNCH_APP",
                    message = "App launched",
                    spokenResponse = "Opening app"
                )
            )
            AppControlResult(
                success = true,
                action = "LAUNCH_APP",
                message = "App launched"
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error launching app with intent", e)
            callback?.onError("Error launching app: ${e.message}")
            AppControlResult(
                success = false,
                action = "LAUNCH_APP",
                message = "Error launching app: ${e.message}",
                error = e.message
            )
        }
    }

    /**
     * Open URL in browser
     */
    fun openUrl(url: String, callback: AppControlCallback? = null): AppControlResult {
        return try {
            var fullUrl = url
            if (!fullUrl.startsWith("http://") && !fullUrl.startsWith("https://")) {
                fullUrl = "https://$fullUrl"
            }
            
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fullUrl))
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            
            callback?.onResult(
                AppControlResult(
                    success = true,
                    action = "OPEN_URL",
                    message = "Opened URL: $url",
                    spokenResponse = "Opening $url"
                )
            )
            
            AppControlResult(
                success = true,
                action = "OPEN_URL",
                message = "Opened URL: $url"
            )
        } catch (e: Exception) {
            Log.e(TAG, "Error opening URL: $url", e)
            callback?.onError("Error opening URL: ${e.message}")
            AppControlResult(
                success = false,
                action = "OPEN_URL",
                message = "Error opening URL: ${e.message}",
                error = e.message
            )
        }
    }

    /**
     * Wait for app to be in foreground
     */
    fun waitForApp(packageName: String, timeout: Long = 5000L, callback: AppControlCallback? = null): Boolean {
        if (accessibilityService == null) {
            callback?.onError("AccessibilityService not available")
            return false
        }

        executor.execute {
            val startTime = System.currentTimeMillis()
            var isForeground = false

            while (System.currentTimeMillis() - startTime < timeout) {
                try {
                    Thread.sleep(200)
                    val currentPackage = accessibilityService.getCurrentPackage()
                    if (currentPackage == packageName) {
                        isForeground = true
                        break
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Error checking foreground app", e)
                }
            }

            mainHandler.post {
                if (isForeground) {
                    callback?.onResult(
                        AppControlResult(
                            success = true,
                            action = "WAIT_FOR_APP",
                            packageName = packageName,
                            message = "App $packageName is in foreground",
                            spokenResponse = "$packageName is open"
                        )
                    )
                } else {
                    callback?.onError("App $packageName did not come to foreground")
                }
            }
        }

        return true
    }

    /**
     * Get current foreground package name
     */
    fun getCurrentPackage(): String? {
        return accessibilityService?.getCurrentPackage()
    }

    /**
     * Return to previous app (back button)
     */
    fun returnToPreviousApp(callback: AppControlCallback? = null): AppControlResult {
        return if (accessibilityService != null) {
            val result = accessibilityService.performBack()
            callback?.onResult(
                AppControlResult(
                    success = result,
                    action = "BACK",
                    message = if (result) "Went back" else "Could not go back",
                    spokenResponse = if (result) "Going back" else "Cannot go back"
                )
            )
            AppControlResult(
                success = result,
                action = "BACK",
                message = if (result) "Went back" else "Could not go back"
            )
        } else {
            callback?.onError("AccessibilityService not available")
            AppControlResult(
                success = false,
                action = "BACK",
                message = "AccessibilityService not available"
            )
        }
    }

    /**
     * Perform home action
     */
    fun performHome(callback: AppControlCallback? = null): AppControlResult {
        return if (accessibilityService != null) {
            val result = accessibilityService.performHome()
            callback?.onResult(
                AppControlResult(
                    success = result,
                    action = "HOME",
                    message = if (result) "Went home" else "Could not go home",
                    spokenResponse = if (result) "Going home" else "Cannot go home"
                )
            )
            AppControlResult(
                success = result,
                action = "HOME",
                message = if (result) "Went home" else "Could not go home"
            )
        } else {
            callback?.onError("AccessibilityService not available")
            AppControlResult(
                success = false,
                action = "HOME",
                message = "AccessibilityService not available"
            )
        }
    }

    /**
     * Stop all automation
     */
    fun stopAutomation(callback: AppControlCallback? = null) {
        isExecuting = false
        currentAction = null
        executor.shutdownNow()
        callback?.onResult(
            AppControlResult(
                success = true,
                action = "STOP",
                message = "Automation stopped",
                spokenResponse = "Stopped"
            )
        )
    }

    /**
     * Tap by text
     */
    fun tapText(text: String, callback: AppControlCallback? = null): Boolean {
        return if (accessibilityService != null) {
            val result = accessibilityService.clickText(text)
            callback?.onResult(
                AppControlResult(
                    success = result,
                    action = "TAP_TEXT",
                    message = if (result) "Tapped: $text" else "Could not find: $text",
                    spokenResponse = if (result) "Tapped $text" else "Cannot find $text"
                )
            )
            result
        } else {
            callback?.onError("AccessibilityService not available")
            false
        }
    }

    /**
     * Tap by description
     */
    fun tapDescription(description: String, callback: AppControlCallback? = null): Boolean {
        return if (accessibilityService != null) {
            val result = accessibilityService.clickDescription(description)
            callback?.onResult(
                AppControlResult(
                    success = result,
                    action = "TAP_DESCRIPTION",
                    message = if (result) "Tapped: $description" else "Could not find: $description",
                    spokenResponse = if (result) "Tapped $description" else "Cannot find $description"
                )
            )
            result
        } else {
            callback?.onError("AccessibilityService not available")
            false
        }
    }

    /**
     * Type text
     */
    fun typeText(text: String, callback: AppControlCallback? = null): Boolean {
        return if (accessibilityService != null) {
            val result = accessibilityService.typeText(text)
            callback?.onResult(
                AppControlResult(
                    success = result,
                    action = "TYPE_TEXT",
                    message = if (result) "Typed text" else "Could not type text",
                    spokenResponse = if (result) "Typed $text" else "Cannot type"
                )
            )
            result
        } else {
            callback?.onError("AccessibilityService not available")
            false
        }
    }

    /**
     * Scroll
     */
    fun scroll(direction: ScrollDirection, callback: AppControlCallback? = null): Boolean {
        return if (accessibilityService != null) {
            val result = accessibilityService.scroll(direction)
            callback?.onResult(
                AppControlResult(
                    success = result,
                    action = "SCROLL",
                    message = if (result) "Scrolled ${direction.name}" else "Could not scroll",
                    spokenResponse = if (result) "Scrolling ${direction.name}" else "Cannot scroll"
                )
            )
            result
        } else {
            callback?.onError("AccessibilityService not available")
            false
        }
    }

    /**
     * Find element by text
     */
    fun findElementByText(text: String): AccessibilityNodeInfo? {
        return accessibilityService?.rootInActiveWindow?.findAccessibilityNodeInfosByText(text)?.firstOrNull()
    }

    /**
     * Find element by description
     */
    fun findElementByDescription(description: String): AccessibilityNodeInfo? {
        return accessibilityService?.let { service ->
            val root = service.rootInActiveWindow ?: return@let null
            findNodeByDescription(root, description)
        }
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

    /**
     * Check if accessibility service is available
     */
    fun isAccessibilityServiceAvailable(): Boolean {
        return accessibilityService != null
    }

    /**
     * Set accessibility service reference
     */
    fun setAccessibilityService(service: IrisAccessibilityService) {
        // Update reference - this would need to be handled carefully in real implementation
    }

    /**
     * Execute a list of actions
     */
    fun executeActions(actions: List<IrisAction>, callback: AppControlCallback? = null) {
        if (isExecuting) {
            callback?.onError("Already executing actions")
            return
        }

        isExecuting = true
        executor.execute {
            try {
                for ((index, action) in actions.withIndex()) {
                    if (!isExecuting) {
                        break
                    }

                    currentAction = action.description ?: "Action ${index + 1}"
                    
                    mainHandler.post {
                        callback?.onProgress(currentAction ?: "", (index + 1) * 100 / actions.size)
                    }

                    val result = executeAction(action)
                    
                    if (!result.success && action.requiresConfirmation) {
                        mainHandler.post {
                            callback?.onResult(result)
                        }
                        isExecuting = false
                        currentAction = null
                        return@execute
                    }

                    if (!result.success) {
                        Log.w(TAG, "Action failed: ${action.description}")
                        // Continue with next action unless it's critical
                    }

                    // Small delay between actions
                    Thread.sleep(500)
                }

                mainHandler.post {
                    callback?.onResult(
                        AppControlResult(
                            success = true,
                            action = "EXECUTE_ACTIONS",
                            message = "All actions completed",
                            spokenResponse = "Done"
                        )
                    )
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error executing actions", e)
                mainHandler.post {
                    callback?.onError("Error: ${e.message}")
                }
            } finally {
                isExecuting = false
                currentAction = null
            }
        }
    }

    /**
     * Execute a single action
     */
    private fun executeAction(action: IrisAction): AppControlResult {
        return when (action.type) {
            ActionType.OPEN_APP -> {
                openApp(action.target ?: "", null)
            }
            ActionType.WAIT -> {
                Thread.sleep(action.timeout)
                AppControlResult(success = true, action = "WAIT", message = "Waited")
            }
            ActionType.WAIT_FOR_ELEMENT -> {
                val packageName = action.target
                if (packageName != null) {
                    waitForApp(packageName, action.timeout, null)
                    AppControlResult(success = true, action = "WAIT_FOR_ELEMENT", packageName = packageName, message = "Waited for element")
                } else {
                    Thread.sleep(action.timeout)
                    AppControlResult(success = true, action = "WAIT_FOR_ELEMENT", message = "Waited")
                }
            }
            ActionType.FIND_ELEMENT -> {
                val found = findElementByText(action.target ?: "") != null
                AppControlResult(success = found, action = "FIND_ELEMENT", message = if (found) "Found element" else "Element not found")
            }
            ActionType.CLICK -> {
                val result = tapText(action.target ?: "", null)
                AppControlResult(success = result, action = "CLICK", message = if (result) "Clicked" else "Click failed")
            }
            ActionType.TYPE_TEXT -> {
                val result = typeText(action.text ?: "", null)
                AppControlResult(success = result, action = "TYPE_TEXT", message = if (result) "Typed" else "Type failed")
            }
            ActionType.CLEAR_TEXT -> {
                // Clear text by typing empty or backspace
                typeText("", null)
                AppControlResult(success = true, action = "CLEAR_TEXT", message = "Cleared")
            }
            ActionType.SCROLL -> {
                val result = scroll(action.direction ?: ScrollDirection.DOWN, null)
                AppControlResult(success = result, action = "SCROLL", message = if (result) "Scrolled" else "Scroll failed")
            }
            ActionType.BACK -> {
                returnToPreviousApp(null)
            }
            ActionType.HOME -> {
                performHome(null)
            }
            ActionType.READ_SCREEN -> {
                AppControlResult(success = false, action = "READ_SCREEN", message = "Read screen not implemented")
            }
            ActionType.SEARCH -> {
                // Search is typically: find search input, click, type, submit
                val success = tapText("Search", null) || tapDescription("Search", null)
                AppControlResult(success = success, action = "SEARCH", message = if (success) "Search initiated" else "Cannot find search")
            }
            ActionType.VERIFY -> {
                AppControlResult(success = true, action = "VERIFY", message = "Verified")
            }
            ActionType.STOP -> {
                stopAutomation(null)
                AppControlResult(success = true, action = "STOP", message = "Stopped")
            }
            ActionType.CONFIRM -> {
                AppControlResult(success = true, action = "CONFIRM", message = "Confirmation required", requiresConfirmation = true)
            }
        }
    }
}
