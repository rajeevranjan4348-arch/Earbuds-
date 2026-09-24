/**
 * Safe JSON Serialization Utility
 * Protects application runtime against 'Uncaught TypeError: Converting circular structure to JSON'
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

      // Check for DOM nodes, events, or window object
      if (
        typeof window !== 'undefined' &&
        (processedVal instanceof Node ||
          processedVal instanceof Event ||
          processedVal === window ||
          processedVal === document)
      ) {
        return '[DOM/Event Node]'
      }

      // Check for Error objects
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

/**
 * Installs global guard on JSON.stringify to safely catch circular structure serialization attempts
 */
export function enableGlobalSafeJsonStringify(): void {
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

// Automatically invoke on module load
enableGlobalSafeJsonStringify()
