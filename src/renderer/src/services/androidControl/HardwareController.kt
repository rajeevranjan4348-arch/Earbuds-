package com.example.jarvis

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.location.Location
import android.location.LocationManager
import android.media.AudioManager
import android.os.BatteryManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.net.wifi.WifiManager
import android.telephony.TelephonyManager
import android.hardware.usb.UsbManager
import androidx.core.content.ContextCompat

/**
 * ============================================================
 * JARVIS / AI HARDWARE CONTROLLER
 * ============================================================
 *
 * One-file Android hardware access layer.
 *
 * Supports:
 *  Camera
 *  Microphone permission checking
 *  Flashlight
 *  Speaker / volume
 *  Vibration
 *  Sensors
 *  Bluetooth state
 *  Wi-Fi state
 *  Location providers
 *  Battery
 *  Display
 *  Telephony information
 *  USB devices
 *
 * Android permissions/security are NOT bypassed.
 * ============================================================
 */

class HardwareController(
    private val context: Context
) {

    // --------------------------------------------------------
    // SYSTEM SERVICES
    // --------------------------------------------------------

    private val cameraManager =
        context.getSystemService(Context.CAMERA_SERVICE)
                as CameraManager

    private val audioManager =
        context.getSystemService(Context.AUDIO_SERVICE)
                as AudioManager

    private val sensorManager =
        context.getSystemService(Context.SENSOR_SERVICE)
                as SensorManager

    private val locationManager =
        context.getSystemService(Context.LOCATION_SERVICE)
                as LocationManager

    private val batteryManager =
        context.getSystemService(Context.BATTERY_SERVICE)
                as BatteryManager

    private val bluetoothManager =
        context.getSystemService(Context.BLUETOOTH_SERVICE)
                as BluetoothManager

    private val wifiManager =
        context.applicationContext
            .getSystemService(Context.WIFI_SERVICE)
                as WifiManager

    private val usbManager =
        context.getSystemService(Context.USB_SERVICE)
                as UsbManager

    private val telephonyManager =
        context.getSystemService(Context.TELEPHONY_SERVICE)
                as TelephonyManager

    private val vibrator = if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    ) {
        context.getSystemService(
            VibratorManager::class.java
        ).defaultVibrator
    } else {
        @Suppress("DEPRECATION")
        context.getSystemService(
            Context.VIBRATOR_SERVICE
        ) as Vibrator
    }

    // ========================================================
    // PERMISSION
    // ========================================================

    fun hasPermission(
        permission: String
    ): Boolean {

        return ContextCompat.checkSelfPermission(
            context,
            permission
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun requiredPermissions(): List<String> {

        return listOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
    }

    // ========================================================
    // FLASHLIGHT
    // ========================================================

    fun flashlight(on: Boolean): Boolean {

        return try {

            val cameraId =
                cameraManager.cameraIdList.firstOrNull { id ->

                    val info =
                        cameraManager
                            .getCameraCharacteristics(id)

                    info.get(
                        CameraCharacteristics
                            .FLASH_INFO_AVAILABLE
                    ) == true
                }

            if (cameraId == null) {
                return false
            }

            cameraManager.setTorchMode(
                cameraId,
                on
            )

            true

        } catch (e: Exception) {

            false
        }
    }

    // ========================================================
    // CAMERA
    // ========================================================

    fun openCamera() {

        val intent = Intent(
            "android.media.action.IMAGE_CAPTURE"
        )

        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
        )

        if (
            intent.resolveActivity(
                context.packageManager
            ) != null
        ) {
            context.startActivity(intent)
        }
    }

    // ========================================================
    // MICROPHONE
    // ========================================================

    fun microphonePermissionGranted(): Boolean {

        return hasPermission(
            Manifest.permission.RECORD_AUDIO
        )
    }

    // ========================================================
    // AUDIO / SPEAKER
    // ========================================================

    fun volumeUp() {

        audioManager.adjustVolume(
            AudioManager.ADJUST_RAISE,
            AudioManager.FLAG_SHOW_UI
        )
    }

    fun volumeDown() {

        audioManager.adjustVolume(
            AudioManager.ADJUST_LOWER,
            AudioManager.FLAG_SHOW_UI
        )
    }

    fun mute() {

        audioManager.adjustStreamVolume(
            AudioManager.STREAM_MUSIC,
            AudioManager.ADJUST_MUTE,
            AudioManager.FLAG_SHOW_UI
        )
    }

    fun unmute() {

        audioManager.adjustStreamVolume(
            AudioManager.STREAM_MUSIC,
            AudioManager.ADJUST_UNMUTE,
            AudioManager.FLAG_SHOW_UI
        )
    }

    fun volume(): Int {

        return audioManager.getStreamVolume(
            AudioManager.STREAM_MUSIC
        )
    }

    fun maxVolume(): Int {

        return audioManager.getStreamMaxVolume(
            AudioManager.STREAM_MUSIC
        )
    }

    // ========================================================
    // VIBRATION
    // ========================================================

    fun vibrate(
        milliseconds: Long = 200
    ) {

        if (
            Build.VERSION.SDK_INT >=
            Build.VERSION_CODES.O
        ) {

            vibrator.vibrate(
                VibrationEffect.createOneShot(
                    milliseconds,
                    VibrationEffect.DEFAULT_AMPLITUDE
                )
            )

        } else {

            @Suppress("DEPRECATION")
            vibrator.vibrate(milliseconds)
        }
    }

    // ========================================================
    // SENSORS
    // ========================================================

    fun availableSensors(): List<String> {

        return sensorManager
            .getSensorList(
                Sensor.TYPE_ALL
            )
            .mapNotNull {

                it.name
            }
    }

    fun hasAccelerometer(): Boolean {

        return sensorManager
            .getDefaultSensor(
                Sensor.TYPE_ACCELEROMETER
            ) != null
    }

    fun hasGyroscope(): Boolean {

        return sensorManager
            .getDefaultSensor(
                Sensor.TYPE_GYROSCOPE
            ) != null
    }

    fun hasMagnetometer(): Boolean {

        return sensorManager
            .getDefaultSensor(
                Sensor.TYPE_MAGNETIC_FIELD
            ) != null
    }

    fun hasProximitySensor(): Boolean {

        return sensorManager
            .getDefaultSensor(
                Sensor.TYPE_PROXIMITY
            ) != null
    }

    fun hasLightSensor(): Boolean {

        return sensorManager
            .getDefaultSensor(
                Sensor.TYPE_LIGHT
            ) != null
    }

    // ========================================================
    // BLUETOOTH
    // ========================================================

    fun bluetoothSupported(): Boolean {

        return bluetoothManager.adapter != null
    }

    fun bluetoothEnabled(): Boolean {

        return bluetoothManager
            .adapter
            ?.isEnabled == true
    }

    fun openBluetoothSettings() {

        val intent = Intent(
            Settings.ACTION_BLUETOOTH_SETTINGS
        )

        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
        )

        context.startActivity(intent)
    }

    // ========================================================
    // WI-FI
    // ========================================================

    @Suppress("DEPRECATION")
    fun wifiEnabled(): Boolean {

        return wifiManager.isWifiEnabled
    }

    fun openWifiSettings() {

        val intent = Intent(
            Settings.ACTION_WIFI_SETTINGS
        )

        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
        )

        context.startActivity(intent)
    }

    // ========================================================
    // LOCATION
    // ========================================================

    fun locationProviders(): List<String> {

        return locationManager
            .getProviders(true)
    }

    fun locationEnabled(): Boolean {

        return if (
            Build.VERSION.SDK_INT >=
            Build.VERSION_CODES.P
        ) {

            locationManager.isLocationEnabled

        } else {

            locationManager
                .isProviderEnabled(
                    LocationManager.GPS_PROVIDER
                )
        }
    }

    fun openLocationSettings() {

        val intent = Intent(
            Settings.ACTION_LOCATION_SOURCE_SETTINGS
        )

        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK
        )

        context.startActivity(intent)
    }

    // ========================================================
    // BATTERY
    // ========================================================

    fun batteryLevel(): Int {

        return batteryManager.getIntProperty(
            BatteryManager.BATTERY_PROPERTY_CAPACITY
        )
    }

    fun batteryCharging(): Boolean {

        val intent =
            context.registerReceiver(
                null,
                android.content.IntentFilter(
                    Intent.ACTION_BATTERY_CHANGED
                )
            )

        val status =
            intent?.getIntExtra(
                BatteryManager.EXTRA_STATUS,
                -1
            ) ?: -1

        return status ==
                BatteryManager.BATTERY_STATUS_CHARGING ||
                status ==
                BatteryManager.BATTERY_STATUS_FULL
    }

    // ========================================================
    // DISPLAY
    // ========================================================

    fun screenInfo(): Map<String, Any> {

        val display =
            context.resources.displayMetrics

        return mapOf(

            "widthPixels" to
                    display.widthPixels,

            "heightPixels" to
                    display.heightPixels,

            "density" to
                    display.density,

            "densityDpi" to
                    display.densityDpi
        )
    }

    // ========================================================
    // USB
    // ========================================================

    fun connectedUsbDevices(): List<String> {

        return usbManager
            .deviceList
            .values
            .map {

                "${it.manufacturerName ?: "Unknown"} " +
                "${it.productName ?: "USB Device"}"
            }
    }

    // ========================================================
    // TELEPHONY
    // ========================================================

    fun phoneHardwareAvailable(): Boolean {

        return context.packageManager
            .hasSystemFeature(
                PackageManager.FEATURE_TELEPHONY
            )
    }

    // ========================================================
    // DEVICE INFORMATION
    // ========================================================

    fun deviceInfo(): Map<String, String> {

        return mapOf(

            "manufacturer" to
                    Build.MANUFACTURER,

            "model" to
                    Build.MODEL,

            "device" to
                    Build.DEVICE,

            "product" to
                    Build.PRODUCT,

            "android" to
                    Build.VERSION.RELEASE,

            "sdk" to
                    Build.VERSION.SDK_INT.toString(),

            "battery" to
                    "${batteryLevel()}%",

            "charging" to
                    batteryCharging().toString(),

            "bluetooth" to
                    bluetoothEnabled().toString(),

            "wifi" to
                    wifiEnabled().toString(),

            "location" to
                    locationEnabled().toString()
        )
    }

    // ========================================================
    // AI COMMAND ROUTER
    // ========================================================

    fun execute(command: String): String {

        val cmd = command
            .trim()
            .lowercase()

        return when {

            cmd.contains("flashlight on") ||
            cmd.contains("torch on") -> {

                if (flashlight(true))
                    "Flashlight ON"
                else
                    "Unable to enable flashlight."
            }

            cmd.contains("flashlight off") ||
            cmd.contains("torch off") -> {

                if (flashlight(false))
                    "Flashlight OFF"
                else
                    "Unable to disable flashlight."
            }

            cmd.contains("volume up") -> {

                volumeUp()
                "Volume increased."
            }

            cmd.contains("volume down") -> {

                volumeDown()
                "Volume decreased."
            }

            cmd == "mute" -> {

                mute()
                "Muted."
            }

            cmd == "unmute" -> {

                unmute()
                "Unmuted."
            }

            cmd.contains("vibrate") -> {

                vibrate()
                "Vibration activated."
            }

            cmd.contains("open camera") -> {

                openCamera()
                "Camera opened."
            }

            cmd.contains("bluetooth") -> {

                openBluetoothSettings()
                "Bluetooth settings opened."
            }

            cmd.contains("wifi") -> {

                openWifiSettings()
                "Wi-Fi settings opened."
            }

            cmd.contains("location settings") -> {

                openLocationSettings()
                "Location settings opened."
            }

            cmd.contains("battery") -> {

                "Battery ${batteryLevel()}%, " +
                "charging=${batteryCharging()}"
            }

            cmd.contains("device info") -> {

                deviceInfo().toString()
            }

            cmd.contains("sensors") -> {

                availableSensors().joinToString(
                    separator = "\n"
                )
            }

            else -> {

                "Unknown hardware command."
            }
        }
    }
}
