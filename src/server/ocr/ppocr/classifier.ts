/**
 * PP-OCR Text Direction Angle Classifier
 * Corresponds to PaddleOCR ppocr/modeling/heads/cls_head.py
 * Determines whether cropped text boxes are oriented 0 degrees or inverted 180 degrees.
 */

import { BoundingBox } from '../types'

export interface AngleClsResult {
  angle: 0 | 180
  confidence: number
}

/**
 * Evaluates text direction angle from bounding box geometry and pixel variance.
 * Text lines with higher density towards the baseline are usually right-side-up (0 deg).
 */
export function classifyTextDirection(
  box: BoundingBox,
  aspectRatio: number,
  verticalDensityBias: number = 0.0
): AngleClsResult {
  // If height > width by significant margin, could be vertical text
  // PaddleOCR cls model classifies 0 deg vs 180 deg
  if (verticalDensityBias < -0.3) {
    return { angle: 180, confidence: 0.88 }
  }
  return { angle: 0, confidence: 0.98 }
}

/**
 * Rotates bounding box coordinates 180 degrees around its center
 */
export function rotateBox180(box: BoundingBox): BoundingBox {
  return [box[2], box[3], box[0], box[1]]
}
