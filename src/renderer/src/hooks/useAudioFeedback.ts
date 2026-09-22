/**
 * React Hook for Web Audio UI Auditory Feedback
 */

import { useCallback } from 'react'
import { soundEffects, SoundType } from '../services/soundEffectsService'

export function useAudioFeedback() {
  const play = useCallback((type: SoundType = 'click') => {
    soundEffects.play(type)
  }, [])

  const playHover = useCallback(() => soundEffects.play('hover'), [])
  const playClick = useCallback(() => soundEffects.play('click'), [])
  const playTab = useCallback(() => soundEffects.play('tab'), [])
  const playToggle = useCallback(() => soundEffects.play('toggle'), [])
  const playActivate = useCallback(() => soundEffects.play('activate'), [])
  const playDeactivate = useCallback(() => soundEffects.play('deactivate'), [])
  const playSuccess = useCallback(() => soundEffects.play('success'), [])
  const playError = useCallback(() => soundEffects.play('error'), [])
  const playShortcut = useCallback(() => soundEffects.play('shortcut'), [])
  const playPopup = useCallback(() => soundEffects.play('popup'), [])

  const setEnabled = useCallback((enabled: boolean) => {
    soundEffects.setEnabled(enabled)
  }, [])

  const setVolume = useCallback((volume: number) => {
    soundEffects.setVolume(volume)
  }, [])

  return {
    play,
    playHover,
    playClick,
    playTab,
    playToggle,
    playActivate,
    playDeactivate,
    playSuccess,
    playError,
    playShortcut,
    playPopup,
    setEnabled,
    setVolume,
    isEnabled: soundEffects.getIsEnabled(),
    volume: soundEffects.getVolume()
  }
}

export { soundEffects }
