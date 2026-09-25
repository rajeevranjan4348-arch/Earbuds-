/**
 * RealTimeCacheManager
 * Intelligent TTL-based caching layer for real-time search, browser, and API data.
 */

export interface CacheEntry<T = any> {
  key: string
  data: T
  createdAt: number
  expiresAt: number
  category: 'LIVE' | 'NEWS' | 'SOFTWARE' | 'STATIC'
  source: string
  etag?: string
}

export class RealTimeCacheManager {
  private cache = new Map<string, CacheEntry>()

  private ttlMap: Record<CacheEntry['category'], number> = {
    LIVE: 2 * 60 * 1000, // 2 minutes
    NEWS: 30 * 60 * 1000, // 30 minutes
    SOFTWARE: 12 * 60 * 60 * 1000, // 12 hours
    STATIC: 7 * 24 * 60 * 60 * 1000 // 7 days
  }

  /**
   * Retrieves item if not expired
   */
  public get<T>(key: string): { data: T; isHit: boolean } | null {
    const entry = this.cache.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return { data: entry.data as T, isHit: true }
  }

  /**
   * Caches data with category TTL
   */
  public set<T>(
    key: string,
    data: T,
    category: CacheEntry['category'] = 'LIVE',
    source = 'unknown',
    customTtlMs?: number
  ): void {
    const ttl = customTtlMs || this.ttlMap[category]
    const now = Date.now()

    this.cache.set(key, {
      key,
      data,
      createdAt: now,
      expiresAt: now + ttl,
      category,
      source
    })
  }

  /**
   * Clears expired entries
   */
  public purgeExpired(): number {
    const now = Date.now()
    let purged = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
        purged++
      }
    }

    return purged
  }

  public clearAll(): void {
    this.cache.clear()
  }
}

export const realTimeCacheManager = new RealTimeCacheManager()
