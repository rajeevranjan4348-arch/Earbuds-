import React from 'react'
import { VoiceChatModal, VoiceChatModalProps } from '../Voice/VoiceChatModal'

export interface LiveVoiceConversationModalProps extends VoiceChatModalProps {}

export const LiveVoiceConversationModal: React.FC<LiveVoiceConversationModalProps> = (props) => {
  return <VoiceChatModal {...props} />
}

export default LiveVoiceConversationModal
