/**
 * Safe JSON Serialization Utility for Server Side
 * Prevents 'Uncaught TypeError: Converting circular structure to JSON' across API routes and IPC layers.
 */

export function safeJsonStringify(value: any, replacer?: any, space?: string | number): string {
  const seen = new WeakSet()

  const safeReplacer = (key: string, val: any) => {
    let processedVal = val
    if (typeof replacer === 'function') {
      try {
        processedVal = replacer(key, val)
      } catch (_e) {
        processedVal = val
      }
    }

    if (typeof processedVal === 'object' && processedVal !== null) {
      if (seen.has(processedVal)) {
        return '[Circular]'
      }

      if (processedVal instanceof Error) {
        return {
          name: processedVal.name,
          message: processedVal.message,
          stack: processedVal.stack
        }
      }

      seen.add(processedVal)
    }

    return processedVal
  }

  try {
    return JSON.stringify(value, safeReplacer, space)
  } catch (_err) {
    return JSON.stringify({ error: 'Failed to serialize object safely' }, null, space)
  }
}

export function enableGlobalSafeJsonStringifyServer(): void {
  if (typeof globalThis === 'undefined') return
  const originalStringify = JSON.stringify

  if ((originalStringify as any)?.__isSafePatched) return

  const patchedStringify = function (value: any, replacer?: any, space?: any) {
    try {
      return originalStringify(value, replacer, space)
    } catch (err: any) {
      if (
        err &&
        (err instanceof TypeError ||
          (typeof err.message === 'string' && err.message.toLowerCase().includes('circular')))
      ) {
        return safeJsonStringify(value, replacer, space)
      }
      throw err
    }
  }

  ;(patchedStringify as any).__isSafePatched = true
  JSON.stringify = patchedStringify as typeof JSON.stringify
}

enableGlobalSafeJsonStringifyServer()
