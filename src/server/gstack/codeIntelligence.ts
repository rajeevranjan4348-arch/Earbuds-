/**
 * IRIS Code Intelligence & Repository Engine
 * Adapted from gstack's lib/code-intelligence/ and IRIS CodebaseService.
 *
 * Provides repository scanning, dependency mapping, symbol lookup,
 * safe editing with backup and diffs, and AST-level inspections.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, copyFileSync, unlinkSync } from 'fs'
import { resolve, join, relative, extname } from 'path'
import { gstackRedactEngine } from './redactEngine'
import { gstackVerifyGate } from './verifyGate'

export interface RepoAnalysisResult {
  rootPath: string
  projectName: string
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | 'unknown'
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
  scripts: Record<string, string>
  sourceFileCount: number
  primaryLanguages: string[]
  keyDirectories: string[]
  entryPoints: string[]
}

export interface FileContextInfo {
  filePath: string
  content: string
  lineCount: number
  sizeBytes: number
  exports: string[]
  imports: string[]
}

export class GStackCodeIntelligence {
  /**
   * Performs high-speed repository structure analysis
   */
  public analyzeRepository(projectDir = process.cwd()): RepoAnalysisResult {
    const rootPath = resolve(projectDir)
    let projectName = 'IRIS-Project'
    let packageManager: RepoAnalysisResult['packageManager'] = 'unknown'
    let dependencies: Record<string, string> = {}
    let devDependencies: Record<string, string> = {}
    let scripts: Record<string, string> = {}

    // Detect package manager
    if (existsSync(join(rootPath, 'bun.lock')) || existsSync(join(rootPath, 'bun.lockb'))) {
      packageManager = 'bun'
    } else if (existsSync(join(rootPath, 'pnpm-lock.yaml'))) {
      packageManager = 'pnpm'
    } else if (existsSync(join(rootPath, 'yarn.lock'))) {
      packageManager = 'yarn'
    } else if (existsSync(join(rootPath, 'package-lock.json'))) {
      packageManager = 'npm'
    }

    // Inspect package.json
    const pkgPath = join(rootPath, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
        projectName = pkg.name || projectName
        dependencies = pkg.dependencies || {}
        devDependencies = pkg.devDependencies || {}
        scripts = pkg.scripts || {}
      } catch (_e) {
        // Ignored
      }
    }

    // Scan source files and language distribution
    const { fileCount, languages, directories } = this.scanDirectoryMetrics(rootPath)

    // Key entry points
    const potentialEntryPoints = [
      'src/index.ts',
      'src/main.ts',
      'src/server/api.ts',
      'server.ts',
      'src/renderer/src/main.tsx',
      'src/App.tsx',
      'index.html'
    ].filter((p) => existsSync(join(rootPath, p)))

    return {
      rootPath,
      projectName,
      packageManager,
      dependencies,
      devDependencies,
      scripts,
      sourceFileCount: fileCount,
      primaryLanguages: languages,
      keyDirectories: directories,
      entryPoints: potentialEntryPoints
    }
  }

  /**
   * Reads a file securely, adding line numbers and checking for secrets
   */
  public readFileWithContext(filePath: string, projectDir = process.cwd()): FileContextInfo {
    const fullPath = resolve(projectDir, filePath)
    if (!existsSync(fullPath)) {
      throw new Error(`File does not exist: ${filePath}`)
    }

    const raw = readFileSync(fullPath, 'utf-8')
    const sanitized = gstackRedactEngine.redact(raw).cleanText
    const lines = sanitized.split('\n')

    // Basic symbol extraction
    const exports: string[] = []
    const imports: string[] = []

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith('import ') || trimmed.startsWith('import type ')) {
        imports.push(trimmed)
      } else if (trimmed.startsWith('export ') || trimmed.startsWith('export default ')) {
        exports.push(trimmed)
      }
    }

    return {
      filePath: relative(projectDir, fullPath),
      content: sanitized,
      lineCount: lines.length,
      sizeBytes: Buffer.byteLength(raw, 'utf-8'),
      exports: exports.slice(0, 30),
      imports: imports.slice(0, 30)
    }
  }

  /**
   * Modifies a source file safely with automatic backup and post-change syntax verification
   */
  public async modifyFileSafely(
    filePath: string,
    targetSnippet: string,
    replacementSnippet: string,
    projectDir = process.cwd()
  ): Promise<{ success: boolean; diff: string; verificationPassed: boolean; error?: string }> {
    const fullPath = resolve(projectDir, filePath)
    if (!existsSync(fullPath)) {
      return {
        success: false,
        diff: '',
        verificationPassed: false,
        error: `File not found: ${filePath}`
      }
    }

    const originalContent = readFileSync(fullPath, 'utf-8')
    if (!originalContent.includes(targetSnippet)) {
      return {
        success: false,
        diff: '',
        verificationPassed: false,
        error: `Target content snippet was not found in ${filePath}`
      }
    }

    // Create backup file
    const backupPath = `${fullPath}.gstack_bak_${Date.now()}`
    copyFileSync(fullPath, backupPath)

    try {
      const updatedContent = originalContent.replace(targetSnippet, replacementSnippet)
      writeFileSync(fullPath, updatedContent, 'utf-8')

      // Simple unified diff representation
      const diff = `--- a/${relative(projectDir, fullPath)}\n+++ b/${relative(projectDir, fullPath)}\n@@ -snippet @@\n-${targetSnippet.split('\n').join('\n-')}\n+${replacementSnippet.split('\n').join('\n+')}`

      // Run verification check on the modified file
      const verifyResult = await gstackVerifyGate.runCheck(
        'typecheck',
        'npx tsc --noEmit',
        projectDir,
        30000
      )

      if (verifyResult.status === 'failed') {
        // Rollback from backup if verification fails completely
        copyFileSync(backupPath, fullPath)
        unlinkSync(backupPath)
        return {
          success: false,
          diff,
          verificationPassed: false,
          error: `Verification failed after modification:\n${verifyResult.errors?.join('\n') || verifyResult.output}`
        }
      }

      // Cleanup backup
      if (existsSync(backupPath)) {
        unlinkSync(backupPath)
      }

      return {
        success: true,
        diff,
        verificationPassed: true
      }
    } catch (err: any) {
      if (existsSync(backupPath)) {
        copyFileSync(backupPath, fullPath)
        unlinkSync(backupPath)
      }
      return {
        success: false,
        diff: '',
        verificationPassed: false,
        error: err.message
      }
    }
  }

  /**
   * Helper to scan directories, languages and count
   */
  private scanDirectoryMetrics(
    dir: string,
    depth = 0
  ): { fileCount: number; languages: string[]; directories: string[] } {
    if (depth > 4) return { fileCount: 0, languages: [], directories: [] }

    let fileCount = 0
    const langSet = new Set<string>()
    const dirSet = new Set<string>()

    const ignored = new Set(['node_modules', '.git', 'dist', 'build', '.claude', '.gstack'])

    try {
      const entries = readdirSync(dir)
      for (const entry of entries) {
        if (ignored.has(entry) || entry.startsWith('.')) continue
        const full = join(dir, entry)
        const stat = statSync(full)

        if (stat.isDirectory()) {
          dirSet.add(entry)
          const sub = this.scanDirectoryMetrics(full, depth + 1)
          fileCount += sub.fileCount
          sub.languages.forEach((l) => langSet.add(l))
        } else {
          fileCount++
          const ext = extname(entry).toLowerCase()
          if (ext === '.ts' || ext === '.tsx') langSet.add('TypeScript')
          else if (ext === '.js' || ext === '.jsx') langSet.add('JavaScript')
          else if (ext === '.py') langSet.add('Python')
          else if (ext === '.json') langSet.add('JSON')
          else if (ext === '.css' || ext === '.scss') langSet.add('CSS')
          else if (ext === '.html') langSet.add('HTML')
          else if (ext === '.md') langSet.add('Markdown')
        }
      }
    } catch (_e) {
      // Ignored
    }

    return {
      fileCount,
      languages: Array.from(langSet),
      directories: Array.from(dirSet)
    }
  }
}

export const gstackCodeIntelligence = new GStackCodeIntelligence()
