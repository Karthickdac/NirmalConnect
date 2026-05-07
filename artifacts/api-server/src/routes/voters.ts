// Voter Roll routes — super-admin-only.
//
// All endpoints sit behind requireStaff + requireRole("super_admin").
// Personal data (names, EPIC numbers, addresses) is logged on every
// access so we can audit who looked at what after the fact.
import { Router } from "express";
import { db } from "@workspace/db";
import {
  votersTable, voterImportsTable, pollingStationsTable, auditLogTable,
} from "@workspace/db/schema";
import { eq, desc, sql, and, inArray, or, gte, lte } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import { createHash } from "node:crypto";
import { requireStaff, requireRole, type AuthRequest } from "../lib/auth.js";
import {
  parseVoterRollPdf, type ParsedVoter, type ParseResult,
} from "../lib/voterRollParser.js";
import { getVoterScopeForUser, resolveScopeBoothIds } from "../lib/voterScope.js";

const router = Router();

// Voter-scope policy:
//
// `requireVoterScope` — for any endpoint that returns identifiable
//   voter data (names, EPICs, addresses). super_admin only.
//
// `requireVoterAggregateScope` — for endpoints that return ONLY
//   aggregate counts (count(*) per booth, totals, etc.) with no PII.
//   Available to all staff, on the documented basis that a per-booth
//   "voters loaded: N" pill is operational metadata, not personal
//   data, and broadening it lets booth coordinators see coverage
//   without granting them super_admin (which would also grant access
//   to PII rows). The exemption is encoded here as a named array so
//   it shows up in code review when changed.
const requireVoterScope = [
  requireStaff,
  requireRole("super_admin"),
] as const;
const requireVoterAggregateScope = [requireStaff] as const;

const upload = multer({
  storage: multer.memoryStorage(),
  // PDFs in the CEO portal can be 10–40 MB depending on photo density.
  limits: { fileSize: 50 * 1024 * 1024, files: 25 },
  fileFilter: (_req, file, cb) => {
    cb(null, /\.pdf$/i.test(file.originalname));
  },
});

async function logVoterAudit(
  req: AuthRequest,
  action: string,
  target: string,
  detail?: string | null,
) {
  try {
    await db.insert(auditLogTable).values({
      actorId: req.user?.id ?? null,
      actorName: req.user?.name ?? "Unknown",
      action,
      target,
      detail: detail ?? null,
    });
  } catch {
    /* non-critical */
  }
}

// ── POST /api/admin/voters/import — upload + parse 1..N PDFs ─────
//
// Returns 202 Accepted immediately with `{ imports: [{ id, status: "queued" }] }`.
// Each file is parsed in a background job (setImmediate) so a 200-page
// scanned PDF that takes a minute of OCR doesn't time out the request.
// Status transitions: queued → parsing → parsed | failed. The UI polls
// /admin/voters/imports until every batch leaves the parsing state.
router.post(
  "/admin/voters/import",
  ...requireVoterScope,
  (req: AuthRequest, res, next) => {
    upload.array("files", 25)(req, res, async (err) => {
      if (err) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        res.status(400).json({ error: msg });
        return;
      }
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        res.status(400).json({ error: "No PDFs uploaded (field 'files')" });
        return;
      }
      const expectedBoothNo =
        typeof req.body?.expectedBoothNo === "string"
          ? req.body.expectedBoothNo.trim() || null
          : null;

      const actorId = req.user?.id ?? null;
      const actorName = req.user?.name ?? "Unknown";
      const created: Array<{ id: number; filename: string; status: string }> = [];

      // Phase 1 (sync, fast): row-per-file in `queued` so the UI sees
      // every upload immediately, even before parsing starts.
      const jobs: Array<{ rowId: number; file: Express.Multer.File }> = [];
      for (const file of files) {
        const sha = createHash("sha256").update(file.buffer).digest("hex");
        const [importRow] = await db
          .insert(voterImportsTable)
          .values({
            filename: file.originalname,
            fileSha256: sha,
            fileSizeBytes: file.size,
            status: "queued",
            expectedBoothNo,
            uploadedBy: actorId,
            uploadedByName: actorName,
          })
          .returning();
        jobs.push({ rowId: importRow.id, file });
        created.push({ id: importRow.id, filename: file.originalname, status: "queued" });
        await logVoterAudit(req, "VOTER_IMPORT_ENQUEUE", `voter_imports:${importRow.id}`, file.originalname);
      }

      // Phase 2 (async): kick off background parsing. We hold the file
      // buffers in this closure (memory cost is bounded by multer's
      // 50 MB / 25-file ceiling on the request itself).
      setImmediate(() => {
        void runParseJobs(jobs).catch((e) =>
          console.error("[voters] background parse pipeline error:", e),
        );
      });

      res.status(202).json({ imports: created });
      next?.();
    });
  },
);

async function runParseJobs(jobs: Array<{ rowId: number; file: Express.Multer.File }>): Promise<void> {
  for (const { rowId, file } of jobs) {
    await db
      .update(voterImportsTable)
      .set({ status: "parsing" })
      .where(eq(voterImportsTable.id, rowId));
    try {
      const result = await parseVoterRollPdf(file.buffer);
      await db
        .update(voterImportsTable)
        .set({
          status: "parsed",
          pageCount: result.pageCount,
          ocrPagesCount: result.ocrPagesCount,
          parsedCount: result.voters.length,
          skippedCount: result.skipped.length,
          previewJson: JSON.stringify({
            partNumber: result.partNumber,
            pollingStationHint: result.pollingStationHint,
            voters: result.voters,
          } satisfies PersistedPreview),
          skippedJson: JSON.stringify(result.skipped),
        })
        .where(eq(voterImportsTable.id, rowId));
    } catch (e) {
      const msg = (e as Error).message ?? "Parse failed";
      await db
        .update(voterImportsTable)
        .set({ status: "failed", errorMessage: msg })
        .where(eq(voterImportsTable.id, rowId));
    }
  }
}

interface PersistedPreview {
  partNumber: string | null;
  pollingStationHint: string | null;
  voters: ParsedVoter[];
}

// ── GET /api/admin/voters/imports — history list ────────────────
router.get("/admin/voters/imports", ...requireVoterScope, async (req: AuthRequest, res) => {
  await logVoterAudit(req, "VOTER_IMPORT_LIST", "voter_imports", null);
  try {
    const rows = await db
      .select({
        id: voterImportsTable.id,
        filename: voterImportsTable.filename,
        fileSha256: voterImportsTable.fileSha256,
        fileSizeBytes: voterImportsTable.fileSizeBytes,
        pageCount: voterImportsTable.pageCount,
        parsedCount: voterImportsTable.parsedCount,
        skippedCount: voterImportsTable.skippedCount,
        ocrPagesCount: voterImportsTable.ocrPagesCount,
        insertedCount: voterImportsTable.insertedCount,
        updatedCount: voterImportsTable.updatedCount,
        status: voterImportsTable.status,
        errorMessage: voterImportsTable.errorMessage,
        expectedBoothNo: voterImportsTable.expectedBoothNo,
        uploadedByName: voterImportsTable.uploadedByName,
        createdAt: voterImportsTable.createdAt,
        committedAt: voterImportsTable.committedAt,
      })
      .from(voterImportsTable)
      .orderBy(desc(voterImportsTable.createdAt))
      .limit(100);
    res.json({
      items: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        committedAt: r.committedAt?.toISOString() ?? null,
      })),
    });
  } catch (err) {
    console.error("[voters] list imports:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/admin/voters/imports/:id — single batch (with preview) ──
router.get("/admin/voters/imports/:id", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    if (!Number.isFinite(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [row] = await db.select().from(voterImportsTable).where(eq(voterImportsTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    const preview = row.previewJson ? (JSON.parse(row.previewJson) as PersistedPreview) : null;
    const skipped = row.skippedJson ? JSON.parse(row.skippedJson) : [];

    // Truncate the preview voter list — the UI shows the first 50 only
    // with a "show all" link that re-fetches with ?full=1.
    const full = req.query["full"] === "1";
    // Reading PII previews is a sensitive action under DPDP — record
    // who looked, when, and whether the full list was requested.
    await logVoterAudit(
      req,
      full ? "VOTER_IMPORT_VIEW_FULL" : "VOTER_IMPORT_VIEW_PREVIEW",
      `voter_imports:${id}`,
      row.filename,
    );
    const previewVoters = preview?.voters ?? [];

    // Per-EPIC read audit: write one VOTER_READ row per EPIC actually
    // returned in this response, batched 500 per insert. This satisfies
    // the DPDP requirement that every read of identifiable voter data
    // be auditable at row granularity. Failure here must not block the
    // response — the batch-level row above is the fallback.
    const returnedVoters = full ? previewVoters : previewVoters.slice(0, 50);
    if (returnedVoters.length > 0) {
      try {
        const actorId = req.user?.id ?? null;
        const actorName = req.user?.name ?? "Unknown";
        const auditRows = returnedVoters.map((v) => ({
          actorId,
          actorName,
          action: "VOTER_READ",
          target: `voter:${v.epicNumber}`,
          detail: `import:${id} ${row.filename}`,
        }));
        const chunkSize = 500;
        for (let off = 0; off < auditRows.length; off += chunkSize) {
          await db.insert(auditLogTable).values(auditRows.slice(off, off + chunkSize));
        }
      } catch (e) {
        console.error("[voters] per-EPIC read audit failed:", e);
      }
    }
    res.json({
      ...row,
      createdAt: row.createdAt.toISOString(),
      committedAt: row.committedAt?.toISOString() ?? null,
      preview: preview && {
        partNumber: preview.partNumber,
        pollingStationHint: preview.pollingStationHint,
        voters: full ? previewVoters : previewVoters.slice(0, 50),
        totalVoters: previewVoters.length,
      },
      skipped: full ? skipped : (skipped as unknown[]).slice(0, 20),
      skippedTotal: (skipped as unknown[]).length,
      previewJson: undefined,
      skippedJson: undefined,
    });
  } catch (err) {
    console.error("[voters] get import:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /api/admin/voters/imports/:id/commit — write rows to voters ──
const CommitBody = z.object({
  pollingStationId: z.number().int().positive().optional().nullable(),
});

router.post(
  "/admin/voters/imports/:id/commit",
  ...requireVoterScope,
  async (req: AuthRequest, res) => {
    try {
      const id = parseInt(req.params["id"] as string);
      if (!Number.isFinite(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const body = CommitBody.safeParse(req.body ?? {});
      if (!body.success) {
        res.status(400).json({ error: "Invalid", details: body.error.issues });
        return;
      }
      const [batch] = await db.select().from(voterImportsTable).where(eq(voterImportsTable.id, id));
      if (!batch) { res.status(404).json({ error: "Not found" }); return; }
      if (batch.status === "committed") {
        res.status(409).json({ error: "Already committed" });
        return;
      }
      if (batch.status !== "parsed") {
        res.status(409).json({ error: `Cannot commit batch in status '${batch.status}'` });
        return;
      }
      const preview = batch.previewJson ? (JSON.parse(batch.previewJson) as PersistedPreview) : null;
      const previewVoters = preview?.voters ?? [];
      if (previewVoters.length === 0) {
        res.status(400).json({ error: "No parsed voters to commit" });
        return;
      }

      // Resolve target booth: explicit pollingStationId wins; otherwise
      // try to look up by partNumber → polling_stations.boothNo. If no
      // match, voters are still inserted with NULL pollingStationId so
      // staff can map them later.
      let pollingStationId: number | null = body.data.pollingStationId ?? null;
      if (!pollingStationId && preview?.partNumber) {
        const [match] = await db
          .select({ id: pollingStationsTable.id })
          .from(pollingStationsTable)
          .where(eq(pollingStationsTable.boothNo, preview.partNumber))
          .limit(1);
        if (match) pollingStationId = match.id;
      }

      await db
        .update(voterImportsTable)
        .set({ status: "committing" })
        .where(eq(voterImportsTable.id, id));

      // Pre-fetch existing rows in full so we can:
      //   (a) report inserted vs updated counts accurately, and
      //   (b) compute per-field deltas to write a focused overwrite-audit
      //       row (old → new, only changed columns) per touched EPIC.
      const epics = previewVoters.map((v) => v.epicNumber);
      const existing = epics.length === 0 ? [] : await db
        .select({
          epic: votersTable.epicNumber,
          fullName: votersTable.fullName,
          fullNameTa: votersTable.fullNameTa,
          age: votersTable.age,
          gender: votersTable.gender,
          relationType: votersTable.relationType,
          relationName: votersTable.relationName,
          houseNumber: votersTable.houseNumber,
          addressLine: votersTable.addressLine,
          pollingStationId: votersTable.pollingStationId,
          partNumber: votersTable.partNumber,
          serialInPart: votersTable.serialInPart,
        })
        .from(votersTable)
        .where(inArray(votersTable.epicNumber, epics));
      const existingByEpic = new Map(existing.map((e) => [e.epic, e]));
      const existingSet = new Set(existingByEpic.keys());

      // Upsert each voter. Done in a single batched insert with ON CONFLICT
      // so we avoid 1000 round-trips for a 1000-row part.
      const values = previewVoters.map((v) => ({
        epicNumber: v.epicNumber,
        fullName: v.fullName,
        fullNameTa: v.fullNameTa ?? null,
        age: v.age ?? null,
        gender: v.gender ?? null,
        relationType: v.relationType ?? null,
        relationName: v.relationName ?? null,
        relationNameTa: null,
        houseNumber: v.houseNumber ?? null,
        addressLine: v.addressLine ?? null,
        pollingStationId,
        partNumber: v.partNumber ?? preview?.partNumber ?? null,
        serialInPart: v.serialInPart ?? null,
        sourceImportId: id,
        sourcePdf: batch.filename,
        sourcePage: v.sourcePage ?? null,
      }));

      // Null-safe upsert: a sparse parse (OCR gaps, partial pages) must
      // never blank out a previously good column. We COALESCE excluded
      // over the existing row so non-null parsed values win, but a NULL
      // parse keeps whatever was already stored. Same idea for booth
      // mapping — never reset to NULL when the new batch couldn't
      // resolve a polling station.
      await db
        .insert(votersTable)
        .values(values)
        .onConflictDoUpdate({
          target: votersTable.epicNumber,
          set: {
            // fullName is NOT NULL in schema, so a non-empty parse can
            // safely replace; otherwise keep existing.
            fullName: sql`COALESCE(NULLIF(excluded.full_name, ''), ${votersTable.fullName})`,
            fullNameTa: sql`COALESCE(excluded.full_name_ta, ${votersTable.fullNameTa})`,
            age: sql`COALESCE(excluded.age, ${votersTable.age})`,
            gender: sql`COALESCE(excluded.gender, ${votersTable.gender})`,
            relationType: sql`COALESCE(excluded.relation_type, ${votersTable.relationType})`,
            relationName: sql`COALESCE(excluded.relation_name, ${votersTable.relationName})`,
            houseNumber: sql`COALESCE(excluded.house_number, ${votersTable.houseNumber})`,
            addressLine: sql`COALESCE(excluded.address_line, ${votersTable.addressLine})`,
            pollingStationId: sql`COALESCE(excluded.polling_station_id, ${votersTable.pollingStationId})`,
            partNumber: sql`COALESCE(excluded.part_number, ${votersTable.partNumber})`,
            serialInPart: sql`COALESCE(excluded.serial_in_part, ${votersTable.serialInPart})`,
            // Source-tracking fields *do* always update so the audit
            // trail points to the most recent batch that touched the row.
            sourceImportId: sql`excluded.source_import_id`,
            sourcePdf: sql`excluded.source_pdf`,
            sourcePage: sql`COALESCE(excluded.source_page, ${votersTable.sourcePage})`,
          },
        });

      const insertedCount = values.length - existingSet.size;
      const updatedCount = existingSet.size;

      // DPDP audit: one row per touched EPIC. For overwrites we compute
      // a per-field delta (old → new, only changed columns under the
      // null-safe COALESCE rule) so reviewers can reconstruct exactly
      // what staff edited and when. Batched in chunks of 500 to bound
      // round-trips; failure here must not roll back the commit.
      try {
        type ScalarVal = string | number | null;
        const diffableFields: Array<{ key: keyof typeof values[number]; col: keyof (typeof existing)[number] }> = [
          { key: "fullName", col: "fullName" },
          { key: "fullNameTa", col: "fullNameTa" },
          { key: "age", col: "age" },
          { key: "gender", col: "gender" },
          { key: "relationType", col: "relationType" },
          { key: "relationName", col: "relationName" },
          { key: "houseNumber", col: "houseNumber" },
          { key: "addressLine", col: "addressLine" },
          { key: "pollingStationId", col: "pollingStationId" },
          { key: "partNumber", col: "partNumber" },
          { key: "serialInPart", col: "serialInPart" },
        ];
        const auditRows = values.map((v) => {
          const prev = existingByEpic.get(v.epicNumber);
          if (!prev) {
            return {
              actorId: req.user?.id ?? null,
              actorName: req.user?.name ?? "Unknown",
              action: "VOTER_WRITE_INSERT",
              target: `voter:${v.epicNumber}`,
              detail: `import:${id} ${batch.filename}`,
            };
          }
          const delta: Record<string, { old: ScalarVal; new: ScalarVal }> = {};
          for (const { key, col } of diffableFields) {
            const incoming = (v as Record<string, ScalarVal>)[key as string];
            const before = (prev as Record<string, ScalarVal>)[col as string];
            // COALESCE rule: NULL incoming keeps existing → not a change.
            const effective = incoming ?? before;
            if (effective !== before) {
              delta[key as string] = { old: before, new: effective };
            }
          }
          const changedKeys = Object.keys(delta);
          return {
            actorId: req.user?.id ?? null,
            actorName: req.user?.name ?? "Unknown",
            action: changedKeys.length > 0 ? "VOTER_WRITE_UPDATE" : "VOTER_WRITE_NOOP",
            target: `voter:${v.epicNumber}`,
            detail: `import:${id} ${batch.filename}` +
              (changedKeys.length > 0 ? ` changed=${JSON.stringify(delta)}` : " (no field changes)"),
          };
        });
        const chunkSize = 500;
        for (let off = 0; off < auditRows.length; off += chunkSize) {
          await db.insert(auditLogTable).values(auditRows.slice(off, off + chunkSize));
        }
      } catch (e) {
        console.error("[voters] per-EPIC audit insert failed:", e);
      }

      await db
        .update(voterImportsTable)
        .set({
          status: "committed",
          insertedCount,
          updatedCount,
          committedAt: new Date(),
        })
        .where(eq(voterImportsTable.id, id));

      await logVoterAudit(
        req,
        "VOTER_IMPORT_COMMIT",
        `voter_imports:${id}`,
        `${batch.filename} (+${insertedCount} new, ~${updatedCount} updated)`,
      );

      res.json({ ok: true, insertedCount, updatedCount, pollingStationId });
    } catch (err) {
      console.error("[voters] commit:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ── DELETE /api/admin/voters/imports/:id — discard a parsed batch ──
router.delete("/admin/voters/imports/:id", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    const id = parseInt(req.params["id"] as string);
    const [row] = await db.select().from(voterImportsTable).where(eq(voterImportsTable.id, id));
    if (!row) { res.status(404).json({ error: "Not found" }); return; }
    if (row.status === "committed") {
      res.status(409).json({ error: "Cannot discard committed batch" });
      return;
    }
    await db.delete(voterImportsTable).where(eq(voterImportsTable.id, id));
    await logVoterAudit(req, "VOTER_IMPORT_DISCARD", `voter_imports:${id}`, row.filename);
    res.json({ ok: true });
  } catch (err) {
    console.error("[voters] discard:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/admin/voters/coverage — voter counts per polling station ──
//
// Aggregate-only (no names, no EPICs, no PII) — just count(*) per booth.
// Visible to *all* staff (requireStaff) so booth-coordinator and
// hierarchy-admin roles can still see the "voters loaded: N" pill in
// HierarchyAdmin without being granted super_admin. Every individual
// voter read remains gated by requireVoterScope.
router.get("/admin/voters/coverage", ...requireVoterAggregateScope, async (req: AuthRequest, res) => {
  await logVoterAudit(req, "VOTER_COVERAGE_VIEW", "voters", null);
  try {
    const rows = await db
      .select({
        pollingStationId: votersTable.pollingStationId,
        count: sql<number>`count(*)::int`,
      })
      .from(votersTable)
      .groupBy(votersTable.pollingStationId);
    const byBooth: Record<string, number> = {};
    let unassigned = 0;
    let total = 0;
    for (const r of rows) {
      total += r.count;
      if (r.pollingStationId == null) unassigned += r.count;
      else byBooth[String(r.pollingStationId)] = r.count;
    }
    res.json({ byBooth, unassigned, total });
  } catch (err) {
    console.error("[voters] coverage:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── GET /api/admin/voters/stats — dashboard summary ──────────────
router.get("/admin/voters/stats", ...requireVoterScope, async (req: AuthRequest, res) => {
  try {
    await logVoterAudit(req, "VOTER_STATS_VIEW", "voters", null);
    const [[{ totalVoters }], [{ totalImports }], [{ committedImports }]] = await Promise.all([
      db.select({ totalVoters: sql<number>`count(*)::int` }).from(votersTable),
      db.select({ totalImports: sql<number>`count(*)::int` }).from(voterImportsTable),
      db
        .select({ committedImports: sql<number>`count(*)::int` })
        .from(voterImportsTable)
        .where(eq(voterImportsTable.status, "committed")),
    ]);
    res.json({ totalVoters, totalImports, committedImports });
  } catch (err) {
    console.error("[voters] stats:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Voter search & detail (task #43) ─────────────────────────────
//
// These two endpoints are gated by `requireStaff`, NOT requireVoterScope,
// because we want grievance officers / coordinators to see voters within
// their assigned wards / areas / booths. Only super_admin and admin see
// everything; every other staff role (including minister) is filtered
// through `getVoterScopeForUser`. Out-of-scope detail look-ups return
// 404 (not 403) so they don't leak existence of voters outside an
// officer's area.

// Per-user in-memory token bucket: 60 requests / 60s window per userId.
// Naive but sufficient for a single-process deployment; switch to Redis
// when we scale horizontally.
const VOTER_SEARCH_RATE_LIMIT = 60;
const VOTER_SEARCH_WINDOW_MS = 60_000;
const voterSearchHits = new Map<number, number[]>();

function checkVoterRateLimit(userId: number): boolean {
  const now = Date.now();
  const cutoff = now - VOTER_SEARCH_WINDOW_MS;
  const arr = (voterSearchHits.get(userId) ?? []).filter((t) => t > cutoff);
  if (arr.length >= VOTER_SEARCH_RATE_LIMIT) {
    voterSearchHits.set(userId, arr);
    return false;
  }
  arr.push(now);
  voterSearchHits.set(userId, arr);
  return true;
}

const EPIC_RE = /^[A-Z]{3}\d{7}$/i;

const searchQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  boothId: z.coerce.number().int().positive().optional(),
  wardId: z.coerce.number().int().positive().optional(),
  gender: z.enum(["M", "F", "O"]).optional(),
  minAge: z.coerce.number().int().min(0).max(150).optional(),
  maxAge: z.coerce.number().int().min(0).max(150).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

router.get("/admin/voters", requireStaff, async (req: AuthRequest, res) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    if (!checkVoterRateLimit(req.user.id)) {
      res.status(429).json({ error: "Too many requests, slow down." });
      return;
    }

    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
      return;
    }
    const { q, boothId, wardId, gender, minAge, maxAge, page, limit } = parsed.data;

    const scope = await getVoterScopeForUser(req.user);
    const scopedBoothIds = await resolveScopeBoothIds(scope);

    // Out-of-scope short-circuit: officer with no assignments → empty.
    if (scopedBoothIds && scopedBoothIds.length === 0) {
      await logVoterAudit(
        req, "VOTER_SEARCH",
        "voters",
        `q=${q ?? ""};empty_scope;total=0`,
      );
      res.json({ items: [], total: 0, page, limit, hasMore: false });
      return;
    }

    const conds = [] as ReturnType<typeof eq>[];
    if (scopedBoothIds) conds.push(inArray(votersTable.pollingStationId, scopedBoothIds));
    if (boothId) {
      // Ensure booth filter doesn't escape scope.
      if (scopedBoothIds && !scopedBoothIds.includes(boothId)) {
        await logVoterAudit(req, "VOTER_SEARCH", "voters", `boothId=${boothId};out_of_scope`);
        res.json({ items: [], total: 0, page, limit, hasMore: false });
        return;
      }
      conds.push(eq(votersTable.pollingStationId, boothId));
    }
    if (wardId) {
      // Resolve ward → booths once and intersect.
      const wardBooths = await db
        .select({ id: pollingStationsTable.id })
        .from(pollingStationsTable)
        .where(eq(pollingStationsTable.wardId, wardId));
      const wardBoothIds = wardBooths.map((b) => b.id);
      if (wardBoothIds.length === 0) {
        res.json({ items: [], total: 0, page, limit, hasMore: false });
        return;
      }
      conds.push(inArray(votersTable.pollingStationId, wardBoothIds));
    }
    if (gender) conds.push(eq(votersTable.gender, gender));
    if (minAge != null) conds.push(gte(votersTable.age, minAge));
    if (maxAge != null) conds.push(lte(votersTable.age, maxAge));

    // EPIC short-circuit: exact match overrides fuzzy name search.
    let usedEpicShortCircuit = false;
    if (q && EPIC_RE.test(q)) {
      conds.push(eq(votersTable.epicNumber, q.toUpperCase()));
      usedEpicShortCircuit = true;
    } else if (q && q.length >= 2) {
      const like = `%${q.toLowerCase()}%`;
      // Trigram similarity on lower(full_name); ILIKE fallback covers Tamil
      // (no trigram index there, but column is small enough).
      conds.push(
        or(
          sql`lower(${votersTable.fullName}) % ${q.toLowerCase()}`,
          sql`lower(${votersTable.fullName}) ILIKE ${like}`,
          sql`${votersTable.fullNameTa} ILIKE ${like}`,
        )!,
      );
    }

    const whereClause = conds.length > 0 ? and(...conds) : undefined;
    const offset = (page - 1) * limit;

    const orderBy = usedEpicShortCircuit
      ? [desc(votersTable.id)]
      : (q && q.length >= 2
          ? [desc(sql`similarity(lower(${votersTable.fullName}), ${q.toLowerCase()})`)]
          : [desc(votersTable.id)]);

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          id: votersTable.id,
          epicNumber: votersTable.epicNumber,
          fullName: votersTable.fullName,
          fullNameTa: votersTable.fullNameTa,
          age: votersTable.age,
          gender: votersTable.gender,
          relationName: votersTable.relationName,
          partNumber: votersTable.partNumber,
          serialInPart: votersTable.serialInPart,
          pollingStationId: votersTable.pollingStationId,
          boothName: pollingStationsTable.name,
          boothNo: pollingStationsTable.boothNo,
        })
        .from(votersTable)
        .leftJoin(pollingStationsTable, eq(pollingStationsTable.id, votersTable.pollingStationId))
        .where(whereClause)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(votersTable)
        .where(whereClause),
    ]);

    const total = totalRow[0]?.n ?? 0;
    await logVoterAudit(
      req, "VOTER_SEARCH", "voters",
      `q=${q ?? ""};epic=${usedEpicShortCircuit};total=${total};page=${page}`,
    );

    res.json({ items: rows, total, page, limit, hasMore: offset + rows.length < total });
  } catch (err) {
    console.error("[voters] search:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/admin/voters/:id", requireStaff, async (req: AuthRequest, res) => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return; }
    // Apply the same per-user rate limit to the detail endpoint so a staff
    // account can't scrape PII by hammering sequential ids past the search
    // throttle. Shared bucket: detail counts toward the same 60/min budget.
    if (!checkVoterRateLimit(req.user.id)) {
      res.status(429).json({ error: "Too many requests, slow down." });
      return;
    }
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [row] = await db
      .select({
        id: votersTable.id,
        epicNumber: votersTable.epicNumber,
        fullName: votersTable.fullName,
        fullNameTa: votersTable.fullNameTa,
        age: votersTable.age,
        gender: votersTable.gender,
        relationType: votersTable.relationType,
        relationName: votersTable.relationName,
        relationNameTa: votersTable.relationNameTa,
        houseNumber: votersTable.houseNumber,
        addressLine: votersTable.addressLine,
        partNumber: votersTable.partNumber,
        serialInPart: votersTable.serialInPart,
        pollingStationId: votersTable.pollingStationId,
        boothName: pollingStationsTable.name,
        boothNo: pollingStationsTable.boothNo,
        wardId: pollingStationsTable.wardId,
        sourceImportId: votersTable.sourceImportId,
        sourcePdf: votersTable.sourcePdf,
        sourcePage: votersTable.sourcePage,
        createdAt: votersTable.createdAt,
        updatedAt: votersTable.updatedAt,
      })
      .from(votersTable)
      .leftJoin(pollingStationsTable, eq(pollingStationsTable.id, votersTable.pollingStationId))
      .where(eq(votersTable.id, id))
      .limit(1);

    if (!row) { res.status(404).json({ error: "Not found" }); return; }

    // Scope check: out-of-scope is reported as 404 (not 403) to avoid
    // leaking the existence of voters in other officers' wards.
    const scope = await getVoterScopeForUser(req.user);
    if (!scope.unrestricted) {
      const allowedBooths = await resolveScopeBoothIds(scope);
      const inScope =
        row.pollingStationId != null &&
        (allowedBooths?.includes(row.pollingStationId) ?? false);
      if (!inScope) {
        await logVoterAudit(req, "VOTER_DETAIL_DENIED", `voter:${row.epicNumber}`, "out_of_scope");
        res.status(404).json({ error: "Not found" });
        return;
      }
    }

    await logVoterAudit(req, "VOTER_READ", `voter:${row.epicNumber}`, `voter_id=${row.id}`);
    res.json({
      ...row,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    });
  } catch (err) {
    console.error("[voters] detail:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
