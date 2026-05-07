import {
  pgTable, text, serial, integer, timestamp, index,
} from "drizzle-orm/pg-core";
import { votersTable } from "./voters";
import { usersTable } from "./users";

// ── Voter contact log (task #46/Phase 2) ─────────────────────────
//
// Append-only log of every interaction with a voter — phone calls,
// SMS, WhatsApp messages, door visits, emails. Used to build the
// per-voter timeline view and the booth coordinator's "who have we
// reached?" coverage report.
//
// CASCADE on voter delete: if the voter row is removed, the log
// entries go with it. We rely on the audit log (admin_audit_log)
// for any deletion forensics, not the contact log.

export const VOTER_CONTACT_TYPES = [
  "call", "sms", "whatsapp", "visit", "email", "other",
] as const;
export const VOTER_CONTACT_DIRECTIONS = ["in", "out"] as const;
export const VOTER_CONTACT_OUTCOMES = [
  "reached", "no_answer", "wrong_number", "refused", "scheduled_followup",
  "promised_support", "issue_logged", "other",
] as const;

export const voterContactLogTable = pgTable("voter_contact_log", {
  id: serial("id").primaryKey(),
  voterId: integer("voter_id").notNull()
    .references(() => votersTable.id, { onDelete: "cascade" }),
  contactType: text("contact_type").notNull(),     // see VOTER_CONTACT_TYPES
  direction: text("direction").notNull().default("out"), // in | out
  outcome: text("outcome"),                        // see VOTER_CONTACT_OUTCOMES
  summary: text("summary").notNull(),              // free-text, max ~1000 chars at the API
  contactedAt: timestamp("contacted_at", { withTimezone: true }).notNull().defaultNow(),
  contactedBy: integer("contacted_by").references(() => usersTable.id, { onDelete: "set null" }),
  // Snapshot of the contacter's name so the log row stays meaningful
  // after staff turnover (FK above goes null but we still know who).
  contactedByName: text("contacted_by_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  voterIdx: index("voter_contact_log_voter_idx").on(t.voterId),
  voterTimeIdx: index("voter_contact_log_voter_time_idx").on(t.voterId, t.contactedAt),
  timeIdx: index("voter_contact_log_time_idx").on(t.contactedAt),
}));

export type VoterContactLog = typeof voterContactLogTable.$inferSelect;
