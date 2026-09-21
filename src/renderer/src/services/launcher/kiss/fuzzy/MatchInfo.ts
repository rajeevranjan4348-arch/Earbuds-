/**
 * Authentic port of fr.neamar.kiss.utils.fuzzy.MatchInfo from Neamar/KISS
 */

export class MatchInfo {
  public static readonly UNMATCHED = new MatchInfo(false, 0)

  public match: boolean
  public score: number
  public matchedIndices?: number[]

  constructor(match: boolean = false, score: number = 0, initialCapacity?: number) {
    this.match = match
    this.score = score
    if (initialCapacity !== undefined) {
      this.matchedIndices = []
    }
  }
}
