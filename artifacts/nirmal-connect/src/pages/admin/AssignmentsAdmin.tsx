import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  adminListAssignments,
  adminCreateAssignment,
  adminUpdateAssignment,
  adminDeleteAssignment,
  adminBulkReassignAssignments,
  adminListVolunteerAssignments,
  adminCreateVolunteerAssignment,
  adminUpdateVolunteerAssignment,
  adminDeleteVolunteerAssignment,
  adminListRoutingLog,
  listGrievanceOfficers,
} from "@workspace/api-client-react";
import { useWards } from "@/lib/useWards";
import { Loader2, Plus, Trash2, Power, History, Search, Users, UserCog, ArrowRightLeft } from "lucide-react";

interface AssignmentsAdminProps { token: string }

interface AreaOption { id: number; name: string }
interface BoothOption { id: number; boothNo: string; name: string }
interface VolunteerLite { id: number; name: string; phone: string }

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
async function fetchAreas(wardId: number): Promise<AreaOption[]> {
  const r = await fetch(`${BASE}/api/wards/${wardId}/areas`);
  return r.ok ? (r.json() as Promise<AreaOption[]>) : [];
}
async function fetchBooths(wardId: number): Promise<BoothOption[]> {
  const r = await fetch(`${BASE}/api/wards/${wardId}/polling-stations`);
  return r.ok ? (r.json() as Promise<BoothOption[]>) : [];
}
async function fetchApprovedVolunteers(token: string): Promise<VolunteerLite[]> {
  const r = await fetch(`${BASE}/api/admin/volunteers?status=approved&limit=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return [];
  const j = await r.json() as { items?: VolunteerLite[] };
  return j.items ?? [];
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

const REASON_BADGE: Record<string, string> = {
  auto: "bg-blue-100 text-blue-700",
  manual: "bg-purple-100 text-purple-700",
  reassign: "bg-orange-100 text-orange-700",
  unassigned: "bg-gray-200 text-gray-700",
};

type TabKey = "officers" | "volunteers";

export default function AssignmentsAdmin({ token }: AssignmentsAdminProps) {
  const [tab, setTab] = useState<TabKey>("officers");
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Assignments</h2>
          <p className="text-sm text-muted-foreground">
            Map officers and volunteers to wards, areas or polling booths. New grievances are
            auto-routed to officers (booth → area → ward), picking the active officer with the
            smallest open caseload.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setLogOpen(true)} className="gap-1.5">
          <History className="w-4 h-4" /> Routing log
        </Button>
      </div>

      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("officers")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
            tab === "officers" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
          data-testid="tab-officers"
        >
          <UserCog className="w-4 h-4" /> Officers
        </button>
        <button
          onClick={() => setTab("volunteers")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px flex items-center gap-1.5 ${
            tab === "volunteers" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
          }`}
          data-testid="tab-volunteers"
        >
          <Users className="w-4 h-4" /> Volunteers
        </button>
      </div>

      {tab === "officers" ? <OfficersTab token={token} /> : <VolunteersTab token={token} />}

      {/* Routing-log peek */}
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Recent Routing Decisions</DialogTitle></DialogHeader>
          <RoutingLogTable token={token} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ────────────────────────── Officers tab ──────────────────────────
function OfficersTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const { data: wardList = [] } = useWards();

  const [filterUserId, setFilterUserId] = useState<string>("all");
  const [filterWardId, setFilterWardId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newUserId, setNewUserId] = useState<string>("");
  const [newWardId, setNewWardId] = useState<string>("none");
  const [newAreaId, setNewAreaId] = useState<string>("none");
  const [newBoothId, setNewBoothId] = useState<string>("none");
  const [newRoleLabel, setNewRoleLabel] = useState("");
  const [createError, setCreateError] = useState<string>("");

  // Bulk reassign state
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reassignOpen, setReassignOpen] = useState(false);
  const [reassignToUserId, setReassignToUserId] = useState<string>("");
  const [reassignError, setReassignError] = useState<string>("");

  const { data: officersData } = useQuery({
    queryKey: ["grievance-officers"],
    queryFn: () => listGrievanceOfficers({ headers: authHeaders(token) }),
    staleTime: 60_000,
  });

  const listParams = useMemo(() => ({
    ...(filterUserId !== "all" && { userId: parseInt(filterUserId, 10) }),
    ...(filterWardId !== "all" && { wardId: parseInt(filterWardId, 10) }),
  }), [filterUserId, filterWardId]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["officer-assignments", listParams],
    queryFn: () => adminListAssignments(listParams, { headers: authHeaders(token) }),
    staleTime: 30_000,
  });

  const newWardIdNum = newWardId !== "none" ? parseInt(newWardId, 10) : null;
  const { data: areaOpts = [] } = useQuery({
    queryKey: ["adm-ward-areas", newWardIdNum],
    queryFn: () => (newWardIdNum ? fetchAreas(newWardIdNum) : Promise.resolve([])),
    enabled: !!newWardIdNum,
    staleTime: 5 * 60_000,
  });
  const { data: boothOpts = [] } = useQuery({
    queryKey: ["adm-ward-booths", newWardIdNum],
    queryFn: () => (newWardIdNum ? fetchBooths(newWardIdNum) : Promise.resolve([])),
    enabled: !!newWardIdNum,
    staleTime: 5 * 60_000,
  });

  useEffect(() => { setNewAreaId("none"); setNewBoothId("none"); }, [newWardId]);

  const createMutation = useMutation({
    mutationFn: () =>
      adminCreateAssignment(
        {
          userId: parseInt(newUserId, 10),
          wardId: newWardId !== "none" ? parseInt(newWardId, 10) : null,
          areaId: newAreaId !== "none" ? parseInt(newAreaId, 10) : null,
          pollingStationId: newBoothId !== "none" ? parseInt(newBoothId, 10) : null,
          roleLabel: newRoleLabel.trim() || null,
          isActive: true,
        },
        { headers: authHeaders(token) },
      ),
    onSuccess: () => {
      setDialogOpen(false);
      setNewUserId(""); setNewWardId("none"); setNewAreaId("none");
      setNewBoothId("none"); setNewRoleLabel(""); setCreateError("");
      qc.invalidateQueries({ queryKey: ["officer-assignments"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setCreateError(msg.includes("409") ? "This officer already has an assignment with the same scope" :
                     msg.includes("400") ? "Invalid assignment — check ward/area/booth match" : msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      adminUpdateAssignment(id, { isActive }, { headers: authHeaders(token) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["officer-assignments"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminDeleteAssignment(id, { headers: authHeaders(token) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["officer-assignments"] }),
  });

  const bulkReassignMutation = useMutation({
    mutationFn: () => adminBulkReassignAssignments(
      { assignmentIds: Array.from(selected), toUserId: parseInt(reassignToUserId, 10) },
      { headers: authHeaders(token) },
    ),
    onSuccess: () => {
      setReassignOpen(false);
      setSelected(new Set());
      setReassignToUserId("");
      setReassignError("");
      qc.invalidateQueries({ queryKey: ["officer-assignments"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setReassignError(
        msg.includes("409") ? "Some reassignments collide with existing scopes for the target officer" :
        msg.includes("400") ? "Invalid request" : msg,
      );
    },
  });

  const items = data?.items ?? [];
  const filtered = search
    ? items.filter(i =>
        (i.userName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (i.wardName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (i.areaName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (i.roleLabel ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  function toggleRow(id: number) {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  }
  function toggleAllVisible() {
    if (filtered.every(r => selected.has(r.id))) {
      const n = new Set(selected);
      filtered.forEach(r => n.delete(r.id));
      setSelected(n);
    } else {
      const n = new Set(selected);
      filtered.forEach(r => n.add(r.id));
      setSelected(n);
    }
  }

  function submitCreate() {
    setCreateError("");
    if (!newUserId) { setCreateError("Pick an officer"); return; }
    if (newWardId === "none" && newAreaId === "none" && newBoothId === "none") {
      setCreateError("Pick at least a ward, area or booth scope"); return;
    }
    createMutation.mutate();
  }

  return (
    <div className="space-y-4">
      {/* Filters + actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterUserId} onValueChange={setFilterUserId}>
              <SelectTrigger className="w-56 h-9 text-sm"><SelectValue placeholder="Officer" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All officers</SelectItem>
                {(officersData?.officers ?? []).map(o => (
                  <SelectItem key={o.id} value={String(o.id)}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterWardId} onValueChange={setFilterWardId}>
              <SelectTrigger className="w-56 h-9 text-sm"><SelectValue placeholder="Ward" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All wards</SelectItem>
                {wardList.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-9 text-sm w-64"
                placeholder="Search by officer / ward / role…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 ml-auto">
              {selected.size > 0 && (
                <Button
                  size="sm" variant="outline" className="h-9 gap-1.5"
                  onClick={() => { setReassignError(""); setReassignOpen(true); }}
                  data-testid="button-bulk-reassign"
                >
                  <ArrowRightLeft className="w-4 h-4" />
                  Reassign {selected.size} selected
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-9">
                {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
              </Button>
              <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-primary text-white hover:bg-primary/90 gap-1.5 h-9">
                <Plus className="w-4 h-4" /> New Assignment
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && filtered.every(r => selected.has(r.id))}
                      onChange={toggleAllVisible}
                      data-testid="checkbox-select-all"
                    />
                  </th>
                  {["Officer", "Role label", "Ward", "Area", "Booth", "Active", "Created", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(a.id)}
                        onChange={() => toggleRow(a.id)}
                        data-testid={`checkbox-row-${a.id}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{a.userName ?? `User #${a.userId}`}</div>
                      <div className="text-xs text-muted-foreground">{a.userEmail ?? ""} {a.userRole ? `· ${a.userRole}` : ""}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{a.roleLabel ?? "—"}</td>
                    <td className="px-4 py-3">{a.wardName ?? "—"}</td>
                    <td className="px-4 py-3">{a.areaName ?? "—"}</td>
                    <td className="px-4 py-3">
                      {a.pollingStationId
                        ? <span className="text-xs">#{a.boothNo} {a.boothName}</span>
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={a.isActive ? "border-green-500 text-green-700" : "border-gray-400 text-gray-500"}>
                        {a.isActive ? "Active" : "Paused"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs"
                          onClick={() => toggleMutation.mutate({ id: a.id, isActive: !a.isActive })}
                          disabled={toggleMutation.isPending}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {a.isActive ? "Pause" : "Activate"}
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => { if (confirm("Delete this assignment?")) deleteMutation.mutate(a.id); }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center text-muted-foreground py-12">
                    {isFetching ? "Loading…" : "No assignments yet — click \"New Assignment\" to create one."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Officer Assignment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1">Officer *</label>
              <Select value={newUserId} onValueChange={setNewUserId}>
                <SelectTrigger><SelectValue placeholder="Pick officer…" /></SelectTrigger>
                <SelectContent>
                  {(officersData?.officers ?? []).map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.name} · {o.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Ward</label>
              <Select value={newWardId} onValueChange={setNewWardId}>
                <SelectTrigger><SelectValue placeholder="Pick ward…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {wardList.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {newWardIdNum && areaOpts.length > 0 && (
              <div>
                <label className="text-xs font-medium block mb-1">Area (optional, narrower scope)</label>
                <Select value={newAreaId} onValueChange={setNewAreaId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {areaOpts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {newWardIdNum && boothOpts.length > 0 && (
              <div>
                <label className="text-xs font-medium block mb-1">Booth (optional, narrowest scope)</label>
                <Select value={newBoothId} onValueChange={setNewBoothId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {boothOpts.map(b => (
                      <SelectItem key={b.id} value={String(b.id)}>#{b.boothNo} — {b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs font-medium block mb-1">Role label (optional)</label>
              <Input
                placeholder="e.g. Booth Captain, Area Coordinator…"
                value={newRoleLabel}
                onChange={(e) => setNewRoleLabel(e.target.value)}
              />
            </div>
            {createError && (
              <div className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{createError}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submitCreate}
              disabled={createMutation.isPending}
              className="bg-primary text-white hover:bg-primary/90"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk reassign dialog */}
      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reassign {selected.size} assignment{selected.size === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Move the selected scopes to another officer. Existing open grievances are not changed —
              only future auto-routing uses the new owner.
            </p>
            <div>
              <label className="text-xs font-medium block mb-1">Target officer *</label>
              <Select value={reassignToUserId} onValueChange={setReassignToUserId}>
                <SelectTrigger><SelectValue placeholder="Pick officer…" /></SelectTrigger>
                <SelectContent>
                  {(officersData?.officers ?? []).map(o => (
                    <SelectItem key={o.id} value={String(o.id)}>{o.name} · {o.role}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {reassignError && (
              <div className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{reassignError}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReassignOpen(false)}>Cancel</Button>
            <Button
              onClick={() => { if (!reassignToUserId) { setReassignError("Pick a target officer"); return; } bulkReassignMutation.mutate(); }}
              disabled={bulkReassignMutation.isPending}
              className="bg-primary text-white hover:bg-primary/90"
              data-testid="button-confirm-reassign"
            >
              {bulkReassignMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Reassign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ────────────────────────── Volunteers tab ──────────────────────────
function VolunteersTab({ token }: { token: string }) {
  const qc = useQueryClient();
  const { data: wardList = [] } = useWards();

  const [filterWardId, setFilterWardId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newVolId, setNewVolId] = useState<string>("");
  const [newWardId, setNewWardId] = useState<string>("none");
  const [newAreaId, setNewAreaId] = useState<string>("none");
  const [newBoothId, setNewBoothId] = useState<string>("none");
  const [createError, setCreateError] = useState<string>("");

  const { data: volunteers = [] } = useQuery({
    queryKey: ["approved-volunteers"],
    queryFn: () => fetchApprovedVolunteers(token),
    staleTime: 60_000,
  });

  const listParams = useMemo(() => ({
    ...(filterWardId !== "all" && { wardId: parseInt(filterWardId, 10) }),
  }), [filterWardId]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["volunteer-assignments", listParams],
    queryFn: () => adminListVolunteerAssignments(listParams, { headers: authHeaders(token) }),
    staleTime: 30_000,
  });

  const newWardIdNum = newWardId !== "none" ? parseInt(newWardId, 10) : null;
  const { data: areaOpts = [] } = useQuery({
    queryKey: ["adm-vol-ward-areas", newWardIdNum],
    queryFn: () => (newWardIdNum ? fetchAreas(newWardIdNum) : Promise.resolve([])),
    enabled: !!newWardIdNum,
    staleTime: 5 * 60_000,
  });
  const { data: boothOpts = [] } = useQuery({
    queryKey: ["adm-vol-ward-booths", newWardIdNum],
    queryFn: () => (newWardIdNum ? fetchBooths(newWardIdNum) : Promise.resolve([])),
    enabled: !!newWardIdNum,
    staleTime: 5 * 60_000,
  });

  useEffect(() => { setNewAreaId("none"); setNewBoothId("none"); }, [newWardId]);

  const createMutation = useMutation({
    mutationFn: () =>
      adminCreateVolunteerAssignment(
        {
          volunteerId: parseInt(newVolId, 10),
          wardId: newWardId !== "none" ? parseInt(newWardId, 10) : null,
          areaId: newAreaId !== "none" ? parseInt(newAreaId, 10) : null,
          pollingStationId: newBoothId !== "none" ? parseInt(newBoothId, 10) : null,
          isActive: true,
        },
        { headers: authHeaders(token) },
      ),
    onSuccess: () => {
      setDialogOpen(false);
      setNewVolId(""); setNewWardId("none"); setNewAreaId("none"); setNewBoothId("none");
      setCreateError("");
      qc.invalidateQueries({ queryKey: ["volunteer-assignments"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      setCreateError(msg.includes("409") ? "This volunteer already has an assignment with the same scope" :
                     msg.includes("400") ? "Invalid assignment — check ward/area/booth match" : msg);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      adminUpdateVolunteerAssignment(id, { isActive }, { headers: authHeaders(token) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["volunteer-assignments"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminDeleteVolunteerAssignment(id, { headers: authHeaders(token) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["volunteer-assignments"] }),
  });

  const items = data?.items ?? [];
  const filtered = search
    ? items.filter(i =>
        (i.volunteerName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (i.wardName ?? "").toLowerCase().includes(search.toLowerCase()) ||
        (i.areaName ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : items;

  function submitCreate() {
    setCreateError("");
    if (!newVolId) { setCreateError("Pick a volunteer"); return; }
    if (newWardId === "none" && newAreaId === "none" && newBoothId === "none") {
      setCreateError("Pick at least a ward, area or booth scope"); return;
    }
    createMutation.mutate();
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filterWardId} onValueChange={setFilterWardId}>
              <SelectTrigger className="w-56 h-9 text-sm"><SelectValue placeholder="Ward" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All wards</SelectItem>
                {wardList.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8 h-9 text-sm w-64"
                placeholder="Search by volunteer / ward…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="ghost" size="sm" onClick={() => refetch()} className="h-9">
                {isFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Refresh"}
              </Button>
              <Button
                size="sm"
                onClick={() => setDialogOpen(true)}
                className="bg-primary text-white hover:bg-primary/90 gap-1.5 h-9"
                data-testid="button-new-volunteer-assignment"
              >
                <Plus className="w-4 h-4" /> Assign volunteer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  {["Volunteer", "Phone", "Ward", "Area", "Booth", "Active", "Created", ""].map(h => (
                    <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(a => (
                  <tr key={a.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-medium">{a.volunteerName ?? `Volunteer #${a.volunteerId}`}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{a.volunteerPhone ?? "—"}</td>
                    <td className="px-4 py-3">{a.wardName ?? "—"}</td>
                    <td className="px-4 py-3">{a.areaName ?? "—"}</td>
                    <td className="px-4 py-3">
                      {a.pollingStationId
                        ? <span className="text-xs">#{a.boothNo} {a.boothName}</span>
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={a.isActive ? "border-green-500 text-green-700" : "border-gray-400 text-gray-500"}>
                        {a.isActive ? "Active" : "Paused"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs"
                          onClick={() => toggleMutation.mutate({ id: a.id, isActive: !a.isActive })}
                          disabled={toggleMutation.isPending}
                        >
                          <Power className="w-3.5 h-3.5" />
                          {a.isActive ? "Pause" : "Activate"}
                        </Button>
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive"
                          onClick={() => { if (confirm("Delete this assignment?")) deleteMutation.mutate(a.id); }}
                          disabled={deleteMutation.isPending}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center text-muted-foreground py-12">
                    {isFetching ? "Loading…" : "No volunteer assignments yet."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Assign Volunteer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium block mb-1">Volunteer *</label>
              <Select value={newVolId} onValueChange={setNewVolId}>
                <SelectTrigger data-testid="select-volunteer"><SelectValue placeholder="Pick volunteer…" /></SelectTrigger>
                <SelectContent>
                  {volunteers.map(v => (
                    <SelectItem key={v.id} value={String(v.id)}>{v.name} · {v.phone}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {volunteers.length === 0 && (
                <p className="text-xs text-muted-foreground mt-1">No approved volunteers found.</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium block mb-1">Ward</label>
              <Select value={newWardId} onValueChange={setNewWardId}>
                <SelectTrigger><SelectValue placeholder="Pick ward…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {wardList.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {newWardIdNum && areaOpts.length > 0 && (
              <div>
                <label className="text-xs font-medium block mb-1">Area (optional)</label>
                <Select value={newAreaId} onValueChange={setNewAreaId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {areaOpts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {newWardIdNum && boothOpts.length > 0 && (
              <div>
                <label className="text-xs font-medium block mb-1">Booth (optional)</label>
                <Select value={newBoothId} onValueChange={setNewBoothId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {boothOpts.map(b => (
                      <SelectItem key={b.id} value={String(b.id)}>#{b.boothNo} — {b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {createError && (
              <div className="text-xs text-destructive bg-destructive/10 rounded px-3 py-2">{createError}</div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submitCreate}
              disabled={createMutation.isPending}
              className="bg-primary text-white hover:bg-primary/90"
              data-testid="button-confirm-volunteer-assignment"
            >
              {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoutingLogTable({ token }: { token: string }) {
  const { data, isFetching } = useQuery({
    queryKey: ["routing-log"],
    queryFn: () => adminListRoutingLog({ limit: 100 }, { headers: authHeaders(token) }),
    staleTime: 30_000,
  });
  const items = data?.items ?? [];
  if (isFetching && items.length === 0) {
    return <div className="py-12 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  }
  if (items.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">No routing log entries yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="border-b">
        <tr className="text-xs uppercase text-muted-foreground">
          <th className="text-left py-2 px-2">When</th>
          <th className="text-left py-2 px-2">Grievance</th>
          <th className="text-left py-2 px-2">Reason</th>
          <th className="text-left py-2 px-2">Scope</th>
          <th className="text-left py-2 px-2">From → To</th>
          <th className="text-left py-2 px-2">By</th>
          <th className="text-left py-2 px-2">Note</th>
        </tr>
      </thead>
      <tbody className="divide-y">
        {items.map(r => (
          <tr key={r.id}>
            <td className="py-2 px-2 text-xs whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
            <td className="py-2 px-2 font-mono text-xs">#{r.grievanceId}</td>
            <td className="py-2 px-2">
              <Badge className={REASON_BADGE[r.reason] ?? "bg-muted"}>{r.reason}</Badge>
            </td>
            <td className="py-2 px-2 text-xs">{r.matchedScope}{r.matchedScopeId ? `:${r.matchedScopeId}` : ""}</td>
            <td className="py-2 px-2 text-xs">{r.fromOfficerId ?? "—"} → {r.toOfficerId ?? "—"}</td>
            <td className="py-2 px-2 text-xs">{r.changedByName}</td>
            <td className="py-2 px-2 text-xs text-muted-foreground">{r.note ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
