package com.example.iris

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings

object AppController {
    private val aliases = mapOf(
        "whatsapp" to "com.whatsapp", "youtube" to "com.google.android.youtube",
        "chrome" to "com.android.chrome", "google chrome" to "com.android.chrome",
        "instagram" to "com.instagram.android", "facebook" to "com.facebook.katana",
        "telegram" to "org.telegram.messenger", "spotify" to "com.spotify.music",
        "gmail" to "com.google.android.gm", "maps" to "com.google.android.apps.maps",
        "google maps" to "com.google.android.apps.maps", "play store" to "com.android.vending",
        "settings" to "com.android.settings"
    )

    fun openApp(context: Context, appNameOrPackage: String): Boolean {
        val packageName = aliases[appNameOrPackage.trim().lowercase()] ?: appNameOrPackage.trim()
        return try {
            context.packageManager.getLaunchIntentForPackage(packageName)?.let {
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(it)
                true
            } ?: false
        } catch (_: Exception) { false }
    }

    fun isInstalled(context: Context, packageName: String): Boolean =
        try { context.packageManager.getApplicationInfo(packageName, 0); true }
        catch (_: PackageManager.NameNotFoundException) { false }

    fun openAccessibilitySettings(context: Context): Boolean = try {
        context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); true
    } catch (_: Exception) { false }

    fun openAppSettings(context: Context, packageName: String): Boolean = try {
        context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:$packageName"); addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }); true
    } catch (_: Exception) { false }

    fun back() = IrisAccessibilityService.performGlobalBack()
    fun home() = IrisAccessibilityService.performGlobalHome()
    fun recents() = IrisAccessibilityService.performGlobalRecents()
    fun tapText(text: String) = IrisAccessibilityService.tapText(text)
    fun scrollForward() = IrisAccessibilityService.scrollForward()
    fun scrollBackward() = IrisAccessibilityService.scrollBackward()
}
