/**
 * Authentic port of fr.neamar.kiss.utils.fuzzy.FuzzyScoreV2 from Neamar/KISS
 * Sublime Text-inspired fuzzy match algorithm.
 *
 * Examples from KISS source:
 * match("otw", "Power of the Wild") = true, score = 14
 * match("yt", "YouTube") = true, high camel bonus
 * match("wa", "WhatsApp") = true
 * match("chrome", "Google Chrome") = true, high separator bonus
 */

import { MatchInfo } from './MatchInfo'

export class FuzzyScoreV2 {
  private readonly patternLength: number
  private readonly patternLower: number[]

  private adjacency_bonus = 15
  private separator_bonus = 30
  private camel_bonus = 30
  private first_letter_bonus = 30
  private leading_letter_penalty = -5
  private max_leading_letter_penalty = -45
  private unmatched_letter_penalty = -2

  private readonly matchInfo: MatchInfo

  constructor(pattern: number[] | string, detailedMatchIndices = false) {
    let codepoints: number[]
    if (typeof pattern === 'string') {
      codepoints = Array.from(pattern).map((c) => c.codePointAt(0) || 0)
    } else {
      codepoints = pattern
    }

    this.patternLength = codepoints.length
    this.patternLower = new Array(this.patternLength)
    for (let i = 0; i < this.patternLength; i++) {
      const char = String.fromCodePoint(codepoints[i]).toLowerCase()
      this.patternLower[i] = char.codePointAt(0) || codepoints[i]
    }

    this.matchInfo = detailedMatchIndices
      ? new MatchInfo(false, 0, this.patternLength)
      : new MatchInfo(false, 0)
  }

  public setAdjacencyBonus(bonus: number): this {
    this.adjacency_bonus = bonus
    return this
  }

  public setSeparatorBonus(bonus: number): this {
    this.separator_bonus = bonus
    return this
  }

  public setCamelBonus(bonus: number): this {
    this.camel_bonus = bonus
    return this
  }

  public setFirstLetterBonus(bonus: number): this {
    this.first_letter_bonus = bonus
    return this
  }

  /**
   * Matches against a string by converting it to codepoints
   */
  public match(text: string | number[]): MatchInfo {
    let codepoints: number[]
    if (typeof text === 'string') {
      codepoints = Array.from(text).map((c) => c.codePointAt(0) || 0)
    } else {
      codepoints = text
    }

    if (this.patternLength === 0) {
      return new MatchInfo(true, 0)
    }

    if (codepoints.length === 0) {
      return MatchInfo.UNMATCHED
    }

    const recursionCount = 0
    const recursionLimit = 7 // KISS standard
    const maxMatches = Math.min(this.patternLength, codepoints.length)
    const matches: number[] = []

    const result = this.matchRecursive(
      codepoints,
      0, // patternCurIndex
      0, // strCurrIndex
      null, // srcMatches
      matches,
      maxMatches,
      0, // nextMatch
      recursionCount,
      recursionLimit
    )

    this.matchInfo.score = result.score
    this.matchInfo.match = result.match
    if (this.matchInfo.matchedIndices) {
      this.matchInfo.matchedIndices = [...matches]
    }

    return result
  }

  private matchRecursive(
    str: number[],
    patternCurIndex: number,
    strCurrIndex: number,
    srcMatches: number[] | null,
    matches: number[],
    maxMatches: number,
    nextMatch: number,
    recursionCount: number,
    recursionLimit: number
  ): MatchInfo {
    recursionCount++
    if (recursionCount >= recursionLimit) {
      return MatchInfo.UNMATCHED
    }

    if (patternCurIndex === this.patternLength || strCurrIndex === str.length) {
      return MatchInfo.UNMATCHED
    }

    let recursiveMatch = false
    const bestRecursiveMatches: number[] = []
    let bestRecursiveScore = 0

    let firstMatch = true

    while (patternCurIndex < this.patternLength && strCurrIndex < str.length) {
      const strChar = String.fromCodePoint(str[strCurrIndex]).toLowerCase()
      const strLowerCode = strChar.codePointAt(0) || str[strCurrIndex]

      if (this.patternLower[patternCurIndex] === strLowerCode) {
        if (nextMatch >= maxMatches) {
          return MatchInfo.UNMATCHED
        }

        if (firstMatch && srcMatches !== null) {
          matches.length = 0
          matches.push(...srcMatches)
          firstMatch = false
        }

        const recursiveMatches: number[] = []
        const recursiveResult = this.matchRecursive(
          str,
          patternCurIndex,
          strCurrIndex + 1,
          matches,
          recursiveMatches,
          maxMatches,
          nextMatch,
          recursionCount,
          recursionLimit
        )

        if (recursiveResult.match) {
          if (!recursiveMatch || recursiveResult.score > bestRecursiveScore) {
            bestRecursiveMatches.length = 0
            bestRecursiveMatches.push(...recursiveMatches)
            bestRecursiveScore = recursiveResult.score
          }
          recursiveMatch = true
        }

        matches.push(strCurrIndex)
        nextMatch++
        patternCurIndex++
      }
      strCurrIndex++
    }

    const matched = patternCurIndex === this.patternLength
    let outScore = 0

    if (matched) {
      outScore = 100

      // Leading letter penalty: applies for distance before first match
      const penalty = Math.max(
        this.max_leading_letter_penalty,
        this.leading_letter_penalty * (matches[0] ?? 0)
      )
      outScore += penalty

      // Unmatched letters penalty
      const unmatched = str.length - nextMatch
      outScore += this.unmatched_letter_penalty * unmatched

      // Ordering & character neighbor bonuses
      for (let i = 0; i < matches.length; i++) {
        const currIdx = matches[i]
        if (i > 0) {
          const prevIdx = matches[i - 1]
          if (currIdx === prevIdx + 1) {
            outScore += this.adjacency_bonus
          }
        }

        if (currIdx > 0) {
          const neighbor = str[currIdx - 1]
          const curr = str[currIdx]
          const neighborChar = String.fromCodePoint(neighbor)
          const currChar = String.fromCodePoint(curr)

          // CamelCase bonus: lowercase followed by uppercase
          if (neighborChar !== neighborChar.toUpperCase() && currChar !== currChar.toLowerCase()) {
            outScore += this.camel_bonus
          }

          // Separator bonus (space, dot, dash, underscore)
          if (/\s|[._\-/]/.test(neighborChar)) {
            outScore += this.separator_bonus
          }
        } else {
          // First letter bonus
          outScore += this.first_letter_bonus
        }
      }
    }

    if (recursiveMatch && (!matched || bestRecursiveScore > outScore)) {
      matches.length = 0
      matches.push(...bestRecursiveMatches)
      return new MatchInfo(true, bestRecursiveScore)
    } else if (matched) {
      return new MatchInfo(true, outScore)
    } else {
      return MatchInfo.UNMATCHED
    }
  }
}
