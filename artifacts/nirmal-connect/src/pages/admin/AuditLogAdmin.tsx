import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminApi } from "./api";
import { Clock, User, Activity } from "lucide-react";

interface AuditEntry {
  id: number;
  actorId: number | null;
  actorName: string;
  action: string;
  target: string;
  detail: string | null;
  createdAt: string;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-green-100 text-green-700 border-green-200",
  UPDATE: "bg-blue-100 text-blue-700 border-blue-200",
  UPDATE_STATUS: "bg-amber-100 text-amber-700 border-amber-200",
  DELETE: "bg-red-100 text-red-700 border-red-200",
};

function actionBadge(action: string) {
  const cls = ACTION_COLORS[action] ?? "bg-gray-100 text-gray-700 border-gray-200";
  return <Badge className={`${cls} font-mono text-xs`}>{action}</Badge>;
}

export default function AuditLogAdmin() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [limit, setLimit] = useState(50);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = (l = limit) => {
    setLoading(true);
    adminApi.getAuditLog(l)
      .then((d: AuditEntry[]) => setEntries(d))
      .catch(() => setError("Failed to load audit log"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [limit]);

  function exportCSV() {
    const headers = ["Timestamp", "Actor", "Action", "Target", "Detail"];
    const rows = entries.map(e => [
      new Date(e.createdAt).toISOString(),
      e.actorName,
      e.action,
      e.target,
      e.detail ?? "",
    ]);
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">Audit Log</h2>
          <p className="text-sm text-muted-foreground">Full history of all admin actions</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
            className="border border-gray-300 rounded-md px-2 py-1.5 text-sm"
          >
            {[50, 100, 200, 500].map(v => <option key={v} value={v}>Last {v} entries</option>)}
          </select>
          <Button size="sm" variant="outline" onClick={exportCSV} disabled={entries.length === 0}>
            Export CSV
          </Button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Loading audit log…</p>
      ) : entries.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">No audit entries found</p>
      ) : (
        <div className="space-y-2">
          {entries.map(e => (
            <Card key={e.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5 text-gray-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{e.actorName}</span>
                      {actionBadge(e.action)}
                      <span className="text-xs text-muted-foreground font-mono">{e.target}</span>
                    </div>
                    {e.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <Activity className="w-3 h-3" /> {e.detail}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(e.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {entries.length >= limit && (
        <div className="text-center pt-2">
          <Button variant="outline" size="sm" onClick={() => setLimit(l => l + 100)}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
