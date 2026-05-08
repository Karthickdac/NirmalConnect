import {
  pgTable, text, serial, integer, timestamp, index,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// ── Voter exports (task #47) ─────────────────────────────
//
// One row per filtered voter export (CSV / Excel) generated from the
// admin Voters page. Records who exported what, the filter shape, the
// final row count, and a SHA-256 of the file bytes so leaked sheets can
// be traced back here.
//
// Insert happens BEFORE streaming begins so the audit row exists even
// if the download is later cancelled mid-stream. The row is updated
// once with the final SHA after the stream has completed successfully;
// rows whose `fileHash` stays NULL indicate an aborted/failed export.
//
// `actorName` is snapshotted (alongside the FK to users.id) so the
// audit trail survives staff turnover.
export const voterExportsTable = pgTable("voter_exports", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => usersTable.id, { onDelete: "set null" }),
  actorName: text("actor_name").notNull(),
  // "csv" | "xlsx"
  format: text("format").notNull(),
  // Serialized filter object (JSON). Stored as text — the size is small
  // and we never need to query into it.
  filterJson: text("filter_json").notNull(),
  // Short human-readable description of the filter (e.g. "ward=12;
  // gender=F"). Kept alongside the JSON so the log page can render
  // without re-parsing.
  filterSummary: text("filter_summary").notNull().default(""),
  rowCount: integer("row_count").notNull().default(0),
  // Threshold that was in effect when this export ran. Helps explain
  // why a particular export did/did not require a password.
  thresholdAtExport: integer("threshold_at_export").notNull().default(5000),
  // True when the over-threshold password gate was satisfied.
  passwordGatePassed: text("password_gate_passed").notNull().default("false"),
  // True when sensitive voter fields (EPIC, address) were masked in
  // the file because the actor was a non-admin (officer-scope) caller.
  // super_admin / admin pulls keep the data unmasked → "false".
  masked: text("masked").notNull().default("false"),
  // Hex SHA-256 of the streamed file bytes. NULL until the stream
  // finishes successfully.
  fileHash: text("file_hash"),
  fileSizeBytes: integer("file_size_bytes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => ({
  actorIdx: index("voter_exports_actor_idx").on(t.actorId),
  createdIdx: index("voter_exports_created_idx").on(t.createdAt),
}));

export type VoterExport = typeof voterExportsTable.$inferSelect;
