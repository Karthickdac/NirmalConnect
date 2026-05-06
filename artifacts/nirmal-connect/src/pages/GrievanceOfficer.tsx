import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/SectionHeader";
import {
  ChevronLeft, ChevronRight, RefreshCw, Loader2, CheckCircle,
  Clock, AlertTriangle, MessageSquare, Filter, X,
} from "lucide-react";
import type { Language } from "@/lib/i18n";
import {
  listGrievances,
  updateGrievanceStatus,
  addGrievanceRemark,
  trackGrievance,
} from "@workspace/api-client-react";
import type { GrievanceListItem, GrievanceTrackResponse } from "@workspace/api-client-react";

interface GrievanceOfficerProps { lang: Language; token: string }

const STATUS_OPTS = ["", "Submitted", "Under Review", "Assigned", "In Progress", "Resolved", "Closed"];
const PRIORITY_OPTS = ["", "Low", "Medium", "High", "Urgent"];
const CATEGORY_OPTS = ["", "Roads", "Water Supply", "EB / Electricity Issues", "Sewage",
  "Healthcare", "Education", "Women Safety", "Corruption", "Ration", "Transport",
  "Pension", "Housing", "Agriculture", "Employment", "Others"];

const STATUS_COLORS: Record<string, string> = {
  "Submitted": "bg-blue-100 text-blue-700",
  "Under Review": "bg-yellow-100 text-yellow-700",
  "Assigned": "bg-purple-100 text-purple-700",
  "In Progress": "bg-orange-100 text-orange-700",
  "Resolved": "bg-green-100 text-green-700",
  "Closed": "bg-gray-100 text-gray-700",
};
const PRIORITY_COLORS: Record<string, string> = {
  "Low": "bg-gray-100 text-gray-600",
  "Medium": "bg-blue-100 text-blue-600",
  "High": "bg-orange-100 text-orange-700",
  "Urgent": "bg-red-100 text-red-700",
};

function makeAuthHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export default function GrievanceOfficer({ lang, token }: GrievanceOfficerProps) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterWard, setFilterWard] = useState("");
  const [selected, setSelected] = useState<GrievanceListItem | null>(null);
  const [detail, setDetail] = useState<GrievanceTrackResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [remarkText, setRemarkText] = useState("");
  const [remarkPublic, setRemarkPublic] = useState(true);

  const params = {
    page,
    limit: 20,
    ...(filterStatus && { status: filterStatus }),
    ...(filterCategory && { category: filterCategory }),
    ...(filterPriority && { priority: filterPriority }),
    ...(filterWard && { ward: filterWard }),
  };

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["grievances-list", params],
    queryFn: () => listGrievances(params, { headers: makeAuthHeaders(token) }),
    staleTime: 30_000,
  });

  async function openDetail(item: GrievanceListItem) {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    setNewStatus(item.status);
    setStatusNote("");
    setRemarkText("");
    try {
      const d = await trackGrievance(item.ticketNo);
      setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  }

  const statusMutation = useMutation({
    mutationFn: () =>
      updateGrievanceStatus(selected!.id, { status: newStatus as GrievanceTrackResponse["status"], note: statusNote || null },
        { headers: makeAuthHeaders(token) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grievances-list"] });
      const updatedItem = { ...selected!, status: newStatus };
      setSelected(updatedItem as GrievanceListItem);
      trackGrievance(selected!.ticketNo).then(setDetail);
      setStatusNote("");
    },
  });

  const remarkMutation = useMutation({
    mutationFn: () =>
      addGrievanceRemark(selected!.id, { remark: remarkText, isPublic: remarkPublic },
        { headers: makeAuthHeaders(token) }),
    onSuccess: () => {
      trackGrievance(selected!.ticketNo).then(setDetail);
      setRemarkText("");
    },
  });

  function clearFilters() {
    setFilterStatus(""); setFilterCategory(""); setFilterPriority(""); setFilterWard(""); setPage(1);
  }
  const hasFilters = filterStatus || filterCategory || filterPriority || filterWard;

  return (
    <div className="space-y-6">
      <SectionHeader
        title={lang === "ta" ? "புகார் அலுவலர் பலகை" : "Grievance Officer Dashboard"}
        subtitle={lang === "ta" ? "புகார்களை நிர்வகிக்கவும், நிலை புதுப்பிக்கவும்" : "Manage, assign and resolve constituent grievances"}
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Filter className="w-4 h-4" />
              {lang === "ta" ? "வடிகட்டு:" : "Filter:"}
            </div>
            <Select value={filterStatus} onValueChange={(v) => { setFilterStatus(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue placeholder={lang === "ta" ? "நிலை" : "Status"} />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTS.map((s) => <SelectItem key={s || "all"} value={s || "all"}>{s || (lang === "ta" ? "அனைத்தும்" : "All")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={(v) => { setFilterCategory(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue placeholder={lang === "ta" ? "வகை" : "Category"} />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_OPTS.map((c) => <SelectItem key={c || "all"} value={c || "all"}>{c || (lang === "ta" ? "அனைத்தும்" : "All")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={(v) => { setFilterPriority(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-32 h-8 text-sm">
                <SelectValue placeholder={lang === "ta" ? "முன்னுரிமை" : "Priority"} />
              </SelectTrigger>
              <SelectContent>
                {PRIORITY_OPTS.map((p) => <SelectItem key={p || "all"} value={p || "all"}>{p || (lang === "ta" ? "அனைத்தும்" : "All")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Input
              className="w-32 h-8 text-sm"
              placeholder={lang === "ta" ? "வார்டு" : "Ward"}
              value={filterWard}
              onChange={(e) => { setFilterWard(e.target.value); setPage(1); }}
            />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 gap-1 text-muted-foreground">
                <X className="w-3.5 h-3.5" />
                {lang === "ta" ? "அழி" : "Clear"}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-8 ml-auto gap-1">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isFetching && !data ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    {["Ticket", "Category", "Ward", "Priority", "Status", "Filed", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.items ?? []).map((item) => (
                    <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-primary font-semibold text-xs">{item.ticketNo}</td>
                      <td className="px-4 py-3">{item.category}</td>
                      <td className="px-4 py-3 text-muted-foreground">{item.ward || "–"}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[item.priority] ?? "bg-muted"}`}>
                          {item.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[item.status] ?? "bg-muted"}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => openDetail(item)}>
                          {lang === "ta" ? "திற" : "Open"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {data?.items.length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted-foreground py-16">
                        {lang === "ta" ? "புகார்கள் இல்லை" : "No grievances found"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{lang === "ta" ? `மொத்தம்: ${data.total}` : `Total: ${data.total} grievances`}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-7 w-7 p-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span>{page} / {data.totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)} className="h-7 w-7 p-0">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-mono">{selected?.ticketNo}</DialogTitle>
          </DialogHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : detail ? (
            <div className="space-y-5">
              {/* Summary */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Category", value: detail.category },
                  { label: "Status", value: detail.status },
                  { label: "Priority", value: selected?.priority ?? "" },
                  { label: "Ward", value: detail.ward ?? "–" },
                  { label: "Constituency", value: detail.constituency },
                  { label: "Filed", value: new Date(detail.createdAt).toLocaleDateString() },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="font-medium">{value}</p>
                  </div>
                ))}
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-1">{lang === "ta" ? "விவரம்" : "Description"}</p>
                <p className="text-sm bg-muted/40 rounded-lg p-3">{detail.description}</p>
              </div>

              {/* Update Status */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-primary" />
                  {lang === "ta" ? "நிலை புதுப்பி" : "Update Status"}
                </h4>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTS.filter(Boolean).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Textarea
                  rows={2}
                  placeholder={lang === "ta" ? "குறிப்பு (விரும்பினால்)..." : "Note (optional)..."}
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={() => statusMutation.mutate()}
                  disabled={statusMutation.isPending || newStatus === detail.status}
                  className="bg-primary text-white hover:bg-primary/90"
                >
                  {statusMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  <span className="ml-2">{lang === "ta" ? "புதுப்பி" : "Update"}</span>
                </Button>
              </div>

              {/* Add Remark */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  {lang === "ta" ? "குறிப்பு சேர்" : "Add Remark"}
                </h4>
                <Textarea
                  rows={2}
                  placeholder={lang === "ta" ? "குறிப்பை உள்ளிடவும்..." : "Enter remark..."}
                  value={remarkText}
                  onChange={(e) => setRemarkText(e.target.value)}
                />
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={remarkPublic}
                      onChange={(e) => setRemarkPublic(e.target.checked)}
                      className="rounded"
                    />
                    {lang === "ta" ? "பொதுவில் காட்டு" : "Visible to citizen"}
                  </label>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => remarkMutation.mutate()}
                    disabled={remarkMutation.isPending || !remarkText.trim()}
                  >
                    {remarkMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : lang === "ta" ? "சேர்" : "Add"}
                  </Button>
                </div>
              </div>

              {/* Status Log */}
              {detail.statusLog.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {lang === "ta" ? "நிலை வரலாறு" : "History"}
                  </h4>
                  <div className="space-y-1.5">
                    {detail.statusLog.map((log) => (
                      <div key={log.id} className="text-xs flex items-start gap-2 p-2 bg-muted/40 rounded">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                        <div>
                          <span className="font-medium">{log.fromStatus ? `${log.fromStatus} → ` : ""}{log.toStatus}</span>
                          {log.note && <span className="text-muted-foreground"> · {log.note}</span>}
                          <span className="text-muted-foreground block">{log.changedByName} · {new Date(log.createdAt).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Remarks */}
              {detail.remarks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">{lang === "ta" ? "குறிப்புகள்" : "Remarks"}</h4>
                  {detail.remarks.map((r) => (
                    <div key={r.id} className="text-sm p-3 border rounded-lg space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs">{r.authorName}</span>
                        {!r.isPublic && <Badge variant="secondary" className="text-xs">Internal</Badge>}
                      </div>
                      <p>{r.remark}</p>
                      <p className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>
              {lang === "ta" ? "மூடு" : "Close"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
