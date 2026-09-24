/*
 * IRIS — UNIVERSAL ANDROID OCR & AI CORE PIPELINE
 * Single Kotlin file: MainActivity.kt
 *
 * PURPOSE:
 * ┌───────────────────────┐
 * │       USER IMAGE      │
 * └───────────┬───────────┘
 *             ↓
 *       Camera / Gallery
 *             ↓
 *        InputImage
 *             ↓
 *        ML Kit OCR
 *             ↓
 *       Extracted Text
 *             ↓
 *       Iris AI Core (/api/ai/chat)
 *             ↓
 *    ┌────────┼─────────┐
 *    ↓        ↓         ↓
 *  Answer   Summarize  Translate
 *    ↓        ↓         ↓
 *            AI CHAT
 *
 * Put this file in:
 * app/src/main/java/com/example/iris/MainActivity.kt
 *
 * Dependency required in app/build.gradle:
 * implementation("com.google.mlkit:text-recognition:16.0.1")
 */

package com.example.iris

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.speech.tts.TextToSpeech
import android.util.Log
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.InputStreamReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.Executors

class MainActivity : AppCompatActivity(), TextToSpeech.OnInitListener {

    companion object {
        private const val TAG = "IrisOCR"
        // Production Cloud Run deployment endpoint for IRIS AI
        const val DEFAULT_BACKEND_URL = "https://ais-dev-v6qls647mkdck4kaertlpk-368786169701.asia-southeast1.run.app"
        // Local emulator fallback
        const val EMULATOR_BACKEND_URL = "http://10.0.2.2:3000"
    }

    // ============================================================
    // IRIS OCR ENGINE (Google ML Kit Latin Text Recognizer)
    // ============================================================

    private val ocr = TextRecognition.getClient(
        TextRecognizerOptions.DEFAULT_OPTIONS
    )

    // Dedicated single-thread executor for network operations to prevent UI freezing
    private val networkExecutor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())

    // Text to Speech for auditory agent responses
    private var tts: TextToSpeech? = null
    private var ttsReady = false

    // Optional reference to an embedded Iris WebView (if used)
    var webView: WebView? = null

    // Cache of the latest extracted OCR text
    var lastExtractedText: String = ""
        private set

    // Active AI backend endpoint
    var backendBaseUrl: String = DEFAULT_BACKEND_URL

    // Listener interface for external consumers / UI bridges
    interface IrisAIResponseListener {
        fun onOcrExtracted(ocrText: String)
        fun onAiProcessingStarted(prompt: String)
        fun onAiSuccess(response: String)
        fun onAiError(error: Throwable)
    }

    var responseListener: IrisAIResponseListener? = null

    // ============================================================
    // IMAGE PICKER (Gallery)
    // ============================================================

    private val imagePicker =
        registerForActivityResult(
            ActivityResultContracts.GetContent()
        ) { uri: Uri? ->
            uri?.let {
                processImage(it)
            }
        }

    // ============================================================
    // CAMERA LAUNCHER
    // ============================================================

    private val cameraLauncher =
        registerForActivityResult(
            ActivityResultContracts.StartActivityForResult()
        ) { result ->
            if (result.resultCode == Activity.RESULT_OK) {
                val bitmap = result.data?.extras?.get("data") as? Bitmap
                bitmap?.let {
                    processBitmap(it)
                } ?: run {
                    // In case camera returned full Uri in data
                    result.data?.data?.let { uri ->
                        processImage(uri)
                    }
                }
            }
        }

    // ============================================================
    // ACTIVITY LIFECYCLE
    // ============================================================

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initialize Text-To-Speech engine for voice feedback
        tts = TextToSpeech(this, this)

        /*
         * KEEP YOUR EXISTING UI.
         *
         * Connect your existing buttons or voice commands to:
         *
         * openGalleryOCR()
         * openCameraOCR()
         *
         * Example:
         * ocrButton.setOnClickListener { openGalleryOCR() }
         * cameraButton.setOnClickListener { openCameraOCR() }
         */
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            ocr.close()
        } catch (e: Exception) {
            Log.w(TAG, "Error closing OCR client", e)
        }
        tts?.stop()
        tts?.shutdown()
        networkExecutor.shutdown()
    }

    override fun onInit(status: Int) {
        if (status == TextToSpeech.SUCCESS) {
            val result = tts?.setLanguage(Locale.US)
            ttsReady = result != TextToSpeech.LANG_MISSING_DATA && result != TextToSpeech.LANG_NOT_SUPPORTED
        }
    }

    private fun speakOut(text: String) {
        if (ttsReady && text.isNotBlank()) {
            // Clean markdown tokens before speaking
            val cleanSpeech = text
                .replace(Regex("[#*`_~]"), "")
                .replace(Regex("\\[(.*?)\\]\\(.*?\\)"), "$1")
                .take(300)
            tts?.speak(cleanSpeech, TextToSpeech.QUEUE_FLUSH, null, "IrisTTS")
        }
    }

    // ============================================================
    // OPEN GALLERY FOR OCR
    // ============================================================

    fun openGalleryOCR() {
        try {
            imagePicker.launch("image/*")
        } catch (e: Exception) {
            Log.e(TAG, "Unable to open gallery", e)
            Toast.makeText(this, "Failed to open gallery: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
        }
    }

    // ============================================================
    // OPEN CAMERA FOR OCR
    // ============================================================

    fun openCameraOCR() {
        try {
            val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
            cameraLauncher.launch(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Unable to launch camera", e)
            Toast.makeText(this, "Failed to open camera: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
        }
    }

    // ============================================================
    // PROCESS IMAGE URI
    // ============================================================

    fun processImage(uri: Uri) {
        try {
            val image = InputImage.fromFilePath(this, uri)
            processInputImage(image)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load image URI: $uri", e)
            Toast.makeText(this, "Image load error: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
        }
    }

    // ============================================================
    // PROCESS BITMAP
    // ============================================================

    fun processBitmap(bitmap: Bitmap) {
        try {
            val image = InputImage.fromBitmap(bitmap, 0)
            processInputImage(image)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load bitmap", e)
            Toast.makeText(this, "Bitmap error: ${e.localizedMessage}", Toast.LENGTH_SHORT).show()
        }
    }

    // ============================================================
    // CORE ML KIT OCR EXTRACTION
    // ============================================================

    private fun processInputImage(image: InputImage) {
        Toast.makeText(this, "Scanning image with Iris OCR...", Toast.LENGTH_SHORT).show()

        ocr.process(image)
            .addOnSuccessListener { visionText ->
                val text = visionText.text?.trim().orEmpty()

                if (text.isEmpty()) {
                    Toast.makeText(this, "No readable text detected in image.", Toast.LENGTH_LONG).show()
                    return@addOnSuccessListener
                }

                lastExtractedText = text
                Log.d(TAG, "OCR extracted: ${text.take(120)}... (length: ${text.length})")
                responseListener?.onOcrExtracted(text)

                // Dispatch to Iris AI Core pipeline
                sendToIrisAI(
                    prompt = "Analyze the extracted document text, summarize the key information, and suggest next actions:",
                    ocrText = text
                )
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "ML Kit OCR failed", e)
                Toast.makeText(this, "OCR recognition failed: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
            }
    }

    // ============================================================
    // IRIS AI CONNECTION (GEMINI CORE PIPELINE)
    // ============================================================

    /**
     * Sends extracted OCR text alongside the prompt to Iris AI Core.
     * Integrates with:
     * 1. Remote Iris AI Backend (/api/ai/chat)
     * 2. Embedded WebView AI Chat instance (via evaluateJavascript)
     * 3. TTS spoken response and UI listeners
     */
    fun sendToIrisAI(
        prompt: String,
        ocrText: String,
        onComplete: ((response: String?, error: Throwable?) -> Unit)? = null
    ) {
        val cleanOcr = ocrText.trim()
        if (cleanOcr.isEmpty()) {
            Toast.makeText(this, "No OCR text to analyze.", Toast.LENGTH_SHORT).show()
            return
        }

        // Compose full contextual prompt for the Iris AI Agent
        val fullPrompt = if (prompt.isNotBlank() && prompt != cleanOcr) {
            "$prompt\n\n[OCR Document / Image Text]:\n\"\"\"\n$cleanOcr\n\"\"\""
        } else {
            "Analyze and explain the following text extracted from an image:\n\n\"\"\"\n$cleanOcr\n\"\"\""
        }

        responseListener?.onAiProcessingStarted(fullPrompt)
        Toast.makeText(this, "Sending OCR data to Iris AI Core...", Toast.LENGTH_SHORT).show()

        // 1. If an embedded Iris WebView is active, broadcast to web UI immediately
        forwardToWebChat(fullPrompt)

        // 2. Perform background request to Iris AI Core endpoint
        networkExecutor.execute {
            var resultText: String? = null
            var requestError: Throwable? = null

            // Try primary endpoint, then local emulator fallback if network error
            val endpoints = listOf(
                "$backendBaseUrl/api/ai/chat",
                "$EMULATOR_BACKEND_URL/api/ai/chat"
            )

            for (endpointUrl in endpoints) {
                try {
                    resultText = callIrisBackend(endpointUrl, fullPrompt, cleanOcr)
                    if (!resultText.isNullOrBlank()) {
                        requestError = null
                        break
                    }
                } catch (e: Throwable) {
                    Log.w(TAG, "Request failed for $endpointUrl: ${e.message}")
                    requestError = e
                }
            }

            mainHandler.post {
                if (resultText != null) {
                    Log.i(TAG, "Iris AI response: ${resultText.take(120)}...")
                    responseListener?.onAiSuccess(resultText)
                    speakOut(resultText)
                    Toast.makeText(this, "Iris AI processed document successfully.", Toast.LENGTH_SHORT).show()
                    onComplete?.invoke(resultText, null)
                } else {
                    val err = requestError ?: Exception("Unknown error contacting Iris AI Core")
                    Log.e(TAG, "Iris AI failed", err)
                    responseListener?.onAiError(err)
                    Toast.makeText(this, "Iris AI request failed: ${err.localizedMessage}", Toast.LENGTH_LONG).show()
                    onComplete?.invoke(null, err)
                }
            }
        }
    }

    // ============================================================
    // HTTP BACKEND CLIENT
    // ============================================================

    @Throws(Exception::class)
    private fun callIrisBackend(endpointUrl: String, prompt: String, ocrText: String): String {
        val url = URL(endpointUrl)
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            connectTimeout = 15000
            readTimeout = 45000
            doInput = true
            doOutput = true
            setRequestProperty("Content-Type", "application/json; charset=UTF-8")
            setRequestProperty("Accept", "application/json")
        }

        // Build JSON body
        val jsonPayload = JSONObject().apply {
            put("prompt", prompt)
            put("ocrText", ocrText)
            put("source", "android_mlkit_ocr")
            // Pass model candidate preference if desired
            put("model", "gemini-2.5-flash")
            put("conversationHistory", JSONArray())
        }

        OutputStreamWriter(conn.outputStream, "UTF-8").use { writer ->
            writer.write(jsonPayload.toString())
            writer.flush()
        }

        val responseCode = conn.responseCode
        if (responseCode !in 200..299) {
            val errorStream = conn.errorStream ?: conn.inputStream
            val errorBody = errorStream?.bufferedReader()?.use(BufferedReader::readText) ?: ""
            throw Exception("HTTP $responseCode: $errorBody")
        }

        val responseString = conn.inputStream.bufferedReader().use(BufferedReader::readText)
        conn.disconnect()

        // Extract response field from JSON
        return try {
            val json = JSONObject(responseString)
            when {
                json.has("response") -> json.getString("response")
                json.has("text") -> json.getString("text")
                json.has("message") -> json.getString("message")
                else -> responseString
            }
        } catch (e: Exception) {
            responseString
        }
    }

    // ============================================================
    // FORWARD TO EMBEDDED IRIS WEBVIEW (IF MOUNTED)
    // ============================================================

    private fun forwardToWebChat(text: String) {
        val wv = webView ?: return
        try {
            val escaped = JSONObject.quote(text)
            val js = "if (window.sendMessageToExistingAI) { window.sendMessageToExistingAI($escaped); }"
            mainHandler.post {
                wv.evaluateJavascript(js, null)
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed forwarding to web chat", e)
        }
    }

    // ============================================================
    // CONVENIENCE PRESETS FOR OCR WORKFLOWS
    // ============================================================

    /** Summarize the text found in the image */
    fun summarizeExtractedText() {
        if (lastExtractedText.isBlank()) {
            Toast.makeText(this, "Please scan an image first.", Toast.LENGTH_SHORT).show()
            return
        }
        sendToIrisAI(
            prompt = "Please provide a concise, structured executive summary of the following document text:",
            ocrText = lastExtractedText
        )
    }

    /** Translate the extracted text to target language */
    fun translateExtractedText(targetLanguage: String = "English") {
        if (lastExtractedText.isBlank()) {
            Toast.makeText(this, "Please scan an image first.", Toast.LENGTH_SHORT).show()
            return
        }
        sendToIrisAI(
            prompt = "Translate the following OCR extracted text accurately into $targetLanguage:",
            ocrText = lastExtractedText
        )
    }

    /** Answer a specific question about the scanned image text */
    fun askQuestionAboutText(question: String) {
        if (lastExtractedText.isBlank()) {
            Toast.makeText(this, "Please scan an image first.", Toast.LENGTH_SHORT).show()
            return
        }
        sendToIrisAI(
            prompt = "Based on the text extracted from the document, answer the following question: $question",
            ocrText = lastExtractedText
        )
    }
}
