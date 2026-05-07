import {
  pgTable, text, serial, integer, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { votersTable } from "./voters";
import { usersTable } from "./users";

// ── Voter relations (task #46/Phase 2) ───────────────────────────
//
// Hand-curated family/social graph on top of the auto-detected
// household groupings. Stored as directed edges (voter → relatedVoter
// with `kind`); the API mirrors creation so the reverse edge is also
// inserted with an inverse kind (parent ↔ child, spouse ↔ spouse).
//
// CASCADE on either side's voter delete: edges go with whichever
// endpoint disappears. The (voterId, relatedVoterId) pair is unique
// — no double-edges.

export const VOTER_RELATION_KINDS = [
  "spouse", "parent", "child", "sibling", "in_law", "other",
] as const;

export const voterRelationsTable = pgTable("voter_relations", {
  id: serial("id").primaryKey(),
  voterId: integer("voter_id").notNull()
    .references(() => votersTable.id, { onDelete: "cascade" }),
  relatedVoterId: integer("related_voter_id").notNull()
    .references(() => votersTable.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),                    // see VOTER_RELATION_KINDS
  notes: text("notes"),
  createdBy: integer("created_by").references(() => usersTable.id, { onDelete: "set null" }),
  createdByName: text("created_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  pairUnique: uniqueIndex("voter_relations_pair_unique").on(t.voterId, t.relatedVoterId),
  voterIdx: index("voter_relations_voter_idx").on(t.voterId),
  relatedIdx: index("voter_relations_related_idx").on(t.relatedVoterId),
}));

export type VoterRelation = typeof voterRelationsTable.$inferSelect;
