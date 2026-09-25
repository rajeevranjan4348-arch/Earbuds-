/*
 * IRIS App Control - Permission Manager
 * Manages permissions and safety checks for app automation
 */

package com.iris.ai.appcontrol

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import android.util.Log

/**
 * Permission check result
 */
data class PermissionResult(
    val granted: Boolean,
    val permission: String,
    val message: String,
    val canRequest: Boolean = false,
    val intent: Intent? = null
)

/**
 * Safety level for actions
 */
enum class SafetyLevel {
    SAFE,        // No confirmation needed
    CAUTION,     // Confirmation recommended
    DANGEROUS    // Confirmation required
}

/**
 * Permission Manager
 * Checks and manages permissions for app automation
 */
class PermissionManager(private val context: Context) {
    private const val TAG = "PermissionManager"

    // Actions that are always safe
    private val safeActions = setOf(
        ActionType.OPEN_APP,
        ActionType.WAIT,
        ActionType.WAIT_FOR_ELEMENT,
        ActionType.FIND_ELEMENT,
        ActionType.SCROLL,
        ActionType.BACK,
        ActionType.HOME,
        ActionType.READ_SCREEN,
        ActionType.VERIFY,
        ActionType.STOP
    )

    // Actions that require caution
    private val cautionActions = setOf(
        ActionType.CLICK,
        ActionType.TYPE_TEXT,
        ActionType.CLEAR_TEXT,
        ActionType.SWIPE,
        ActionType.SEARCH
    )

    // Actions that are dangerous and require confirmation
    private val dangerousActions = setOf(
        // These would be in the context of sending/deleting
    )

    // Sensitive keywords that require confirmation
    private val sensitiveKeywords = setOf(
        "send", "post", "submit", "delete", "remove", "buy", "purchase",
        "share", "forward", "reply", "call", "dial", "install", "uninstall",
        "logout", "sign out", "change password", "update", "pay",
        "message", "email", "comment"
    )

    // Required Android permissions
    private val requiredPermissions = listOf(
        android.Manifest.permission.BIND_ACCESSIBILITY_SERVICE,
        android.Manifest.permission.WRITE_EXTERNAL_STORAGE,
        android.Manifest.permission.READ_EXTERNAL_STORAGE
    )

    /**
     * Check if accessibility service is enabled
     */
    fun isAccessibilityServiceEnabled(serviceClass: Class<out AccessibilityService>): Boolean {
        try {
            val accessibilityEnabled = Settings.Secure.getInt(
                context.contentResolver,
                Settings.Secure.ACCESSIBILITY_ENABLED
            ) == 1

            if (!accessibilityEnabled) {
                return false
            }

            val enabledServices = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            )

            val componentName = context.packageName + "/" + serviceClass.name
            return enabledServices?.contains(componentName) == true
        } catch (e: Exception) {
            Log.e(TAG, "Error checking accessibility service", e)
            return false
        }
    }

    /**
     * Check if a specific permission is granted
     */
    fun checkPermission(permission: String): PermissionResult {
        return try {
            val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                context.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED
            } else {
                true // Permissions are granted at install time on older Android
            }

            if (granted) {
                PermissionResult(
                    granted = true,
                    permission = permission,
                    message = "Permission granted"
                )
            } else {
                val intent = when (permission) {
                    android.Manifest.permission.BIND_ACCESSIBILITY_SERVICE ->
                        Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
                    android.Manifest.permission.WRITE_EXTERNAL_STORAGE,
                    android.Manifest.permission.READ_EXTERNAL_STORAGE ->
                        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                            data = android.net.Uri.fromParts("package", context.packageName, null)
                        }
                    else -> null
                }

                PermissionResult(
                    granted = false,
                    permission = permission,
                    message = "Permission not granted",
                    canRequest = true,
                    intent = intent
                )
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error checking permission: $permission", e)
            PermissionResult(
                granted = false,
                permission = permission,
                message = "Error checking permission: ${e.message}",
                canRequest = false
            )
        }
    }

    /**
     * Check all required permissions
     */
    fun checkAllPermissions(): List<PermissionResult> {
        return requiredPermissions.map { permission ->
            checkPermission(permission)
        }
    }

    /**
     * Check if app is installed
     */
    fun isAppInstalled(packageName: String): Boolean {
        return try {
            context.packageManager.getPackageInfo(packageName, 0)
            true
        } catch (e: PackageManager.NameNotFoundException) {
            false
        } catch (e: Exception) {
            Log.e(TAG, "Error checking app installation: $packageName", e)
            false
        }
    }

    /**
     * Check if action is allowed
     */
    fun isActionAllowed(action: IrisAction): Boolean {
        return when (action.type) {
            in safeActions -> true
            in cautionActions -> checkCautionAction(action)
            else -> false
        }
    }

    /**
     * Check caution action
     */
    private fun checkCautionAction(action: IrisAction): Boolean {
        // Check if action contains sensitive keywords
        val text = action.text ?: ""
        val target = action.target ?: ""
        
        val combined = "$text $target".lowercase()
        
        // Check for sensitive keywords
        val hasSensitiveKeyword = sensitiveKeywords.any { keyword ->
            combined.contains(keyword, ignoreCase = true)
        }

        // For now, allow caution actions but they might need confirmation
        return true
    }

    /**
     * Check if action requires confirmation
     */
    fun requiresConfirmation(action: IrisAction): Boolean {
        return action.requiresConfirmation || isSensitiveAction(action)
    }

    /**
     * Check if action is sensitive
     */
    fun isSensitiveAction(action: IrisAction): Boolean {
        val text = action.text ?: ""
        val target = action.target ?: ""
        
        val combined = "$text $target".lowercase()
        
        return sensitiveKeywords.any { keyword ->
            combined.contains(keyword, ignoreCase = true)
        }
    }

    /**
     * Check if command requires confirmation
     */
    fun requiresConfirmation(command: String): Boolean {
        val lowerCommand = command.lowercase()
        return sensitiveKeywords.any { keyword ->
            lowerCommand.contains(keyword, ignoreCase = true)
        }
    }

    /**
     * Get safety level for action
     */
    fun getSafetyLevel(action: IrisAction): SafetyLevel {
        return when (action.type) {
            in safeActions -> SafetyLevel.SAFE
            in cautionActions -> SafetyLevel.CAUTION
            else -> SafetyLevel.DANGEROUS
        }
    }

    /**
     * Get intent to request accessibility service
     */
    fun getAccessibilityIntent(): Intent {
        return Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    }

    /**
     * Check if all required permissions are granted
     */
    fun areAllPermissionsGranted(): Boolean {
        return checkAllPermissions().all { it.granted }
    }

    /**
     * Get missing permissions
     */
    fun getMissingPermissions(): List<PermissionResult> {
        return checkAllPermissions().filter { !it.granted }
    }

    /**
     * Get intent to open app settings
     */
    fun getAppSettingsIntent(): Intent {
        return Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = android.net.Uri.fromParts("package", context.packageName, null)
        }
    }
}
