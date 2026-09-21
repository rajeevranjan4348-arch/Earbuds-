/**
 * Claude Context - GitHub Integration & Repository Cloner
 * Clones, fetches, and manages repositories in isolated sandbox workspaces.
 * Strictly guards against path traversal, command injection, and token leakage.
 */

import { execFile } from 'child_process'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { resolve } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const WORKSPACE_BASE = '/tmp/iris_codebases'

// Ensure root workspace exists
try {
  if (!existsSync(WORKSPACE_BASE)) {
    mkdirSync(WORKSPACE_BASE, { recursive: true })
  }
} catch (_e) {}

/**
 * Validates and normalizes GitHub URL
 */
export function sanitizeGithubUrl(rawUrl: string): {
  owner: string
  repo: string
  cleanUrl: string
} {
  const trimmed = rawUrl.trim()
  const match = trimmed.match(
    /^https:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git)?\/?$/
  )
  if (!match) {
    throw new Error('Invalid GitHub repository URL. Expected format: https://github.com/owner/repo')
  }
  const owner = match[1]
  const repo = match[2]
  return {
    owner,
    repo,
    cleanUrl: `https://github.com/${owner}/${repo}.git`
  }
}

/**
 * Returns isolated path for a project repository
 */
export function getProjectWorkspacePath(projectId: string): string {
  const safeId = projectId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const target = resolve(WORKSPACE_BASE, safeId)
  if (!target.startsWith(WORKSPACE_BASE)) {
    throw new Error('Path traversal detected in project workspace resolution')
  }
  return target
}

/**
 * Clones or updates a GitHub repository into isolated workspace
 */
export async function syncGithubRepository(
  githubUrl: string,
  projectId: string,
  githubToken?: string
): Promise<{ repoPath: string; owner: string; repo: string; isNewClone: boolean }> {
  const { owner, repo, cleanUrl } = sanitizeGithubUrl(githubUrl)
  const targetDir = getProjectWorkspacePath(projectId)

  let cloneUrl = cleanUrl
  if (githubToken) {
    // Inject token safely into HTTPS clone URL for authenticated private repos
    cloneUrl = `https://x-access-token:${encodeURIComponent(githubToken)}@github.com/${owner}/${repo}.git`
  }

  const isNewClone = !existsSync(targetDir)

  if (isNewClone) {
    mkdirSync(targetDir, { recursive: true })
    try {
      // Shallow clone with depth 1 for speed & minimal disk footprint
      await execFileAsync('git', ['clone', '--depth', '1', cloneUrl, '.'], {
        cwd: targetDir,
        timeout: 60000
      })
    } catch (err: any) {
      // Clean up failed clone
      try {
        rmSync(targetDir, { recursive: true, force: true })
      } catch (_e) {}
      const sanitizedMsg = (err?.message || 'Git clone failed').replace(
        /https:\/\/.*@github\.com/,
        'https://[TOKEN]@github.com'
      )
      throw new Error(`Failed to clone GitHub repository: ${sanitizedMsg}`)
    }
  } else {
    // Fast update existing checkout
    try {
      await execFileAsync('git', ['pull', '--depth', '1'], {
        cwd: targetDir,
        timeout: 30000
      })
    } catch (_pullErr) {
      // If pull fails, re-use existing local workspace snapshot
    }
  }

  return {
    repoPath: targetDir,
    owner,
    repo,
    isNewClone
  }
}

/**
 * Delete a cloned repository workspace
 */
export function removeProjectWorkspace(projectId: string): boolean {
  try {
    const targetDir = getProjectWorkspacePath(projectId)
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
      return true
    }
  } catch (_e) {}
  return false
}
