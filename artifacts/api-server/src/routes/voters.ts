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
import { eq, desc, sql, and, inArray } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import { createHash } from "node:crypto";
import { requireStaff, requireRole, type AuthRequest } from "../lib/auth.js";
import {
  parseVoterRollPdf, type ParsedVoter, type ParseResult,
} from "../lib/voterRollParser.js";

const router = Router();

// ── Hard guard: every voter-route accesses personal data. Require
// staff first, then narrow to super_admin only. The frontend hides
// the nav entry too, but the backend is the source of truth.
const requireVoterScope = [
  requireStaff,
  requireRole("super_admin"),
] as const;

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
router.get("/admin/voters/coverage", requireStaff, async (req: AuthRequest, res) => {
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

export default router;
