/*
 * WidgetProvider.kt
 * Provides home screen widgets for quick app control access
 */

package com.iris.ai.appcontrol

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews
import com.iris.ai.IrisAppControlManager

/**
 * App Widget Provider for Iris App Control
 * Provides home screen widgets for quick access to app control features
 */
class IrisAppControlWidget : AppWidgetProvider() {
    
    companion object {
        private const val TAG = "IrisAppControlWidget"
        
        // Widget types
        const val WIDGET_SINGLE_ACTION = "single_action"
        const val WIDGET_MULTI_ACTION = "multi_action"
        const val WIDGET_QUICK_ACTIONS = "quick_actions"
        
        // Widget update actions
        const val ACTION_UPDATE_WIDGET = "com.iris.ai.ACTION_UPDATE_WIDGET"
        const val ACTION_WIDGET_CLICK = "com.iris.ai.ACTION_WIDGET_CLICK"
        const val EXTRA_WIDGET_TYPE = "extra_widget_type"
        const val EXTRA_ACTION_ID = "extra_action_id"
        const val EXTRA_APP_NAME = "extra_app_name"
        
        // Update interval (30 minutes)
        private const val UPDATE_INTERVAL_MS = 30 * 60 * 1000L
    }
    
    /**
     * Update all widgets
     */
    fun updateAllWidgets(context: Context) {
        val manager = AppWidgetManager.getInstance(context)
        val component = ComponentName(context, IrisAppControlWidget::class.java)
        val widgetIds = manager.getAppWidgetIds(component)
        
        widgetIds.forEach { widgetId ->
            updateAppWidget(context, manager, widgetId)
        }
        
        Log.d(TAG, "Updated ${widgetIds.size} widgets")
    }
    
    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        // Update all widgets
        appWidgetIds.forEach { widgetId ->
            updateAppWidget(context, appWidgetManager, widgetId)
        }
        
        // Schedule periodic updates
        scheduleWidgetUpdate(context)
    }
    
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_UPDATE_WIDGET -> {
                val widgetIds = intent.getIntArrayExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS)
                if (widgetIds != null) {
                    val manager = AppWidgetManager.getInstance(context)
                    widgetIds.forEach { widgetId ->
                        updateAppWidget(context, manager, widgetId)
                    }
                } else {
                    updateAllWidgets(context)
                }
            }
            
            ACTION_WIDGET_CLICK -> {
                val actionId = intent.getStringExtra(EXTRA_ACTION_ID)
                val appName = intent.getStringExtra(EXTRA_APP_NAME)
                
                Log.d(TAG, "Widget click: action=$actionId, app=$appName")
                
                // Execute the action
                executeWidgetAction(context, actionId, appName)
            }
            
            else -> {
                super.onReceive(context, intent)
            }
        }
    }
    
    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        // Clean up when widgets are deleted
        super.onDeleted(context, appWidgetIds)
        Log.d(TAG, "Widgets deleted: ${appWidgetIds.size}")
    }
    
    override fun onEnabled(context: Context) {
        // Called when first widget is placed
        super.onEnabled(context)
        Log.d(TAG, "Widget enabled")
        
        // Initialize widget data
        initializeWidgetData(context)
    }
    
    override fun onDisabled(context: Context) {
        // Called when last widget is removed
        super.onDisabled(context)
        Log.d(TAG, "Widget disabled")
    }
    
    /**
     * Update a single widget
     */
    private fun updateAppWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        // Get widget preferences
        val widgetType = getWidgetType(context, appWidgetId)
        
        val views = RemoteViews(context.packageName, android.R.layout.simple_list_item_1)
        
        when (widgetType) {
            WIDGET_SINGLE_ACTION -> {
                setupSingleActionWidget(context, views, appWidgetId)
            }
            WIDGET_MULTI_ACTION -> {
                setupMultiActionWidget(context, views, appWidgetId)
            }
            WIDGET_QUICK_ACTIONS -> {
                setupQuickActionsWidget(context, views, appWidgetId)
            }
            else -> {
                setupDefaultWidget(context, views, appWidgetId)
            }
        }
        
        // Set up click handlers
        setupWidgetClickHandlers(context, views, appWidgetId, widgetType)
        
        // Update the widget
        appWidgetManager.updateAppWidget(appWidgetId, views)
    }
    
    /**
     * Set up single action widget
     */
    private fun setupSingleActionWidget(
        context: Context,
        views: RemoteViews,
        appWidgetId: Int
    ) {
        // Get the configured action
        val actionId = getWidgetAction(context, appWidgetId)
        val quickActionManager = QuickActionManagerSingleton.getInstance(context)
        val action = quickActionManager.getQuickAction(actionId)
        
        if (action != null) {
            views.setTextViewText(android.R.id.text1, action.name)
            
            // Set icon if possible
            try {
                views.setImageViewResource(android.R.id.icon, action.iconResId)
            } catch (e: Exception) {
                // Icon setting might fail on some Android versions
            }
        } else {
            views.setTextViewText(android.R.id.text1, "Iris App Control")
        }
    }
    
    /**
     * Set up multi-action widget
     */
    private fun setupMultiActionWidget(
        context: Context,
        views: RemoteViews,
        appWidgetId: Int
    ) {
        val quickActionManager = QuickActionManagerSingleton.getInstance(context)
        val popularActions = quickActionManager.getPopularQuickActions(3)
        
        if (popularActions.isNotEmpty()) {
            // For simplicity, just show the first action
            views.setTextViewText(android.R.id.text1, popularActions[0].name)
        } else {
            views.setTextViewText(android.R.id.text1, "Iris Actions")
        }
    }
    
    /**
     * Set up quick actions widget
     */
    private fun setupQuickActionsWidget(
        context: Context,
        views: RemoteViews,
        appWidgetId: Int
    ) {
        val usageTracker = AppUsageTrackerSingleton.getInstance(context)
        val favoriteApps = usageTracker.getFavoriteApps(1)
        
        if (favoriteApps.isNotEmpty()) {
            views.setTextViewText(android.R.id.text1, "Open ${favoriteApps[0].appName}")
        } else {
            views.setTextViewText(android.R.id.text1, "Open App")
        }
    }
    
    /**
     * Set up default widget
     */
    private fun setupDefaultWidget(
        context: Context,
        views: RemoteViews,
        appWidgetId: Int
    ) {
        views.setTextViewText(android.R.id.text1, "Iris App Control")
    }
    
    /**
     * Set up widget click handlers
     */
    private fun setupWidgetClickHandlers(
        context: Context,
        views: RemoteViews,
        appWidgetId: Int,
        widgetType: String
    ) {
        val clickIntent = Intent(context, IrisAppControlWidget::class.java).apply {
            action = ACTION_WIDGET_CLICK
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            putExtra(EXTRA_WIDGET_TYPE, widgetType)
        }
        
        // For single action widget, get the action ID
        if (widgetType == WIDGET_SINGLE_ACTION) {
            val actionId = getWidgetAction(context, appWidgetId)
            clickIntent.putExtra(EXTRA_ACTION_ID, actionId)
        }
        
        // For quick actions widget, get the app name
        if (widgetType == WIDGET_QUICK_ACTIONS) {
            val usageTracker = AppUsageTrackerSingleton.getInstance(context)
            val favoriteApps = usageTracker.getFavoriteApps(1)
            if (favoriteApps.isNotEmpty()) {
                clickIntent.putExtra(EXTRA_APP_NAME, favoriteApps[0].appName)
            }
        }
        
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            appWidgetId,
            clickIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        views.setOnClickPendingIntent(android.R.id.text1, pendingIntent)
    }
    
    /**
     * Execute widget action
     */
    private fun executeWidgetAction(
        context: Context,
        actionId: String?,
        appName: String?
    ) {
        val quickActionManager = QuickActionManagerSingleton.getInstance(context)
        
        if (!actionId.isNullOrEmpty()) {
            // Execute specific quick action
            val result = quickActionManager.executeQuickAction(actionId)
            Log.d(TAG, "Widget action result: ${result.message}")
        } else if (!appName.isNullOrEmpty()) {
            // Open the app
            val appController = AppController(context)
            val packageName = AppResolver(context).resolveApp(appName)
            
            if (packageName != null) {
                val result = appController.openApp(packageName)
                Log.d(TAG, "Widget open app result: ${result.message}")
            }
        }
    }
    
    /**
     * Schedule widget updates
     */
    private fun scheduleWidgetUpdate(context: Context) {
        val intent = Intent(context, IrisAppControlWidget::class.java).apply {
            action = ACTION_UPDATE_WIDGET
        }
        
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        // Schedule update in 30 minutes
        android.app.AlarmManager(context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager)
            .setInexactRepeating(
                android.app.AlarmManager.ELAPSED_REALTIME,
                UPDATE_INTERVAL_MS,
                UPDATE_INTERVAL_MS,
                pendingIntent
            )
    }
    
    /**
     * Initialize widget data
     */
    private fun initializeWidgetData(context: Context) {
        // Initialize managers
        IrisAppControlManager.getInstance(context)
        QuickActionManagerSingleton.getInstance(context)
        AppUsageTrackerSingleton.getInstance(context)
        
        Log.d(TAG, "Widget data initialized")
    }
    
    /**
     * Get widget type from preferences
     */
    private fun getWidgetType(context: Context, appWidgetId: Int): String {
        val prefs = context.getSharedPreferences("IrisWidgetPrefs", Context.MODE_PRIVATE)
        return prefs.getString("widget_type_$appWidgetId", WIDGET_SINGLE_ACTION) ?: WIDGET_SINGLE_ACTION
    }
    
    /**
     * Get widget action from preferences
     */
    private fun getWidgetAction(context: Context, appWidgetId: Int): String {
        val prefs = context.getSharedPreferences("IrisWidgetPrefs", Context.MODE_PRIVATE)
        return prefs.getString("widget_action_$appWidgetId", "open_youtube") ?: "open_youtube"
    }
    
    /**
     * Save widget configuration
     */
    fun saveWidgetConfig(
        context: Context,
        appWidgetId: Int,
        widgetType: String,
        actionId: String? = null
    ) {
        val prefs = context.getSharedPreferences("IrisWidgetPrefs", Context.MODE_PRIVATE)
        prefs.edit()
            .putString("widget_type_$appWidgetId", widgetType)
            .apply()
        
        actionId?.let {
            prefs.edit()
                .putString("widget_action_$appWidgetId", it)
                .apply()
        }
        
        // Update the widget
        val manager = AppWidgetManager.getInstance(context)
        updateAppWidget(context, manager, appWidgetId)
    }
}

/**
 * Widget configuration activity
 */
class IrisWidgetConfigActivity : android.app.Activity() {
    
    private lateinit var appWidgetId: Int
    private lateinit var quickActionManager: QuickActionManager
    
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        super.onCreate(savedInstanceState)
        
        // Get widget ID
        appWidgetId = intent?.extras?.getInt(
            AppWidgetManager.EXTRA_APPWIDGET_ID,
            AppWidgetManager.INVALID_APPWIDGET_ID
        ) ?: AppWidgetManager.INVALID_APPWIDGET_ID
        
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        
        quickActionManager = QuickActionManagerSingleton.getInstance(this)
        
        // Show configuration UI
        showConfiguration()
    }
    
    private fun showConfiguration() {
        // For simplicity, just save default config and finish
        // In a real implementation, this would show a UI to select widget type and action
        
        val widget = IrisAppControlWidget()
        widget.saveWidgetConfig(
            this,
            appWidgetId,
            IrisAppControlWidget.WIDGET_SINGLE_ACTION,
            "open_youtube"
        )
        
        // Return result
        val result = Intent().apply {
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
        }
        setResult(RESULT_OK, result)
        finish()
    }
}

/**
 * Widget utility functions
 */

/**
 * Update all Iris widgets
 */
fun updateIrisWidgets(context: Context) {
    val widget = IrisAppControlWidget()
    widget.updateAllWidgets(context)
}

/**
 * Configure a widget
 */
fun configureIrisWidget(
    context: Context,
    appWidgetId: Int,
    widgetType: String,
    actionId: String? = null
) {
    val widget = IrisAppControlWidget()
    widget.saveWidgetConfig(context, appWidgetId, widgetType, actionId)
}

/**
 * Get widget configuration
 */
fun getIrisWidgetConfig(
    context: Context,
    appWidgetId: Int
): Pair<String, String?> {
    val prefs = context.getSharedPreferences("IrisWidgetPrefs", Context.MODE_PRIVATE)
    val widgetType = prefs.getString("widget_type_$appWidgetId", IrisAppControlWidget.WIDGET_SINGLE_ACTION)
    val actionId = prefs.getString("widget_action_$appWidgetId", null)
    return Pair(widgetType ?: IrisAppControlWidget.WIDGET_SINGLE_ACTION, actionId)
}
