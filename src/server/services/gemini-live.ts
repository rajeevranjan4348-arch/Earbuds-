/**
 * Gemini Multimodal Live API & Real-Time Audio Bridge Service
 *
 * Implements a continuous bi-directional real-time audio bridge using
 * the @google/genai SDK specification. Supports WebSocket connections for
 * Gemini's Multimodal Live API (gemini-3.8-live), piping raw 16kHz PCM audio
 * from microphone clients directly to Gemini, streaming back 24kHz PCM audio,
 * handling voice activity detection (VAD), interrupts, and function calls.
 */

import type { IncomingMessage, Server } from 'node:http'
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai'
import { WebSocket, WebSocketServer } from 'ws'
import { loadEnv } from '../env'
import { toolRegistry } from '../tools/toolRegistry'

loadEnv()

export interface VoiceConversationRequest {
  prompt: string
  voiceName?: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'
  conversationHistory?: Array<{ role: string; text: string }>
}

export interface VoiceConversationResponse {
  text: string
  audioBase64?: string
  sampleRate: number
  voiceName: string
  model: string
  transcript?: string
  isFinal?: boolean
}

export interface LiveAudioBridgeRequest {
  audioChunk?: string // base64 encoded audio slice (PCM or WebM)
  mimeType?: string // e.g. 'audio/pcm;rate=16000' or 'audio/webm;codecs=opus'
  prompt?: string // optional text override or companion prompt
  voiceName?: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'
  sessionId?: string // continuous audio session identifier
  isFinal?: boolean // true when user finishes speaking
  conversationHistory?: Array<{ role: string; text: string }>
}

export interface AudioStreamSession {
  id: string
  createdAt: number
  lastActive: number
  chunks: string[]
  mimeType: string
  history: Array<{ role: string; text: string }>
  voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'
}

export class GeminiLiveService {
  private client: GoogleGenAI | null = null
  private activeSessions: Map<string, AudioStreamSession> = new Map()
  private wss: WebSocketServer | null = null
  private isAttached = false

  /**
   * Initializes or retrieves the GoogleGenAI client with the Gemini API Key
   */
  public getClient(): GoogleGenAI | null {
    loadEnv()
    const key =
      process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    if (!key) return null

    if (!this.client) {
      this.client = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      })
    }
    return this.client
  }

  /**
   * Retrieves or initializes an active continuous audio stream session
   */
  public getOrCreateSession(
    sessionId: string,
    voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' = 'Kore',
    mimeType = 'audio/pcm;rate=16000'
  ): AudioStreamSession {
    let session = this.activeSessions.get(sessionId)
    if (!session) {
      session = {
        id: sessionId,
        createdAt: Date.now(),
        lastActive: Date.now(),
        chunks: [],
        mimeType,
        history: [],
        voiceName
      }
      this.activeSessions.set(sessionId, session)
    } else {
      session.lastActive = Date.now()
    }

    // Clean up stale sessions (> 10 minutes old)
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000
    for (const [id, s] of this.activeSessions.entries()) {
      if (s.lastActive < tenMinutesAgo) {
        this.activeSessions.delete(id)
      }
    }

    return session
  }

  /**
   * Attaches WebSocket handling for the Gemini Multimodal Live API to an HTTP server
   */
  public attachWebSocket(server: Server): void {
    if (this.isAttached) return
    this.isAttached = true

    const wss = new WebSocketServer({ noServer: true })
    this.wss = wss

    server.on('upgrade', (req: IncomingMessage, socket: any, head: Buffer) => {
      try {
        const host = req.headers.host || 'localhost'
        const parsedUrl = new URL(req.url || '/', `http://${host}`)
        const pathname = parsedUrl.pathname

        if (pathname === '/api/ai/live-ws' || pathname === '/live' || pathname === '/api/live') {
          wss.handleUpgrade(req, socket, head, (clientWs) => {
            wss.emit('connection', clientWs, req)
          })
        }
      } catch (err) {
        console.error('[Gemini Live WS Upgrade Error]', err)
        socket.destroy()
      }
    })

    wss.on('connection', async (clientWs: WebSocket, req: IncomingMessage) => {
      await this.handleClientConnection(clientWs, req)
    })

    console.log(
      '[Gemini Live Service] WebSocket server endpoint attached at /api/ai/live-ws and /live'
    )
  }

  /**
   * Manages an active bi-directional WebSocket connection with a client
   */
  private async handleClientConnection(clientWs: WebSocket, req: IncomingMessage): Promise<void> {
    const host = req.headers.host || 'localhost'
    const parsedUrl = new URL(req.url || '/', `http://${host}`)
    const queryVoice = parsedUrl.searchParams.get('voice') as
      'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'
    let voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' = queryVoice || 'Zephyr'

    let liveSession: any = null
    let isConnectedToLive = false
    let isClosed = false

    const sendToClient = (msg: any) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(msg))
      }
    }

    sendToClient({
      type: 'status',
      status: 'connecting',
      message: 'Establishing connection to Gemini Multimodal Live API...'
    })

    const ai = this.getClient()

    if (ai) {
      try {
        liveSession = await ai.live.connect({
          model: 'gemini-3.8-live',
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName }
              }
            },
            systemInstruction:
              'You are JARVIS / IRIS, an intelligent, conversational, real-time multimodal operating layer. Speak naturally, articulately, and directly. You have authority over device controls, tools, research, and coding. Keep answers concise when spoken aloud.',
            inputAudioTranscription: {},
            outputAudioTranscription: {}
          },
          callbacks: {
            onopen: () => {
              isConnectedToLive = true
              sendToClient({
                type: 'status',
                status: 'ready',
                voice: voiceName,
                model: 'gemini-3.8-live',
                message: 'Gemini Live multimodal session active'
              })
            },
            onmessage: async (message: LiveServerMessage) => {
              if (isClosed) return

              // 1. Output audio chunk stream from Gemini Live (24kHz 16-bit PCM mono)
              const parts = message.serverContent?.modelTurn?.parts
              if (parts && parts.length > 0) {
                for (const part of parts) {
                  if (part.inlineData?.data) {
                    sendToClient({
                      type: 'audio',
                      audio: part.inlineData.data,
                      sampleRate: 24000,
                      mimeType: part.inlineData.mimeType || 'audio/pcm;rate=24000'
                    })
                  }
                  if (part.text) {
                    sendToClient({
                      type: 'transcript',
                      role: 'assistant',
                      text: part.text
                    })
                  }
                }
              }

              // 2. Interruption detection (user barged in while model was speaking)
              if (message.serverContent?.interrupted) {
                sendToClient({
                  type: 'interrupted',
                  interrupted: true,
                  message: 'Model playback interrupted by user voice activity'
                })
              }

              // 3. Turn complete signal
              if (message.serverContent?.turnComplete) {
                sendToClient({
                  type: 'turn_complete',
                  turnComplete: true
                })
              }

              // 4. Transcription events
              const anyMsg = message as any
              if (anyMsg.serverContent?.inputAudioTranscription?.text) {
                sendToClient({
                  type: 'transcript',
                  role: 'user',
                  text: anyMsg.serverContent.inputAudioTranscription.text
                })
              }
              if (anyMsg.serverContent?.outputAudioTranscription?.text) {
                sendToClient({
                  type: 'transcript',
                  role: 'assistant',
                  text: anyMsg.serverContent.outputAudioTranscription.text
                })
              }

              // 5. Tool call handling
              if (message.toolCall?.functionCalls && liveSession) {
                const calls = message.toolCall.functionCalls
                const responses: Array<{
                  id?: string
                  name?: string
                  response: Record<string, any>
                }> = []

                for (const call of calls) {
                  const callName = call.name || ''
                  sendToClient({
                    type: 'tool_call',
                    name: callName,
                    id: call.id,
                    args: call.args
                  })

                  try {
                    const result = await toolRegistry.executeTool(
                      callName,
                      (call.args as any) || {}
                    )
                    responses.push({
                      id: call.id,
                      name: callName,
                      response: { output: result }
                    })
                  } catch (toolErr: any) {
                    responses.push({
                      id: call.id,
                      name: callName,
                      response: { error: toolErr?.message || 'Tool execution failed' }
                    })
                  }
                }

                try {
                  liveSession.sendToolResponse({
                    functionResponses: responses
                  })
                } catch (sendErr) {
                  console.warn('[Gemini Live] Error sending tool response:', sendErr)
                }
              }
            },
            onerror: (err: any) => {
              console.warn('[Gemini Live Session Error]', err?.message || err)
              sendToClient({
                type: 'error',
                error: err?.message || 'Gemini Live connection error'
              })
            },
            onclose: () => {
              isConnectedToLive = false
              sendToClient({
                type: 'status',
                status: 'closed',
                message: 'Gemini Live session closed'
              })
            }
          }
        })
      } catch (err: any) {
        console.warn(
          '[Gemini Live] Falling back to continuous HTTP audio bridge:',
          err?.message || err
        )
      }
    }

    if (!isConnectedToLive && !liveSession) {
      sendToClient({
        type: 'status',
        status: 'fallback',
        message: 'Live API connecting via continuous audio bridge fallback'
      })
    }

    // Ingest messages from client microphone
    clientWs.on('message', async (raw: any) => {
      if (isClosed) return

      try {
        const dataStr = raw.toString()
        const parsed = JSON.parse(dataStr)

        // 1. Raw PCM audio stream packet from client (16kHz 16-bit PCM mono base64)
        if (parsed.type === 'audio' && parsed.audio) {
          if (liveSession && isConnectedToLive) {
            liveSession.sendRealtimeInput({
              audio: {
                data: parsed.audio,
                mimeType: parsed.mimeType || 'audio/pcm;rate=16000'
              }
            })
          } else {
            // Fallback audio buffering
            this.handleFallbackAudioChunk(parsed.audio, clientWs, voiceName)
          }
          return
        }

        // 2. Audio stream end / pause signal
        if (parsed.type === 'audio_end') {
          if (liveSession && isConnectedToLive) {
            liveSession.sendRealtimeInput({
              audioStreamEnd: true
            })
          }
          return
        }

        // 3. User spoken / text message injection
        if (parsed.type === 'text' && parsed.text) {
          if (liveSession && isConnectedToLive) {
            liveSession.sendClientContent({
              turns: [
                {
                  role: 'user',
                  parts: [{ text: parsed.text }]
                }
              ],
              turnComplete: true
            })
          } else {
            const resp = await this.generateVoiceResponse({
              prompt: parsed.text,
              voiceName
            })
            sendToClient({
              type: 'audio',
              audio: resp.audioBase64,
              sampleRate: resp.sampleRate || 24000,
              text: resp.text
            })
            sendToClient({
              type: 'turn_complete',
              turnComplete: true
            })
          }
          return
        }

        // 4. Configuration change (e.g. voice selection)
        if (parsed.type === 'config' && parsed.voiceName) {
          voiceName = parsed.voiceName
          sendToClient({
            type: 'status',
            status: 'configured',
            voiceName
          })
          return
        }

        // 5. Ping / keepalive
        if (parsed.type === 'ping') {
          sendToClient({ type: 'pong', timestamp: Date.now() })
        }
      } catch (err: any) {
        console.warn('[Gemini Live WS Client Message Error]', err?.message || err)
      }
    })

    clientWs.on('close', () => {
      isClosed = true
      if (liveSession) {
        try {
          liveSession.close()
        } catch (_e) {}
        liveSession = null
      }
    })

    clientWs.on('error', (err) => {
      console.warn('[Gemini Live WS Client Socket Error]', err?.message || err)
    })
  }

  /**
   * Buffers fallback audio chunks when Live WebSockets are not available
   */
  private async handleFallbackAudioChunk(
    base64Pcm: string,
    clientWs: WebSocket,
    voiceName: 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr'
  ): Promise<void> {
    // Process periodically or on quiet thresholds
    try {
      const resp = await this.processLiveAudioStream({
        audioChunk: base64Pcm,
        mimeType: 'audio/pcm;rate=16000',
        voiceName,
        isFinal: false
      })
      if (resp.audioBase64) {
        clientWs.send(
          JSON.stringify({
            type: 'audio',
            audio: resp.audioBase64,
            sampleRate: resp.sampleRate || 24000,
            text: resp.text
          })
        )
      }
    } catch (_e) {}
  }

  /**
   * Generates a conversational voice response using Gemini 3.8 and Gemini TTS
   */
  public async generateVoiceResponse(
    request: VoiceConversationRequest
  ): Promise<VoiceConversationResponse> {
    const ai = this.getClient()
    const voiceName = request.voiceName || 'Kore'
    const prompt = request.prompt.trim()

    if (!ai) {
      return {
        text: `I heard: "${prompt}". Standing by to assist.`,
        sampleRate: 24000,
        voiceName,
        model: 'local-voice-fallback'
      }
    }

    // Format conversation history for context
    let historyContext = ''
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      historyContext = request.conversationHistory
        .slice(-6)
        .map((m) => `${m.role === 'user' ? 'User' : 'IRIS'}: ${m.text}`)
        .join('\n')
    }

    const systemPrompt =
      'You are JARVIS / IRIS, an intelligent, conversational, real-time voice assistant. Provide direct, natural, spoken answers that sound great when read aloud. Keep replies concise and articulate.'

    const fullPrompt = historyContext
      ? `System: ${systemPrompt}\n\nRecent Turns:\n${historyContext}\n\nUser: ${prompt}\nJARVIS:`
      : `System: ${systemPrompt}\n\nUser: ${prompt}\nJARVIS:`

    // 1. Generate text answer
    let spokenText = ''
    try {
      const textRes = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: fullPrompt
      })
      spokenText = textRes.text?.trim() || ''
    } catch (_err) {
      spokenText = `I heard: "${prompt}". Ready to proceed.`
    }

    // 2. Synthesize audio with Gemini Flash TTS
    let audioBase64: string | undefined = undefined
    try {
      const ttsRes = await ai.models.generateContent({
        model: 'gemini-3.1-flash-tts-preview',
        contents: [{ parts: [{ text: spokenText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName }
            }
          }
        }
      })

      const rawAudio = ttsRes.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data
      if (rawAudio) {
        audioBase64 = rawAudio
      }
    } catch (ttsErr: any) {
      console.warn('[Gemini Live Voice] TTS generation note:', ttsErr?.message || ttsErr)
    }

    return {
      text: spokenText,
      audioBase64,
      sampleRate: 24000,
      voiceName,
      model: 'gemini-3.8-live-tts'
    }
  }

  /**
   * Continuous Real-Time Audio Bridge (HTTP Fallback):
   * Ingests continuous audio chunks streamed from UI microphone event handlers,
   * buffers them in the active session, performs multimodal transcription and reasoning,
   * and generates speech audio responses.
   */
  public async processLiveAudioStream(
    request: LiveAudioBridgeRequest
  ): Promise<VoiceConversationResponse> {
    const ai = this.getClient()
    const voiceName = request.voiceName || 'Kore'
    const sessionId = request.sessionId || `session_${Date.now()}`
    const mimeType = request.mimeType || 'audio/pcm;rate=16000'

    const session = this.getOrCreateSession(sessionId, voiceName, mimeType)

    // Ingest and buffer incoming audio chunk
    if (request.audioChunk) {
      session.chunks.push(request.audioChunk)
    }

    // If this is an ongoing streaming chunk and not final or prompted, acknowledge ingestion
    if (!request.isFinal && !request.prompt) {
      return {
        text: 'Listening...',
        transcript: '',
        sampleRate: 24000,
        voiceName,
        model: 'gemini-live-audio-bridge',
        isFinal: false
      }
    }

    // Audio transcription & interpretation turn
    let userPrompt = request.prompt?.trim() || ''
    let extractedTranscript = ''

    // Use the latest audio chunk or combined audio for multimodal inference
    const chunkToProcess =
      request.audioChunk ||
      (session.chunks.length > 0 ? session.chunks[session.chunks.length - 1] : null)

    if (ai && chunkToProcess) {
      try {
        const audioResponse = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: chunkToProcess
                  }
                },
                {
                  text: 'Listen to this spoken audio from the user. Transcribe what was said accurately, and then provide a direct spoken answer as JARVIS. Format as:\nTRANSCRIPT: <transcription>\nRESPONSE: <spoken answer>'
                }
              ]
            }
          ]
        })

        const raw = audioResponse.text || ''
        const transcriptMatch = raw.match(/TRANSCRIPT:\s*(.*?)(?=\nRESPONSE:|$)/is)
        const responseMatch = raw.match(/RESPONSE:\s*(.*)/is)

        if (transcriptMatch && transcriptMatch[1]) {
          extractedTranscript = transcriptMatch[1].trim()
        }
        if (responseMatch && responseMatch[1]) {
          userPrompt = responseMatch[1].trim()
        } else if (!userPrompt) {
          userPrompt = raw.trim()
        }
      } catch (err: any) {
        console.warn('[Gemini Live Audio Bridge] Audio inference notice:', err?.message || err)
      }
    }

    // Reset buffered chunks for this session turn
    session.chunks = []

    const finalQuery = userPrompt || request.prompt || 'Hello JARVIS'
    const voiceResult = await this.generateVoiceResponse({
      prompt: finalQuery,
      voiceName,
      conversationHistory: request.conversationHistory || session.history
    })

    // Update session history
    session.history.push({ role: 'user', text: extractedTranscript || finalQuery })
    session.history.push({ role: 'assistant', text: voiceResult.text })
    if (session.history.length > 12) {
      session.history = session.history.slice(-12)
    }

    return {
      ...voiceResult,
      transcript: extractedTranscript || finalQuery,
      isFinal: true
    }
  }
}

export const geminiLiveService = new GeminiLiveService()

export function attachGeminiLiveWebSocket(server: Server): void {
  geminiLiveService.attachWebSocket(server)
}
