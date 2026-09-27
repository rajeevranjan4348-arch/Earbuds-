import { GoogleGenAI, Modality } from '@google/genai';

export const getAiInstance = () => {
  const apiKey =
    (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) ||
    (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_GEMINI_API_KEY) ||
    '';
  return new GoogleGenAI({ apiKey });
};

export const getSearchGroundedResponse = async (message: string) => {
  const ai = getAiInstance();
  return await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: message,
    config: {
      tools: [{ googleSearch: {} }]
    }
  });
};

export const getMapsGroundedResponse = async (message: string, lat: number, lng: number) => {
  const ai = getAiInstance();
  return await ai.models.generateContent({
    model: 'gemini-3.8-flash',
    contents: message,
    config: {
      tools: [{ googleMaps: {} }],
      toolConfig: {
        retrievalConfig: {
          latLng: {
            latitude: lat,
            longitude: lng
          }
        }
      }
    }
  });
};

export const transcribeAudio = async (base64Audio: string, mimeType: string) => {
  const ai = getAiInstance();
  return await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Audio,
              mimeType: mimeType
            }
          },
          { text: 'Please transcribe this audio exactly as spoken.' }
        ]
      }
    ]
  });
};

export const generateSpeech = async (text: string, voiceName: string = 'Puck') => {
  const ai = getAiInstance();
  return await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName }
        }
      }
    }
  });
};
