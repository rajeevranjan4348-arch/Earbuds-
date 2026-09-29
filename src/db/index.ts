import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

declare global {
  var _postgresPool: Pool | undefined
}

/**
 * Cloud SQL is optional: without credentials every Postgres-backed feature
 * (map waypoints, workspace items) falls back to in-memory state instead of
 * burning a 15s connection timeout on every request.
 */
export const isDatabaseConfigured = (): boolean =>
  Boolean(
    process.env.SQL_HOST &&
      process.env.SQL_HOST.trim() !== '' &&
      process.env.SQL_DB_NAME &&
      process.env.SQL_USER
  )

export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      database: process.env.SQL_DB_NAME,
      max: 10,
      connectionTimeoutMillis: 3000
    })

    global._postgresPool.on('error', (err) => {
      // Quiet handler for idle pool connection drops
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[Cloud SQL Pool] Connection closed or unavailable:', err.message)
      }
    })
  }
  return global._postgresPool
}

export const getDb = () => {
  if (!global._postgresDb) {
    global._postgresDb = drizzle(createPool(), { schema })
  }
  return global._postgresDb
}

declare global {
  // eslint-disable-next-line no-var
  var _postgresDb: ReturnType<typeof drizzle<typeof schema>> | undefined
}

/**
 * Lazily-bound drizzle client: the pool is only created when a query actually
 * runs, so an unconfigured environment never opens a socket.
 */
export const db = new Proxy({} as ReturnType<typeof getDb>, {
  get: (_target, property, receiver) => Reflect.get(getDb(), property, receiver)
})
