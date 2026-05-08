// Filtered voter exports (task #47).
//
// POST /api/admin/voters/export — accepts the same filter shape used
// by GET /api/admin/voters, plus { format: "csv"|"xlsx", password? }.
// Streams the result so 100k-row pulls don't OOM. Inserts a row in
// `voter_exports` BEFORE streaming so the audit trail exists even if
// the download is later cancelled. Updates the row with the final
// SHA-256 + byte count once the stream completes.
//
// GET /api/admin/voter-exports — super-admin-only read of the audit
// log (who exported what, when, with which filter, how many rows).
//
// Watermark: every row carries a "Watermark" column =
// "<actorName> @ <iso-ts>" so leaked sheets can be traced back here.
//
// Threshold gate: exports above `EXPORT_PASSWORD_THRESHOLD` rows
// (default 5000) require the caller to re-enter their account
// password. Threshold can be overridden per-request (smaller only —
// callers can't loosen the gate).

import { Router } from "express";
import { db, pool } from "@workspace/db";
import {
  votersTable, voterTagAssignmentsTable, pollingStationsTable,
  voterExportsTable, usersTable, auditLogTable, householdsTable,
} from "@workspace/db/schema";
import { eq, and, inArray, gte, lte, or, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { createHash } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";
import ExcelJS from "exceljs";
import { requireStaff, type AuthRequest, verifyPassword } from "../lib/auth.js";
import { getVoterScopeForUser, resolveScopeBoothIds, voterListOrderBy, VOTER_EPIC_RE } from "../lib/voterScope.js";

// PII masking for officer-scope (non-admin) exports. Officers see the
// full data on screen one row at a time, but a downloaded sheet of
// thousands of rows is a much larger PII surface — so EPIC + address
// columns are reduced to a non-leaky form before the bytes are written.
//
// Rules (kept simple so the file is still useful in the field):
//   - epicNumber  → "••••••<last 4>" (e.g. "••••••3456")
//   - addressLine → "Booth <boothNo> / Part <partNumber>"
//   - houseNumber → blanked
// Booth no, booth name, part, serial, name, age, gender stay intact.
function maskEpic(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (s.length <= 4) return "•".repeat(Math.max(0, s.length - 1)) + s.slice(-1);
  return "•".repeat(s.length - 4) + s.slice(-4);
}
function maskAddress(boothNo: unknown, partNumber: unknown): string {
  const b = boothNo == null || boothNo === "" ? "—" : String(boothNo);
  const p = partNumber == null || partNumber === "" ? "—" : String(partNumber);
  return `Booth ${b} / Part ${p}`;
}

const router = Router();

const EXPORT_PASSWORD_THRESHOLD = 5000;
const STREAM_BATCH_SIZE = 1000;

const EPIC_RE = VOTER_EPIC_RE;

const filterSchema = z.object({
  q: z.string().trim().max(120).optional(),
  boothId: z.number().int().positive().optional(),
  wardId: z.number().int().positive().optional(),
  gender: z.enum(["M", "F", "O"]).optional(),
  minAge: z.number().int().min(0).max(150).optional(),
  maxAge: z.number().int().min(0).max(150).optional(),
  tagIds: z.array(z.number().int().positive()).max(50).optional(),
});

// Allow-listed export columns. Anything not in this set is silently
// dropped — clients cannot make the export include arbitrary fields.
const ALL_COLUMN_KEYS = [
  "id", "epicNumber", "fullName", "fullNameTa", "age", "gender",
  "relationType", "relationName", "houseNumber", "addressLine",
  "boothNo", "boothName", "partNumber", "serialInPart",
  "householdLabel",
] as const;

const bodySchema = z.object({
  format: z.enum(["csv", "xlsx"]),
  password: z.string().min(1).max(200).optional(),
  threshold: z.number().int().min(1).max(EXPORT_PASSWORD_THRESHOLD).optional(),
  filters: filterSchema.default({}),
  // Subset of columns the caller wants in the file (excluding the
  // mandatory "Watermark" column which is always appended). Defaults
  // to the columns visible in the on-screen Voters table — the export
  // mirrors what staff actually see.
  columns: z.array(z.enum(ALL_COLUMN_KEYS)).optional(),
});

type Filter = z.infer<typeof filterSchema>;

function summariseFilter(f: Filter): string {
  const parts: string[] = [];
  if (f.q) parts.push(`q="${f.q}"`);
  if (f.wardId) parts.push(`ward=${f.wardId}`);
  if (f.boothId) parts.push(`booth=${f.boothId}`);
  if (f.gender) parts.push(`gender=${f.gender}`);
  if (f.minAge != null) parts.push(`minAge=${f.minAge}`);
  if (f.maxAge != null) parts.push(`maxAge=${f.maxAge}`);
  if (f.tagIds && f.tagIds.length) parts.push(`tags=[${f.tagIds.join(",")}]`);
  return parts.length ? parts.join("; ") : "(no filters — full scope)";
}

// Build the same WHERE clause the search route uses, scoped through
// the caller's voter-scope. Returns null when the scope is empty
// (officer with no assignments) — caller should treat as "0 results".
async function buildExportWhere(
  user: { id: number; role: string },
  f: Filter,
): Promise<{ where: ReturnType<typeof and> | undefined } | null> {
  const scope = await getVoterScopeForUser(user);
  const scopedBoothIds = await resolveScopeBoothIds(scope);
  if (scopedBoothIds && scopedBoothIds.length === 0) return null;

  const conds: ReturnType<typeof eq>[] = [];
  if (scopedBoothIds) conds.push(inArray(votersTable.pollingStationId, scopedBoothIds));

  if (f.boothId) {
    if (scopedBoothIds && !scopedBoothIds.includes(f.boothId)) return null;
    conds.push(eq(votersTable.pollingStationId, f.boothId));
  }

  if (f.wardId) {
    const wardBooths = await db
      .select({ id: pollingStationsTable.id })
      .from(pollingStationsTable)
      .where(eq(pollingStationsTable.wardId, f.wardId));
    const ids = wardBooths.map((b) => b.id);
    if (ids.length === 0) return null;
    conds.push(inArray(votersTable.pollingStationId, ids));
  }

  if (f.gender) conds.push(eq(votersTable.gender, f.gender));
  if (f.minAge != null) conds.push(gte(votersTable.age, f.minAge));
  if (f.maxAge != null) conds.push(lte(votersTable.age, f.maxAge));

  if (f.tagIds && f.tagIds.length > 0) {
    const tagged = db
      .select({ vid: voterTagAssignmentsTable.voterId })
      .from(voterTagAssignmentsTable)
      .where(inArray(voterTagAssignmentsTable.tagId, f.tagIds));
    conds.push(inArray(votersTable.id, tagged));
  }

  if (f.q && EPIC_RE.test(f.q)) {
    conds.push(eq(votersTable.epicNumber, f.q.toUpperCase()));
  } else if (f.q && f.q.length >= 2) {
    const like = `%${f.q.toLowerCase()}%`;
    conds.push(
      or(
        sql`lower(${votersTable.fullName}) % ${f.q.toLowerCase()}`,
        sql`lower(${votersTable.fullName}) ILIKE ${like}`,
        sql`${votersTable.fullNameTa} ILIKE ${like}`,
      )!,
    );
  }

  return { where: conds.length ? and(...conds) : undefined };
}

// Pipe-through stream that incrementally hashes the bytes flowing
// through it AND counts total bytes. Hash + size are read off the
// instance after the upstream `end` event fires.
class HashingPassThrough extends Transform {
  hash = createHash("sha256");
  bytes = 0;
  override _transform(chunk: Buffer | string, _enc: BufferEncoding, cb: TransformCallback): void {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.hash.update(buf);
    this.bytes += buf.length;
    cb(null, buf);
  }
}

function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : String(v);
  // Escape per RFC 4180.
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const COLUMN_DEFS: Record<typeof ALL_COLUMN_KEYS[number], { header: string }> = {
  id:             { header: "ID" },
  epicNumber:     { header: "EPIC" },
  fullName:       { header: "Name" },
  fullNameTa:     { header: "Name (TA)" },
  age:            { header: "Age" },
  gender:         { header: "Gender" },
  relationType:   { header: "Relation type" },
  relationName:   { header: "Relation name" },
  houseNumber:    { header: "House #" },
  addressLine:    { header: "Address" },
  boothNo:        { header: "Booth #" },
  boothName:      { header: "Booth name" },
  partNumber:     { header: "Part" },
  serialInPart:   { header: "Serial" },
  householdLabel: { header: "Household" },
};

// Default = exact column set rendered by VotersAdmin's table:
// Name (incl. TA), EPIC, Age, Gender, Booth (no + name), Part / Serial.
// Relation name is shown beneath the name in the UI so we include it
// here too. Anything else (address, household, source) is opt-in via
// the "include all fields" toggle in the UI.
const DEFAULT_VISIBLE_COLUMNS: ReadonlyArray<typeof ALL_COLUMN_KEYS[number]> = [
  "fullName", "fullNameTa", "epicNumber", "age", "gender",
  "relationName", "boothNo", "boothName", "partNumber", "serialInPart",
];

router.post("/admin/voters/export", requireStaff, async (req: AuthRequest, res) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.flatten() });
    return;
  }
  const { format, password, threshold, filters, columns: requestedCols } = parsed.data;
  const effectiveThreshold = threshold ?? EXPORT_PASSWORD_THRESHOLD;

  // Resolve column set: caller-supplied (subset of allow-list) or
  // default = visible-on-screen columns. Watermark is always appended
  // last so leaked sheets can be traced.
  const selectedColKeys: ReadonlyArray<typeof ALL_COLUMN_KEYS[number]> =
    requestedCols && requestedCols.length > 0
      ? Array.from(new Set(requestedCols))
      : DEFAULT_VISIBLE_COLUMNS;
  const writeCols: Array<{ key: string; header: string }> = [
    ...selectedColKeys.map((k) => ({ key: k, header: COLUMN_DEFS[k].header })),
    { key: "watermark", header: "Watermark" },
  ];

  // 1) Resolve scope + build where.
  const built = await buildExportWhere(req.user, filters);
  // Officer-scope (non-admin) callers get masked EPIC + address fields
  // in the file. Mirror the role check inside getVoterScopeForUser so
  // both stay in lock-step.
  const scope = await getVoterScopeForUser(req.user);
  const maskPII = !scope.unrestricted;
  let total = 0;
  let where: ReturnType<typeof and> | undefined;
  if (built) {
    where = built.where;
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(votersTable)
      .where(where);
    total = n ?? 0;
  }

  // 2) Threshold gate. Reject WITHOUT inserting an audit row when the
  //    password is missing/wrong — failed attempts shouldn't pollute
  //    the export log.
  let passwordGatePassed = false;
  if (total > effectiveThreshold) {
    if (!password) {
      res.status(403).json({
        error: "password_required",
        message: `This export covers ${total.toLocaleString()} voters. Re-enter your password to confirm.`,
        rowCount: total,
        threshold: effectiveThreshold,
      });
      return;
    }
    const [user] = await db
      .select({ passwordHash: usersTable.passwordHash })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.id));
    if (!user || !verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "invalid_password", message: "Incorrect password." });
      return;
    }
    passwordGatePassed = true;
  }

  // 3) Audit row (pre-stream). Captured BEFORE bytes leave the server
  //    so a cancelled download still leaves a trace; fileHash stays
  //    null until the stream finishes.
  const summary = summariseFilter(filters);
  const [exportRow] = await db.insert(voterExportsTable).values({
    actorId: req.user.id,
    actorName: req.user.name,
    format,
    filterJson: JSON.stringify(filters),
    filterSummary: summary,
    rowCount: total,
    thresholdAtExport: effectiveThreshold,
    passwordGatePassed: passwordGatePassed ? "true" : "false",
    masked: maskPII ? "true" : "false",
  }).returning();

  // Mirror into the central audit log so it shows up alongside other
  // admin actions in the existing audit page.
  db.insert(auditLogTable).values({
    actorId: req.user.id,
    actorName: req.user.name,
    action: "VOTER_EXPORT",
    target: `voter_exports:${exportRow.id}`,
    detail: `format=${format};rows=${total};threshold=${effectiveThreshold};masked=${maskPII};${summary}`,
  }).catch(() => null);

  // 4) Headers + watermark.
  const ts = new Date();
  const tsIso = ts.toISOString();
  const tsFile = tsIso.replace(/[:T]/g, "-").replace(/\..*/, "");
  const filename = `voters-${tsFile}.${format}`;
  const watermark = `${req.user.name} @ ${tsIso}`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Voter-Export-Id", String(exportRow.id));
  res.setHeader("X-Voter-Export-Rows", String(total));

  const hasher = new HashingPassThrough();
  hasher.pipe(res);

  let aborted = false;
  res.on("close", () => {
    if (!res.writableEnded) aborted = true;
  });

  // Mirror the search route's ordering EXACTLY (see voterListOrderBy
  // in lib/voterScope.ts) so the exported rows are in the same order
  // staff see on-screen — including tied-similarity rows.
  const orderBy = voterListOrderBy(filters.q);

  async function* batches() {
    if (!built) return;
    let offset = 0;
    while (!aborted) {
      const rows = await db
        .select({
          id: votersTable.id,
          epicNumber: votersTable.epicNumber,
          fullName: votersTable.fullName,
          fullNameTa: votersTable.fullNameTa,
          age: votersTable.age,
          gender: votersTable.gender,
          relationType: votersTable.relationType,
          relationName: votersTable.relationName,
          houseNumber: votersTable.houseNumber,
          addressLine: votersTable.addressLine,
          partNumber: votersTable.partNumber,
          serialInPart: votersTable.serialInPart,
          boothNo: pollingStationsTable.boothNo,
          boothName: pollingStationsTable.name,
          householdLabel: householdsTable.label,
        })
        .from(votersTable)
        .leftJoin(pollingStationsTable, eq(pollingStationsTable.id, votersTable.pollingStationId))
        .leftJoin(householdsTable, eq(householdsTable.id, votersTable.householdId))
        .where(where)
        .orderBy(...orderBy)
        .limit(STREAM_BATCH_SIZE)
        .offset(offset);
      if (rows.length === 0) break;
      yield rows;
      offset += rows.length;
      if (rows.length < STREAM_BATCH_SIZE) break;
    }
  }

  try {
    res.setHeader(
      "Content-Type",
      format === "csv"
        ? "text/csv; charset=utf-8"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );

    if (format === "csv") {
      // BOM so Excel auto-detects UTF-8 (Tamil names render correctly).
      hasher.write("\uFEFF");
      hasher.write(writeCols.map((c) => csvCell(c.header)).join(",") + "\r\n");
      for await (const batch of batches()) {
        for (const row of batch) {
          const r = row as Record<string, unknown>;
          if (maskPII) {
            r.epicNumber = maskEpic(r.epicNumber);
            r.addressLine = maskAddress(r.boothNo, r.partNumber);
            r.houseNumber = "";
          }
          r.watermark = watermark;
          const line = writeCols.map((c) => csvCell(r[c.key])).join(",") + "\r\n";
          if (!hasher.write(line)) {
            await new Promise<void>((resolve) => hasher.once("drain", resolve));
          }
        }
      }
      hasher.end();
    } else {
      // Streaming xlsx writer. ExcelJS writes the zipped workbook
      // chunk-by-chunk into our HashingPassThrough.
      const wb = new ExcelJS.stream.xlsx.WorkbookWriter({
        stream: hasher,
        useStyles: false,
      });
      const sheet = wb.addWorksheet("Voters");
      sheet.columns = writeCols.map((c) => ({
        header: c.header, key: c.key, width: Math.min(40, Math.max(10, c.header.length + 4)),
      }));
      for await (const batch of batches()) {
        for (const row of batch) {
          const r = row as Record<string, unknown>;
          if (maskPII) {
            r.epicNumber = maskEpic(r.epicNumber);
            r.addressLine = maskAddress(r.boothNo, r.partNumber);
            r.houseNumber = "";
          }
          r.watermark = watermark;
          sheet.addRow(r).commit();
        }
      }
      await sheet.commit();
      await wb.commit();
    }

    // Stream finished — finalize audit row with hash + byte count.
    if (!aborted) {
      const fileHash = hasher.hash.digest("hex");
      await db.update(voterExportsTable)
        .set({
          fileHash,
          fileSizeBytes: hasher.bytes,
          completedAt: new Date(),
        })
        .where(eq(voterExportsTable.id, exportRow.id));
    }
  } catch (err) {
    console.error("[voter-export] stream failed:", err);
    // Best-effort: terminate the response. The audit row stays without
    // a fileHash, signalling an aborted export.
    if (!res.headersSent) {
      res.status(500).json({ error: "Export failed" });
    } else {
      res.destroy();
    }
  }
});

// ── Super-admin audit log ─────────────────────────────────
router.get("/admin/voter-exports", requireStaff, async (req: AuthRequest, res) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden: super_admin only" });
    return;
  }
  const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query["limit"] ?? "100"), 10) || 100));
  const rows = await db
    .select()
    .from(voterExportsTable)
    .orderBy(desc(voterExportsTable.createdAt))
    .limit(limit);
  res.json({
    items: rows.map((r) => ({
      ...r,
      passwordGatePassed: r.passwordGatePassed === "true",
      masked: r.masked === "true",
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  });
});

export default router;
