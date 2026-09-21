import { db } from '../db'
import { users, workspaceItems, mapMarkers } from '../db/schema'
import { eq, desc } from 'drizzle-orm'

export async function upsertUser(uid: string, email: string, displayName?: string) {
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
    console.error('[Cloud SQL] upsertUser error:', error)
    return null
  }
}

export async function getMarkersForUser(uid?: string) {
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
    console.error('[Cloud SQL] getMarkersForUser error:', error)
    return []
  }
}

export async function addMarker(markerData: {
  uid: string
  title: string
  latitude: number
  longitude: number
  category?: string
  notes?: string
}) {
  try {
    const u = await upsertUser(markerData.uid, `${markerData.uid}@user.com`)
    if (!u) throw new Error('Could not resolve user in Cloud SQL')

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
  } catch (error) {
    console.error('[Cloud SQL] addMarker error:', error)
    return null
  }
}

export async function getWorkspaceItems(uid?: string) {
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
    console.error('[Cloud SQL] getWorkspaceItems error:', error)
    return []
  }
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
  try {
    const u = await upsertUser(item.uid, `${item.uid}@user.com`)
    if (!u) throw new Error('Could not resolve user in Cloud SQL')

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
  } catch (error) {
    console.error('[Cloud SQL] saveWorkspaceItem error:', error)
    return null
  }
}
