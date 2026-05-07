import {
  pgTable, text, serial, integer, timestamp, index, uniqueIndex,
} from "drizzle-orm/pg-core";

// ── Voters (electoral roll) ──────────────────────────────
//
// One row per individual elector imported from the Tamil Nadu CEO
// electoral roll PDFs (one PDF per polling-part for AC 195
// Thiruparankundram). EPIC (Elector's Photo Identity Card) number is
// the natural key — every Indian voter has exactly one.
//
// Personal data: protected under DPDP Act. Reads/writes are admin-only,
// scope-checked, and audited. Never expose on a public route.

export const VOTER_GENDERS = ["M", "F", "O"] as const;
export const VOTER_RELATION_TYPES = [
  "father", "mother", "husband", "wife", "guardian", "other",
] as const;

export const votersTable = pgTable("voters", {
  id: serial("id").primaryKey(),
  // Natural key — uppercase, no spaces. e.g. "ABC1234567".
  epicNumber: text("epic_number").notNull(),
  // Display name (English; Tamil where available from roll).
  fullName: text("full_name").notNull(),
  fullNameTa: text("full_name_ta"),
  age: integer("age"),
  gender: text("gender"), // see VOTER_GENDERS; nullable for unparseable rows
  relationType: text("relation_type"),
  relationName: text("relation_name"),
  relationNameTa: text("relation_name_ta"),
  houseNumber: text("house_number"),
  addressLine: text("address_line"),
  // Booth membership — FK to polling_stations.id. Nullable so a row
  // can be retained even if the booth is later renumbered/removed.
  pollingStationId: integer("polling_station_id"),
  partNumber: text("part_number"),     // ECI "Part No." within the AC
  serialInPart: integer("serial_in_part"), // Sl. No. within that part
  // Provenance: which import batch loaded / last updated this row.
  sourceImportId: integer("source_import_id"),
  sourcePdf: text("source_pdf"),       // Original filename
  sourcePage: integer("source_page"),  // Page within the PDF
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (t) => ({
  // EPIC must be globally unique — same elector cannot exist twice.
  epicUnique: uniqueIndex("voters_epic_unique").on(t.epicNumber),
  boothIdx: index("voters_booth_idx").on(t.pollingStationId),
  // Plain btree on lowercased name; trigram index added separately
  // via SQL since drizzle's index() builder lacks pg_trgm ops.
  nameIdx: index("voters_name_idx").on(t.fullName),
  partIdx: index("voters_part_idx").on(t.partNumber, t.serialInPart),
}));

// ── Import batches (audit + dedupe + status tracking) ────
//
// Each PDF upload creates one row. Multi-file uploads create one row
// per file. Status moves: queued → parsing → parsed (preview) →
// committing → committed | failed.

export const VOTER_IMPORT_STATUSES = [
  "queued", "parsing", "parsed", "committing", "committed", "failed",
] as const;

export const voterImportsTable = pgTable("voter_imports", {
  id: serial("id").primaryKey(),
  // Original PDF filename as uploaded by staff.
  filename: text("filename").notNull(),
  // SHA-256 of the PDF bytes — used to detect duplicate re-uploads.
  fileSha256: text("file_sha256").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull(),
  pageCount: integer("page_count").notNull().default(0),
  // Parser stats. parsedCount = rows successfully extracted;
  // skippedCount = rows we couldn't parse (OCR garbage etc.);
  // ocrPagesCount = pages that fell back to OCR.
  parsedCount: integer("parsed_count").notNull().default(0),
  skippedCount: integer("skipped_count").notNull().default(0),
  ocrPagesCount: integer("ocr_pages_count").notNull().default(0),
  // After commit: how many rows were inserted vs updated.
  insertedCount: integer("inserted_count").notNull().default(0),
  updatedCount: integer("updated_count").notNull().default(0),
  status: text("status").notNull().default("queued"),
  errorMessage: text("error_message"),
  // Parsed records (pre-commit) and skipped raw blocks (for review)
  // are persisted as JSON so the UI can render a preview without
  // holding the parser process.
  previewJson: text("preview_json"),
  skippedJson: text("skipped_json"),
  // Optional booth hint — staff may pre-tag a batch with the booth
  // number expected in the file (cross-checked at commit time).
  expectedBoothNo: text("expected_booth_no"),
  uploadedBy: integer("uploaded_by"),
  uploadedByName: text("uploaded_by_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  committedAt: timestamp("committed_at", { withTimezone: true }),
}, (t) => ({
  shaIdx: index("voter_imports_sha_idx").on(t.fileSha256),
  statusIdx: index("voter_imports_status_idx").on(t.status),
}));

export type Voter = typeof votersTable.$inferSelect;
export type VoterImport = typeof voterImportsTable.$inferSelect;
