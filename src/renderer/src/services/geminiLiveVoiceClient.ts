/**
 * Gemini Live API Voice Conversation Client
 *
 * Implements real-time bi-directional streaming over WebSocket to the Gemini
 * Multimodal Live API service. Captures raw 16kHz linear PCM microphone audio,
 * pipes it to the backend via WebSocket, schedules low-latency gapless 24kHz
 * PCM audio playback, and supports immediate interruption (barge-in) and VAD.
 */

export type LiveVoiceState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'interrupted'
  | 'error'

export interface LiveVoiceMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
  audioPlayed?: boolean
}

export type VoiceOption = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'

class GeminiLiveVoiceClient {
  private state: LiveVoiceState = 'idle'
  private ws: WebSocket | null = null
  private inputAudioCtx: AudioContext | null = null
  private outputAudioCtx: AudioContext | null = null
  private micStream: MediaStream | null = null
  private micSource: MediaStreamAudioSourceNode | null = null
  private micProcessor: ScriptProcessorNode | null = null
  private activeSources: AudioBufferSourceNode[] = []
  private nextPlayTime: number = 0
  private voiceName: VoiceOption = 'Zephyr'
  private conversationHistory: LiveVoiceMessage[] = []
  private listeners: Set<(state: LiveVoiceState, payload?: any) => void> = new Set()
  private audioLevelListeners: Set<(level: number) => void> = new Set()
  private isMuted: boolean = false
  private reconnectTimer: any = null

  public getState(): LiveVoiceState {
    return this.state
  }

  public getHistory(): LiveVoiceMessage[] {
    return [...this.conversationHistory]
  }

  public setVoice(voice: VoiceOption) {
    this.voiceName = voice
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'config', voiceName: voice }))
    }
  }

  public getVoice(): VoiceOption {
    return this.voiceName
  }

  public subscribe(callback: (state: LiveVoiceState, payload?: any) => void): () => void {
    this.listeners.add(callback)
    callback(this.state)
    return () => this.listeners.delete(callback)
  }

  public onAudioLevel(callback: (level: number) => void): () => void {
    this.audioLevelListeners.add(callback)
    return () => this.audioLevelListeners.delete(callback)
  }

  private notify(state: LiveVoiceState, payload?: any) {
    this.state = state
    this.listeners.forEach((cb) => cb(state, payload))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('iris:gemini-live-state', {
          detail: { state, payload }
        })
      )
    }
  }

  private notifyLevel(level: number) {
    this.audioLevelListeners.forEach((cb) => cb(level))
  }

  /**
   * Initializes or resumes the 24kHz output AudioContext for model playback
   */
  private initOutputAudioContext(): AudioContext {
    if (!this.outputAudioCtx || this.outputAudioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      this.outputAudioCtx = new AudioContextClass({ sampleRate: 24000 })
    }
    if (this.outputAudioCtx.state === 'suspended') {
      this.outputAudioCtx.resume()
    }
    return this.outputAudioCtx
  }

  /**
   * Initializes the 16kHz input AudioContext for microphone capture
   */
  private initInputAudioContext(): AudioContext {
    if (!this.inputAudioCtx || this.inputAudioCtx.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext
      this.inputAudioCtx = new AudioContextClass({ sampleRate: 16000 })
    }
    if (this.inputAudioCtx.state === 'suspended') {
      this.inputAudioCtx.resume()
    }
    return this.inputAudioCtx
  }

  /**
   * Opens WebSocket connection to Gemini Live multimodal server
   */
  public async connectWebSocket(): Promise<void> {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }

    this.notify('connecting', { message: 'Connecting to Gemini Live WebSocket...' })

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    const wsUrl = `${protocol}//${host}/api/ai/live-ws?voice=${this.voiceName}`

    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(wsUrl)
        this.ws = ws

        ws.onopen = () => {
          this.notify('listening', { message: 'Connected to Gemini Live' })
          resolve()
        }

        ws.onmessage = (event) => {
          this.handleServerMessage(event.data)
        }

        ws.onerror = (err) => {
          console.warn('[Gemini Live WS Error]', err)
          this.notify('error', { error: 'WebSocket connection failed' })
        }

        ws.onclose = () => {
          this.ws = null
          if (this.state !== 'idle') {
            this.notify('idle', { message: 'Session disconnected' })
          }
        }
      } catch (err: any) {
        console.warn('[Gemini Live WS Connect Exception]', err)
        this.notify('error', { error: err?.message || 'Failed to connect' })
        resolve()
      }
    })
  }

  /**
   * Handles incoming WebSocket frames from the server
   */
  private handleServerMessage(dataStr: string) {
    try {
      const msg = JSON.parse(dataStr)

      // 1. Streaming 24kHz raw PCM audio chunk from Gemini Live
      if (msg.type === 'audio' && msg.audio) {
        this.playPcmChunk(msg.audio, msg.sampleRate || 24000)
        return
      }

      // 2. Interruption signal (user began speaking while model was playing)
      if (msg.type === 'interrupted' || msg.interrupted) {
        this.stopPlayback()
        this.notify('interrupted', { message: 'Interrupted by user speech' })
        setTimeout(() => {
          if (this.state === 'interrupted') {
            this.notify('listening')
          }
        }, 150)
        return
      }

      // 3. Transcript notification
      if (msg.type === 'transcript') {
        const role = msg.role === 'user' ? 'user' : 'assistant'
        const existing = this.conversationHistory[this.conversationHistory.length - 1]

        if (existing && existing.role === role && Date.now() - existing.timestamp < 3000) {
          existing.text += ` ${msg.text}`
        } else {
          this.conversationHistory.push({
            id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            role,
            text: msg.text,
            timestamp: Date.now()
          })
        }
        this.notify(this.state, { history: this.conversationHistory })
        return
      }

      // 4. Status update
      if (msg.type === 'status') {
        if (msg.status === 'ready') {
          this.notify('listening', { message: msg.message })
        } else if (msg.status === 'fallback') {
          this.notify('listening', { message: 'Operating in audio bridge mode' })
        }
        return
      }

      // 5. Turn complete
      if (msg.type === 'turn_complete') {
        // Model finished generating this turn
      }
    } catch (err) {
      console.warn('[Gemini Live Message Parse Error]', err)
    }
  }

  /**
   * Plays a 24kHz 16-bit linear PCM chunk gaplessly
   */
  public playPcmChunk(base64Data: string, sampleRate = 24000) {
    try {
      const ctx = this.initOutputAudioContext()
      const binaryString = window.atob(base64Data)
      const len = binaryString.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      let audioBuffer: AudioBuffer

      // Check if it has a WAV RIFF header
      if (
        bytes.length > 4 &&
        bytes[0] === 0x52 &&
        bytes[1] === 0x49 &&
        bytes[2] === 0x46 &&
        bytes[3] === 0x46
      ) {
        ctx.decodeAudioData(bytes.buffer.slice(0)).then((buf) => {
          this.scheduleAudioBuffer(ctx, buf)
        })
        return
      }

      // Raw 16-bit linear PCM mono
      const int16Array = new Int16Array(bytes.buffer)
      audioBuffer = ctx.createBuffer(1, int16Array.length, sampleRate)
      const channelData = audioBuffer.getChannelData(0)
      for (let i = 0; i < int16Array.length; i++) {
        channelData[i] = int16Array[i] / 32768.0
      }

      this.scheduleAudioBuffer(ctx, audioBuffer)
    } catch (err) {
      console.warn('[Gemini Live PCM Playback Note]', err)
    }
  }

  /**
   * Schedules audio buffer with jitter buffer tracking for gapless output
   */
  private scheduleAudioBuffer(ctx: AudioContext, buffer: AudioBuffer) {
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    const now = ctx.currentTime
    if (this.nextPlayTime < now) {
      this.nextPlayTime = now + 0.04 // 40ms lead-in jitter buffer
    }

    source.start(this.nextPlayTime)
    this.nextPlayTime += buffer.duration
    this.activeSources.push(source)

    this.notify('speaking', { duration: buffer.duration })

    source.onended = () => {
      const idx = this.activeSources.indexOf(source)
      if (idx !== -1) {
        this.activeSources.splice(idx, 1)
      }
      if (this.activeSources.length === 0 && this.state === 'speaking') {
        this.notify('listening')
      }
    }
  }

  /**
   * Stops any currently playing audio and clears the buffer schedule immediately
   */
  public stopPlayback(): void {
    for (const src of this.activeSources) {
      try {
        src.stop(0)
        src.disconnect()
      } catch (_e) {}
    }
    this.activeSources = []
    if (this.outputAudioCtx) {
      this.nextPlayTime = this.outputAudioCtx.currentTime
    }
  }

  /**
   * Starts capturing microphone audio at 16kHz and pipes raw 16-bit PCM to WebSocket
   */
  public async startMicrophoneCapture(): Promise<boolean> {
    try {
      if (this.micStream) {
        return true
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      this.micStream = stream
      const inputCtx = this.initInputAudioContext()
      const source = inputCtx.createMediaStreamSource(stream)
      this.micSource = source

      // 4096 sample buffer size = ~256ms chunk at 16kHz
      const processor = inputCtx.createScriptProcessor(4096, 1, 1)
      this.micProcessor = processor

      processor.onaudioprocess = (e) => {
        if (this.isMuted) return

        const channelData = e.inputBuffer.getChannelData(0)

        // Calculate RMS volume level for UI visualizer
        let sum = 0
        for (let i = 0; i < channelData.length; i++) {
          sum += channelData[i] * channelData[i]
        }
        const rms = Math.sqrt(sum / channelData.length)
        const normalized = Math.min(1, rms * 4)
        this.notifyLevel(normalized)

        // Convert Float32Array (-1.0 to 1.0) to 16-bit signed PCM
        const pcm16 = new Int16Array(channelData.length)
        for (let i = 0; i < channelData.length; i++) {
          const s = Math.max(-1, Math.min(1, channelData[i]))
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }

        // Convert PCM bytes to Base64
        const bytes = new Uint8Array(pcm16.buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i])
        }
        const base64Audio = window.btoa(binary)

        // Pipe raw PCM data to Gemini Live WebSocket
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(
            JSON.stringify({
              type: 'audio',
              audio: base64Audio,
              mimeType: 'audio/pcm;rate=16000'
            })
          )
        }
      }

      source.connect(processor)
      processor.connect(inputCtx.destination)

      return true
    } catch (err: any) {
      console.error('[GeminiLive] Microphone capture start error:', err)
      this.notify('error', { error: err?.message || 'Failed to start microphone' })
      return false
    }
  }

  /**
   * Stops microphone audio capture and releases device
   */
  public stopMicrophoneCapture(): void {
    if (this.micProcessor) {
      try {
        this.micProcessor.disconnect()
      } catch (_e) {}
      this.micProcessor = null
    }

    if (this.micSource) {
      try {
        this.micSource.disconnect()
      } catch (_e) {}
      this.micSource = null
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop())
      this.micStream = null
    }

    if (this.inputAudioCtx) {
      try {
        this.inputAudioCtx.close()
      } catch (_e) {}
      this.inputAudioCtx = null
    }

    this.notifyLevel(0)
  }

  /**
   * Starts full live session: connects WebSocket and initiates microphone PCM stream
   */
  public async startLiveSession(): Promise<boolean> {
    await this.connectWebSocket()
    const micStarted = await this.startMicrophoneCapture()
    if (micStarted) {
      this.notify('listening', { message: 'Gemini Live session active' })
    }
    return micStarted
  }

  /**
   * Ends live session cleanly
   */
  public endLiveSession(): void {
    this.stopPlayback()
    this.stopMicrophoneCapture()

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'audio_end' }))
        this.ws.close()
      }
      this.ws = null
    }

    this.notify('idle', { message: 'Session stopped' })
  }

  /**
   * Alias for playPcmChunk supporting base64 audio strings
   */
  public async playBase64Audio(base64Data: string, sampleRate = 24000): Promise<void> {
    this.playPcmChunk(base64Data, sampleRate)
  }

  /**
   * Sends user speech / voice prompt to Gemini Live voice endpoint
   */
  public async sendVoiceTurn(
    prompt: string,
    voiceName: VoiceOption = this.voiceName
  ): Promise<{ text: string; audioBase64?: string }> {
    const trimmed = prompt.trim()
    if (!trimmed) throw new Error('Empty voice prompt')

    const userMsg: LiveVoiceMessage = {
      id: `live_user_${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: Date.now()
    }
    this.conversationHistory.push(userMsg)
    this.notify('processing', { prompt: trimmed })

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendTextTurn(trimmed)
    }

    try {
      const response = await fetch('/api/ai/voice/conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: trimmed,
          voiceName,
          conversationHistory: this.conversationHistory.map((m) => ({
            role: m.role,
            text: m.text
          }))
        })
      })

      if (!response.ok) {
        throw new Error(`Voice server response error: ${response.status}`)
      }

      const data = await response.json()
      const assistantText = data?.text || 'Standing by for your command.'

      const assistantMsg: LiveVoiceMessage = {
        id: `live_model_${Date.now()}`,
        role: 'assistant',
        text: assistantText,
        timestamp: Date.now(),
        audioPlayed: Boolean(data?.audioBase64)
      }
      this.conversationHistory.push(assistantMsg)

      if (data?.audioBase64) {
        this.playPcmChunk(data.audioBase64, data.sampleRate || 24000)
      }

      this.notify('listening')
      return { text: assistantText, audioBase64: data?.audioBase64 }
    } catch (err: any) {
      console.warn('[GeminiLive] Voice turn note:', err)
      this.notify('listening')
      return { text: `Acknowledged: ${trimmed}` }
    }
  }

  /**
   * Sends user text turn or instruction directly over WebSocket
   */
  public sendTextTurn(text: string): void {
    const trimmed = text.trim()
    if (!trimmed) return

    this.conversationHistory.push({
      id: `text_${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: Date.now()
    })

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'text', text: trimmed }))
      this.notify('processing', { prompt: trimmed })
    }
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted
    if (muted) {
      this.notifyLevel(0)
    }
  }

  public clearHistory(): void {
    this.conversationHistory = []
  }
}

export const geminiLiveVoiceClient = new GeminiLiveVoiceClient()
