/*
 * IRIS — CAPABILITY MAP + PERMISSION MANAGER
 *
 * Foundation module for the Android agent system (spec sections 2 & 3).
 * Every other controller (mic, camera, accessibility, calls, contacts,
 * bluetooth, location, calendar, files) must go through this before
 * touching a protected capability.
 *
 * Rules enforced here:
 *  - never silently grant/assume a permission
 *  - never bypass the Android permission dialog
 *  - least-privilege: callers ask for exactly the capability they need
 *  - when a capability can't be requested via a runtime dialog
 *    (accessibility service, notification listener), route the user to
 *    the correct system settings screen instead of pretending it's on
 *
 * Does not touch any existing UI/activity — pure infrastructure.
 */

package com.example.iris

import android.Manifest
import android.accessibilityservice.AccessibilityServiceInfo
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.view.accessibility.AccessibilityManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

/** One entry per capability the spec's capability map defines. */
enum class IrisCapability {
    MICROPHONE,
    CAMERA,
    LOCATION,
    NOTIFICATIONS,
    ACCESSIBILITY,
    BLUETOOTH,
    CONTACTS,
    CALENDAR,
    FILES,
    CALLS,
    MESSAGING
}

/**
 * Result of checking a capability.
 * @param available true only if Iris can use this capability right now
 * @param androidPermissions the underlying Android permission string(s), if any
 * @param requiresSettingsScreen true when this can't be granted via a runtime
 *        dialog and must be turned on from a system Settings screen instead
 *        (accessibility service, notification listener access)
 */
data class CapabilityStatus(
    val capability: IrisCapability,
    val available: Boolean,
    val androidPermissions: List<String>,
    val requiresSettingsScreen: Boolean = false
)

object PermissionManager {

    /** Runtime (dialog-requestable) permissions per capability, where applicable. */
    private fun runtimePermissionsFor(capability: IrisCapability): List<String> = when (capability) {
        IrisCapability.MICROPHONE -> listOf(Manifest.permission.RECORD_AUDIO)
        IrisCapability.CAMERA -> listOf(Manifest.permission.CAMERA)
        IrisCapability.LOCATION -> listOf(Manifest.permission.ACCESS_FINE_LOCATION)
        IrisCapability.CONTACTS -> listOf(Manifest.permission.READ_CONTACTS)
        IrisCapability.CALENDAR -> listOf(Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR)
        IrisCapability.CALLS -> listOf(Manifest.permission.CALL_PHONE)
        IrisCapability.MESSAGING -> listOf(Manifest.permission.SEND_SMS)
        IrisCapability.BLUETOOTH ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                listOf(Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN)
            else
                emptyList() // pre-S bluetooth state doesn't need a runtime permission
        IrisCapability.FILES ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU)
                listOf(Manifest.permission.READ_MEDIA_IMAGES)
            else
                listOf(Manifest.permission.READ_EXTERNAL_STORAGE)
        // Accessibility + Notifications are not runtime-dialog permissions.
        IrisCapability.ACCESSIBILITY, IrisCapability.NOTIFICATIONS -> emptyList()
    }

    private fun needsSettingsScreen(capability: IrisCapability): Boolean =
        capability == IrisCapability.ACCESSIBILITY || capability == IrisCapability.NOTIFICATIONS

    /** Check a single capability's current status. Never grants anything itself. */
    fun check(context: Context, capability: IrisCapability): CapabilityStatus {
        val perms = runtimePermissionsFor(capability)
        val available = when {
            capability == IrisCapability.ACCESSIBILITY -> isAccessibilityServiceEnabled(context)
            capability == IrisCapability.NOTIFICATIONS -> isNotificationListenerEnabled(context)
            perms.isEmpty() -> true // no gate for this Android version/capability
            else -> perms.all {
                ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED
            }
        }
        return CapabilityStatus(
            capability = capability,
            available = available,
            androidPermissions = perms,
            requiresSettingsScreen = needsSettingsScreen(capability)
        )
    }

    /** Build the full capability map the spec's startup discovery step expects. */
    fun buildCapabilityMap(context: Context): Map<IrisCapability, Boolean> =
        IrisCapability.values().associateWith { check(context, it).available }

    /**
     * Request a capability's runtime permission(s) via the standard Android
     * dialog. No-op (returns false) for capabilities that require a settings
     * screen instead — call [openSettingsFor] for those.
     */
    fun requestPermission(activity: Activity, capability: IrisCapability, requestCode: Int): Boolean {
        val status = check(activity, capability)
        if (status.available) return true
        if (status.requiresSettingsScreen || status.androidPermissions.isEmpty()) return false

        ActivityCompat.requestPermissions(activity, status.androidPermissions.toTypedArray(), requestCode)
        return true
    }

    /**
     * Open the correct system settings screen for capabilities that can't be
     * granted through a runtime dialog, or as a fallback when a runtime
     * permission was permanently denied ("don't ask again").
     */
    fun openSettingsFor(context: Context, capability: IrisCapability) {
        val intent = when (capability) {
            IrisCapability.ACCESSIBILITY -> Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            IrisCapability.NOTIFICATIONS -> Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
            else -> Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.fromParts("package", context.packageName, null)
            }
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    // ------------------------------------------------------------------
    // Special-case checks that aren't ordinary runtime permissions
    // ------------------------------------------------------------------

    /**
     * True if the user has explicitly enabled Iris's AccessibilityService
     * in system settings. Update SERVICE_CLASS_NAME once the actual service
     * (spec section 7 / IrisPhoneController) is registered in the manifest.
     */
    private fun isAccessibilityServiceEnabled(context: Context): Boolean {
        val am = context.getSystemService(Context.ACCESSIBILITY_SERVICE) as? AccessibilityManager
            ?: return false
        val enabledServices = am.getEnabledAccessibilityServiceList(
            AccessibilityServiceInfo.FEEDBACK_ALL_MASK
        )
        return enabledServices.any { it.resolveInfo.serviceInfo.packageName == context.packageName }
    }

    private fun isNotificationListenerEnabled(context: Context): Boolean {
        val flat = Settings.Secure.getString(context.contentResolver, "enabled_notification_listeners")
            ?: return false
        return flat.contains(context.packageName)
    }
}
