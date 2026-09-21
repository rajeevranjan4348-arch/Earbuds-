/**
 * Authentic port of fr.neamar.kiss.normalizer.StringNormalizer from Neamar/KISS
 * Handles decomposition of accented characters, non-spacing mark stripping,
 * dashes removal, and character code point position mapping.
 */

export class NormalizerResult {
  public static readonly EMPTY = new NormalizerResult(0, [], [])

  public readonly originalLength: number
  public readonly codePoints: number[]
  public readonly mapPositions: number[]
  public readonly normalizedString: string

  constructor(originalLength: number, codePoints: number[], mapPositions: number[]) {
    this.originalLength = originalLength
    this.codePoints = codePoints
    this.mapPositions = mapPositions
    this.normalizedString = String.fromCodePoint(...codePoints)
  }
}

export class StringNormalizer {
  /**
   * Normalizes input text according to KISS string normalization specification:
   * 1. Decomposes combination characters into canonical parts (NFKD)
   * 2. Strips combining diacritical marks (accents, umlauts, cedillas)
   * 3. Strips punctuation dashes
   * 4. Converts to lowercase
   * 5. Preserves character code point mapping
   */
  public static normalizeWithResult(
    input: string | null | undefined,
    makeLowercase = true
  ): NormalizerResult {
    if (!input || input.length === 0) {
      return NormalizerResult.EMPTY
    }

    const codePoints: number[] = []
    const mapPositions: number[] = []

    let i = 0
    while (i < input.length) {
      const codePoint = input.codePointAt(i)
      if (codePoint === undefined) break
      const charCount = codePoint > 0xffff ? 2 : 1

      // If in standard ASCII range
      if (codePoint <= 0x7a) {
        // Hyphen-minus is skipped per KISS StringNormalizer
        if (codePoint !== 0x2d) {
          const processed =
            makeLowercase && codePoint >= 0x41 && codePoint <= 0x5a ? codePoint + 0x20 : codePoint
          codePoints.push(processed)
          mapPositions.push(i)
        }
      } else {
        // Unicode normalization (NFKD decomposition)
        const charStr = String.fromCodePoint(codePoint)
        const decomposed = charStr.normalize('NFKD')

        for (let d = 0; d < decomposed.length; d++) {
          const dCode = decomposed.codePointAt(d)
          if (dCode === undefined) continue

          // Skip combining diacritical marks (Unicode range 0x0300 - 0x036F and dashes)
          const isCombiningMark = dCode >= 0x0300 && dCode <= 0x036f
          const isDash =
            dCode === 0x2010 || dCode === 0x2013 || dCode === 0x2014 || dCode === 0x2212

          if (!isCombiningMark && !isDash) {
            const charFromCode = String.fromCodePoint(dCode)
            const finalChar = makeLowercase ? charFromCode.toLowerCase() : charFromCode
            const finalCode = finalChar.codePointAt(0) || dCode
            codePoints.push(finalCode)
            mapPositions.push(i)
          }

          if (dCode > 0xffff) {
            d++ // skip surrogate pair
          }
        }
      }

      i += charCount
    }

    return new NormalizerResult(input.length, codePoints, mapPositions)
  }

  /**
   * Fast string normalization helper returning simplified string
   */
  public static normalize(input: string | null | undefined): string {
    return this.normalizeWithResult(input, true).normalizedString
  }
}
