import { VoicePersonality, VoicePersonalityId } from './VoiceTypes'

export const VOICE_PERSONALITIES: Record<VoicePersonalityId, VoicePersonality> = {
  jarvis: {
    id: 'jarvis',
    name: 'JARVIS',
    title: 'Calm, Intelligent, Professional',
    description: 'Refined, articulate British butler style. Authoritative and measured.',
    systemInstructionModifier:
      'Adopt the persona of J.A.R.V.I.S. Respond calmly, intelligently, and with polite British professionalism. Be articulate, precise, and measured. Address the user with respect (e.g. "Certainly, sir" or "Right away"). Keep spoken explanations concise and crisp.',
    preferredVoiceKeywords: [
      'daniel',
      'george',
      'oliver',
      'british',
      'en-gb',
      'natural',
      'google uk'
    ],
    pitch: 0.95,
    rate: 1.02,
    accentColor: '#10b981' // emerald
  },
  assistant: {
    id: 'assistant',
    name: 'Assistant',
    title: 'Friendly & Natural',
    description: 'Warm, helpful, conversational, and natural companion tone.',
    systemInstructionModifier:
      'Adopt a warm, friendly, natural assistant tone. Speak in an encouraging, clear, and conversational voice. Provide straightforward answers and helpful suggestions naturally.',
    preferredVoiceKeywords: [
      'samantha',
      'karen',
      'victoria',
      'serena',
      'natural',
      'google us english',
      'en-us'
    ],
    pitch: 1.05,
    rate: 1.05,
    accentColor: '#06b6d4' // cyan
  },
  developer: {
    id: 'developer',
    name: 'Developer',
    title: 'Technical & Concise',
    description: 'Direct, analytical, code-centric, with zero fluff.',
    systemInstructionModifier:
      'Adopt a direct, highly technical developer persona. Speak with extreme conciseness, skipping pleasantries. Focus directly on code, architecture, system parameters, commands, and actionable outcomes.',
    preferredVoiceKeywords: ['alex', 'fred', 'rishi', 'en-us', 'google'],
    pitch: 1.0,
    rate: 1.1,
    accentColor: '#8b5cf6' // violet
  },
  companion: {
    id: 'companion',
    name: 'Companion',
    title: 'Relaxed & Conversational',
    description: 'Empathetic, engaging, thoughtful, and expressive companion.',
    systemInstructionModifier:
      'Adopt an empathetic, thoughtful, engaging companion tone. Speak warmly with conversational presence and supportive curiosity.',
    preferredVoiceKeywords: ['tom', 'arthur', 'en-us', 'natural'],
    pitch: 1.0,
    rate: 1.02,
    accentColor: '#f59e0b' // amber
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    title: 'User-Defined Instructions',
    description: 'Follows user customized behavioral directives.',
    systemInstructionModifier: 'Follow the custom user-defined instructions provided in settings.',
    preferredVoiceKeywords: ['natural', 'google', 'en-us'],
    pitch: 1.0,
    rate: 1.0,
    accentColor: '#ec4899' // pink
  }
}

export function getPersonality(id: VoicePersonalityId): VoicePersonality {
  return VOICE_PERSONALITIES[id] || VOICE_PERSONALITIES.jarvis
}
