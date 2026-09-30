package com.example.iris

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings

/**
 * Unified Android app resolver/launcher.
 * Prefers installed launchable packages and never redirects an installed app to Play Store.
 */
object AppController {
    private val aliases = mapOf(
        "whatsapp" to "com.whatsapp",
        "youtube" to "com.google.android.youtube",
        "chrome" to "com.android.chrome",
        "google chrome" to "com.android.chrome",
        "instagram" to "com.instagram.android",
        "facebook" to "com.facebook.katana",
        "telegram" to "org.telegram.messenger",
        "spotify" to "com.spotify.music",
        "gmail" to "com.google.android.gm",
        "maps" to "com.google.android.apps.maps",
        "google maps" to "com.google.android.apps.maps",
        "play store" to "com.android.vending",
        "settings" to "com.android.settings",
        "calculator" to "com.google.android.calculator"
    )

    fun resolvePackage(context: Context, appNameOrPackage: String): String? {
        val query = appNameOrPackage.trim()
        if (query.isBlank()) return null

        val direct = aliases[query.lowercase()] ?: query
        if (isInstalled(context, direct) && context.packageManager.getLaunchIntentForPackage(direct) != null) {
            return direct
        }

        val normalized = query.lowercase().replace(Regex("[^a-z0-9]+"), "")
        val pm = context.packageManager

        return pm.getInstalledApplications(PackageManager.GET_META_DATA)
            .asSequence()
            .filter { pm.getLaunchIntentForPackage(it.packageName) != null }
            .map { app ->
                app.packageName to pm.getApplicationLabel(app).toString()
            }
            .firstOrNull { (packageName, label) ->
                val labelNormalized = label.lowercase().replace(Regex("[^a-z0-9]+"), "")
                labelNormalized == normalized ||
                    labelNormalized.contains(normalized) ||
                    packageName.lowercase() == query.lowercase()
            }
            ?.first
    }

    /**
     * Opens WhatsApp's native share composer with the supplied message prefilled.
     * The user still chooses the chat and taps Send; Iris does not silently send messages.
     */
    fun shareTextToWhatsApp(context: Context, message: String): Boolean {
        if (message.isBlank()) return false
        return try {
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, message)
                setPackage("com.whatsapp")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            context.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun openApp(context: Context, appNameOrPackage: String): Boolean {
        val packageName = resolvePackage(context, appNameOrPackage) ?: return false
        return try {
            val intent = context.packageManager.getLaunchIntentForPackage(packageName) ?: return false
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }


    /** Jarvis-style safe system shortcuts. These open Android settings; they do not silently change protected settings. */
    fun openSystemSettings(context: Context, action: String): Boolean = try {
        val intent = Intent(action).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
        true
    } catch (_: Exception) {
        false
    }

    fun openWifiSettings(context: Context): Boolean =
        openSystemSettings(context, Settings.ACTION_WIFI_SETTINGS)

    fun openBluetoothSettings(context: Context): Boolean =
        openSystemSettings(context, Settings.ACTION_BLUETOOTH_SETTINGS)

    fun openDisplaySettings(context: Context): Boolean =
        openSystemSettings(context, Settings.ACTION_DISPLAY_SETTINGS)

    fun openNotificationSettings(context: Context): Boolean =
        openSystemSettings(context, Settings.ACTION_NOTIFICATION_SETTINGS)

    fun openSoundSettings(context: Context): Boolean =
        openSystemSettings(context, Settings.ACTION_SOUND_SETTINGS)

    fun openBatterySettings(context: Context): Boolean =
        openSystemSettings(context, Settings.ACTION_BATTERY_SAVER_SETTINGS)

    fun openDateTimeSettings(context: Context): Boolean =
        openSystemSettings(context, Settings.ACTION_DATE_SETTINGS)

    fun isInstalled(context: Context, packageName: String): Boolean =
        try {
            context.packageManager.getApplicationInfo(packageName, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }

    fun openAccessibilitySettings(context: Context): Boolean = try {
        context.startActivity(
            Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
        true
    } catch (_: Exception) {
        false
    }

    fun openAppSettings(context: Context, packageName: String): Boolean = try {
        context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:$packageName")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        })
        true
    } catch (_: Exception) {
        false
    }

    fun back(): Boolean = IrisAccessibilityService.instance?.performBack() == true
    fun home(): Boolean = IrisAccessibilityService.instance?.performHome() == true
    fun recents(): Boolean = IrisAccessibilityService.instance?.performRecents() == true
    fun tapText(text: String): Boolean = IrisAccessibilityService.instance?.clickText(text) == true
    fun scrollForward(): Boolean = IrisAccessibilityService.instance?.scroll(IrisAccessibilityService.Direction.DOWN) == true
    fun scrollBackward(): Boolean = IrisAccessibilityService.instance?.scroll(IrisAccessibilityService.Direction.UP) == true
}
