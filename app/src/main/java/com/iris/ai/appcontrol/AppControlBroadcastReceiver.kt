/*
 * AppControlBroadcastReceiver.kt
 * Handles broadcast intents for remote app control
 * Allows Iris to receive commands from other apps or system events
 */

package com.iris.ai.appcontrol

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * Broadcast receiver for app control commands
 * Receives intents and forwards them to the AppControlManager
 */
class AppControlBroadcastReceiver : BroadcastReceiver() {
    
    companion object {
        private const val TAG = "AppControlReceiver"
        
        // Action constants for broadcast intents
        const val ACTION_APP_CONTROL = "com.iris.ai.ACTION_APP_CONTROL"
        const val ACTION_OPEN_APP = "com.iris.ai.ACTION_OPEN_APP"
        const val ACTION_SEARCH = "com.iris.ai.ACTION_SEARCH"
        const val ACTION_SEND_MESSAGE = "com.iris.ai.ACTION_SEND_MESSAGE"
        const val ACTION_STOP = "com.iris.ai.ACTION_STOP"
        const val ACTION_EXECUTE_COMMAND = "com.iris.ai.ACTION_EXECUTE_COMMAND"
        
        // Extra keys
        const val EXTRA_COMMAND = "extra_command"
        const val EXTRA_APP_NAME = "extra_app_name"
        const val EXTRA_QUERY = "extra_query"
        const val EXTRA_RECIPIENT = "extra_recipient"
        const val EXTRA_MESSAGE = "extra_message"
    }
    
    private var appControlManager: IrisAppControlManager? = null
    private var context: Context? = null
    
    override fun onReceive(context: Context, intent: Intent) {
        this.context = context
        
        if (appControlManager == null) {
            appControlManager = IrisAppControlManager.getInstance(context)
        }
        
        val action = intent.action
        Log.d(TAG, "Received broadcast: $action")
        
        when (action) {
            ACTION_APP_CONTROL,
            ACTION_EXECUTE_COMMAND -> {
                val command = intent.getStringExtra(EXTRA_COMMAND)
                if (!command.isNullOrEmpty()) {
                    executeCommand(command)
                }
            }
            
            ACTION_OPEN_APP -> {
                val appName = intent.getStringExtra(EXTRA_APP_NAME)
                if (!appName.isNullOrEmpty()) {
                    openApp(appName)
                }
            }
            
            ACTION_SEARCH -> {
                val query = intent.getStringExtra(EXTRA_QUERY)
                val appName = intent.getStringExtra(EXTRA_APP_NAME)
                if (!query.isNullOrEmpty()) {
                    search(appName, query)
                }
            }
            
            ACTION_SEND_MESSAGE -> {
                val recipient = intent.getStringExtra(EXTRA_RECIPIENT)
                val message = intent.getStringExtra(EXTRA_MESSAGE)
                val appName = intent.getStringExtra(EXTRA_APP_NAME) ?: "WhatsApp"
                if (!recipient.isNullOrEmpty() && !message.isNullOrEmpty()) {
                    sendMessage(appName, recipient, message)
                }
            }
            
            ACTION_STOP -> {
                stopExecution()
            }
            
            else -> {
                Log.w(TAG, "Unknown action: $action")
            }
        }
    }
    
    /**
     * Set the app control manager (for testing)
     */
    fun setAppControlManager(manager: IrisAppControlManager) {
        this.appControlManager = manager
    }
    
    /**
     * Execute a natural language command
     */
    private fun executeCommand(command: String) {
        appControlManager?.let { manager ->
            Log.d(TAG, "Executing command: $command")
            val result = manager.processCommand(command)
            Log.d(TAG, "Command result: ${result.message}")
            
            // Broadcast result if needed
            sendResultBroadcast(command, result.message, result.success)
        } ?: run {
            Log.e(TAG, "AppControlManager not initialized")
        }
    }
    
    /**
     * Open an app
     */
    private fun openApp(appName: String) {
        appControlManager?.let { manager ->
            Log.d(TAG, "Opening app: $appName")
            val result = manager.openApp(appName)
            Log.d(TAG, "Open app result: ${result.message}")
            sendResultBroadcast("open:$appName", result.message, result.success)
        }
    }
    
    /**
     * Perform a search
     */
    private fun search(appName: String?, query: String) {
        appControlManager?.let { manager ->
            val targetApp = appName ?: "Chrome"
            Log.d(TAG, "Searching $targetApp for: $query")
            
            val actions = when (targetApp) {
                "YouTube" -> manager.planYouTubeSearch(query)
                "Chrome" -> manager.planChromeSearch(query)
                "Maps" -> manager.planMapsSearch(query)
                else -> manager.planSearch(targetApp, query)
            }
            
            val success = manager.executeActionsDirect(actions)
            sendResultBroadcast("search:$query", "Searching $targetApp for: $query", success)
        }
    }
    
    /**
     * Send a message
     */
    private fun sendMessage(appName: String, recipient: String, message: String) {
        appControlManager?.let { manager ->
            Log.d(TAG, "Sending message to $recipient via $appName: $message")
            
            val actions = when (appName) {
                "WhatsApp" -> manager.planWhatsAppMessage(recipient, message)
                "Messages" -> manager.planSmsMessage(recipient, message)
                else -> manager.planSendMessage(appName, recipient, message)
            }
            
            val success = manager.executeActionsDirect(actions)
            sendResultBroadcast("message:$recipient", "Message sent via $appName", success)
        }
    }
    
    /**
     * Stop current execution
     */
    private fun stopExecution() {
        appControlManager?.let { manager ->
            Log.d(TAG, "Stopping execution")
            manager.stopExecution()
            sendResultBroadcast("stop", "Execution stopped", true)
        }
    }
    
    /**
     * Send result broadcast
     */
    private fun sendResultBroadcast(command: String, message: String, success: Boolean) {
        context?.let { ctx ->
            val resultIntent = Intent(ACTION_APP_CONTROL + ".RESULT").apply {
                putExtra(EXTRA_COMMAND, command)
                putExtra("extra_message", message)
                putExtra("extra_success", success)
            }
            ctx.sendBroadcast(resultIntent)
        }
    }
    
    /**
     * Create intent for app control
     */
    fun createAppControlIntent(command: String): Intent {
        return Intent(ACTION_EXECUTE_COMMAND).apply {
            putExtra(EXTRA_COMMAND, command)
        }
    }
    
    /**
     * Create intent to open an app
     */
    fun createOpenAppIntent(appName: String): Intent {
        return Intent(ACTION_OPEN_APP).apply {
            putExtra(EXTRA_APP_NAME, appName)
        }
    }
    
    /**
     * Create intent to search
     */
    fun createSearchIntent(query: String, appName: String? = null): Intent {
        return Intent(ACTION_SEARCH).apply {
            putExtra(EXTRA_QUERY, query)
            appName?.let { putExtra(EXTRA_APP_NAME, it) }
        }
    }
    
    /**
     * Create intent to send a message
     */
    fun createSendMessageIntent(
        recipient: String,
        message: String,
        appName: String = "WhatsApp"
    ): Intent {
        return Intent(ACTION_SEND_MESSAGE).apply {
            putExtra(EXTRA_RECIPIENT, recipient)
            putExtra(EXTRA_MESSAGE, message)
            putExtra(EXTRA_APP_NAME, appName)
        }
    }
    
    /**
     * Create stop intent
     */
    fun createStopIntent(): Intent {
        return Intent(ACTION_STOP)
    }
}

/**
 * Helper to register the receiver
 */
fun registerAppControlReceiver(
    context: Context,
    receiver: AppControlBroadcastReceiver
): Intent? {
    return try {
        val filter = IntentFilter().apply {
            addAction(AppControlBroadcastReceiver.ACTION_APP_CONTROL)
            addAction(AppControlBroadcastReceiver.ACTION_OPEN_APP)
            addAction(AppControlBroadcastReceiver.ACTION_SEARCH)
            addAction(AppControlBroadcastReceiver.ACTION_SEND_MESSAGE)
            addAction(AppControlBroadcastReceiver.ACTION_STOP)
            addAction(AppControlBroadcastReceiver.ACTION_EXECUTE_COMMAND)
        }
        context.registerReceiver(receiver, filter)
        Log.d("AppControlReceiver", "Broadcast receiver registered")
        filter
    } catch (e: Exception) {
        Log.e("AppControlReceiver", "Failed to register receiver", e)
        null
    }
}

/**
 * Helper to unregister the receiver
 */
fun unregisterAppControlReceiver(
    context: Context,
    receiver: AppControlBroadcastReceiver
) {
    try {
        context.unregisterReceiver(receiver)
        Log.d("AppControlReceiver", "Broadcast receiver unregistered")
    } catch (e: Exception) {
        Log.e("AppControlReceiver", "Failed to unregister receiver", e)
    }
}
