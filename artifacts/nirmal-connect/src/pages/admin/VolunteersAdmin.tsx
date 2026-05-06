import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, MapPin, CheckCircle, XCircle, Clock } from "lucide-react";
import { adminApi } from "./api";

interface VolunteerItem {
  id: number;
  name: string;
  nameTa?: string | null;
  email?: string | null;
  phone: string;
  ward?: string | null;
  constituency: string;
  skills?: string | null;
  message?: string | null;
  status: string;
  createdAt: string;
}

const STATUS_FILTERS = ["all", "pending", "approved", "rejected"];

function statusBadge(status: string) {
  if (status === "approved") return <Badge className="bg-green-100 text-green-700 border-green-200">Approved</Badge>;
  if (status === "rejected") return <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>;
  return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Pending</Badge>;
}

export default function VolunteersAdmin() {
  const [items, setItems] = useState<VolunteerItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = (p = page, f = filter) => {
    setLoading(true);
    adminApi.getVolunteers(p, f === "all" ? undefined : f)
      .then((d: { items: VolunteerItem[]; total: number }) => { setItems(d.items); setTotal(d.total); })
      .catch(() => setError("Failed to load volunteers"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page, filter]);

  async function updateStatus(id: number, status: string) {
    setUpdating(id);
    try {
      await adminApi.updateVolunteerStatus(id, status);
      setItems(prev => prev.map(v => v.id === id ? { ...v, status } : v));
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setUpdating(null);
    }
  }

  const totalPages = Math.ceil(total / 20);
  const pendingCount = items.filter(v => v.status === "pending").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Volunteer Management</h2>
          <p className="text-sm text-muted-foreground">{total} volunteers{pendingCount > 0 && ` • ${pendingCount} pending review`}</p>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b pb-2">
        {STATUS_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(1); }}
            className={`px-3 py-1.5 text-sm rounded-md font-medium capitalize transition-colors
              ${filter === f ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">No volunteers found</p>
      ) : (
        <div className="space-y-2">
          {items.map((v) => (
            <Card key={v.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{v.name}</p>
                      {v.nameTa && <p className="text-xs text-muted-foreground">{v.nameTa}</p>}
                      {statusBadge(v.status)}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" /> {v.phone}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" /> {v.constituency}{v.ward ? `, Ward ${v.ward}` : ""}
                      </div>
                    </div>
                    {v.skills && <p className="text-xs text-muted-foreground mt-0.5">Skills: {v.skills}</p>}
                    {v.message && <p className="text-xs text-muted-foreground italic mt-0.5 line-clamp-1">"{v.message}"</p>}
                    <p className="text-xs text-muted-foreground mt-1">Registered {new Date(v.createdAt).toLocaleDateString("en-IN")}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {v.status !== "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-green-600 border-green-200 hover:bg-green-50 gap-1"
                        disabled={updating === v.id}
                        onClick={() => updateStatus(v.id, "approved")}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Approve
                      </Button>
                    )}
                    {v.status !== "rejected" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-red-500 border-red-200 hover:bg-red-50 gap-1"
                        disabled={updating === v.id}
                        onClick={() => updateStatus(v.id, "rejected")}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </Button>
                    )}
                    {v.status !== "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs text-amber-600 border-amber-200 hover:bg-amber-50 gap-1"
                        disabled={updating === v.id}
                        onClick={() => updateStatus(v.id, "pending")}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Pending
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
        </div>
      )}
    </div>
  );
}
