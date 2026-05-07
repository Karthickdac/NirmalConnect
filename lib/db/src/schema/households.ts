import {
  pgTable, text, serial, integer, timestamp, index, boolean,
} from "drizzle-orm/pg-core";
import { pollingStationsTable } from "./hierarchy";

// ── Households (auto-grouped from electoral roll) ─────────
//
// One row per detected family/household within a single polling
// station. The auto-grouping job reads voters within a booth and
// clusters them by normalized address; this table records the
// resulting groups so the UI can list them, show member counts,
// and let staff plan door-to-door visits by house.
//
// Households are bound to a specific polling station — cross-booth
// households are explicitly out of scope (members may live in the
// same dwelling but appear on different parts of the roll, which is
// rare enough to ignore).
//
// `manuallyEdited` flips to true when staff splits or merges this
// household. The auto-grouping job then skips members of this
// household so a re-import doesn't undo the manual fix.

export const householdsTable = pgTable("households", {
  id: serial("id").primaryKey(),
  // Booth this household belongs to. Nullable so the row survives
  // booth deletion (matches voters.pollingStationId behaviour).
  pollingStationId: integer("polling_station_id").references(
    () => pollingStationsTable.id,
    { onDelete: "set null" },
  ),
  // Normalized address signature: lower-cased, whitespace-collapsed
  // combination of houseNumber + addressLine. Empty string is
  // allowed (rolls sometimes lack address data); the index still
  // groups them together within a booth.
  addressKey: text("address_key").notNull(),
  // Human-readable label — typically the most common Father/Husband
  // relationName among members ("S/o RAMASAMY"), filled in by the
  // auto-grouping job.
  label: text("label"),
  // True once a staff member splits/merges this household. Auto-
  // grouping then leaves these members alone on subsequent runs.
  manuallyEdited: boolean("manually_edited").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  pollAddrIdx: index("households_poll_addr_idx").on(t.pollingStationId, t.addressKey),
}));

export type Household = typeof householdsTable.$inferSelect;
