import {
  pgTable, text, serial, integer, timestamp, primaryKey, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { votersTable } from "./voters";
import { usersTable } from "./users";

// ── Voter tags (task #44) ────────────────────────────────
//
// Editable catalog of voter labels (Supporter, Opposed, etc.) maintained
// by super-admin. Bilingual (EN + TA). Soft-deletable through a
// manual DELETE (cascades to assignments).
export const voterTagsTable = pgTable("voter_tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  nameTa: text("name_ta"),
  // Tailwind-friendly hex (#RRGGBB). Used for chip styling in UI.
  color: text("color").notNull().default("#6366f1"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  nameUnique: uniqueIndex("voter_tags_name_unique").on(t.name),
}));

// Many-to-many voter ↔ tag. Voter delete cascades (re-imports may
// recreate rows but assignments shouldn't dangle).
export const voterTagAssignmentsTable = pgTable("voter_tag_assignments", {
  voterId: integer("voter_id").notNull()
    .references(() => votersTable.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull()
    .references(() => voterTagsTable.id, { onDelete: "cascade" }),
  assignedBy: integer("assigned_by").references(() => usersTable.id, { onDelete: "set null" }),
  // Snapshot the assigner's display name so audit trail survives staff
  // turnover (FK above goes null but we still know who did it).
  assignedByName: text("assigned_by_name"),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pk: primaryKey({ columns: [t.voterId, t.tagId] }),
  tagIdx: index("voter_tag_assignments_tag_idx").on(t.tagId),
}));

// Free-text observations from doorstep visits etc. Author may edit/
// delete their own notes; admins may edit/delete any. All mutations
// are audit-logged so accountability is preserved.
export const voterNotesTable = pgTable("voter_notes", {
  id: serial("id").primaryKey(),
  voterId: integer("voter_id").notNull()
    .references(() => votersTable.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  authorId: integer("author_id").references(() => usersTable.id, { onDelete: "set null" }),
  // Snapshot of author's name at write time — preserved even if the
  // user account is later deleted or renamed.
  authorName: text("author_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  voterIdx: index("voter_notes_voter_idx").on(t.voterId),
  voterCreatedIdx: index("voter_notes_voter_created_idx").on(t.voterId, t.createdAt),
}));

export type VoterTag = typeof voterTagsTable.$inferSelect;
export type VoterTagAssignment = typeof voterTagAssignmentsTable.$inferSelect;
export type VoterNote = typeof voterNotesTable.$inferSelect;
