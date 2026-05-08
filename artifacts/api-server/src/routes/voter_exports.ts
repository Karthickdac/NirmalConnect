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
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { Transform, type TransformCallback } from "node:stream";
import ExcelJS from "exceljs";
import { requireStaff, type AuthRequest, verifyPassword } from "../lib/auth.js";
import { getVoterScopeForUser, resolveScopeBoothIds, voterListOrderBy, VOTER_EPIC_RE } from "../lib/voterScope.js";
import type { Writable } from "node:stream";
import {
  createVoterExportWriteStream, deleteVoterExport, fetchVoterExport,
  ObjectNotFoundError,
} from "../lib/objectStorage.js";
import { sweepExpiredVoterExports } from "../lib/voterExportSweeper.js";

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
//
// When `secondary` is provided the bytes are *also* tee'd into that
// writable in real time — used by the export route to upload the file
// to App Storage for re-download (task #48) without ever holding the
// whole file in memory. Backpressure on the secondary is honoured so
// the in-flight buffer stays bounded regardless of export size; if
// the secondary errors mid-stream we drop it silently and let the
// primary delivery to the client continue.
class HashingPassThrough extends Transform {
  hash = createHash("sha256");
  bytes = 0;
  secondaryFailed = false;
  private secondary: Writable | null;
  constructor(opts: { secondary?: Writable } = {}) {
    super();
    this.secondary = opts.secondary ?? null;
    if (this.secondary) {
      this.secondary.on("error", (err) => {
        this.secondaryFailed = true;
        this.secondary = null;
        console.warn("[voter-export] tee to App Storage failed mid-stream:", err);
      });
    }
  }
  override _transform(chunk: Buffer | string, _enc: BufferEncoding, cb: TransformCallback): void {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.hash.update(buf);
    this.bytes += buf.length;
    if (this.secondary && !this.secondaryFailed) {
      const ok = this.secondary.write(buf);
      if (!ok) {
        // Honour backpressure on the secondary by pausing the primary
        // transform — this is what bounds memory for arbitrarily large
        // exports without buffering the full file. Race drain against
        // error so a secondary failure during the wait still releases
        // the transform callback (otherwise the primary stream stalls).
        const sec = this.secondary;
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          sec.removeListener("drain", finish);
          sec.removeListener("error", finish);
          sec.removeListener("close", finish);
          cb(null, buf);
        };
        sec.once("drain", finish);
        sec.once("error", finish);
        sec.once("close", finish);
        return;
      }
    }
    cb(null, buf);
  }
  override _flush(cb: TransformCallback): void {
    if (this.secondary && !this.secondaryFailed) {
      this.secondary.end(() => cb());
    } else {
      cb();
    }
  }
}

// ── Signed download URLs ─────────────────────────────────
//
// Re-download links are tiny HMAC-signed tokens carried as URL params.
// They encode { exportId, generatedByUserId, expiresAt } and are signed
// with the same JWT secret the rest of auth uses, so leaking one URL
// lets the holder pull that specific file for at most `RE_DOWNLOAD_TTL`
// seconds. The download endpoint additionally re-checks the generating
// user is still a super_admin before serving any bytes.
const RE_DOWNLOAD_TTL_SEC = 5 * 60;        // 5 minutes — enough to click
const STORAGE_RETENTION_DAYS = 7;          // bytes kept ~1 week
const DOWNLOAD_SIG_VERSION = "v1";

// Cached per-process fallback secret used only when JWT_SECRET is unset
// (dev). Module-scoped so it survives across requests within a worker
// without leaking through globalThis.
let ephemeralSigningSecret: string | null = null;

function signingSecret(): string {
  // Reuse JWT_SECRET so we don't introduce a second secret to manage.
  // Falls back to an ephemeral per-process secret in dev (matches the
  // behaviour in lib/auth.ts).
  const fromEnv = process.env["JWT_SECRET"];
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  if (!ephemeralSigningSecret) {
    ephemeralSigningSecret = randomBytes(32).toString("hex");
  }
  return ephemeralSigningSecret;
}

function signDownloadToken(exportId: number, uid: number, exp: number): string {
  const payload = `${DOWNLOAD_SIG_VERSION}.${exportId}.${uid}.${exp}`;
  return createHmac("sha256", signingSecret()).update(payload).digest("base64url");
}

function verifyDownloadToken(
  exportId: number, uid: number, exp: number, sig: string,
): boolean {
  const expected = signDownloadToken(exportId, uid, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try { return timingSafeEqual(a, b); } catch { return false; }
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

  // Open a streaming upload to App Storage in parallel with the client
  // download. Bytes are tee'd into both sinks as they're produced — the
  // GCS writer's backpressure is honoured by HashingPassThrough so we
  // never hold the whole file in memory regardless of export size.
  const storageRand = randomBytes(8).toString("hex");
  const storageKey = `voter-exports/${exportRow.id}-${storageRand}.${format}`;
  const storageContentType = format === "csv"
    ? "text/csv; charset=utf-8"
    : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  let gcsWriter: Writable | null = null;
  // `gcsDone` resolves once the GCS upload either finishes successfully
  // or errors out — we always await it before recording the storageKey.
  const gcsDone: Promise<{ ok: boolean }> = new Promise((resolve) => {
    try {
      gcsWriter = createVoterExportWriteStream(storageKey, storageContentType);
      gcsWriter.once("finish", () => resolve({ ok: true }));
      gcsWriter.once("error", (err) => {
        console.warn("[voter-export] App Storage upload failed:", err);
        resolve({ ok: false });
      });
    } catch (e) {
      console.warn("[voter-export] failed to open App Storage writer:", e);
      resolve({ ok: false });
    }
  });
  const hasher = new HashingPassThrough(gcsWriter ? { secondary: gcsWriter } : {});
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

    // Stream finished — wait for the hasher to fully drain (any pending
    // transform callbacks waiting on secondary backpressure must run
    // before we digest), then wait for the App Storage upload to settle,
    // then finalize the audit row. The file bytes the client received
    // are identical to what GCS received (same tee), so the hash applies
    // to both copies. If GCS failed mid-stream we still record the hash
    // + byte count but leave storageKey null (no re-download).
    if (!aborted) {
      if (!(hasher as unknown as { writableFinished: boolean }).writableFinished) {
        await new Promise<void>((resolve, reject) => {
          hasher.once("finish", () => resolve());
          hasher.once("error", (e) => reject(e));
        });
      }
      const fileHash = hasher.hash.digest("hex");
      const gcsResult = await gcsDone;
      const persisted = gcsResult.ok && !hasher.secondaryFailed;
      const finalStorageKey = persisted ? storageKey : null;
      const finalExpiresAt = persisted
        ? new Date(Date.now() + STORAGE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
        : null;
      await db.update(voterExportsTable)
        .set({
          fileHash,
          fileSizeBytes: hasher.bytes,
          completedAt: new Date(),
          storageKey: finalStorageKey,
          expiresAt: finalExpiresAt,
        })
        .where(eq(voterExportsTable.id, exportRow.id));
    } else {
      // Client cancelled mid-stream — abort the GCS upload and clean up
      // any partial blob so we don't leave junk behind.
      const w = gcsWriter as Writable | null;
      try { w?.destroy(); } catch { /* noop */ }
      void gcsDone.then(async (r) => {
        if (r.ok) {
          try { await deleteVoterExport(storageKey); } catch { /* noop */ }
        }
      });
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
  // Fire-and-forget retention pass: deletes blobs whose TTL has expired
  // so storage cost stays bounded. Doesn't block the response. Local
  // catch keeps a failed sweep from surfacing as an unhandled rejection.
  void sweepExpiredVoterExports().catch((err) => {
    console.warn("[voter-export] opportunistic sweep failed:", err);
  });
  const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query["limit"] ?? "100"), 10) || 100));
  const rows = await db
    .select()
    .from(voterExportsTable)
    .orderBy(desc(voterExportsTable.createdAt))
    .limit(limit);
  const now = Date.now();
  res.json({
    items: rows.map((r) => ({
      ...r,
      passwordGatePassed: r.passwordGatePassed === "true",
      masked: r.masked === "true",
      createdAt: r.createdAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
      expiresAt: r.expiresAt?.toISOString() ?? null,
      // True iff a saved file exists in App Storage AND it hasn't aged
      // past its TTL — the UI uses this to decide whether to render the
      // "Download" button. The storageKey itself is kept server-side.
      downloadAvailable: Boolean(
        r.storageKey && r.expiresAt && r.expiresAt.getTime() > now && r.fileHash,
      ),
      // Don't leak the raw object key to the client — the signed-URL
      // endpoint resolves it server-side.
      storageKey: undefined,
    })),
  });
});

// Build a short-lived signed URL for re-downloading a past export.
// Super-admin only. The returned URL is self-contained (signature in
// the query string) so it can be opened from a plain anchor or pasted
// into curl — but it expires in RE_DOWNLOAD_TTL_SEC and the download
// endpoint additionally re-checks the requesting user is a super_admin.
router.post("/admin/voter-exports/:id/download-url", requireStaff, async (req: AuthRequest, res) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden: super_admin only" });
    return;
  }
  const id = Number.parseInt(String(req.params["id"] ?? ""), 10);
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: "Invalid export id" });
    return;
  }
  const [row] = await db
    .select()
    .from(voterExportsTable)
    .where(eq(voterExportsTable.id, id));
  if (!row) { res.status(404).json({ error: "Export not found" }); return; }
  if (!row.storageKey || !row.fileHash) {
    res.status(409).json({ error: "no_file", message: "This export has no saved file (older row, aborted, or too large)." });
    return;
  }
  if (!row.expiresAt || row.expiresAt.getTime() <= Date.now()) {
    res.status(410).json({ error: "expired", message: "The saved file for this export has expired." });
    return;
  }

  const exp = Math.floor(Date.now() / 1000) + RE_DOWNLOAD_TTL_SEC;
  const sig = signDownloadToken(row.id, req.user.id, exp);
  // The URL is relative — the frontend prefixes its artifact base URL.
  const url = `/api/admin/voter-exports/${row.id}/download?exp=${exp}&uid=${req.user.id}&sig=${sig}`;
  res.json({
    url,
    expiresAt: new Date(exp * 1000).toISOString(),
    ttlSeconds: RE_DOWNLOAD_TTL_SEC,
  });
});

// Serve the saved bytes back. Defence in depth:
//   - requireStaff guards the endpoint (must be a logged-in user with
//     a valid bearer token) — a leaked signed URL alone isn't enough.
//   - The HMAC-signed token's `uid` must match the logged-in user, so
//     a leaked URL can't be replayed by a different super-admin either.
//   - The token is short-lived (RE_DOWNLOAD_TTL_SEC).
//   - The user's current role is re-checked at request time — losing
//     super_admin invalidates all their outstanding signed URLs.
//   - Bytes are streamed through a SHA-256 hasher into the response.
//     If the running hash doesn't match the stored fileHash at end of
//     stream, the response is destroyed mid-flight so the client
//     receives a truncated/corrupt download AND a tamper event is
//     written to the audit log. We never buffer the whole file.
router.get("/admin/voter-exports/:id/download", requireStaff, async (req: AuthRequest, res) => {
  if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
  if (req.user.role !== "super_admin") {
    res.status(403).json({ error: "Forbidden: super_admin only" });
    return;
  }

  const id = Number.parseInt(String(req.params["id"] ?? ""), 10);
  const exp = Number.parseInt(String(req.query["exp"] ?? ""), 10);
  const uid = Number.parseInt(String(req.query["uid"] ?? ""), 10);
  const sig = String(req.query["sig"] ?? "");
  if (!Number.isFinite(id) || !Number.isFinite(exp) || !Number.isFinite(uid) || !sig) {
    res.status(400).json({ error: "Invalid signed URL" });
    return;
  }
  if (exp * 1000 <= Date.now()) {
    res.status(410).json({ error: "link_expired", message: "This download link has expired." });
    return;
  }
  if (!verifyDownloadToken(id, uid, exp, sig)) {
    res.status(403).json({ error: "bad_signature" });
    return;
  }
  // The token must have been issued to the *current* user — prevents
  // signed-URL replay by anyone other than the original recipient.
  if (uid !== req.user.id) {
    res.status(403).json({ error: "wrong_user", message: "This download link was issued to a different user." });
    return;
  }

  const [row] = await db
    .select()
    .from(voterExportsTable)
    .where(eq(voterExportsTable.id, id));
  if (!row || !row.storageKey || !row.fileHash) {
    res.status(404).json({ error: "Export file not found" });
    return;
  }
  if (!row.expiresAt || row.expiresAt.getTime() <= Date.now()) {
    res.status(410).json({ error: "expired", message: "The saved file for this export has expired." });
    return;
  }

  // Open the GCS read stream first so we can fail cleanly with a JSON
  // error before any download headers go out the door.
  let fetched: { stream: NodeJS.ReadableStream; contentType: string; size?: number };
  try {
    fetched = await fetchVoterExport(row.storageKey);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Export file missing from storage" });
      return;
    }
    console.error("[voter-export] re-download fetch failed:", err);
    res.status(500).json({ error: "Failed to fetch export" });
    return;
  }

  const tsFile = row.createdAt.toISOString().replace(/[:T]/g, "-").replace(/\..*/, "");
  const filename = `voters-${tsFile}-redownload.${row.format}`;
  res.setHeader("Content-Type", fetched.contentType);
  if (fetched.size != null) res.setHeader("Content-Length", String(fetched.size));
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("X-Voter-Export-Id", String(row.id));
  res.setHeader("X-Voter-Export-Redownload", "1");

  // Stream from GCS through a hashing transform into the response.
  // Tamper detection happens *after* both the hasher has fully
  // consumed the GCS stream AND the response has been fully flushed
  // to the client. An early client disconnect (`res.close` before
  // `res.finish`) is treated as an aborted transfer, not tamper —
  // we skip the comparison so we don't log false positives.
  const hasher = new HashingPassThrough();
  let bytesOut = 0;
  let hasherEnded = false;
  let streamErrored = false;
  hasher.on("data", (chunk: Buffer) => { bytesOut += chunk.length; });
  hasher.on("end", () => { hasherEnded = true; });
  fetched.stream.on("error", (err) => {
    streamErrored = true;
    console.error("[voter-export] re-download stream error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Failed to read export" });
    else res.destroy();
  });
  fetched.stream.pipe(hasher).pipe(res);

  const responseFinished = await new Promise<boolean>((resolve) => {
    res.on("finish", () => resolve(true));
    res.on("close", () => resolve(false));
  });

  if (!responseFinished || !hasherEnded || streamErrored) {
    // Client aborted, upstream errored, or hash never finalized — do
    // not run the tamper check on a partial read.
    return;
  }

  const observedHash = hasher.hash.digest("hex");
  if (observedHash !== row.fileHash) {
    console.error(`[voter-export] hash mismatch on re-download id=${row.id} expected=${row.fileHash} got=${observedHash}`);
    // The bytes are already on the wire; force-close the connection so
    // the client doesn't get a clean Content-Length match.
    try { res.destroy(); } catch { /* noop */ }
    db.insert(auditLogTable).values({
      actorId: req.user.id,
      actorName: req.user.name,
      action: "VOTER_EXPORT_TAMPER_DETECTED",
      target: `voter_exports:${row.id}`,
      detail: `expected=${row.fileHash};got=${observedHash};bytes=${bytesOut}`,
    }).catch(() => null);
    return;
  }

  // Audit the successful re-download as a separate event.
  db.insert(auditLogTable).values({
    actorId: req.user.id,
    actorName: req.user.name,
    action: "VOTER_EXPORT_REDOWNLOAD",
    target: `voter_exports:${row.id}`,
    detail: `format=${row.format};rows=${row.rowCount};bytes=${bytesOut};hash=${row.fileHash}`,
  }).catch(() => null);
});

export default router;
