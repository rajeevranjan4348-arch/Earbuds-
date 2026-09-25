/**
 * YouTubeProvider Implementation
 */

import { YouTubeProvider, YouTubeVideo } from '../types'
import { trendDiscoveryEngine } from '../../youtube'

export class DefaultYouTubeProvider implements YouTubeProvider {
  public name = 'DefaultYouTubeProvider'

  public async searchVideos(query: string, limit = 5): Promise<YouTubeVideo[]> {
    try {
      const searchRes = await trendDiscoveryEngine.searchTrends(query)
      if (!searchRes || !searchRes.items) return []

      return searchRes.items.slice(0, limit).map((item: any, index: number) => ({
        id: item.id || `yt_${index}`,
        title: item.title || item.snippet?.title || 'YouTube Video',
        channelTitle: item.channelTitle || item.snippet?.channelTitle || 'YouTube Creator',
        url: item.url || `https://www.youtube.com/watch?v=${item.id || 'video'}`,
        publishedAt: item.publishedAt || new Date().toISOString(),
        description: item.description || item.snippet?.description || '',
        viewCount: item.viewCount || item.statistics?.viewCount
      }))
    } catch (_err) {
      return []
    }
  }

  public async getTrending(_region = 'US'): Promise<YouTubeVideo[]> {
    return this.searchVideos('trending videos', 5)
  }
}

export const defaultYouTubeProvider = new DefaultYouTubeProvider()
