import { useState, useEffect } from "react";
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
  ListChecks, CalendarRange, FileDown, FileText, Inbox, UserCheck, UserX, Search,
  MapPin, Building2, FileVideo, FileAudio, FileImage, FileIcon, ExternalLink,
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
import { useWards } from "@/lib/useWards";

interface GrievanceOfficerProps { lang: Language; token: string; userRole?: string }

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
  complaintScope: string | null;
  district: string | null;
  priority: string;
  status: string;
  anonymous: boolean;
  assignedTo: number | null;
  voterId: number | null;
  voter: {
    id: number;
    epicNumber: string;
    fullName: string;
    pollingStationId: number | null;
    boothNo: string | null;
    boothName: string | null;
  } | null;
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

export default function GrievanceOfficer({ lang, token, userRole = "" }: GrievanceOfficerProps) {
  // Officers default to their own inbox; admins/coordinators default to all.
  const isOfficer = userRole === "grievance_officer";
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterWard, setFilterWard] = useState("");
  const [filterConstituency, setFilterConstituency] = useState("");
  const [filterScope, setFilterScope] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  // "Mine" toggle: when on, list is restricted to grievances assigned to the current officer.
  // Default ON for grievance_officer role, OFF for broader admin roles.
  const [mineOnly, setMineOnly] = useState(isOfficer);
  // userRole is loaded async from /me — when it arrives and the user is a
  // grievance officer, snap the toggle ON so they default to "Mine" instead
  // of falling through to the all=1 inbox.
  const [userTouchedToggle, setUserTouchedToggle] = useState(false);
  useEffect(() => {
    if (!userTouchedToggle && isOfficer) setMineOnly(true);
  }, [isOfficer, userTouchedToggle]);
  const { data: wardList = [] } = useWards();
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
    ...(filterScope && { complaintScope: filterScope }),
    ...(filterDateFrom && { dateFrom: filterDateFrom }),
    ...(filterDateTo && { dateTo: filterDateTo }),
    ...(mineOnly ? { mine: "1" } : (isOfficer ? { all: "1" } : {})),
  };

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["grievances-list", params],
    queryFn: () => listGrievances(params, { headers: makeAuthHeaders(token) }),
    staleTime: 30_000,
  });

  // Deep-link from VotersAdmin: when a voter's grievance is clicked,
  // it stashes the grievance id in sessionStorage and navigates to
  // #grievances. We pick it up on mount and open the detail dialog.
  useEffect(() => {
    const pending = sessionStorage.getItem("openGrievanceId");
    if (!pending) return;
    sessionStorage.removeItem("openGrievanceId");
    const gid = parseInt(pending, 10);
    if (!Number.isFinite(gid) || gid <= 0) return;
    (async () => {
      try {
        const d = await fetchStaffDetail(gid, token);
        setSelected({
          id: d.id, ticketNo: d.ticketNo, name: d.name, phone: d.phone,
          category: d.category, status: d.status, priority: d.priority,
          ward: d.ward, constituency: d.constituency, anonymous: d.anonymous,
          createdAt: d.createdAt, updatedAt: d.updatedAt,
        });
        setDetail(d);
      } catch (err) {
        console.error("Deep-link grievance open failed:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setFilterWard(""); setFilterConstituency(""); setFilterScope(""); setFilterDateFrom(""); setFilterDateTo(""); setPage(1);
  }

  function attachmentIcon(fileType: string, fileName: string) {
    const t = fileType.toLowerCase();
    const n = fileName.toLowerCase();
    if (t.startsWith("video/") || /\.(mp4|mov|avi|webm|mkv)$/.test(n))
      return <FileVideo className="w-3 h-3 text-purple-500 shrink-0" />;
    if (t.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac)$/.test(n))
      return <FileAudio className="w-3 h-3 text-blue-500 shrink-0" />;
    if (t.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(n))
      return <FileImage className="w-3 h-3 text-green-500 shrink-0" />;
    return <FileIcon className="w-3 h-3 text-orange-500 shrink-0" />;
  }
  const hasFilters = filterStatus || filterCategory || filterPriority || filterWard || filterConstituency || filterScope || filterDateFrom || filterDateTo;

  async function exportCSV() {
    const res = await fetch("/api/admin/grievances/export", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `grievances-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportPDF() {
    const { default: jsPDF } = await import("jspdf");
    const { default: autoTable } = await import("jspdf-autotable");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.setFontSize(16);
    doc.text("Tirupparankundram Constituency — Grievance Report", 14, 15);
    doc.setFontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")} | Filters: ${filterStatus || "All"} | ${filterCategory || "All categories"}`, 14, 22);

    const rows = (data?.items ?? []).map(g => [
      g.ticketNo,
      g.name,
      g.category,
      g.status,
      g.priority,
      g.ward ?? "",
      new Date(g.createdAt).toLocaleDateString("en-IN"),
    ]);

    autoTable(doc, {
      startY: 27,
      head: [["Ticket #", "Petitioner", "Category", "Status", "Priority", "Ward", "Filed On"]],
      body: rows,
      styles: { fontSize: 7.5 },
      headStyles: { fillColor: [30, 58, 138] },
      alternateRowStyles: { fillColor: [245, 247, 250] },
    });

    doc.save(`grievances-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <SectionHeader
          title={lang === "ta" ? "புகார் அலுவலர் பலகை" : "Grievance Officer Dashboard"}
          subtitle={lang === "ta" ? "புகார்களை நிர்வகிக்கவும், நிலை புதுப்பிக்கவும்" : "Manage, assign and resolve constituent grievances"}
        />
        <div className="flex gap-2 shrink-0 items-center">
          <Button
            variant={mineOnly ? "default" : "outline"}
            size="sm"
            className={`gap-1.5 h-8 ${mineOnly ? "bg-primary text-white hover:bg-primary/90" : ""}`}
            onClick={() => { setMineOnly(v => !v); setUserTouchedToggle(true); setPage(1); }}
            data-testid="mine-toggle"
          >
            <Inbox className="w-3.5 h-3.5" />
            {mineOnly
              ? (lang === "ta" ? "என் புகார்கள்" : "My Inbox")
              : (lang === "ta" ? "அனைத்து புகார்கள்" : "All Grievances")}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={exportCSV}>
            <FileText className="w-3.5 h-3.5" />
            {lang === "ta" ? "CSV ஏற்றுமதி" : "Export CSV"}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={exportPDF}>
            <FileDown className="w-3.5 h-3.5" />
            {lang === "ta" ? "PDF ஏற்றுமதி" : "Export PDF"}
          </Button>
        </div>
      </div>

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
            <Select
              value={filterWard || "all"}
              onValueChange={(v) => { setFilterWard(v === "all" ? "" : v); setPage(1); }}
            >
              <SelectTrigger className="w-40 h-8 text-sm">
                <SelectValue placeholder={lang === "ta" ? "வார்டு" : "Ward"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === "ta" ? "அனைத்தும்" : "All wards"}</SelectItem>
                {wardList.map((w) => (
                  <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="w-40 h-8 text-sm"
              placeholder={lang === "ta" ? "தொகுதி" : "Constituency"}
              value={filterConstituency}
              onChange={(e) => { setFilterConstituency(e.target.value); setPage(1); }}
            />
            <Select value={filterScope || "all"} onValueChange={(v) => { setFilterScope(v === "all" ? "" : v); setPage(1); }}>
              <SelectTrigger className="w-44 h-8 text-sm">
                <SelectValue placeholder={lang === "ta" ? "புகார் வகை" : "Complaint Scope"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{lang === "ta" ? "அனைத்தும்" : "All scopes"}</SelectItem>
                <SelectItem value="constituency">
                  <span className="flex items-center gap-1.5"><MapPin className="w-3 h-3 text-primary" />{lang === "ta" ? "தொகுதி புகார்" : "Constituency"}</span>
                </SelectItem>
                <SelectItem value="statewide">
                  <span className="flex items-center gap-1.5"><Building2 className="w-3 h-3 text-orange-500" />{lang === "ta" ? "அமைச்சர் அலுவலகம்" : "Ministerial / Statewide"}</span>
                </SelectItem>
              </SelectContent>
            </Select>
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
                    {["Ticket", "Category", "Scope / Ward", "Priority", "Status", "Filed", ""].map((h) => (
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
                      <td className="px-4 py-3">
                        {(item as StaffGrievanceDetail).complaintScope === "statewide" ? (
                          <span className="flex items-center gap-1 text-xs text-orange-600 font-medium">
                            <Building2 className="w-3 h-3" />
                            {(item as StaffGrievanceDetail).district || (lang === "ta" ? "அமைச்சர்" : "Statewide")}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            {item.ward || "–"}
                          </span>
                        )}
                      </td>
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
                {/* Scope row */}
                <div>
                  <p className="text-xs text-muted-foreground">{lang === "ta" ? "புகார் வகை" : "Complaint Scope"}</p>
                  <p className="font-medium flex items-center gap-1.5">
                    {detail.complaintScope === "statewide"
                      ? <><Building2 className="w-3.5 h-3.5 text-orange-500" />{lang === "ta" ? "அமைச்சர் அலுவலகம்" : "Ministerial / Statewide"}</>
                      : <><MapPin className="w-3.5 h-3.5 text-primary" />{lang === "ta" ? "தொகுதி புகார்" : "Constituency"}</>
                    }
                  </p>
                </div>
                {detail.complaintScope === "statewide" && detail.district && (
                  <div>
                    <p className="text-xs text-muted-foreground">{lang === "ta" ? "மாவட்டம்" : "District"}</p>
                    <p className="font-medium">{detail.district}</p>
                  </div>
                )}
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
                    <span className="text-xs font-normal text-muted-foreground">({detail.attachments.length})</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {detail.attachments.map((a) => {
                      const isImage = a.fileType.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(a.fileName);
                      const isVideo = a.fileType.startsWith("video/") || /\.(mp4|mov|avi|webm|mkv)$/i.test(a.fileName);
                      const isAudio = a.fileType.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac)$/i.test(a.fileName);
                      return (
                        <div key={a.id} className="flex flex-col gap-1 max-w-[180px]">
                          {isImage && (
                            <a href={a.fileUrl} target="_blank" rel="noopener noreferrer">
                              <img
                                src={a.fileUrl}
                                alt={a.fileName}
                                className="w-full h-24 object-cover rounded-lg border hover:opacity-80 transition-opacity"
                              />
                            </a>
                          )}
                          {isVideo && (
                            <video
                              src={a.fileUrl}
                              controls
                              className="w-full rounded-lg border"
                              style={{ maxHeight: 120 }}
                            />
                          )}
                          {isAudio && (
                            <audio src={a.fileUrl} controls className="w-full" />
                          )}
                          <a
                            href={a.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-lg hover:bg-muted/40 transition-colors truncate"
                          >
                            {attachmentIcon(a.fileType, a.fileName)}
                            <span className="truncate">{a.fileName}</span>
                            <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
                          </a>
                          {a.fileSize && (
                            <span className="text-xs text-muted-foreground text-center">
                              {(a.fileSize / 1024 / 1024).toFixed(1)} MB
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Match Voter */}
              <VoterMatchPanel
                grievanceId={detail.id}
                token={token}
                voter={detail.voter}
                lang={lang}
                onChanged={() => refreshDetail(detail.id)}
              />

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

interface VoterSuggestion {
  id: number;
  epicNumber: string;
  fullName: string;
  boothNo: string | null;
  boothName: string | null;
  similarity: number;
  sameWard: boolean;
}

interface VoterSearchHit {
  id: number;
  epicNumber: string;
  fullName: string;
  boothNo: string | null;
  boothName: string | null;
}

function VoterMatchPanel({
  grievanceId, token, voter, lang, onChanged,
}: {
  grievanceId: number;
  token: string;
  voter: StaffGrievanceDetail["voter"];
  lang: Language;
  onChanged: () => void;
}) {
  const [suggestions, setSuggestions] = useState<VoterSuggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VoterSearchHit[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function loadSuggestions() {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin/grievances/${grievanceId}/voter-suggestions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as { items: VoterSuggestion[] };
      setSuggestions(data.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Auto-suggest the moment the panel mounts for an unlinked grievance,
  // so officers see candidates without an extra click. Re-runs if the
  // grievance changes or if it gets unlinked again.
  useEffect(() => {
    if (!voter && suggestions === null && !loading) {
      loadSuggestions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grievanceId, voter]);

  async function runSearch() {
    const q = searchQuery.trim();
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true); setError(null);
    try {
      const r = await fetch(`/api/admin/voters?q=${encodeURIComponent(q)}&limit=8`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json() as { items: VoterSearchHit[] };
      setSearchResults(data.items ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function linkVoter(voterId: number) {
    setBusyId(voterId); setError(null);
    try {
      const r = await fetch(`/api/admin/grievances/${grievanceId}/voter`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ voterId }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      setSuggestions(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function unlinkVoter() {
    setBusyId(-1); setError(null);
    try {
      const r = await fetch(`/api/admin/grievances/${grievanceId}/voter`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      setSuggestions(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3" data-testid="voter-match-panel">
      <h4 className="font-semibold text-sm flex items-center gap-2">
        <UserCheck className="w-4 h-4 text-primary" />
        {lang === "ta" ? "வாக்காளரை இணை" : "Match Voter"}
      </h4>
      {voter ? (
        <div className="flex items-start justify-between gap-2 rounded border bg-muted/30 p-3">
          <button
            type="button"
            className="text-sm text-left flex-1 min-w-0 hover:opacity-80 cursor-pointer"
            title={lang === "ta" ? "வாக்காளர் விவரத்தைத் திற" : "Open voter detail"}
            data-testid="open-linked-voter-btn"
            onClick={() => {
              sessionStorage.setItem("openVoterId", String(voter.id));
              window.location.hash = "#voters-search";
            }}
          >
            <div className="font-medium underline-offset-2 hover:underline">{voter.fullName}</div>
            <div className="text-xs text-muted-foreground font-mono">{voter.epicNumber}</div>
            {voter.boothNo && (
              <div className="text-xs text-muted-foreground">
                {lang === "ta" ? "வாக்குச்சாவடி" : "Booth"} {voter.boothNo}
                {voter.boothName ? ` · ${voter.boothName}` : ""}
              </div>
            )}
          </button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busyId === -1}
            onClick={unlinkVoter}
            data-testid="unlink-voter-btn"
          >
            {busyId === -1 ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserX className="w-4 h-4" />}
            <span className="ml-1">{lang === "ta" ? "இணைப்பை நீக்கு" : "Unlink"}</span>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {!suggestions && (
            <Button
              size="sm"
              variant="outline"
              onClick={loadSuggestions}
              disabled={loading}
              data-testid="suggest-voters-btn"
            >
              {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Users className="w-4 h-4 mr-1" />}
              {lang === "ta" ? "வாக்காளர்களைப் பரிந்துரை" : "Suggest matches"}
            </Button>
          )}
          {suggestions && suggestions.length === 0 && (
            <div className="text-xs text-muted-foreground italic">
              {lang === "ta"
                ? "பொருந்தக்கூடிய வாக்காளர் எதுவும் கிடைக்கவில்லை."
                : "No matching voters found."}
            </div>
          )}
          {suggestions && suggestions.length > 0 && (
            <div className="space-y-2">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-start justify-between gap-2 rounded border p-2"
                  data-testid={`voter-suggestion-${s.id}`}
                >
                  <div className="text-sm min-w-0 flex-1">
                    <div className="font-medium truncate">{s.fullName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{s.epicNumber}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {Math.round(s.similarity * 100)}% match
                      </Badge>
                      {s.sameWard && (
                        <Badge variant="outline" className="text-[10px]">
                          {lang === "ta" ? "அதே வார்டு" : "Same ward"}
                        </Badge>
                      )}
                      {s.boothNo && (
                        <span className="text-[10px] text-muted-foreground">
                          · {lang === "ta" ? "வா.சா." : "Booth"} {s.boothNo}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="default"
                    disabled={busyId === s.id}
                    onClick={() => linkVoter(s.id)}
                    data-testid={`link-voter-${s.id}`}
                  >
                    {busyId === s.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : (lang === "ta" ? "இணை" : "Link")}
                  </Button>
                </div>
              ))}
              <Button
                size="sm"
                variant="ghost"
                onClick={loadSuggestions}
                disabled={loading}
              >
                {loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                {lang === "ta" ? "மீண்டும் பரிந்துரை" : "Refresh suggestions"}
              </Button>
            </div>
          )}
          {/* Manual "Find voter…" search — for cases where the auto
              suggestions miss the right voter (e.g. nickname, typo,
              EPIC lookup). Calls the same admin voter search endpoint. */}
          <div className="border-t pt-3 space-y-2">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {lang === "ta" ? "வாக்காளரை கைமுறையாக தேடு" : "Find voter manually"}
            </div>
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); runSearch(); } }}
                placeholder={lang === "ta" ? "பெயர் அல்லது EPIC எண்…" : "Name or EPIC number…"}
                data-testid="voter-search-input"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={runSearch}
                disabled={searching || searchQuery.trim().length < 2}
                data-testid="voter-search-btn"
              >
                {searching ? <Loader2 className="w-4 h-4" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>
            {searchResults && searchResults.length === 0 && (
              <div className="text-xs text-muted-foreground italic">
                {lang === "ta" ? "முடிவுகள் இல்லை." : "No matches."}
              </div>
            )}
            {searchResults && searchResults.length > 0 && (
              <div className="space-y-1.5">
                {searchResults.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-start justify-between gap-2 rounded border p-2 text-sm"
                    data-testid={`voter-search-result-${s.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{s.fullName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{s.epicNumber}</div>
                      {s.boothNo && (
                        <div className="text-[10px] text-muted-foreground">
                          {lang === "ta" ? "வா.சா." : "Booth"} {s.boothNo}
                          {s.boothName ? ` · ${s.boothName}` : ""}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      disabled={busyId === s.id}
                      onClick={() => linkVoter(s.id)}
                      data-testid={`link-search-${s.id}`}
                    >
                      {busyId === s.id
                        ? <Loader2 className="w-4 h-4 animate-spin" />
                        : (lang === "ta" ? "இணை" : "Link")}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {error && <div className="text-xs text-destructive">{error}</div>}
    </div>
  );
}
