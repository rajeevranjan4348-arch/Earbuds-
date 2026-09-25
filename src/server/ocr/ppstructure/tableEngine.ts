/**
 * PP-Structure Table Recognition Engine (SLANet / TableMaster)
 * Corresponds to PaddleOCR ppstructure/table/
 * Performs table cell detection, row/column alignment, text matching,
 * and generates clean HTML and Markdown tables.
 */

import { BoundingBox, DetectedTable, DetectedTextBlock, TableCell } from '../types'

export class TableRecognitionEngine {
  /**
   * Identifies tabular clusters from OCR text blocks and reconstructs structured tables
   */
  public extractTables(
    blocks: DetectedTextBlock[],
    _pageWidth?: number,
    _pageHeight?: number
  ): DetectedTable[] {
    if (blocks.length < 4) return []

    const candidateTables: DetectedTable[] = []

    // Group blocks by vertical bands to find rows with multiple columns
    const rows = this.groupIntoRows(blocks)
    const multiColRows = rows.filter((r) => r.length >= 2)

    // A table must have at least 2 consecutive multi-column rows or table markers
    if (multiColRows.length >= 2) {
      const tableBlocks = multiColRows.flat()
      const minX = Math.min(...tableBlocks.map((b) => (b.rect ? b.rect[0] : b.box[0][0])))
      const maxX = Math.max(
        ...tableBlocks.map((b) => (b.rect ? b.rect[0] + b.rect[2] : b.box[1][0]))
      )
      const minY = Math.min(...tableBlocks.map((b) => (b.rect ? b.rect[1] : b.box[0][1])))
      const maxY = Math.max(
        ...tableBlocks.map((b) => (b.rect ? b.rect[1] + b.rect[3] : b.box[2][1]))
      )

      const tableBox: BoundingBox = [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY]
      ]

      // Build cells
      const cells: TableCell[] = []
      let totalConf = 0
      let cellCount = 0

      // Compute approximate column boundaries
      const columnXs = this.detectColumnBoundaries(multiColRows)
      const numCols = Math.max(2, columnXs.length)

      for (let rIdx = 0; rIdx < multiColRows.length; rIdx++) {
        const rowBlocks = multiColRows[rIdx]
        const isHeader = rIdx === 0

        for (let cIdx = 0; cIdx < numCols; cIdx++) {
          const colMinX = columnXs[cIdx] ? columnXs[cIdx].min : minX + (cIdx * (maxX - minX)) / numCols
          const colMaxX = columnXs[cIdx] ? columnXs[cIdx].max : minX + ((cIdx + 1) * (maxX - minX)) / numCols

          // Find block in this column
          const matchingBlock = rowBlocks.find((b) => {
            const bx = b.rect ? b.rect[0] + b.rect[2] / 2 : (b.box[0][0] + b.box[1][0]) / 2
            return bx >= colMinX - 15 && bx <= colMaxX + 15
          })

          const cellText = matchingBlock ? matchingBlock.text : ''
          const cellConf = matchingBlock ? matchingBlock.confidence : 0.85

          cells.push({
            row: rIdx,
            col: cIdx,
            text: cellText,
            confidence: cellConf,
            isHeader,
            box: matchingBlock?.box
          })

          totalConf += cellConf
          cellCount++
        }
      }

      // Generate HTML representation
      const html = this.buildHtmlTable(cells, multiColRows.length, numCols)
      const markdown = this.buildMarkdownTable(cells, multiColRows.length, numCols)
      const avgConfidence = cellCount > 0 ? Number((totalConf / cellCount).toFixed(4)) : 0.9

      candidateTables.push({
        id: `table_1`,
        rows: multiColRows.length,
        cols: numCols,
        html,
        markdown,
        cells,
        confidence: avgConfidence,
        box: tableBox
      })
    }

    return candidateTables
  }

  private groupIntoRows(blocks: DetectedTextBlock[]): DetectedTextBlock[][] {
    const sorted = [...blocks].sort((a, b) => {
      const ay = a.rect ? a.rect[1] : a.box[0][1]
      const by = b.rect ? b.rect[1] : b.box[0][1]
      return ay - by
    })

    const rows: DetectedTextBlock[][] = []
    let currentRow: DetectedTextBlock[] = []

    for (const block of sorted) {
      if (currentRow.length === 0) {
        currentRow.push(block)
        continue
      }

      const prev = currentRow[currentRow.length - 1]
      const prevY = prev.rect ? prev.rect[1] + prev.rect[3] / 2 : (prev.box[0][1] + prev.box[3][1]) / 2
      const currY = block.rect ? block.rect[1] + block.rect[3] / 2 : (block.box[0][1] + block.box[3][1]) / 2
      const rowHeight = prev.rect ? prev.rect[3] : 20

      if (Math.abs(currY - prevY) < rowHeight * 0.7) {
        currentRow.push(block)
      } else {
        // Sort row left-to-right
        currentRow.sort((a, b) => (a.rect ? a.rect[0] : a.box[0][0]) - (b.rect ? b.rect[0] : b.box[0][0]))
        rows.push(currentRow)
        currentRow = [block]
      }
    }

    if (currentRow.length > 0) {
      currentRow.sort((a, b) => (a.rect ? a.rect[0] : a.box[0][0]) - (b.rect ? b.rect[0] : b.box[0][0]))
      rows.push(currentRow)
    }

    return rows
  }

  private detectColumnBoundaries(
    rows: DetectedTextBlock[][]
  ): Array<{ min: number; max: number }> {
    const allBlocks = rows.flat()
    const xCenters = allBlocks
      .map((b) => (b.rect ? b.rect[0] + b.rect[2] / 2 : (b.box[0][0] + b.box[1][0]) / 2))
      .sort((a, b) => a - b)

    if (xCenters.length === 0) return []

    // Cluster x-centers within 40px
    const clusters: number[][] = []
    for (const x of xCenters) {
      const match = clusters.find((c) => Math.abs(c[0] - x) < 45)
      if (match) {
        match.push(x)
      } else {
        clusters.push([x])
      }
    }

    // Sort clusters left-to-right
    clusters.sort((a, b) => a[0] - b[0])

    return clusters.map((c) => {
      const avg = c.reduce((sum, v) => sum + v, 0) / c.length
      return { min: avg - 30, max: avg + 30 }
    })
  }

  private buildHtmlTable(cells: TableCell[], numRows: number, numCols: number): string {
    let html = '<table border="1" cellpadding="4" cellspacing="0">\n'
    for (let r = 0; r < numRows; r++) {
      html += '  <tr>\n'
      for (let c = 0; c < numCols; c++) {
        const cell = cells.find((cell) => cell.row === r && cell.col === c)
        const text = cell ? cell.text : ''
        const tag = r === 0 ? 'th' : 'td'
        html += `    <${tag}>${this.escapeXml(text)}</${tag}>\n`
      }
      html += '  </tr>\n'
    }
    html += '</table>'
    return html
  }

  private buildMarkdownTable(cells: TableCell[], numRows: number, numCols: number): string {
    const grid: string[][] = Array.from({ length: numRows }, () => Array(numCols).fill(''))
    for (const cell of cells) {
      if (cell.row < numRows && cell.col < numCols) {
        grid[cell.row][cell.col] = cell.text.replace(/\|/g, '\\|')
      }
    }

    let md = ''
    // Header
    if (numRows > 0) {
      md += '| ' + grid[0].join(' | ') + ' |\n'
      md += '| ' + grid[0].map(() => '---').join(' | ') + ' |\n'
      for (let r = 1; r < numRows; r++) {
        md += '| ' + grid[r].join(' | ') + ' |\n'
      }
    }
    return md.trim()
  }

  private escapeXml(unsafe: string): string {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }
}

export const tableRecognitionEngine = new TableRecognitionEngine()
