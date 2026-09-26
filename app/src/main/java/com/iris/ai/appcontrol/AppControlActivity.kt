/*
 * AppControlActivity.kt
 * Main activity for app control features
 * Provides UI for manual app control and settings
 */

package com.iris.ai.appcontrol

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.ListView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.iris.ai.IrisAppControlManager

/**
 * Main activity for app control features
 * Provides a UI for users to manually control apps and configure settings
 */
class AppControlActivity : AppCompatActivity() {
    
    companion object {
        private const val TAG = "AppControlActivity"
        
        // Intent actions
        const val ACTION_OPEN_APP_CONTROL = "com.iris.ai.ACTION_OPEN_APP_CONTROL"
        const val ACTION_VOICE_COMMAND = "com.iris.ai.ACTION_VOICE_COMMAND"
        const val EXTRA_COMMAND = "extra_command"
        
        // Request codes
        private const val REQUEST_CODE_ACCESSIBILITY = 1001
        private const val REQUEST_CODE_APP_SELECTION = 1002
    }
    
    private lateinit var appControlManager: IrisAppControlManager
    private lateinit var quickActionManager: QuickActionManager
    private lateinit var appResolver: AppResolver
    private lateinit var appController: AppController
    private lateinit var permissionManager: PermissionManager
    
    // UI components
    private lateinit var commandInput: EditText
    private lateinit var executeButton: Button
    private lateinit var stopButton: Button
    private lateinit var statusText: TextView
    private lateinit var appSpinner: Spinner
    private lateinit var actionSpinner: Spinner
    private lateinit var quickActionsList: ListView
    private lateinit var accessibilityStatus: TextView
    private lateinit var accessibilityButton: Button
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Initialize managers
        appControlManager = IrisAppControlManager.getInstance(this)
        quickActionManager = QuickActionManagerSingleton.getInstance(this)
        appResolver = AppResolver(this)
        appController = AppController(this)
        permissionManager = PermissionManager(this)
        
        // Check if we should handle a voice command
        handleVoiceCommandIntent(intent)
        
        // Set content view
        setContentView(android.R.layout.activity_list_item)
        
        // Initialize UI
        initializeUI()
        
        // Update status
        updateAccessibilityStatus()
        
        Log.d(TAG, "AppControlActivity created")
    }
    
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleVoiceCommandIntent(intent)
    }
    
    /**
     * Handle voice command intent
     */
    private fun handleVoiceCommandIntent(intent: Intent) {
        when (intent.action) {
            ACTION_VOICE_COMMAND -> {
                val command = intent.getStringExtra(EXTRA_COMMAND)
                if (!command.isNullOrEmpty()) {
                    executeCommand(command)
                }
            }
            
            ACTION_OPEN_APP_CONTROL -> {
                // Just show the UI
            }
            
            Intent.ACTION_VIEW -> {
                // Handle deep links
                val data = intent.data
                data?.let { uri ->
                    handleDeepLink(uri)
                }
            }
        }
    }
    
    /**
     * Handle deep links
     */
    private fun handleDeepLink(uri: android.net.Uri) {
        val path = uri.path ?: return
        
        when {
            path.startsWith("/open/") -> {
                val appName = path.substringAfter("/open/")
                openApp(appName)
            }
            path.startsWith("/search/") -> {
                val parts = path.substringAfter("/search/").split("/")
                val appName = if (parts.size > 1) parts[0] else "Chrome"
                val query = if (parts.size > 1) parts[1] else parts[0]
                search(appName, query)
            }
            path.startsWith("/message/") -> {
                val parts = path.substringAfter("/message/").split("/")
                if (parts.size >= 2) {
                    val appName = parts[0]
                    val recipient = parts[1]
                    val message = if (parts.size > 2) parts[2] else ""
                    sendMessage(appName, recipient, message)
                }
            }
        }
    }
    
    /**
     * Initialize UI components
     */
    private fun initializeUI() {
        // Note: This is a simplified implementation
        // In a real app, you would use a custom layout with proper UI
        
        // For now, just set up basic functionality
        commandInput = EditText(this).apply {
            hint = "Enter command (e.g., 'Open YouTube and search Hindi songs')"
        }
        
        executeButton = Button(this).apply {
            text = "Execute"
            setOnClickListener { executeCommandFromInput() }
        }
        
        stopButton = Button(this).apply {
            text = "Stop"
            setOnClickListener { stopExecution() }
        }
        
        statusText = TextView(this).apply {
            text = "Ready"
        }
        
        accessibilityStatus = TextView(this).apply {
            text = "Accessibility: Checking..."
        }
        
        accessibilityButton = Button(this).apply {
            text = "Enable Accessibility"
            setOnClickListener { requestAccessibility() }
        }
        
        // Set up quick actions list
        setupQuickActionsList()
        
        // Set up app spinner
        setupAppSpinner()
    }
    
    /**
     * Set up quick actions list
     */
    private fun setupQuickActionsList() {
        val actions = quickActionManager.getAllQuickActions()
            .sortedBy { it.name }
        
        val actionNames = actions.map { it.name }
        
        quickActionsList = ListView(this).apply {
            adapter = ArrayAdapter(this@AppControlActivity, android.R.layout.simple_list_item_1, actionNames)
            onItemClickListener = AdapterView.OnItemClickListener { _, _, position, _ ->
                val action = actions[position]
                executeQuickAction(action.id)
            }
        }
    }
    
    /**
     * Set up app spinner
     */
    private fun setupAppSpinner() {
        val installedApps = appResolver.getInstalledApps()
            .sortedBy { it.appName }
        
        val appNames = installedApps.map { it.appName }
        
        appSpinner = Spinner(this).apply {
            adapter = ArrayAdapter(this@AppControlActivity, android.R.layout.simple_spinner_item, appNames)
        }
        
        // Set up action spinner
        val actions = listOf("Open", "Search", "Send Message", "Close")
        actionSpinner = Spinner(this).apply {
            adapter = ArrayAdapter(this@AppControlActivity, android.R.layout.simple_spinner_item, actions)
        }
    }
    
    /**
     * Update accessibility status
     */
    private fun updateAccessibilityStatus() {
        val isEnabled = permissionManager.checkAccessibilityEnabled()
        accessibilityStatus.text = if (isEnabled) {
            "Accessibility: Enabled ✓"
        } else {
            "Accessibility: Not Enabled ✗"
        }
        accessibilityButton.visibility = if (isEnabled) View.GONE else View.VISIBLE
    }
    
    /**
     * Request accessibility permission
     */
    private fun requestAccessibility() {
        val intent = permissionManager.getAccessibilityIntent()
        startActivityForResult(intent, REQUEST_CODE_ACCESSIBILITY)
    }
    
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        
        if (requestCode == REQUEST_CODE_ACCESSIBILITY) {
            updateAccessibilityStatus()
            if (resultCode == Activity.RESULT_OK) {
                Toast.makeText(this, "Accessibility enabled!", Toast.LENGTH_SHORT).show()
            }
        }
    }
    
    /**
     * Execute command from input
     */
    private fun executeCommandFromInput() {
        val command = commandInput.text.toString().trim()
        if (command.isNotEmpty()) {
            executeCommand(command)
        }
    }
    
    /**
     * Execute a command
     */
    private fun executeCommand(command: String) {
        statusText.text = "Executing: $command..."
        
        val result = appControlManager.processCommand(command)
        
        statusText.text = result.message
        
        if (result.success) {
            Toast.makeText(this, result.message, Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "Error: ${result.message}", Toast.LENGTH_LONG).show()
        }
        
        Log.d(TAG, "Command result: ${result.message}")
    }
    
    /**
     * Execute a quick action
     */
    private fun executeQuickAction(actionId: String) {
        statusText.text = "Executing quick action: $actionId..."
        
        val result = quickActionManager.executeQuickAction(actionId)
        
        statusText.text = result.message
        
        if (result.success) {
            Toast.makeText(this, result.message, Toast.LENGTH_SHORT).show()
        } else if (result.requiresAccessibility) {
            Toast.makeText(this, "Please enable Accessibility Service", Toast.LENGTH_LONG).show()
            requestAccessibility()
        } else if (result.requiresConfirmation) {
            Toast.makeText(this, result.confirmationMessage, Toast.LENGTH_LONG).show()
        } else {
            Toast.makeText(this, "Error: ${result.message}", Toast.LENGTH_LONG).show()
        }
        
        Log.d(TAG, "Quick action result: ${result.message}")
    }
    
    /**
     * Open an app
     */
    private fun openApp(appName: String) {
        executeCommand("Open $appName")
    }
    
    /**
     * Search in an app
     */
    private fun search(appName: String, query: String) {
        executeCommand("$appName search $query")
    }
    
    /**
     * Send a message
     */
    private fun sendMessage(appName: String, recipient: String, message: String) {
        executeCommand("$appName message $recipient: $message")
    }
    
    /**
     * Stop execution
     */
    private fun stopExecution() {
        appControlManager.stopExecution()
        statusText.text = "Stopped"
        Toast.makeText(this, "All actions stopped", Toast.LENGTH_SHORT).show()
        Log.d(TAG, "Execution stopped")
    }
    
    /**
     * Check if accessibility is enabled
     */
    fun isAccessibilityEnabled(): Boolean {
        return permissionManager.checkAccessibilityEnabled()
    }
    
    /**
     * Create intent to open this activity
     */
    companion object {
        fun createIntent(context: Context): Intent {
            return Intent(context, AppControlActivity::class.java).apply {
                action = ACTION_OPEN_APP_CONTROL
            }
        }
        
        fun createVoiceCommandIntent(context: Context, command: String): Intent {
            return Intent(context, AppControlActivity::class.java).apply {
                action = ACTION_VOICE_COMMAND
                putExtra(EXTRA_COMMAND, command)
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
        }
    }
}

/**
 * App control settings activity
 */
class AppControlSettingsActivity : AppCompatActivity() {
    
    companion object {
        private const val TAG = "AppControlSettings"
    }
    
    private lateinit var permissionManager: PermissionManager
    private lateinit var quickActionManager: QuickActionManager
    private lateinit var usageTracker: AppUsageTracker
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        permissionManager = PermissionManager(this)
        quickActionManager = QuickActionManagerSingleton.getInstance(this)
        usageTracker = AppUsageTrackerSingleton.getInstance(this)
        
        // Set content view
        setContentView(android.R.layout.preference_list_content)
        
        // Initialize UI
        initializeUI()
        
        Log.d(TAG, "AppControlSettingsActivity created")
    }
    
    private fun initializeUI() {
        // Set up settings UI
        val settingsList = ListView(this)
        
        val settings = listOf(
            "Accessibility Service",
            "Quick Actions",
            "Usage Statistics",
            "Clear Data",
            "About"
        )
        
        settingsList.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, settings)
        settingsList.onItemClickListener = AdapterView.OnItemClickListener { _, _, position, _ ->
            when (position) {
                0 -> openAccessibilitySettings()
                1 -> openQuickActionsSettings()
                2 -> openUsageStatistics()
                3 -> showClearDataDialog()
                4 -> showAboutDialog()
            }
        }
        
        setContentView(settingsList)
    }
    
    private fun openAccessibilitySettings() {
        val intent = permissionManager.getAccessibilityIntent()
        startActivity(intent)
    }
    
    private fun openQuickActionsSettings() {
        // Start QuickActionsSettingsActivity
        startActivity(Intent(this, QuickActionsSettingsActivity::class.java))
    }
    
    private fun openUsageStatistics() {
        // Start UsageStatisticsActivity
        startActivity(Intent(this, UsageStatisticsActivity::class.java))
    }
    
    private fun showClearDataDialog() {
        android.app.AlertDialog.Builder(this)
            .setTitle("Clear Data")
            .setMessage("Are you sure you want to clear all app control data? This includes usage history and preferences.")
            .setPositiveButton("Clear") { _, _ ->
                clearAllData()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }
    
    private fun clearAllData() {
        usageTracker.clearAll()
        Toast.makeText(this, "All data cleared", Toast.LENGTH_SHORT).show()
    }
    
    private fun showAboutDialog() {
        android.app.AlertDialog.Builder(this)
            .setTitle("About Iris App Control")
            .setMessage("Iris App Control allows you to control installed apps using natural language voice commands.\n\nVersion: 1.0.0")
            .setPositiveButton("OK", null)
            .show()
    }
}

/**
 * Quick actions settings activity
 */
class QuickActionsSettingsActivity : AppCompatActivity() {
    
    private lateinit var quickActionManager: QuickActionManager
    private lateinit var actionsList: ListView
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        quickActionManager = QuickActionManagerSingleton.getInstance(this)
        
        setContentView(android.R.layout.activity_list_item)
        
        actionsList = ListView(this)
        
        val actions = quickActionManager.getAllQuickActions()
        val actionNames = actions.map { "${it.name} (${it.category})" }
        
        actionsList.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, actionNames)
        actionsList.onItemClickListener = AdapterView.OnItemClickListener { _, _, position, _ ->
            val action = actions[position]
            showActionDetails(action)
        }
        
        setContentView(actionsList)
    }
    
    private fun showActionDetails(action: QuickAction) {
        android.app.AlertDialog.Builder(this)
            .setTitle(action.name)
            .setMessage("Category: ${action.category}\n\nDescription: ${action.description}")
            .setPositiveButton("Execute") { _, _ ->
                executeAction(action)
            }
            .setNegativeButton("Close", null)
            .show()
    }
    
    private fun executeAction(action: QuickAction) {
        val result = quickActionManager.executeQuickAction(action.id)
        Toast.makeText(this, result.message, Toast.LENGTH_SHORT).show()
    }
}

/**
 * Usage statistics activity
 */
class UsageStatisticsActivity : AppCompatActivity() {
    
    private lateinit var usageTracker: AppUsageTracker
    private lateinit var statsList: ListView
    
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        usageTracker = AppUsageTrackerSingleton.getInstance(this)
        
        setContentView(android.R.layout.activity_list_item)
        
        statsList = ListView(this)
        
        val stats = usageTracker.getAllStats()
        val statStrings = stats.map { (_, stat) ->
            "${stat.appName}: ${stat.totalUsage} uses"
        }.sortedDescending()
        
        statsList.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_1, statStrings)
        
        setContentView(statsList)
    }
}
