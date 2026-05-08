import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getToken } from "@/lib/auth";
import { Clock, User, Download, Hash } from "lucide-react";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface ExportRow {
  id: number;
  actorId: number | null;
  actorName: string;
  format: "csv" | "xlsx";
  filterJson: string;
  filterSummary: string;
  rowCount: number;
  thresholdAtExport: number;
  passwordGatePassed: boolean;
  masked: boolean;
  fileHash: string | null;
  fileSizeBytes: number | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  downloadAvailable: boolean;
}

function bytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export default function VoterExportsAdmin() {
  const [items, setItems] = useState<ExportRow[]>([]);
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  // Re-download flow: ask the server for a short-lived signed URL, then
  // fetch it with the user's bearer token (the download endpoint also
  // requires a valid logged-in super-admin, not just the signature) and
  // hand the resulting blob to the browser as a file save. We can't use
  // a plain `<a download>` here because the link must carry the
  // Authorization header.
  async function handleDownload(row: ExportRow) {
    const tok = getToken();
    setDownloadingId(row.id);
    try {
      const headers: Record<string, string> = tok ? { Authorization: `Bearer ${tok}` } : {};
      const urlRes = await fetch(
        `${BASE}/api/admin/voter-exports/${row.id}/download-url`,
        { method: "POST", headers },
      );
      if (!urlRes.ok) {
        const body = await urlRes.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `HTTP ${urlRes.status}`);
      }
      const { url } = (await urlRes.json()) as { url: string };

      const fileRes = await fetch(`${BASE}${url}`, { headers });
      if (!fileRes.ok) {
        const body = await fileRes.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? `HTTP ${fileRes.status}`);
      }
      const blob = await fileRes.blob();
      const disposition = fileRes.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match?.[1] ?? `voter-export-${row.id}.${row.format}`;

      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start download");
    } finally {
      setDownloadingId(null);
    }
  }

  useEffect(() => {
    const tok = getToken();
    setLoading(true);
    fetch(`${BASE}/api/admin/voter-exports?limit=${limit}`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<{ items: ExportRow[] }>;
      })
      .then((j) => { setItems(j.items); setError(null); })
      .catch((e) => setError(e.message ?? "Failed to load"))
      .finally(() => setLoading(false));
  }, [limit]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Voter Exports</h2>
          <p className="text-sm text-muted-foreground">
            Read-only audit of every CSV / Excel pull from the Voters page. Each
            row records the actor, the filter that was applied, the row count
            shipped, and a SHA-256 of the file bytes so leaked sheets can be
            traced back here.
          </p>
        </div>
        <select
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
        >
          {[50, 100, 200, 500].map((v) => (
            <option key={v} value={v}>Last {v} exports</option>
          ))}
        </select>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Loading exports…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">No exports yet.</p>
      ) : (
        <div className="space-y-2">
          {items.map((e) => (
            <Card key={e.id} className="hover:shadow-sm transition-shadow" data-testid={`voter-export-${e.id}`}>
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium flex items-center gap-1">
                        <User className="w-3 h-3" /> {e.actorName}
                      </span>
                      <Badge variant="outline" className="text-xs uppercase font-mono">{e.format}</Badge>
                      <Badge className="bg-gray-100 text-gray-700 border-gray-200 text-xs">
                        {e.rowCount.toLocaleString()} rows
                      </Badge>
                      {e.passwordGatePassed && (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">
                          password-gated (over {e.thresholdAtExport.toLocaleString()})
                        </Badge>
                      )}
                      {e.masked && (
                        <Badge
                          className="bg-purple-100 text-purple-700 border-purple-200 text-xs"
                          title="EPIC last-4 only; address replaced with Booth/Part summary"
                        >
                          PII masked (officer scope)
                        </Badge>
                      )}
                      {!e.fileHash && (
                        <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">
                          incomplete / aborted
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Filter: <span className="font-mono">{e.filterSummary || "(none)"}</span>
                    </p>
                    <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(e.createdAt).toLocaleString("en-IN")}
                      </span>
                      <span>{bytes(e.fileSizeBytes)}</span>
                      {e.fileHash && (
                        <span className="flex items-center gap-1 font-mono" title={e.fileHash}>
                          <Hash className="w-3 h-3" />
                          {e.fileHash.slice(0, 16)}…
                        </span>
                      )}
                      {e.expiresAt && (
                        <span title={`Saved file expires ${new Date(e.expiresAt).toLocaleString("en-IN")}`}>
                          file kept until {new Date(e.expiresAt).toLocaleDateString("en-IN")}
                        </span>
                      )}
                    </div>
                  </div>
                  {e.downloadAvailable && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={downloadingId === e.id}
                      onClick={() => handleDownload(e)}
                      data-testid={`download-export-${e.id}`}
                    >
                      <Download className="w-3.5 h-3.5 mr-1" />
                      {downloadingId === e.id ? "Preparing…" : "Download"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {items.length >= limit && (
        <div className="text-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setLimit((l) => l + 100)}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
