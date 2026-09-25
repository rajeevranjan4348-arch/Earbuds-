/**
 * PP-OCR Differentiable Binarization (DBNet) Text Detection Pipeline
 * Corresponds to PaddleOCR ppocr/modeling/heads/det_db_head.py
 * and ppocr/postprocess/db_postprocess.py
 */

import { BoundingBox, Point } from '../types'

export interface DetectionOptions {
  thresh?: number // binarization threshold (default: 0.3)
  boxThresh?: number // min average box probability (default: 0.6)
  unclipRatio?: number // polygon expansion ratio (default: 1.5)
  maxSideLen?: number // max image side length for inference (default: 960)
}

export interface RawDetectedPolygon {
  box: BoundingBox
  score: number
}

/**
 * Calculates polygon area using the shoelace formula
 */
export function polygonArea(points: Point[]): number {
  let area = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area += points[i][0] * points[j][1]
    area -= points[j][0] * points[i][1]
  }
  return Math.abs(area) / 2.0
}

/**
 * Calculates perimeter of a polygon
 */
export function polygonPerimeter(points: Point[]): number {
  let perimeter = 0
  const n = points.length
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const dx = points[j][0] - points[i][0]
    const dy = points[j][1] - points[i][1]
    perimeter += Math.sqrt(dx * dx + dy * dy)
  }
  return perimeter
}

/**
 * Unclips/expands polygon outward using DBNet unclip ratio
 * D = Area * (1 - ratio^2) / Perimeter or Area * ratio / Perimeter
 */
export function unclipPolygon(box: BoundingBox, unclipRatio: number = 1.5): BoundingBox {
  const points: Point[] = [box[0], box[1], box[2], box[3]]
  const area = polygonArea(points)
  const perimeter = polygonPerimeter(points)
  if (perimeter === 0) return box

  const distance = (area * unclipRatio) / perimeter

  // Centroid
  const cx = (box[0][0] + box[1][0] + box[2][0] + box[3][0]) / 4
  const cy = (box[0][1] + box[1][1] + box[2][1] + box[3][1]) / 4

  const unclipped: Point[] = points.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const nx = dx / len
    const ny = dy / len
    return [Math.round(x + nx * distance), Math.round(y + ny * distance)] as Point
  })

  return [unclipped[0], unclipped[1], unclipped[2], unclipped[3]]
}

/**
 * Sorts detected boxes into natural human reading order:
 * Top-to-bottom by row (within height threshold), then left-to-right.
 * Follows PaddleOCR's sort_boxes() implementation.
 */
export function sortBoxesInReadingOrder(boxes: RawDetectedPolygon[]): RawDetectedPolygon[] {
  if (boxes.length <= 1) return boxes

  // Sort initially by top Y coordinate
  const sorted = [...boxes].sort((a, b) => {
    const minY_A = Math.min(a.box[0][1], a.box[1][1])
    const minY_B = Math.min(b.box[0][1], b.box[1][1])
    return minY_A - minY_B
  })

  const rows: RawDetectedPolygon[][] = []
  let currentRow: RawDetectedPolygon[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const currentBox = sorted[i]
    const prevBox = currentRow[currentRow.length - 1]

    const prevHeight = Math.abs(prevBox.box[3][1] - prevBox.box[0][1]) || 20
    const prevY = (prevBox.box[0][1] + prevBox.box[1][1]) / 2
    const currentY = (currentBox.box[0][1] + currentBox.box[1][1]) / 2

    // If vertical distance is smaller than half line height, consider same line/row
    if (Math.abs(currentY - prevY) < prevHeight * 0.6) {
      currentRow.push(currentBox)
    } else {
      // Sort the finished row left-to-right
      currentRow.sort((a, b) => Math.min(a.box[0][0], a.box[3][0]) - Math.min(b.box[0][0], b.box[3][0]))
      rows.push(currentRow)
      currentRow = [currentBox]
    }
  }

  if (currentRow.length > 0) {
    currentRow.sort((a, b) => Math.min(a.box[0][0], a.box[3][0]) - Math.min(b.box[0][0], b.box[3][0]))
    rows.push(currentRow)
  }

  return rows.flat()
}

/**
 * Preprocesses image dimensions for PP-OCR DBNet
 * Standardizes maximum side to maxSideLen while keeping aspect ratio and rounding to multiples of 32
 */
export function calculatePreprocessDimensions(
  width: number,
  height: number,
  maxSideLen: number = 960
): { targetWidth: number; targetHeight: number; scaleX: number; scaleY: number } {
  let w = width
  let h = height
  const maxSide = Math.max(w, h)

  let ratio = 1.0
  if (maxSide > maxSideLen) {
    ratio = maxSideLen / maxSide
  }

  let targetW = Math.round((w * ratio) / 32) * 32
  let targetH = Math.round((h * ratio) / 32) * 32

  targetW = Math.max(32, targetW)
  targetH = Math.max(32, targetH)

  return {
    targetWidth: targetW,
    targetHeight: targetH,
    scaleX: targetW / width,
    scaleY: targetH / height
  }
}
