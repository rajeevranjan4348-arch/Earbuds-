/**
 * PP-OCRv4 Text Recognition Pipeline (SVTR / CRNN)
 * Corresponds to PaddleOCR ppocr/modeling/architectures/distillation_model.py
 * and ppocr/postprocess/rec_postprocess.py
 */

import { BoundingBox, DetectedTextBlock, RectBox } from '../types'

export interface RecognitionOptions {
  language?: string
  recImageShape?: [number, number, number] // [3, 48, 320]
  dropScore?: number
}

/**
 * Converts 4 polygon points to standard axis-aligned bounding box [x, y, width, height]
 */
export function polygonToRect(box: BoundingBox): RectBox {
  const xs = [box[0][0], box[1][0], box[2][0], box[3][0]]
  const ys = [box[0][1], box[1][1], box[2][1], box[3][1]]

  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  return [minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY)]
}

/**
 * Computes the width and height of an oriented bounding box
 * according to PaddleOCR get_rotate_crop_image
 */
export function getBoundingBoxDimensions(box: BoundingBox): { width: number; height: number } {
  const widthA = Math.hypot(box[1][0] - box[0][0], box[1][1] - box[0][1])
  const widthB = Math.hypot(box[2][0] - box[3][0], box[2][1] - box[3][1])
  const cropWidth = Math.max(widthA, widthB)

  const heightA = Math.hypot(box[3][0] - box[0][0], box[3][1] - box[0][1])
  const heightB = Math.hypot(box[2][0] - box[1][0], box[2][1] - box[1][1])
  const cropHeight = Math.max(heightA, heightB)

  return {
    width: Math.round(cropWidth),
    height: Math.round(cropHeight)
  }
}

/**
 * Post-processes recognized line text:
 * trims punctuation artifacts, normalizes unicode spaces, validates confidence.
 */
export function postProcessRecognizedText(
  rawText: string,
  rawConfidence: number,
  options?: RecognitionOptions
): { text: string; confidence: number; valid: boolean } {
  const minScore = options?.dropScore ?? 0.4
  const text = Array.from(rawText)
    .filter((c) => {
      const code = c.charCodeAt(0)
      return code >= 32 && code !== 127
    })
    .join('')
    .trim()

  if (!text || rawConfidence < minScore) {
    return { text: '', confidence: 0, valid: false }
  }

  return { text, confidence: rawConfidence, valid: true }
}

/**
 * Reconstructs lines into structured text blocks with reading indices
 */
export function assembleTextBlocks(
  items: Array<{
    box: BoundingBox
    text: string
    confidence: number
    angle?: number
  }>,
  language: string = 'en'
): DetectedTextBlock[] {
  return items.map((item, index) => {
    const rect = polygonToRect(item.box)
    return {
      id: `block_${index + 1}`,
      text: item.text,
      confidence: Number(item.confidence.toFixed(4)),
      box: item.box,
      rect,
      angle: item.angle || 0,
      readingOrder: index + 1,
      language
    }
  })
}
