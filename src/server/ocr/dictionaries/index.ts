/**
 * Multilingual Character Dictionaries & CTC Decoder for PaddleOCR
 * Implements standard PP-OCR character mapping, blank token handling,
 * and CTC label decoding with confidence aggregation.
 */

// Basic Latin / English character dictionary (PP-OCRv4 English standard)
export const LATIN_CHARACTERS = [
  ' ', '!', '"', '#', '$', '%', '&', '\'', '(', ')', '*', '+', ',', '-', '.', '/',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', ':', ';', '<', '=', '>', '?',
  '@', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O',
  'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '[', '\\', ']', '^', '_',
  '`', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o',
  'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', '{', '|', '}', '~',
  '€', '£', '¥', '₹', '©', '®', '°', '±', '×', '÷', 'µ', '§', '¶', '•'
]

// Common European accented characters
export const EXTENDED_LATIN = [
  'à', 'á', 'â', 'ã', 'ä', 'å', 'æ', 'ç', 'è', 'é', 'ê', 'ë', 'ì', 'í', 'î', 'ï',
  'ð', 'ñ', 'ò', 'ó', 'ô', 'õ', 'ö', 'ø', 'ù', 'ú', 'û', 'ü', 'ý', 'þ', 'ÿ',
  'À', 'Á', 'Â', 'Ã', 'Ä', 'Å', 'Æ', 'Ç', 'È', 'É', 'Ê', 'Ë', 'Ì', 'Í', 'Î', 'Ï',
  'Ð', 'Ñ', 'Ò', 'Ó', 'Ô', 'Õ', 'Ö', 'Ø', 'Ù', 'Ú', 'Û', 'Ü', 'Ý', 'ß'
]

// Devanagari character keys
export const DEVANAGARI_CHARS = [
  'अ', 'आ', 'इ', 'ई', 'उ', 'ऊ', 'ऋ', 'ए', 'ऐ', 'ओ', 'औ', 'अं', 'अः',
  'क', 'ख', 'ग', 'घ', 'ङ', 'च', 'छ', 'ज', 'झ', 'ञ',
  'ट', 'ठ', 'ड', 'ढ', 'ण', 'त', 'थ', 'द', 'ध', 'न',
  'प', 'फ', 'ब', 'भ', 'म', 'य', 'र', 'ल', 'व', 'श', 'ष', 'स', 'ह',
  'ा', 'ि', 'ी', 'ु', 'ू', 'ृ', 'े', 'ै', 'ो', 'ौ', 'ं', 'ः', '्'
]

/**
 * Returns character dictionary for a given language code
 */
export function getCharacterDictionary(lang: string = 'en'): string[] {
  const base = [...LATIN_CHARACTERS]
  if (lang === 'latin' || lang === 'french' || lang === 'german') {
    return [...base, ...EXTENDED_LATIN]
  }
  if (lang === 'devanagari') {
    return [...base, ...DEVANAGARI_CHARS]
  }
  return base
}

export interface CtcDecodedResult {
  text: string
  confidence: number
}

/**
 * Standard Connectionist Temporal Classification (CTC) Greedy Decoder
 * Follows PaddleOCR ppocr/postprocess/rec_postprocess.py (CTCLabelDecode)
 * 
 * @param predIndices Predicted character indices over time steps
 * @param predProbabilities Softmax probabilities for top predictions
 * @param dictionary Character list (index 0 or last represents CTC blank token)
 * @param blankIndex Index of the blank token (default: 0)
 */
export function ctcGreedyDecode(
  predIndices: number[],
  predProbabilities: number[],
  dictionary: string[],
  blankIndex: number = 0
): CtcDecodedResult {
  const characters: string[] = []
  const confidences: number[] = []
  let lastIndex = -1

  for (let t = 0; t < predIndices.length; t++) {
    const idx = predIndices[t]
    const prob = predProbabilities[t] !== undefined ? predProbabilities[t] : 0.95

    // Blank token or consecutive duplicate token is dropped in CTC
    if (idx !== blankIndex && idx !== lastIndex) {
      // Offset by 1 if 0 is blank
      const charIndex = blankIndex === 0 ? idx - 1 : idx
      if (charIndex >= 0 && charIndex < dictionary.length) {
        characters.push(dictionary[charIndex])
        confidences.push(prob)
      }
    }
    lastIndex = idx
  }

  const text = characters.join('').trim()
  const confidence =
    confidences.length > 0
      ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length
      : 0.0

  return { text, confidence: Number(confidence.toFixed(4)) }
}
