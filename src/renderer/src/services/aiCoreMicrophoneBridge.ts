// ============================================================
// EARbuds / IRIS — AI CORE MICROPHONE PIPELINE FIX
// ============================================================
// PURPOSE:
// Microphone → AudioStream → AI Core → Response
//
// IMPORTANT:
// - Existing UI is NOT changed.
// - Do not create a second microphone pipeline.
// - Call startAIListening() from your existing mic/voice button.
// - Call stopAIListening() when voice mode closes.
// ============================================================

import { geminiLiveVoiceClient } from './geminiLiveVoiceClient'

type AIInputHandler = (audio: ArrayBuffer) => void | Promise<void>

interface AICoreConfig {
  onAudioInput: AIInputHandler
  onError?: (error: Error) => void
}

export class AICoreMicrophoneBridge {
  private stream: MediaStream | null = null
  private audioContext: AudioContext | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private processor: ScriptProcessorNode | null = null
  private analyser: AnalyserNode | null = null

  private running = false
  private onAudioInput: AIInputHandler
  private onError?: (error: Error) => void

  constructor(config: AICoreConfig) {
    this.onAudioInput = config.onAudioInput
    this.onError = config.onError
  }

  // ----------------------------------------------------------
  // START MICROPHONE
  // ----------------------------------------------------------

  async start(): Promise<boolean> {
    if (this.running) return true

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia is not supported in this environment.')
      }

      // IMPORTANT:
      // Explicitly request microphone input.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      })

      const tracks = this.stream.getAudioTracks()

      if (!tracks.length) {
        throw new Error('Microphone stream contains no audio track.')
      }

      const track = tracks[0]

      if (track.readyState !== 'live') {
        throw new Error(`Microphone track is not live: ${track.readyState}`)
      }

      // --------------------------------------------------------
      // AUDIO CONTEXT
      // --------------------------------------------------------

      this.audioContext = new AudioContext()

      // Android/browser can create a suspended AudioContext.
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      this.source = this.audioContext.createMediaStreamSource(this.stream)

      // Used only to verify that audio is actually arriving.
      this.analyser = this.audioContext.createAnalyser()

      this.analyser.fftSize = 2048

      // --------------------------------------------------------
      // PROCESSOR
      // --------------------------------------------------------

      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)

      this.processor.onaudioprocess = async (event) => {
        if (!this.running) return

        const input = event.inputBuffer.getChannelData(0)

        // Ignore completely empty buffers.
        let peak = 0

        for (let i = 0; i < input.length; i++) {
          const value = Math.abs(input[i])

          if (value > peak) {
            peak = value
          }
        }

        // Notify audio level listener for visualizer / sphere
        if (typeof (window as any).__IRIS_ON_AUDIO_LEVEL__ === 'function') {
          try {
            ;(window as any).__IRIS_ON_AUDIO_LEVEL__(Math.min(1, peak * 3))
          } catch (_e) {}
        }

        // No useful microphone signal.
        if (peak < 0.00001) {
          return
        }

        // Convert Float32 PCM → Int16 PCM.
        const pcm = this.float32ToInt16(input)

        // SEND REAL AUDIO TO AI CORE.
        await this.onAudioInput(pcm)
      }

      // --------------------------------------------------------
      // CONNECT GRAPH
      // --------------------------------------------------------

      this.source.connect(this.analyser)

      this.analyser.connect(this.processor)

      // Processor must connect to destination for
      // onaudioprocess to execute reliably in browsers.
      this.processor.connect(this.audioContext.destination)

      this.running = true

      console.log('[AI CORE] Microphone started:', track.label)

      console.log('[AI CORE] AudioContext:', this.audioContext.state)

      return true
    } catch (error) {
      console.error('[AI CORE] Microphone initialization failed:', error)

      this.cleanup()

      this.onError?.(error instanceof Error ? error : new Error(String(error)))

      return false
    }
  }

  // ----------------------------------------------------------
  // FLOAT32 → PCM16
  // ----------------------------------------------------------

  private float32ToInt16(input: Float32Array): ArrayBuffer {
    const output = new Int16Array(input.length)

    for (let i = 0; i < input.length; i++) {
      const sample = Math.max(-1, Math.min(1, input[i]))

      output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
    }

    return output.buffer
  }

  // ----------------------------------------------------------
  // MICROPHONE STATUS
  // ----------------------------------------------------------

  getStatus() {
    const track = this.stream?.getAudioTracks()[0]

    return {
      running: this.running,
      audioContext: this.audioContext?.state ?? 'none',
      trackState: track?.readyState ?? 'none',
      enabled: track?.enabled ?? false,
      muted: track?.muted ?? false,
      label: track?.label ?? ''
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  // ----------------------------------------------------------
  // STOP
  // ----------------------------------------------------------

  stop() {
    this.running = false

    this.cleanup()

    console.log('[AI CORE] Microphone stopped.')
  }

  // ----------------------------------------------------------
  // CLEANUP
  // ----------------------------------------------------------

  private cleanup() {
    try {
      this.processor?.disconnect()
    } catch {}

    try {
      this.source?.disconnect()
    } catch {}

    try {
      this.analyser?.disconnect()
    } catch {}

    this.processor = null
    this.source = null
    this.analyser = null

    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop()
      }

      this.stream = null
    }

    if (this.audioContext) {
      this.audioContext.close().catch(() => {})

      this.audioContext = null
    }
  }
}

// ============================================================
// AI CORE CONNECTION
// ============================================================

export class AIRealtimeVoiceController {
  private mic: AICoreMicrophoneBridge | null = null

  // Replace this function with your existing
  // Gemini Live/WebRTC/WebSocket send-audio method.
  private async sendAudioToAICore(pcm: ArrayBuffer) {
    /*
      IMPORTANT:

      DO NOT create another microphone here.

      The microphone is already captured by
      AICoreMicrophoneBridge.

      Send PCM directly to your existing AI transport.

      Example:

      existingGeminiLiveClient.sendAudio(pcm)

      OR

      existingVoiceService.sendAudio(pcm)

      OR

      existingWebSocket.send(pcm)
    */

    let client = (window as any).__IRIS_AI_CORE__

    if (!client) {
      // Connect to Gemini Live client by default
      client = geminiLiveVoiceClient
      ;(window as any).__IRIS_AI_CORE__ = client
    }

    if (typeof client.sendAudio === 'function') {
      await client.sendAudio(pcm)

      return
    }

    if (client.socket && client.socket.readyState === WebSocket.OPEN) {
      client.socket.send(pcm)

      return
    }

    console.error('[AI CORE] No active audio transport.')
  }

  // ----------------------------------------------------------
  // START
  // ----------------------------------------------------------

  async startAIListening(): Promise<boolean> {
    if (this.mic) {
      this.stopAIListening()
    }

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

    this.mic = new AICoreMicrophoneBridge({
      onAudioInput: async (pcm) => {
        await this.sendAudioToAICore(pcm)
      },

      onError: (error) => {
        console.error('[AI CORE] Mic error:', error)
      }
    })

    return await this.mic.start()
  }

  // ----------------------------------------------------------
  // STOP
  // ----------------------------------------------------------

  stopAIListening() {
    this.mic?.stop()

    this.mic = null

    if (typeof (window as any).__IRIS_ON_AUDIO_LEVEL__ === 'function') {
      try {
        ;(window as any).__IRIS_ON_AUDIO_LEVEL__(0)
      } catch (_e) {}
    }
  }

  // ----------------------------------------------------------
  // DEBUG
  // ----------------------------------------------------------

  getMicrophoneStatus() {
    return (
      this.mic?.getStatus() ?? {
        running: false,
        audioContext: 'none',
        trackState: 'none',
        enabled: false,
        muted: false,
        label: ''
      }
    )
  }
}

// ============================================================
// SINGLE GLOBAL INSTANCE
// ============================================================

export const aiRealtimeVoice = new AIRealtimeVoiceController()

// ============================================================
// EXISTING MIC BUTTON INTEGRATION
// ============================================================
//
// DO NOT change your existing button/UI.
//
// Just connect the existing action:
//
// await aiRealtimeVoice.startAIListening();
//
// And when voice mode closes:
//
// aiRealtimeVoice.stopAIListening();
//
// ============================================================

// ============================================================
// OPTIONAL DEBUG COMMAND
// ============================================================
//
// Browser console:
//
// window.__IRIS_MIC_DEBUG__ =
//   () => aiRealtimeVoice.getMicrophoneStatus();
//
// ============================================================

if (typeof window !== 'undefined') {
  ;(window as any).__IRIS_MIC_DEBUG__ = () => aiRealtimeVoice.getMicrophoneStatus()
}
