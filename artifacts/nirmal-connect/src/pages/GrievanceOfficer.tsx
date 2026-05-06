import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SectionHeader } from "@/components/SectionHeader";
import {
  ChevronLeft, ChevronRight, RefreshCw, Loader2, CheckCircle,
  Clock, AlertTriangle, MessageSquare, Filter, X, Paperclip, Users,
  ListChecks, CalendarRange,
} from "lucide-react";
import type { Language } from "@/lib/i18n";
import {
  listGrievances,
  updateGrievanceStatus,
  addGrievanceRemark,
  assignGrievance,
  listGrievanceOfficers,
  updateGrievancePriority,
} from "@workspace/api-client-react";
import type { GrievanceListItem } from "@workspace/api-client-react";

interface GrievanceOfficerProps { lang: Language; token: string }

// Full staff-view detail type — includes internal remarks and attachments
interface StaffGrievanceDetail {
  id: number;
  ticketNo: string;
  name: string;
  phone: string;
  email: string | null;
  category: string;
  description: string;
  address: string | null;
  ward: string | null;
  constituency: string;
  priority: string;
  status: string;
  anonymous: boolean;
  assignedTo: number | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  remarks: Array<{
    id: number;
    grievanceId: number;
    remark: string;
    isPublic: boolean;
    authorId: number | null;
    authorName: string;
    createdAt: string;
  }>;
  statusLog: Array<{
    id: number;
    grievanceId: number;
    fromStatus: string | null;
    toStatus: string;
    changedBy: number | null;
    changedByName: string;
    note: string | null;
    createdAt: string;
  }>;
  attachments: Array<{
    id: number;
    grievanceId: number;
    fileUrl: string;
    fileName: string;
    fileType: string;
    fileSize: number | null;
    createdAt: string;
  }>;
}

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

/** Fetch full staff detail (all remarks, attachments) for a grievance by id. */
async function fetchStaffDetail(id: number, token: string): Promise<StaffGrievanceDetail> {
  const res = await fetch(`/api/grievances/${id}`, {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`Failed to load detail: ${res.status}`);
  return res.json() as Promise<StaffGrievanceDetail>;
}

export default function GrievanceOfficer({ lang, token }: GrievanceOfficerProps) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterWard, setFilterWard] = useState("");
  const [filterConstituency, setFilterConstituency] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkAssignId, setBulkAssignId] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [selected, setSelected] = useState<GrievanceListItem | null>(null);
  const [detail, setDetail] = useState<StaffGrievanceDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [remarkText, setRemarkText] = useState("");
  const [remarkPublic, setRemarkPublic] = useState(true);
  const [assignOfficerId, setAssignOfficerId] = useState<string>("");
  const [assignNote, setAssignNote] = useState("");
  const [newPriority, setNewPriority] = useState("");

  const { data: officersData } = useQuery({
    queryKey: ["grievance-officers"],
    queryFn: () => listGrievanceOfficers({ headers: makeAuthHeaders(token) }),
    staleTime: 60_000,
  });

  const params = {
    page,
    limit: 20,
    ...(filterStatus && { status: filterStatus }),
    ...(filterCategory && { category: filterCategory }),
    ...(filterPriority && { priority: filterPriority }),
    ...(filterWard && { ward: filterWard }),
    ...(filterConstituency && { constituency: filterConstituency }),
    ...(filterDateFrom && { dateFrom: filterDateFrom }),
    ...(filterDateTo && { dateTo: filterDateTo }),
  };

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["grievances-list", params],
    queryFn: () => listGrievances(params, { headers: makeAuthHeaders(token) }),
    staleTime: 30_000,
  });

  async function refreshDetail(id: number) {
    try {
      const d = await fetchStaffDetail(id, token);
      setDetail(d);
    } catch (err) {
      console.error("Detail refresh failed:", err);
    }
  }

  async function openDetail(item: GrievanceListItem) {
    setSelected(item);
    setDetail(null);
    setDetailLoading(true);
    setNewStatus(item.status);
    setNewPriority(item.priority);
    setStatusNote("");
    setRemarkText("");
    setAssignOfficerId("");
    setAssignNote("");
    try {
      const d = await fetchStaffDetail(item.id, token);
      setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  }

  const statusMutation = useMutation({
    mutationFn: () =>
      updateGrievanceStatus(
        selected!.id,
        { status: newStatus as StaffGrievanceDetail["status"], note: statusNote || null },
        { headers: makeAuthHeaders(token) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grievances-list"] });
      const updatedItem = { ...selected!, status: newStatus };
      setSelected(updatedItem as GrievanceListItem);
      setStatusNote("");
      refreshDetail(selected!.id);
    },
  });

  const remarkMutation = useMutation({
    mutationFn: () =>
      addGrievanceRemark(selected!.id, { remark: remarkText, isPublic: remarkPublic },
        { headers: makeAuthHeaders(token) }),
    onSuccess: () => {
      setRemarkText("");
      refreshDetail(selected!.id);
    },
  });

  const assignMutation = useMutation({
    mutationFn: () => {
      const officer = officersData?.officers.find((o) => String(o.id) === assignOfficerId);
      return assignGrievance(
        selected!.id,
        { officerId: officer!.id, officerName: officer!.name, note: assignNote.trim() || null },
        { headers: makeAuthHeaders(token) }
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grievances-list"] });
      const updated = { ...selected!, status: "Assigned" };
      setSelected(updated as GrievanceListItem);
      setAssignOfficerId("");
      setAssignNote("");
      refreshDetail(selected!.id);
    },
  });

  const priorityMutation = useMutation({
    mutationFn: () =>
      updateGrievancePriority(
        selected!.id,
        { priority: newPriority as "Low" | "Medium" | "High" | "Urgent" },
        { headers: makeAuthHeaders(token) }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["grievances-list"] });
      const updated = { ...selected!, priority: newPriority };
      setSelected(updated as GrievanceListItem);
      refreshDetail(selected!.id);
    },
  });

  function clearFilters() {
    setFilterStatus(""); setFilterCategory(""); setFilterPriority("");
    setFilterWard(""); setFilterConstituency(""); setFilterDateFrom(""); setFilterDateTo(""); setPage(1);
  }
  const hasFilters = filterStatus || filterCategory || filterPriority || filterWard || filterConstituency || filterDateFrom || filterDateTo;

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const pageIds = (data?.items ?? []).map(i => i.id);
    if (pageIds.every(id => selectedIds.has(id))) {
      setSelectedIds(prev => { const n = new Set(prev); pageIds.forEach(id => n.delete(id)); return n; });
    } else {
      setSelectedIds(prev => { const n = new Set(prev); pageIds.forEach(id => n.add(id)); return n; });
    }
  }

  async function applyBulkStatus() {
    if (!bulkStatus || selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/grievances/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds), status: bulkStatus }),
      });
      if (!res.ok) throw new Error("Bulk update failed");
      setSelectedIds(new Set());
      setBulkStatus("");
      qc.invalidateQueries({ queryKey: ["grievances-list"] });
    } catch (e) {
      console.error(e);
    } finally {
      setBulkLoading(false);
    }
  }

  async function applyBulkAssign() {
    if (!bulkAssignId || selectedIds.size === 0) return;
    const officer = officersData?.officers.find(o => String(o.id) === bulkAssignId);
    if (!officer) return;
    setBulkLoading(true);
    try {
      const res = await fetch("/api/admin/grievances/bulk-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: Array.from(selectedIds), officerId: officer.id, officerName: officer.name }),
      });
      if (!res.ok) throw new Error("Bulk assign failed");
      setSelectedIds(new Set());
      setBulkAssignId("");
      qc.invalidateQueries({ queryKey: ["grievances-list"] });
    } catch (e) {
      console.error(e);
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionHeader
        title={lang === "ta" ? "புகார் அலுவலர் பலகை" : "Grievance Officer Dashboard"}
        subtitle={lang === "ta" ? "புகார்களை நிர்வகிக்கவும், நிலை புதுப்பிக்கவும்" : "Manage, assign and resolve constituent grievances"}
      />

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
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
              className="w-28 h-8 text-sm"
              placeholder={lang === "ta" ? "வார்டு" : "Ward"}
              value={filterWard}
              onChange={(e) => { setFilterWard(e.target.value); setPage(1); }}
            />
            <Input
              className="w-40 h-8 text-sm"
              placeholder={lang === "ta" ? "தொகுதி" : "Constituency"}
              value={filterConstituency}
              onChange={(e) => { setFilterConstituency(e.target.value); setPage(1); }}
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
          {/* Date-range filter */}
          <div className="flex flex-wrap gap-3 items-center border-t pt-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarRange className="w-3.5 h-3.5" />
              {lang === "ta" ? "தேதி வரம்பு:" : "Date range:"}
            </div>
            <Input
              type="date"
              className="w-36 h-8 text-sm"
              value={filterDateFrom}
              onChange={(e) => { setFilterDateFrom(e.target.value); setPage(1); }}
            />
            <span className="text-xs text-muted-foreground">{lang === "ta" ? "முதல்" : "to"}</span>
            <Input
              type="date"
              className="w-36 h-8 text-sm"
              value={filterDateTo}
              onChange={(e) => { setFilterDateTo(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <ListChecks className="w-4 h-4" />
                {selectedIds.size} {lang === "ta" ? "புகார்கள் தேர்ந்தெடுக்கப்பட்டன" : "selected"}
              </div>
              {/* Bulk Status */}
              <Select value={bulkStatus} onValueChange={setBulkStatus}>
                <SelectTrigger className="w-40 h-8 text-sm">
                  <SelectValue placeholder={lang === "ta" ? "நிலை தேர்வு" : "Set status…"} />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTS.filter(Boolean).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 bg-primary text-white hover:bg-primary/90 gap-1"
                onClick={applyBulkStatus}
                disabled={!bulkStatus || bulkLoading}
              >
                {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                {lang === "ta" ? "பயன்படுத்து" : "Apply Status"}
              </Button>
              {/* Bulk Assign */}
              {officersData && officersData.officers.length > 0 && (
                <>
                  <div className="w-px h-6 bg-border mx-1" />
                  <Select value={bulkAssignId} onValueChange={setBulkAssignId}>
                    <SelectTrigger className="w-44 h-8 text-sm">
                      <SelectValue placeholder={lang === "ta" ? "அலுவலர் ஒதுக்கு" : "Assign officer…"} />
                    </SelectTrigger>
                    <SelectContent>
                      {officersData.officers.map(o => (
                        <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1"
                    onClick={applyBulkAssign}
                    disabled={!bulkAssignId || bulkLoading}
                  >
                    {bulkLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                    {lang === "ta" ? "ஒதுக்கு" : "Assign"}
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" className="h-8 ml-auto" onClick={() => setSelectedIds(new Set())}>
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

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
                    <th className="px-4 py-3 w-8">
                      <input
                        type="checkbox"
                        className="rounded"
                        checked={(data?.items ?? []).length > 0 && (data?.items ?? []).every(i => selectedIds.has(i.id))}
                        onChange={toggleSelectAll}
                      />
                    </th>
                    {["Ticket", "Category", "Ward", "Priority", "Status", "Filed", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(data?.items ?? []).map((item) => (
                    <tr key={item.id} className={`hover:bg-muted/20 transition-colors ${selectedIds.has(item.id) ? "bg-primary/5" : ""}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="rounded"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                        />
                      </td>
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
                      <td colSpan={8} className="text-center text-muted-foreground py-16">
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
                  { label: "Priority", value: detail.priority },
                  { label: "Ward", value: detail.ward ?? "–" },
                  { label: "Constituency", value: detail.constituency },
                  { label: "Filed", value: new Date(detail.createdAt).toLocaleDateString() },
                  { label: "Name", value: detail.anonymous ? "Anonymous" : detail.name },
                  { label: "Phone", value: detail.anonymous ? "***" : detail.phone },
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

              {/* Attachments */}
              {detail.attachments.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Paperclip className="w-4 h-4" />
                    {lang === "ta" ? "இணைப்புகள்" : "Attachments"}
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {detail.attachments.map((a) => (
                      <a
                        key={a.id}
                        href={a.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted/40 transition-colors"
                      >
                        <Paperclip className="w-3 h-3" />
                        {a.fileName}
                      </a>
                    ))}
                  </div>
                </div>
              )}

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

              {/* Update Priority */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-primary" />
                  {lang === "ta" ? "முன்னுரிமை மாற்று" : "Update Priority"}
                </h4>
                <Select value={newPriority} onValueChange={setNewPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTS.filter(Boolean).map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => priorityMutation.mutate()}
                  disabled={priorityMutation.isPending || newPriority === detail.priority}
                >
                  {priorityMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : lang === "ta" ? "புதுப்பி" : "Set Priority"}
                </Button>
              </div>

              {/* Assign to Officer */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  {lang === "ta" ? "அலுவலருக்கு ஒதுக்கு" : "Assign to Officer"}
                </h4>
                <Select value={assignOfficerId} onValueChange={setAssignOfficerId}>
                  <SelectTrigger>
                    <SelectValue placeholder={lang === "ta" ? "அலுவலரை தேர்வு செய்யவும்..." : "Select officer..."} />
                  </SelectTrigger>
                  <SelectContent>
                    {(officersData?.officers ?? []).map((o) => (
                      <SelectItem key={o.id} value={String(o.id)}>
                        {o.name} <span className="text-muted-foreground text-xs ml-1">({o.role.replace("_", " ")})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder={lang === "ta" ? "குறிப்பு (விரும்பினால்)..." : "Note (optional)..."}
                  value={assignNote}
                  onChange={(e) => setAssignNote(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => assignMutation.mutate()}
                  disabled={assignMutation.isPending || !assignOfficerId}
                >
                  {assignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : lang === "ta" ? "ஒதுக்கு" : "Assign"}
                </Button>
              </div>

              {/* Status History */}
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

              {/* All Remarks (including internal) */}
              {detail.remarks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold">
                    {lang === "ta" ? "குறிப்புகள்" : "Remarks"}
                  </h4>
                  {detail.remarks.map((r) => (
                    <div key={r.id} className={`text-sm p-3 border rounded-lg space-y-1 ${!r.isPublic ? "border-orange-200 bg-orange-50/50" : ""}`}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-xs">{r.authorName}</span>
                        {r.isPublic
                          ? <Badge variant="secondary" className="text-xs bg-green-100 text-green-700">Public</Badge>
                          : <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-700">Internal</Badge>
                        }
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
