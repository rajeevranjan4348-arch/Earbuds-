import { relations } from 'drizzle-orm'
import { integer, pgTable, serial, text, timestamp, doublePrecision } from 'drizzle-orm/pg-core'

// Users table
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at').defaultNow()
})

// Workspace synced items
export const workspaceItems = pgTable('workspace_items', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  service: text('service').notNull(), // 'drive' | 'sheets' | 'gmail' | 'calendar' | 'docs' | 'slides' | 'tasks' | 'chat' | 'forms' | 'meet' | 'contacts' | 'classroom'
  itemId: text('item_id').notNull(),
  title: text('title').notNull(),
  url: text('url'),
  snippet: text('snippet'),
  metadata: text('metadata'),
  updatedAt: timestamp('updated_at').defaultNow()
})

// Map markers & spatial telemetry saved to Cloud SQL
export const mapMarkers = pgTable('map_markers', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .references(() => users.id)
    .notNull(),
  title: text('title').notNull(),
  latitude: doublePrecision('latitude').notNull(),
  longitude: doublePrecision('longitude').notNull(),
  category: text('category').default('general'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow()
})

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  workspaceItems: many(workspaceItems),
  mapMarkers: many(mapMarkers)
}))

export const workspaceItemsRelations = relations(workspaceItems, ({ one }) => ({
  user: one(users, {
    fields: [workspaceItems.userId],
    references: [users.id]
  })
}))

export const mapMarkersRelations = relations(mapMarkers, ({ one }) => ({
  user: one(users, {
    fields: [mapMarkers.userId],
    references: [users.id]
  })
}))
