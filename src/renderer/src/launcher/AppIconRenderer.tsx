import React from 'react'
import {
  RiLayoutGridLine,
  RiChat3Line,
  RiYoutubeFill,
  RiGoogleFill,
  RiCompass3Line,
  RiFolderOpenLine,
  RiImageLine,
  RiPhoneLine,
  RiSettings4Line,
  RiMicLine,
  RiCameraLine,
  RiTvLine,
  RiFileTextLine,
  RiFullscreenLine,
  RiGithubFill,
  RiWhatsappFill,
  RiGlobalLine,
  RiSpotifyFill,
  RiMailLine,
  RiDiscordFill,
  RiTelegramFill,
  RiBookOpenLine,
  RiCodeBoxLine,
  RiTwitterXFill,
  RiRedditFill,
  RiDeleteBin6Line,
  RiBrainLine,
  RiShieldCrossLine,
  RiAppsLine
} from 'react-icons/ri'
import { Hand, Sparkles } from 'lucide-react'

interface AppIconProps {
  iconId: string
  category?: string
  className?: string
  size?: number
}

export const AppIconRenderer: React.FC<AppIconProps> = ({
  iconId,
  category,
  className = '',
  size = 20
}) => {
  // Map icon identifiers to React components
  switch (iconId) {
    case 'RiLayoutGridLine':
      return <RiLayoutGridLine size={size} className={className || 'text-emerald-400'} />
    case 'RiChat3Line':
      return <RiChat3Line size={size} className={className || 'text-cyan-400'} />
    case 'RiYoutubeFill':
      return <RiYoutubeFill size={size} className={className || 'text-rose-500'} />
    case 'RiGoogleFill':
      return <RiGoogleFill size={size} className={className || 'text-blue-400'} />
    case 'RiCompass3Line':
      return <RiCompass3Line size={size} className={className || 'text-amber-400'} />
    case 'RiFolderOpenLine':
      return <RiFolderOpenLine size={size} className={className || 'text-yellow-400'} />
    case 'RiImageLine':
      return <RiImageLine size={size} className={className || 'text-purple-400'} />
    case 'RiPhoneLine':
      return <RiPhoneLine size={size} className={className || 'text-emerald-400'} />
    case 'RiSettings4Line':
      return <RiSettings4Line size={size} className={className || 'text-zinc-400'} />
    case 'RiMicLine':
      return <RiMicLine size={size} className={className || 'text-cyan-400'} />
    case 'RiCameraLine':
      return <RiCameraLine size={size} className={className || 'text-emerald-400'} />
    case 'RiTvLine':
      return <RiTvLine size={size} className={className || 'text-indigo-400'} />
    case 'RiFileTextLine':
      return <RiFileTextLine size={size} className={className || 'text-amber-300'} />
    case 'RiFullscreenLine':
      return <RiFullscreenLine size={size} className={className || 'text-teal-400'} />
    case 'RiHandCoinLine':
      return <Hand size={size} className={className || 'text-emerald-400'} />
    case 'RiGithubFill':
      return <RiGithubFill size={size} className={className || 'text-white'} />
    case 'RiWhatsappFill':
      return <RiWhatsappFill size={size} className={className || 'text-emerald-500'} />
    case 'RiGlobalLine':
      return <RiGlobalLine size={size} className={className || 'text-blue-400'} />
    case 'RiSpotifyFill':
      return <RiSpotifyFill size={size} className={className || 'text-emerald-400'} />
    case 'RiMailLine':
      return <RiMailLine size={size} className={className || 'text-rose-400'} />
    case 'RiDiscordFill':
      return <RiDiscordFill size={size} className={className || 'text-indigo-400'} />
    case 'RiTelegramFill':
      return <RiTelegramFill size={size} className={className || 'text-sky-400'} />
    case 'RiBookOpenLine':
      return <RiBookOpenLine size={size} className={className || 'text-zinc-300'} />
    case 'RiCodeBoxLine':
      return <RiCodeBoxLine size={size} className={className || 'text-blue-500'} />
    case 'RiTwitterXFill':
      return <RiTwitterXFill size={size} className={className || 'text-zinc-200'} />
    case 'RiRedditFill':
      return <RiRedditFill size={size} className={className || 'text-orange-500'} />
    case 'RiDeleteBin6Line':
      return <RiDeleteBin6Line size={size} className={className || 'text-rose-500'} />
    case 'RiBrainLine':
      return <RiBrainLine size={size} className={className || 'text-violet-400'} />
    case 'RiShieldCrossLine':
      return <RiShieldCrossLine size={size} className={className || 'text-red-500'} />
    default:
      if (category === 'media')
        return <RiYoutubeFill size={size} className={className || 'text-rose-400'} />
      if (category === 'communication')
        return <RiChat3Line size={size} className={className || 'text-cyan-400'} />
      if (category === 'developer')
        return <RiGithubFill size={size} className={className || 'text-white'} />
      if (category === 'tools')
        return <Sparkles size={size} className={className || 'text-emerald-400'} />
      return <RiAppsLine size={size} className={className || 'text-zinc-400'} />
  }
}
