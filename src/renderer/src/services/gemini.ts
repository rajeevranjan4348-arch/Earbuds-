import { GoogleGenAI } from '@google/genai'

let aiInstance: GoogleGenAI | null = null

export function getAiInstance(): GoogleGenAI {
  if (!aiInstance) {
    const apiKey =
      localStorage.getItem('gemini_api_key') ||
      localStorage.getItem('VITE_GEMINI_API_KEY') ||
      import.meta.env.VITE_GEMINI_API_KEY ||
      'AIzaSyDemoKey'

    aiInstance = new GoogleGenAI({ apiKey })
  }
  return aiInstance
}

export async function getSearchGroundedResponse(prompt: string): Promise<string> {
  try {
    const ai = getAiInstance()
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    })
    return response.text || 'No response generated.'
  } catch (error: any) {
    console.error('[Gemini Search Grounded Error]:', error)
    return `Error generating grounded response: ${error?.message || error}`
  }
}

export async function getMapsGroundedResponse(prompt: string): Promise<string> {
  try {
    const ai = getAiInstance()
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    })
    return response.text || 'No response generated.'
  } catch (error: any) {
    console.error('[Gemini Maps Grounded Error]:', error)
    return `Error generating map response: ${error?.message || error}`
  }
}

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  try {
    const ai = getAiInstance()
    const arrayBuffer = await audioBlob.arrayBuffer()
    const base64Audio = Buffer.from(arrayBuffer).toString('base64')

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: [
        {
          inlineData: {
            mimeType: audioBlob.type || 'audio/wav',
            data: base64Audio
          }
        },
        'Transcribe this audio precisely.'
      ]
    })
    return response.text || ''
  } catch (error: any) {
    console.error('[Gemini Audio Transcribe Error]:', error)
    return ''
  }
}

export async function generateSpeech(text: string): Promise<ArrayBuffer | null> {
  try {
    const ai = getAiInstance()
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: text
    })
    if (response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data) {
      const base64 = response.candidates[0].content.parts[0].inlineData.data
      const binaryStr = window.atob(base64)
      const len = binaryStr.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      return bytes.buffer
    }
    return null
  } catch (error: any) {
    console.error('[Gemini Generate Speech Error]:', error)
    return null
  }
}
