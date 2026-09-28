/**
 * SkillOpt adapter for Iris.
 *
 * Integrates Microsoft's SkillOpt research engine at the system boundary
 * without copying its Python runtime, benchmarks, or UI into Iris.
 *
 * SkillOpt optimizes natural-language skill documents through:
 * rollout -> reflection -> bounded edit selection -> update -> validation gate.
 * See: https://github.com/microsoft/SkillOpt
 *
 * On desktop/self-hosted Iris, the adapter can call the installed
 * skillopt-train / skillopt-eval CLIs. On hosts such as Netlify where the
 * Python CLI is unavailable, the adapter reports unavailable instead of
 * pretending optimization ran.
 */

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import path from 'node:path'

const execFileAsync = promisify(execFile)

export interface SkillOptStatus {
  configured: boolean
  available: boolean
  trainCommand: string
  evalCommand: string
  reason?: string
}

export interface SkillOptTrainOptions {
  config: string
  skill?: string
  numEpochs?: number
  batchSize?: number
  seed?: number
  useGate?: boolean
  outRoot?: string
}

export interface SkillOptEvalOptions {
  config: string
  skill: string
  split?: 'train' | 'valid_seen' | 'valid_unseen' | 'all'
}

function boundedInt(value: number | undefined, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value as number)))
}

function safeRelativePath(value: string, field: string): string {
  const normalized = path.normalize(value.trim())
  if (!normalized || normalized === '.' || path.isAbsolute(normalized) || normalized.startsWith('..' + path.sep) || normalized === '..') {
    throw new Error(field + ' must be a relative workspace path')
  }
  return normalized
}

function skillOptBinary(name: 'train' | 'eval'): string {
  return process.env[name === 'train' ? 'SKILLOPT_TRAIN_BIN' : 'SKILLOPT_EVAL_BIN'] ||
    (name === 'train' ? 'skillopt-train' : 'skillopt-eval')
}

export class SkillOptAdapter {
  private readonly workspaceRoot: string

  constructor(workspaceRoot = process.env.IRIS_WORKSPACE_ROOT || process.cwd()) {
    this.workspaceRoot = workspaceRoot
  }

  getStatus(): SkillOptStatus {
    const trainCommand = skillOptBinary('train')
    const evalCommand = skillOptBinary('eval')
    const configured = Boolean(process.env.SKILLOPT_ENABLED !== 'false')
    const available = configured && (
      existsSync(trainCommand) ||
      existsSync(evalCommand) ||
      process.env.SKILLOPT_AVAILABLE === 'true'
    )

    return {
      configured,
      available,
      trainCommand,
      evalCommand,
      reason: available
        ? undefined
        : 'SkillOpt CLI is not installed or exposed to this Iris runtime. Install SkillOpt with Python 3.10+ on a self-hosted/desktop runtime, or provide SKILLOPT_*_BIN paths.'
    }
  }

  async train(options: SkillOptTrainOptions) {
    this.assertAvailable()
    const config = safeRelativePath(options.config, 'config')
    const args = ['--config', config]

    if (options.numEpochs !== undefined) args.push('--num_epochs', String(boundedInt(options.numEpochs, 1, 1, 100)))
    if (options.batchSize !== undefined) args.push('--batch_size', String(boundedInt(options.batchSize, 1, 1, 1024)))
    if (options.seed !== undefined) args.push('--seed', String(boundedInt(options.seed, 0, 0, 2147483647)))
    if (options.outRoot) args.push('--cfg-options', 'env.out_root=' + safeRelativePath(options.outRoot, 'outRoot'))
    if (options.useGate === false) args.push('--cfg-options', 'evaluation.use_gate=false')

    const result = await execFileAsync(skillOptBinary('train'), args, {
      cwd: this.workspaceRoot,
      timeout: 15 * 60 * 1000,
      maxBuffer: 2 * 1024 * 1024
    })

    return {
      status: 'completed',
      command: skillOptBinary('train'),
      stdout: result.stdout,
      stderr: result.stderr
    }
  }

  async evaluate(options: SkillOptEvalOptions) {
    this.assertAvailable()
    const config = safeRelativePath(options.config, 'config')
    const skill = safeRelativePath(options.skill, 'skill')
    const args = ['--config', config, '--skill', skill]
    if (options.split) args.push('--split', options.split)

    const result = await execFileAsync(skillOptBinary('eval'), args, {
      cwd: this.workspaceRoot,
      timeout: 10 * 60 * 1000,
      maxBuffer: 2 * 1024 * 1024
    })

    return {
      status: 'completed',
      command: skillOptBinary('eval'),
      stdout: result.stdout,
      stderr: result.stderr
    }
  }

  private assertAvailable() {
    const status = this.getStatus()
    if (!status.available) throw new Error(status.reason || 'SkillOpt is unavailable')
  }
}

export const skillOptAdapter = new SkillOptAdapter()
