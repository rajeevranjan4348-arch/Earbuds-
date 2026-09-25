import { db, isDatabaseConfigured } from '../db'
import { users, workspaceItems, mapMarkers } from '../db/schema'
import { eq, desc } from 'drizzle-orm'

// In-Memory Storage Fallback when Cloud SQL socket/connection is unavailable
interface LocalUser {
  id: number
  uid: string
  email: string
  displayName: string | null
  createdAt: Date
}

interface LocalMapMarker {
  id: number
  userId: number
  title: string
  latitude: number
  longitude: number
  category: string
  notes: string
  createdAt: Date
}

interface LocalWorkspaceItem {
  id: number
  userId: number
  service: string
  itemId: string
  title: string
  url: string
  snippet: string
  metadata: string
  updatedAt: Date
}

const memoryUsers: LocalUser[] = []
const memoryMarkers: LocalMapMarker[] = []
const memoryWorkspaceItems: LocalWorkspaceItem[] = []
let memoryIdCounter = 1
let isCloudSqlDisabled = false

function handleCloudSqlError(opName: string, error: any) {
  if (!isCloudSqlDisabled) {
    console.log(
      `[Cloud SQL] Database offline during ${opName} (${error?.message || error}). Local memory store active.`
    )
    isCloudSqlDisabled = true
  }
}

export async function upsertUser(uid: string, email: string, displayName?: string) {
  if (isDatabaseConfigured() && !isCloudSqlDisabled) {
    try {
      const existing = await db.select().from(users).where(eq(users.uid, uid)).limit(1)
      if (existing.length > 0) {
        return existing[0]
      }
      const inserted = await db
        .insert(users)
        .values({
          uid,
          email: email || 'anonymous@user.com',
          displayName: displayName || 'User'
        })
        .returning()
      return inserted[0]
    } catch (error) {
      handleCloudSqlError('upsertUser', error)
    }
  }

  // Memory fallback
  let localUser = memoryUsers.find((u) => u.uid === uid)
  if (!localUser) {
    localUser = {
      id: memoryIdCounter++,
      uid,
      email: email || 'anonymous@user.com',
      displayName: displayName || 'User',
      createdAt: new Date()
    }
    memoryUsers.push(localUser)
  }
  return localUser
}

export async function getMarkersForUser(uid?: string) {
  if (isDatabaseConfigured() && !isCloudSqlDisabled) {
    try {
      if (!uid) {
        return await db.select().from(mapMarkers).orderBy(desc(mapMarkers.createdAt)).limit(50)
      }
      const u = await db.select().from(users).where(eq(users.uid, uid)).limit(1)
      if (!u.length) {
        return await db.select().from(mapMarkers).orderBy(desc(mapMarkers.createdAt)).limit(50)
      }
      return await db
        .select()
        .from(mapMarkers)
        .where(eq(mapMarkers.userId, u[0].id))
        .orderBy(desc(mapMarkers.createdAt))
    } catch (error) {
      handleCloudSqlError('getMarkersForUser', error)
    }
  }

  // Memory fallback
  if (!uid) {
    return [...memoryMarkers].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50)
  }
  const u = memoryUsers.find((usr) => usr.uid === uid)
  if (!u) {
    return [...memoryMarkers].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50)
  }
  return memoryMarkers
    .filter((m) => m.userId === u.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 50)
}

export async function addMarker(markerData: {
  uid: string
  title: string
  latitude: number
  longitude: number
  category?: string
  notes?: string
}) {
  if (isDatabaseConfigured() && !isCloudSqlDisabled) {
    try {
      const u = await upsertUser(markerData.uid, `${markerData.uid}@user.com`)
      if (u) {
        const inserted = await db
          .insert(mapMarkers)
          .values({
            userId: u.id,
            title: markerData.title,
            latitude: markerData.latitude,
            longitude: markerData.longitude,
            category: markerData.category || 'general',
            notes: markerData.notes || ''
          })
          .returning()
        return inserted[0]
      }
    } catch (error) {
      handleCloudSqlError('addMarker', error)
    }
  }

  // Memory fallback
  const u = await upsertUser(markerData.uid, `${markerData.uid}@user.com`)
  const newMarker: LocalMapMarker = {
    id: memoryIdCounter++,
    userId: u.id,
    title: markerData.title,
    latitude: markerData.latitude,
    longitude: markerData.longitude,
    category: markerData.category || 'general',
    notes: markerData.notes || '',
    createdAt: new Date()
  }
  memoryMarkers.unshift(newMarker)
  return newMarker
}

export async function getWorkspaceItems(uid?: string) {
  if (isDatabaseConfigured() && !isCloudSqlDisabled) {
    try {
      if (!uid) {
        return await db
          .select()
          .from(workspaceItems)
          .orderBy(desc(workspaceItems.updatedAt))
          .limit(50)
      }
      const u = await db.select().from(users).where(eq(users.uid, uid)).limit(1)
      if (!u.length) {
        return await db
          .select()
          .from(workspaceItems)
          .orderBy(desc(workspaceItems.updatedAt))
          .limit(50)
      }
      return await db
        .select()
        .from(workspaceItems)
        .where(eq(workspaceItems.userId, u[0].id))
        .orderBy(desc(workspaceItems.updatedAt))
    } catch (error) {
      handleCloudSqlError('getWorkspaceItems', error)
    }
  }

  // Memory fallback
  if (!uid) {
    return [...memoryWorkspaceItems].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 50)
  }
  const u = memoryUsers.find((usr) => usr.uid === uid)
  if (!u) {
    return [...memoryWorkspaceItems].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, 50)
  }
  return memoryWorkspaceItems
    .filter((item) => item.userId === u.id)
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 50)
}

export async function saveWorkspaceItem(item: {
  uid: string
  service: string
  itemId: string
  title: string
  url?: string
  snippet?: string
  metadata?: string
}) {
  if (isDatabaseConfigured() && !isCloudSqlDisabled) {
    try {
      const u = await upsertUser(item.uid, `${item.uid}@user.com`)
      if (u) {
        const inserted = await db
          .insert(workspaceItems)
          .values({
            userId: u.id,
            service: item.service,
            itemId: item.itemId,
            title: item.title,
            url: item.url || '',
            snippet: item.snippet || '',
            metadata: item.metadata || ''
          })
          .returning()
        return inserted[0]
      }
    } catch (error) {
      handleCloudSqlError('saveWorkspaceItem', error)
    }
  }

  // Memory fallback
  const u = await upsertUser(item.uid, `${item.uid}@user.com`)
  const newItem: LocalWorkspaceItem = {
    id: memoryIdCounter++,
    userId: u.id,
    service: item.service,
    itemId: item.itemId,
    title: item.title,
    url: item.url || '',
    snippet: item.snippet || '',
    metadata: item.metadata || '',
    updatedAt: new Date()
  }
  memoryWorkspaceItems.unshift(newItem)
  return newItem
}
