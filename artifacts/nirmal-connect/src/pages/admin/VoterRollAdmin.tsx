import { useEffect, useMemo, useRef, useState } from "react";
import { adminApi } from "./api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Upload, FileText, AlertCircle, CheckCircle2, Loader2, RefreshCw,
  Trash2, Eye, ShieldAlert,
} from "lucide-react";

interface VoterImportRow {
  id: number;
  filename: string;
  fileSizeBytes: number;
  pageCount: number;
  parsedCount: number;
  skippedCount: number;
  ocrPagesCount: number;
  insertedCount: number;
  updatedCount: number;
  status: string;
  errorMessage: string | null;
  expectedBoothNo: string | null;
  uploadedByName: string | null;
  createdAt: string;
  committedAt: string | null;
}

interface ImportDetail extends VoterImportRow {
  preview: {
    partNumber: string | null;
    pollingStationHint: string | null;
    voters: Array<{
      epicNumber: string; fullName: string; age: number | null;
      gender: string | null; relationType: string | null; relationName: string | null;
      houseNumber: string | null; serialInPart: number | null;
    }>;
    totalVoters: number;
  } | null;
  skipped: Array<{ page: number; reason: string; raw: string }>;
  skippedTotal: number;
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    queued:     { bg: "bg-gray-100 text-gray-700",       label: "Queued (waiting to parse)" },
    parsing:    { bg: "bg-blue-100 text-blue-700",       label: "Parsing…" },
    parsed:     { bg: "bg-amber-100 text-amber-800",     label: "Parsed (review)" },
    committing: { bg: "bg-blue-100 text-blue-700",       label: "Committing…" },
    committed:  { bg: "bg-emerald-100 text-emerald-700", label: "Committed" },
    failed:     { bg: "bg-red-100 text-red-700",         label: "Failed" },
  };
  const cfg = map[status] ?? { bg: "bg-gray-100 text-gray-700", label: status };
  return <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${cfg.bg}`}>{cfg.label}</span>;
}

export default function VoterRollAdmin() {
  const [stats, setStats] = useState<{ totalVoters: number; totalImports: number; committedImports: number } | null>(null);
  const [imports, setImports] = useState<VoterImportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [expectedBoothNo, setExpectedBoothNo] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Detail dialog
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ImportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [committing, setCommitting] = useState(false);

  const reload = () => {
    setLoading(true);
    Promise.all([
      adminApi.getVoterStats() as Promise<{ totalVoters: number; totalImports: number; committedImports: number }>,
      adminApi.getVoterImports() as Promise<{ items: VoterImportRow[] }>,
    ])
      .then(([s, i]) => {
        setStats(s);
        setImports(i.items);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(() => { reload(); }, []);

  // Auto-poll while any batch is mid-processing.
  const hasRunning = useMemo(
    () => imports.some((i) => i.status === "queued" || i.status === "parsing" || i.status === "committing"),
    [imports],
  );
  useEffect(() => {
    if (!hasRunning) return;
    const t = setInterval(reload, 3000);
    return () => clearInterval(t);
  }, [hasRunning]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      await adminApi.uploadVoterPdfs(Array.from(files), expectedBoothNo.trim() || undefined);
      setExpectedBoothNo("");
      if (fileRef.current) fileRef.current.value = "";
      reload();
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function openDetail(id: number) {
    setDetailId(id);
    setDetail(null);
    setDetailLoading(true);
    try {
      const d = await adminApi.getVoterImport(id);
      setDetail(d as ImportDetail);
    } catch (e) {
      setUploadError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function commitDetail() {
    if (!detail) return;
    if (!confirm(`Commit ${detail.preview?.totalVoters ?? 0} voters from ${detail.filename}? Existing rows with the same EPIC will be updated.`)) return;
    setCommitting(true);
    try {
      await adminApi.commitVoterImport(detail.id);
      setDetailId(null);
      setDetail(null);
      reload();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setCommitting(false);
    }
  }

  async function discardDetail() {
    if (!detail) return;
    if (!confirm(`Discard parsed batch ${detail.filename}? It will not be committed.`)) return;
    try {
      await adminApi.discardVoterImport(detail.id);
      setDetailId(null);
      setDetail(null);
      reload();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600" /> Voter Roll
          </h2>
          <p className="text-xs text-muted-foreground max-w-xl">
            Personal data — DPDP Act protected. Every read and write is recorded
            in the audit log with your name. Never share this data outside
            authorized staff.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reload} className="gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Voters loaded</p>
          <p className="text-2xl font-semibold">{stats?.totalVoters?.toLocaleString() ?? "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Imports committed</p>
          <p className="text-2xl font-semibold">{stats?.committedImports ?? "—"}</p>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total batches</p>
          <p className="text-2xl font-semibold">{stats?.totalImports ?? "—"}</p>
        </CardContent></Card>
      </div>

      {/* Upload panel */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-sm">Import from PDFs</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Upload one or many electoral-roll PDFs (Tamil Nadu CEO portal,
            <code className="mx-1">Part No.</code> per file). Each file is parsed
            individually so a bad PDF will not abort the rest. Scanned PDFs need
            OCR and are flagged separately.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <Label className="text-xs">PDF files</Label>
              <Input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf"
                multiple
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files)}
                className="mt-1 text-sm"
                data-testid="voter-roll-file-input"
              />
            </div>
            <div>
              <Label className="text-xs">Expected booth no. (optional)</Label>
              <Input
                value={expectedBoothNo}
                onChange={(e) => setExpectedBoothNo(e.target.value)}
                placeholder="e.g. 23"
                disabled={uploading}
                className="mt-1 text-sm"
              />
            </div>
          </div>
          {uploading && (
            <p className="text-xs text-blue-700 flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" /> Parsing — this may take 30–60s per file…
            </p>
          )}
          {uploadError && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {uploadError}
            </p>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <div>
        <h3 className="font-semibold text-sm mb-2">Import history</h3>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        {loading && imports.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
        ) : imports.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center italic">No imports yet.</p>
        ) : (
          <div className="border rounded-md overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-muted-foreground">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">File</th>
                  <th className="text-left px-2 py-1.5 font-medium">Status</th>
                  <th className="text-right px-2 py-1.5 font-medium">Pages</th>
                  <th className="text-right px-2 py-1.5 font-medium">Parsed</th>
                  <th className="text-right px-2 py-1.5 font-medium">Skipped</th>
                  <th className="text-right px-2 py-1.5 font-medium">OCR</th>
                  <th className="text-right px-2 py-1.5 font-medium">Inserted/Updated</th>
                  <th className="text-left px-2 py-1.5 font-medium">When</th>
                  <th className="text-left px-2 py-1.5 font-medium">By</th>
                  <th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {imports.map((row) => (
                  <tr key={row.id} className="border-t hover:bg-gray-50">
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1.5 max-w-[260px]">
                        <FileText className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                        <span className="truncate font-mono">{row.filename}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{fmtBytes(row.fileSizeBytes)}</p>
                      {row.errorMessage && <p className="text-[10px] text-red-600 truncate max-w-[260px]" title={row.errorMessage}>{row.errorMessage}</p>}
                    </td>
                    <td className="px-2 py-1.5"><StatusPill status={row.status} /></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.pageCount}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.parsedCount}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.skippedCount > 0
                        ? <span className="text-amber-700">{row.skippedCount}</span>
                        : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.ocrPagesCount}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {row.status === "committed"
                        ? <span className="text-emerald-700">+{row.insertedCount} / ~{row.updatedCount}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</td>
                    <td className="px-2 py-1.5">{row.uploadedByName ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">
                      {(row.status === "parsed" || row.status === "committed") && (
                        <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => openDetail(row.id)}>
                          <Eye className="w-3 h-3" /> View
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={detailId !== null} onOpenChange={(o) => { if (!o) { setDetailId(null); setDetail(null); } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.filename ?? "Loading…"}</DialogTitle>
            <DialogDescription>
              Review parsed records before committing. Existing voters with the
              same EPIC are updated, never duplicated.
            </DialogDescription>
          </DialogHeader>
          {detailLoading && <p className="text-sm text-muted-foreground py-6 text-center"><Loader2 className="w-4 h-4 animate-spin inline" /> Loading…</p>}
          {detail && (
            <div className="space-y-3">
              <div className="grid sm:grid-cols-4 gap-2 text-xs">
                <div><span className="text-muted-foreground">Status:</span> <StatusPill status={detail.status} /></div>
                <div><span className="text-muted-foreground">Part:</span> <strong>{detail.preview?.partNumber ?? "—"}</strong></div>
                <div><span className="text-muted-foreground">Parsed:</span> <strong>{detail.parsedCount}</strong></div>
                <div><span className="text-muted-foreground">Skipped:</span> <strong className={detail.skippedCount > 0 ? "text-amber-700" : ""}>{detail.skippedCount}</strong></div>
              </div>

              {detail.preview?.pollingStationHint && (
                <p className="text-xs bg-blue-50 border border-blue-200 rounded p-2">
                  <strong>Polling station hint:</strong> {detail.preview.pollingStationHint}
                </p>
              )}

              {detail.ocrPagesCount > 0 && (
                <p className="text-xs bg-amber-50 border border-amber-200 rounded p-2 flex gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    {detail.ocrPagesCount} page(s) had no extractable text and
                    were processed with the built-in OCR fallback (English +
                    Tamil). Any page where OCR could not recover voter records
                    is listed in the Skipped section below — re-upload a
                    higher-quality scan if needed.
                  </span>
                </p>
              )}

              <div>
                <p className="text-xs font-medium mb-1">Preview ({detail.preview?.voters.length ?? 0} of {detail.preview?.totalVoters ?? 0} shown)</p>
                <div className="border rounded max-h-[40vh] overflow-y-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left px-2 py-1">#</th>
                        <th className="text-left px-2 py-1">EPIC</th>
                        <th className="text-left px-2 py-1">Name</th>
                        <th className="text-left px-2 py-1">Relation</th>
                        <th className="text-right px-2 py-1">Age</th>
                        <th className="text-left px-2 py-1">Sex</th>
                        <th className="text-left px-2 py-1">House</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.preview?.voters ?? []).map((v, i) => (
                        <tr key={v.epicNumber + i} className="border-t">
                          <td className="px-2 py-1 text-muted-foreground">{v.serialInPart ?? i + 1}</td>
                          <td className="px-2 py-1 font-mono">{v.epicNumber}</td>
                          <td className="px-2 py-1">{v.fullName}</td>
                          <td className="px-2 py-1 text-muted-foreground">{v.relationType ? `${v.relationType}: ${v.relationName ?? ""}` : "—"}</td>
                          <td className="px-2 py-1 text-right">{v.age ?? "—"}</td>
                          <td className="px-2 py-1">{v.gender ?? "—"}</td>
                          <td className="px-2 py-1 text-muted-foreground truncate max-w-[120px]">{v.houseNumber ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {detail.skipped.length > 0 && (
                <details className="text-xs border rounded p-2 bg-amber-50/40">
                  <summary className="cursor-pointer font-medium text-amber-800">
                    {detail.skippedTotal} skipped block(s) — click to inspect
                  </summary>
                  <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {detail.skipped.map((s, i) => (
                      <li key={i} className="border-l-2 border-amber-300 pl-2">
                        <span className="text-muted-foreground">page {s.page} · {s.reason}</span>
                        <p className="font-mono text-[10px] truncate">{s.raw}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t">
                {detail.status === "parsed" && (
                  <>
                    <Button variant="outline" size="sm" onClick={discardDetail} className="gap-1 text-red-600 hover:text-red-700">
                      <Trash2 className="w-3.5 h-3.5" /> Discard
                    </Button>
                    <Button size="sm" onClick={commitDetail} disabled={committing || (detail.preview?.totalVoters ?? 0) === 0} className="gap-1">
                      {committing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      Commit {detail.preview?.totalVoters ?? 0} voters
                    </Button>
                  </>
                )}
                {detail.status === "committed" && (
                  <p className="text-xs text-emerald-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Committed at {detail.committedAt ? new Date(detail.committedAt).toLocaleString() : "—"}
                  </p>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
