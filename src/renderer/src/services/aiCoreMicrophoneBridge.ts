/* ============================================================
   IRIS — COMPLETE MICROPHONE + VOICE PIPELINE
   Replace the existing microphone bridge / voice capture layer
   ============================================================ */

import { geminiLiveVoiceClient } from './geminiLiveVoiceClient'
import { sendMessageToExistingAI } from './VoiceRecognition'

export type VoiceState =
  | 'idle'
  | 'requesting-permission'
  | 'connecting'
  | 'listening'
  | 'error'

export interface VoiceConfig {
  targetSampleRate?: number
  channelCount?: number
  silenceThreshold?: number
  chunkSize?: number
}

export interface VoiceCallbacks {
  onState?: (state: VoiceState) => void
  onAudioLevel?: (level: number) => void
  onError?: (error: Error) => void
  onConnected?: () => void
  onDisconnected?: () => void
  onTranscript?: (text: string) => void
  onAIText?: (text: string) => void
}

export class IrisVoicePipeline {
  private config: Required<VoiceConfig>
  private callbacks: VoiceCallbacks

  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private silentGain: GainNode | null = null

  private websocket: WebSocket | null = null

  private state: VoiceState = 'idle'
  private running = false

  private packetsSent = 0
  private bytesSent = 0

  constructor(callbacks: VoiceCallbacks = {}, config: VoiceConfig = {}) {
    this.callbacks = callbacks

    this.config = {
      targetSampleRate: config.targetSampleRate ?? 16000,
      channelCount: config.channelCount ?? 1,
      silenceThreshold: config.silenceThreshold ?? 0.003,
      chunkSize: config.chunkSize ?? 4096
    }
  }

  /* ==========================================================
     STATE
     ========================================================== */

  private setState(state: VoiceState) {
    this.state = state
    this.callbacks.onState?.(state)
  }

  getState(): VoiceState {
    return this.state
  }

  /* ==========================================================
     MICROPHONE PERMISSION
     ========================================================== */

  async requestMicrophonePermission(): Promise<boolean> {
    try {
      this.setState('requesting-permission')

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone API is not available in this environment.')
      }

      const testStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      })

      testStream.getTracks().forEach((track) => track.stop())

      return true
    } catch (error) {
      const err =
        error instanceof Error
          ? error
          : new Error('Microphone permission denied.')

      this.callbacks.onError?.(err)
      this.setState('error')

      return false
    }
  }

  /* ==========================================================
     GET MICROPHONE STREAM
     ========================================================== */

  private async getMicrophoneStream(): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('getUserMedia is unavailable.')
    }

    const advancedConstraints: MediaStreamConstraints = {
      audio: {
        channelCount: {
          ideal: this.config.channelCount
        },

        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true

        // Do NOT force sampleRate here.
        // Browsers/hardware can reject this.
      },
      video: false
    }

    try {
      return await navigator.mediaDevices.getUserMedia(advancedConstraints)
    } catch {
      // Reliable fallback for Android/Chromium/Electron.
      return await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      })
    }
  }

  /* ==========================================================
     START
     ========================================================== */

  async start(websocketUrl?: string): Promise<void> {
    if (this.running) {
      return
    }

    try {
      this.setState('requesting-permission')

      this.stream = await this.getMicrophoneStream()

      const track = this.stream.getAudioTracks()[0]

      if (!track) {
        throw new Error('No microphone audio track was created.')
      }

      if (track.readyState !== 'live') {
        throw new Error(`Microphone track is not live: ${track.readyState}`)
      }

      track.enabled = true

      console.info('[IRIS MIC] microphone started', {
        label: track.label,
        state: track.readyState,
        enabled: track.enabled,
        settings: track.getSettings()
      })

      /* ------------------------------------------------------
         AUDIO CONTEXT
         ------------------------------------------------------ */

      this.audioContext = new AudioContext()

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      console.info('[IRIS MIC] AudioContext', {
        state: this.audioContext.state,
        sampleRate: this.audioContext.sampleRate
      })

      /* ------------------------------------------------------
         SOURCE
         ------------------------------------------------------ */

      this.source = this.audioContext.createMediaStreamSource(this.stream)

      /* ------------------------------------------------------
         PROCESSOR
         ------------------------------------------------------ */

      this.processor = this.audioContext.createScriptProcessor(
        this.config.chunkSize,
        1,
        1
      )

      /* ------------------------------------------------------
         SILENT OUTPUT
         Prevent microphone feedback.
         ------------------------------------------------------ */

      this.silentGain = this.audioContext.createGain()

      this.silentGain.gain.value = 0

      this.source.connect(this.processor)

      this.processor.connect(this.silentGain)

      this.silentGain.connect(this.audioContext.destination)

      /* ------------------------------------------------------
         AUDIO PROCESSING
         ------------------------------------------------------ */

      this.processor.onaudioprocess = (event) => {
        if (!this.running) {
          return
        }

        try {
          const input = event.inputBuffer.getChannelData(0)

          const level = this.calculateRMS(input)

          this.callbacks.onAudioLevel?.(level)

          // Ignore extremely quiet background noise.
          if (level < this.config.silenceThreshold) {
            return
          }

          const pcm16 = this.resampleAndConvertToPCM16(
            input,
            this.audioContext!.sampleRate,
            this.config.targetSampleRate
          )

          if (pcm16.length === 0) {
            return
          }

          const base64 = this.arrayBufferToBase64(pcm16.buffer)

          this.sendAudio(base64)
        } catch (error) {
          console.error('[IRIS MIC] audio processing error', error)
        }
      }

      /* ------------------------------------------------------
         WEBSOCKET
         ------------------------------------------------------ */

      if (websocketUrl) {
        await this.connect(websocketUrl)
      } else {
        // Connect AI transport if not yet connected
        let client = (window as any).__IRIS_AI_CORE__
        if (!client) {
          client = geminiLiveVoiceClient
          ;(window as any).__IRIS_AI_CORE__ = client
        }
        if (client && typeof client.connectWebSocket === 'function' && client.getState?.() === 'idle') {
          try {
            await client.connectWebSocket()
          } catch (_e) {}
        }
      }

      this.running = true

      this.setState('listening')

      console.info('[IRIS MIC] capture pipeline ready')
    } catch (error) {
      await this.stop()

      const err =
        error instanceof Error
          ? error
          : new Error('Failed to start microphone.')

      this.callbacks.onError?.(err)
      this.setState('error')

      throw err
    }
  }

  /* ==========================================================
     RMS / AUDIO LEVEL
     ========================================================== */

  private calculateRMS(samples: Float32Array): number {
    let sum = 0

    for (let i = 0; i < samples.length; i++) {
      const value = samples[i]
      sum += value * value
    }

    return Math.sqrt(sum / Math.max(1, samples.length))
  }

  /* ==========================================================
     RESAMPLE + FLOAT32 → PCM16
     ========================================================== */

  private resampleAndConvertToPCM16(
    input: Float32Array,
    inputRate: number,
    outputRate: number
  ): Int16Array {
    if (inputRate === outputRate) {
      const result = new Int16Array(input.length)

      for (let i = 0; i < input.length; i++) {
        result[i] = this.floatToPCM16(input[i])
      }

      return result
    }

    const ratio = inputRate / outputRate

    const outputLength = Math.max(1, Math.floor(input.length / ratio))

    const output = new Int16Array(outputLength)

    for (let i = 0; i < outputLength; i++) {
      const position = i * ratio

      const index = Math.floor(position)

      const nextIndex = Math.min(index + 1, input.length - 1)

      const fraction = position - index

      const sample =
        input[index] * (1 - fraction) + input[nextIndex] * fraction

      output[i] = this.floatToPCM16(sample)
    }

    return output
  }

  private floatToPCM16(value: number): number {
    const clamped = Math.max(-1, Math.min(1, value))

    return clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff
  }

  /* ==========================================================
     ARRAYBUFFER → BASE64
     ========================================================== */

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)

    let binary = ''

    const CHUNK = 0x8000

    for (let i = 0; i < bytes.length; i += CHUNK) {
      const chunk = bytes.subarray(i, Math.min(i + CHUNK, bytes.length))

      binary += String.fromCharCode(...chunk)
    }

    return btoa(binary)
  }

  /* ==========================================================
     WEBSOCKET CONNECTION
     ========================================================== */

  private connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.setState('connecting')

        const socket = new WebSocket(url)

        this.websocket = socket

        let settled = false

        const timeout = window.setTimeout(() => {
          if (!settled) {
            settled = true

            socket.close()

            reject(new Error('Voice WebSocket connection timed out.'))
          }
        }, 10000)

        socket.onopen = () => {
          clearTimeout(timeout)

          if (!settled) {
            settled = true

            console.info('[IRIS VOICE] WebSocket connected')

            this.callbacks.onConnected?.()

            resolve()
          }
        }

        socket.onerror = () => {
          clearTimeout(timeout)

          const error = new Error('Voice WebSocket connection failed.')

          this.callbacks.onError?.(error)

          if (!settled) {
            settled = true
            reject(error)
          }
        }

        socket.onclose = () => {
          console.info('[IRIS VOICE] WebSocket closed')

          this.callbacks.onDisconnected?.()
        }

        socket.onmessage = (event) => {
          this.handleServerMessage(event.data)
        }
      } catch (error) {
        reject(
          error instanceof Error
            ? error
            : new Error('Unable to create WebSocket.')
        )
      }
    })
  }

  /* ==========================================================
     SERVER RESPONSE
     ========================================================== */

  private handleServerMessage(raw: unknown) {
    try {
      if (typeof raw !== 'string') {
        return
      }

      const data = JSON.parse(raw)

      /*
       * Gemini/your server can expose transcription
       * under different fields. Support the common forms.
       */

      const transcript =
        data?.inputAudioTranscription?.text ??
        data?.input_transcription?.text ??
        data?.transcript ??
        data?.text

      if (typeof transcript === 'string' && transcript.trim()) {
        this.callbacks.onTranscript?.(transcript)
      }

      const aiText =
        data?.outputTranscription?.text ??
        data?.output_transcription?.text ??
        data?.response?.text ??
        data?.aiText

      if (typeof aiText === 'string' && aiText.trim()) {
        this.callbacks.onAIText?.(aiText)
      }

      /*
       * If the backend sends raw PCM response audio,
       * pass it to the audio response handler.
       */

      if (data?.audio || data?.audioBase64) {
        const audio = data.audio ?? data.audioBase64

        if (typeof audio === 'string') {
          void this.playPCM16(audio, 24000)
        }
      }
    } catch {
      // Ignore non-JSON websocket messages.
    }
  }

  /* ==========================================================
     SEND AUDIO
     ========================================================== */

  private sendAudio(base64PCM: string) {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      try {
        /*
         * Gemini Live style audio message.
         * If your backend uses another envelope,
         * change ONLY this object.
         */

        const message = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: 'audio/pcm;rate=16000',
                data: base64PCM
              }
            ]
          }
        }

        this.websocket.send(JSON.stringify(message))

        this.packetsSent++
        this.bytesSent += base64PCM.length
        return
      } catch (error) {
        console.error('[IRIS VOICE] sendAudio failed', error)
      }
    }

    // Direct fallback to connected local Gemini Live voice client
    try {
      let client = (window as any).__IRIS_AI_CORE__
      if (!client) {
        client = geminiLiveVoiceClient
        ;(window as any).__IRIS_AI_CORE__ = client
      }
      if (client && typeof client.sendAudio === 'function') {
        const binary = atob(base64PCM)
        const bytes = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i)
        }
        client.sendAudio(bytes.buffer)
        this.packetsSent++
        this.bytesSent += base64PCM.length
      }
    } catch (_e) {}
  }

  /* ==========================================================
     PLAY AI PCM16 RESPONSE
     ========================================================== */

  private async playPCM16(base64: string, sampleRate: number) {
    try {
      if (!this.audioContext) {
        this.audioContext = new AudioContext()
      }

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      const binary = atob(base64)

      const pcm = new Int16Array(binary.length / 2)

      for (let i = 0; i < pcm.length; i++) {
        const lo = binary.charCodeAt(i * 2)

        const hi = binary.charCodeAt(i * 2 + 1)

        let value = lo | (hi << 8)

        if (value & 0x8000) {
          value -= 0x10000
        }

        pcm[i] = value
      }

      const audioBuffer = this.audioContext.createBuffer(
        1,
        pcm.length,
        sampleRate
      )

      const channel = audioBuffer.getChannelData(0)

      for (let i = 0; i < pcm.length; i++) {
        channel[i] = pcm[i] / 32768
      }

      const source = this.audioContext.createBufferSource()

      source.buffer = audioBuffer

      source.connect(this.audioContext.destination)

      source.start()
    } catch (error) {
      console.error('[IRIS VOICE] playback error', error)
    }
  }

  /* ==========================================================
     STOP
     ========================================================== */

  async stop() {
    this.running = false

    try {
      if (this.processor) {
        this.processor.onaudioprocess = null

        this.processor.disconnect()
        this.processor = null
      }

      if (this.source) {
        this.source.disconnect()
        this.source = null
      }

      if (this.silentGain) {
        this.silentGain.disconnect()
        this.silentGain = null
      }

      if (this.stream) {
        this.stream.getTracks().forEach((track) => {
          track.stop()
        })

        this.stream = null
      }

      if (this.audioContext) {
        if (this.audioContext.state !== 'closed') {
          await this.audioContext.close()
        }

        this.audioContext = null
      }

      if (this.websocket) {
        if (
          this.websocket.readyState === WebSocket.OPEN ||
          this.websocket.readyState === WebSocket.CONNECTING
        ) {
          this.websocket.close()
        }

        this.websocket = null
      }
    } finally {
      this.setState('idle')

      console.info('[IRIS VOICE] pipeline stopped')
    }
  }

  /* ==========================================================
     DIAGNOSTICS
     ========================================================== */

  getDiagnostics() {
    const track = this.stream?.getAudioTracks()[0]

    return {
      state: this.state,
      running: this.running,

      microphone: {
        available: !!navigator.mediaDevices?.getUserMedia,

        trackExists: !!track,

        trackState: track?.readyState ?? null,

        enabled: track?.enabled ?? false,

        muted: track?.muted ?? false,

        settings: track?.getSettings?.() ?? null
      },

      audioContext: {
        exists: !!this.audioContext,

        state: this.audioContext?.state ?? null,

        sampleRate: this.audioContext?.sampleRate ?? null,

        targetSampleRate: this.config.targetSampleRate
      },

      websocket: {
        exists: !!this.websocket,

        state: this.websocket?.readyState ?? null
      },

      packetsSent: this.packetsSent,

      bytesSent: this.bytesSent
    }
  }
}

/* ============================================================
   SIMPLE IRIS INTEGRATION
   ============================================================ */

export const irisVoice = new IrisVoicePipeline({
  onState(state) {
    console.log('[IRIS] Voice state:', state)
  },

  onAudioLevel(level) {
    /*
     * Connect this to your existing UI
     * microphone animation if required.
     */
    if (typeof (window as any).__IRIS_ON_AUDIO_LEVEL__ === 'function') {
      try {
        ;(window as any).__IRIS_ON_AUDIO_LEVEL__(Math.min(1, level * 5))
      } catch (_e) {}
    }
  },

  onTranscript(text) {
    console.log('[IRIS] User:', text)

    /*
     * Send transcript to your existing
     * chat/history system
     */
    sendMessageToExistingAI(text)
  },

  onAIText(text) {
    console.log('[IRIS] AI:', text)
  },

  onError(err) {
    console.error('[IRIS Voice Error]:', err)
  }
})

/* ============================================================
   BACKWARD COMPATIBILITY CONTROLLER FOR EXISTING UI & HOOKS
   ============================================================ */

export class AIRealtimeVoiceController {
  async startAIListening(websocketUrl?: string): Promise<boolean> {
    try {
      await irisVoice.start(websocketUrl)
      return true
    } catch (_error) {
      return false
    }
  }

  stopAIListening() {
    irisVoice.stop().catch(() => {})
    if (typeof (window as any).__IRIS_ON_AUDIO_LEVEL__ === 'function') {
      try {
        ;(window as any).__IRIS_ON_AUDIO_LEVEL__(0)
      } catch (_e) {}
    }
  }

  getMicrophoneStatus() {
    return irisVoice.getDiagnostics()
  }
}

export const aiRealtimeVoice = new AIRealtimeVoiceController()

// Alias for any existing imports expecting AICoreMicrophoneBridge
export { IrisVoicePipeline as AICoreMicrophoneBridge }

if (typeof window !== 'undefined') {
  ;(window as any).__IRIS_VOICE__ = irisVoice
  ;(window as any).__IRIS_MIC_DEBUG__ = () => irisVoice.getDiagnostics()
}
