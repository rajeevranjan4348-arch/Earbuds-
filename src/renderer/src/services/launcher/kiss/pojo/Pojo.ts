/**
 * Authentic port of fr.neamar.kiss.pojo.Pojo & fr.neamar.kiss.pojo.PojoWithTags from Neamar/KISS
 */

import { NormalizerResult, StringNormalizer } from '../normalizer/StringNormalizer'
import { MatchInfo } from '../fuzzy/MatchInfo'
import { UserHandle } from './UserHandle'

export abstract class Pojo {
  // Globally unique ID (e.g. "app://com.whatsapp/com.whatsapp.Main")
  public readonly id: string

  // Normalized name representation for high-performance searching
  public normalizedName: NormalizerResult = NormalizerResult.EMPTY

  // Dynamic search relevance score
  public relevance = 0

  // Display name (e.g. "WhatsApp", "YouTube")
  private _name = ''

  constructor(id: string) {
    this.id = id
  }

  public getName(): string {
    return this._name
  }

  public setName(name: string): void {
    this._name = name
    this.normalizedName = StringNormalizer.normalizeWithResult(name, false)
  }

  public getHistoryId(): string {
    return this.id
  }

  public getFavoriteId(): string {
    return this.getHistoryId()
  }

  public isDisabled(): boolean {
    return false
  }

  public getUserHandle(): UserHandle {
    return UserHandle.OWNER
  }

  /**
   * Updates relevance of this pojo with score of given matchInfo if there is a match
   */
  public updateMatchingRelevance(matchInfo: MatchInfo, matched: boolean): boolean {
    if (matchInfo.match && (!matched || matchInfo.score > this.relevance)) {
      this.relevance = matchInfo.score
      return true
    }
    return matched
  }
}

export abstract class PojoWithTags extends Pojo {
  public tags: string[] = []

  public getTags(): string[] {
    return this.tags
  }

  public setTags(tags: string[]): void {
    this.tags = tags
  }
}
