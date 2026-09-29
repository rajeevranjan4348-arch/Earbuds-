package com.example.iris

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

/**
 * Keeps Iris's approved background agent session alive while Android allows it.
 *
 * This service does not bypass Android restrictions and does not silently
 * control other apps. Accessibility actions still require the user-enabled
 * AccessibilityService.
 */
class IrisBackgroundService : Service() {

    companion object {
        const val ACTION_START = "com.example.iris.action.BACKGROUND_START"
        const val ACTION_STOP = "com.example.iris.action.BACKGROUND_STOP"
        private const val CHANNEL_ID = "iris_background_agent"
        private const val NOTIFICATION_ID = 7401

        fun startIntent(context: android.content.Context): Intent =
            Intent(context, IrisBackgroundService::class.java).setAction(ACTION_START)

        fun stopIntent(context: android.content.Context): Intent =
            Intent(context, IrisBackgroundService::class.java).setAction(ACTION_STOP)
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                startForeground(NOTIFICATION_ID, buildNotification())
                // START_STICKY lets Android recreate the service after ordinary
                // process pressure; it does not override force-stop/restrictions.
                return START_STICKY
            }
        }
    }

    private fun buildNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_sync)
            .setContentTitle("Iris AI")
            .setContentText("Background agent is active")
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    "Iris Background Agent",
                    NotificationManager.IMPORTANCE_LOW
                )
            )
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
