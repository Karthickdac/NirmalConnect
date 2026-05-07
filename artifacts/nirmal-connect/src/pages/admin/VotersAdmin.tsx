import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useWards } from "@/lib/useWards";
import { getToken } from "@/lib/auth";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2, Search, ChevronLeft, ChevronRight, FileText, Tag as TagIcon, Plus, Pencil, Trash2, X } from "lucide-react";
import type { Language } from "@/lib/i18n";
import { useVoterTags, type VoterTag } from "./VoterTagsAdmin";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface VoterRow {
  id: number;
  epicNumber: string;
  fullName: string;
  fullNameTa: string | null;
  age: number | null;
  gender: string | null;
  relationName: string | null;
  partNumber: string | null;
  serialInPart: number | null;
  pollingStationId: number | null;
  boothName: string | null;
  boothNo: string | null;
}

interface VoterDetail extends VoterRow {
  relationType: string | null;
  relationNameTa: string | null;
  houseNumber: string | null;
  addressLine: string | null;
  wardId: number | null;
  sourceImportId: number | null;
  sourcePdf: string | null;
  sourcePage: number | null;
  createdAt: string;
  updatedAt: string;
  tags: VoterTag[];
}

interface VoterNote {
  id: number;
  voterId: number;
  body: string;
  authorId: number | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

interface SearchResponse {
  items: VoterRow[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface BoothOption { id: number; boothNo: string; name: string }

async function authJson<T>(path: string, init?: RequestInit): Promise<T> {
  const tok = getToken();
  const r = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (r.status === 404) throw new Error("not_found");
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

async function fetchBooths(wardId: number): Promise<BoothOption[]> {
  const r = await fetch(`${BASE}/api/wards/${wardId}/polling-stations`);
  return r.ok ? (r.json() as Promise<BoothOption[]>) : [];
}

interface VotersAdminProps { lang?: Language }

export default function VotersAdmin({ lang = "ta" }: VotersAdminProps) {
  const { data: wards = [] } = useWards();
  const { data: me } = useGetMe();
  // Source PDF endpoint (/admin/voters/imports/:id) is super_admin-only;
  // hide the link for everyone else to avoid a confusing 403.
  const canViewSourcePdf = me?.role === "super_admin";
  const isAdminRole = me?.role === "super_admin" || me?.role === "admin";
  const { data: tagCatalog } = useVoterTags();
  const allTags = useMemo(() => tagCatalog?.items ?? [], [tagCatalog]);

  // Bilingual display toggle (defaults to incoming admin lang).
  const [displayLang, setDisplayLang] = useState<Language>(lang);
  useEffect(() => { setDisplayLang(lang); }, [lang]);

  // Filter inputs (uncommitted)
  const [qInput, setQInput] = useState("");
  const [wardInput, setWardInput] = useState("all");
  const [boothInput, setBoothInput] = useState("all");
  const [genderInput, setGenderInput] = useState("all");
  const [minAgeInput, setMinAgeInput] = useState("");
  const [maxAgeInput, setMaxAgeInput] = useState("");
  const [tagFilterIds, setTagFilterIds] = useState<number[]>([]);

  // Reset booth when ward changes (booth list is ward-scoped).
  useEffect(() => { setBoothInput("all"); }, [wardInput]);

  const wardForBooths = wardInput !== "all" ? parseInt(wardInput, 10) : null;
  const { data: boothOpts = [] } = useQuery({
    queryKey: ["voter-booth-opts", wardForBooths],
    queryFn: () => (wardForBooths ? fetchBooths(wardForBooths) : Promise.resolve([])),
    enabled: !!wardForBooths,
    staleTime: 5 * 60_000,
  });

  // Committed filter values that drive the query.
  const [filters, setFilters] = useState<{
    q: string; wardId: string; boothId: string; gender: string;
    minAge: string; maxAge: string; tagIds: number[];
  }>({
    q: "", wardId: "all", boothId: "all", gender: "all", minAge: "", maxAge: "", tagIds: [],
  });
  const [page, setPage] = useState(1);
  const limit = 25;

  function applyFilters() {
    setPage(1);
    setFilters({
      q: qInput.trim(),
      wardId: wardInput,
      boothId: boothInput,
      gender: genderInput,
      minAge: minAgeInput,
      maxAge: maxAgeInput,
      tagIds: [...tagFilterIds],
    });
  }
  function clearFilters() {
    setQInput(""); setWardInput("all"); setBoothInput("all");
    setGenderInput("all"); setMinAgeInput(""); setMaxAgeInput("");
    setTagFilterIds([]);
    setFilters({ q: "", wardId: "all", boothId: "all", gender: "all", minAge: "", maxAge: "", tagIds: [] });
    setPage(1);
  }

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.q) p.set("q", filters.q);
    if (filters.wardId !== "all") p.set("wardId", filters.wardId);
    if (filters.boothId !== "all") p.set("boothId", filters.boothId);
    if (filters.gender !== "all") p.set("gender", filters.gender);
    if (filters.minAge) p.set("minAge", filters.minAge);
    if (filters.maxAge) p.set("maxAge", filters.maxAge);
    if (filters.tagIds.length > 0) p.set("tagIds", filters.tagIds.join(","));
    p.set("page", String(page));
    p.set("limit", String(limit));
    return p.toString();
  }, [filters, page]);

  const { data, isFetching, error } = useQuery<SearchResponse>({
    queryKey: ["voter-search", queryString],
    queryFn: () => authJson<SearchResponse>(`/admin/voters?${queryString}`),
    staleTime: 30_000,
  });

  // Detail panel
  const [detailId, setDetailId] = useState<number | null>(null);
  // Deep-link from GrievanceOfficer: clicking a linked-voter chip
  // stashes the voter id in sessionStorage and navigates here.
  useEffect(() => {
    const pending = sessionStorage.getItem("openVoterId");
    if (!pending) return;
    sessionStorage.removeItem("openVoterId");
    const vid = parseInt(pending, 10);
    if (Number.isFinite(vid) && vid > 0) setDetailId(vid);
  }, []);
  const { data: detail, isFetching: detailLoading, error: detailError } = useQuery<VoterDetail>({
    queryKey: ["voter-detail", detailId],
    queryFn: () => authJson<VoterDetail>(`/admin/voters/${detailId}`),
    enabled: detailId != null,
    staleTime: 30_000,
    retry: false,
  });

  const wardNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const w of wards) m.set(w.id, w.name);
    return m;
  }, [wards]);

  useEffect(() => { setPage(1); }, [filters]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  function pickName(en: string, ta: string | null): string {
    if (displayLang === "ta" && ta) return ta;
    return en;
  }
  function pickSubName(en: string, ta: string | null): string | null {
    if (displayLang === "ta" && ta) return en; // show EN as subtitle when TA primary
    if (displayLang === "en" && ta) return ta;
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Voters</h2>
          <p className="text-sm text-muted-foreground">
            Search the electoral roll within your assigned wards. Officers see only voters in their
            area; admins see all. Every search and detail view is audited.
          </p>
        </div>
        {/* EN/TA presentation toggle (mirrors AboutAdmin pattern) */}
        <div className="flex gap-1 rounded-md border bg-background p-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setDisplayLang("en")}
            data-testid="voters-lang-en"
            className={`px-2.5 py-1 text-xs rounded ${displayLang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            EN
          </button>
          <button
            type="button"
            onClick={() => setDisplayLang("ta")}
            data-testid="voters-lang-ta"
            className={`px-2.5 py-1 text-xs rounded ${displayLang === "ta" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            தமிழ்
          </button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[260px]">
              <label className="text-xs font-medium block mb-1">Search</label>
              <Search className="w-4 h-4 absolute left-2 top-[30px] text-muted-foreground" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Name (EN/TA) or EPIC number…"
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
                data-testid="input-voter-search"
              />
            </div>
            <div className="w-44">
              <label className="text-xs font-medium block mb-1">Ward</label>
              <Select value={wardInput} onValueChange={setWardInput}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-voter-ward"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All wards</SelectItem>
                  {wards.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="w-52">
              <label className="text-xs font-medium block mb-1">
                Booth {wardForBooths == null && <span className="text-muted-foreground/70">(pick a ward first)</span>}
              </label>
              <Select value={boothInput} onValueChange={setBoothInput} disabled={!wardForBooths}>
                <SelectTrigger className="h-9 text-sm" data-testid="select-voter-booth"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All booths</SelectItem>
                  {boothOpts.map(b => (
                    <SelectItem key={b.id} value={String(b.id)}>#{b.boothNo} — {b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <label className="text-xs font-medium block mb-1">Gender</label>
              <Select value={genderInput} onValueChange={setGenderInput}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any</SelectItem>
                  <SelectItem value="M">Male</SelectItem>
                  <SelectItem value="F">Female</SelectItem>
                  <SelectItem value="O">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-24">
              <label className="text-xs font-medium block mb-1">Min age</label>
              <Input
                className="h-9 text-sm" type="number" min={0} max={150}
                value={minAgeInput}
                onChange={(e) => setMinAgeInput(e.target.value)}
              />
            </div>
            <div className="w-24">
              <label className="text-xs font-medium block mb-1">Max age</label>
              <Input
                className="h-9 text-sm" type="number" min={0} max={150}
                value={maxAgeInput}
                onChange={(e) => setMaxAgeInput(e.target.value)}
              />
            </div>
            {/* Tag filter (multi-select via popover) */}
            <div className="min-w-[200px]">
              <label className="text-xs font-medium block mb-1">Tags</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 text-xs justify-start font-normal w-full" data-testid="button-voter-tag-filter">
                    <TagIcon className="w-3.5 h-3.5 mr-1.5" />
                    {tagFilterIds.length === 0 ? "Any tag" : `${tagFilterIds.length} tag${tagFilterIds.length === 1 ? "" : "s"} selected`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-2" align="start">
                  <div className="text-xs text-muted-foreground mb-2 px-1">Show voters with any of:</div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {allTags.length === 0 && (
                      <div className="text-xs text-muted-foreground px-2 py-3 text-center">No tags defined yet.</div>
                    )}
                    {allTags.map(t => {
                      const checked = tagFilterIds.includes(t.id);
                      return (
                        <label key={t.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setTagFilterIds(prev => e.target.checked
                                ? Array.from(new Set([...prev, t.id]))
                                : prev.filter(id => id !== t.id));
                            }}
                          />
                          <span
                            className="inline-block w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: t.color }}
                          />
                          <span className="truncate">{displayLang === "ta" && t.nameTa ? t.nameTa : t.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  {tagFilterIds.length > 0 && (
                    <button
                      type="button"
                      className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground py-1 border-t"
                      onClick={() => setTagFilterIds([])}
                    >
                      Clear tag filter
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button size="sm" variant="ghost" className="h-9" onClick={clearFilters}>Clear</Button>
              <Button size="sm" className="h-9 bg-primary text-white hover:bg-primary/90" onClick={applyFilters} data-testid="button-voter-search">
                <Search className="w-4 h-4 mr-1" /> Search
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results table */}
      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-2 border-b text-xs text-muted-foreground flex items-center justify-between">
            <span>
              {isFetching ? "Loading…" : (
                error ? <span className="text-destructive">Error: {(error as Error).message}</span>
                : `${total.toLocaleString()} voter${total === 1 ? "" : "s"} matched`
              )}
            </span>
            {total > 0 && <span>Page {page} of {totalPages}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  {["Name", "EPIC", "Age", "Gender", "Booth", "Part / Sl.", ""].map(h => (
                    <th key={h} className="text-left px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map(v => (
                  <tr key={v.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <div className="font-medium">{pickName(v.fullName, v.fullNameTa)}</div>
                      {pickSubName(v.fullName, v.fullNameTa) && (
                        <div className="text-xs text-muted-foreground">{pickSubName(v.fullName, v.fullNameTa)}</div>
                      )}
                      {v.relationName && <div className="text-xs text-muted-foreground">c/o {v.relationName}</div>}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">{v.epicNumber}</td>
                    <td className="px-4 py-2">{v.age ?? "—"}</td>
                    <td className="px-4 py-2">
                      {v.gender ? <Badge variant="outline" className="text-xs">{v.gender}</Badge> : "—"}
                    </td>
                    <td className="px-4 py-2">
                      {v.boothNo ? (
                        <span className="text-xs">#{v.boothNo} {v.boothName ?? ""}</span>
                      ) : "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {v.partNumber ? `${v.partNumber}${v.serialInPart ? ` / ${v.serialInPart}` : ""}` : "—"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDetailId(v.id)} data-testid={`button-view-voter-${v.id}`}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && !isFetching && (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-12">
                    No voters match your filters.
                  </td></tr>
                )}
                {isFetching && items.length === 0 && (
                  <tr><td colSpan={7} className="text-center text-muted-foreground py-12">
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {total > 0 && (
            <div className="px-4 py-2 border-t flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" className="h-8" disabled={page <= 1 || isFetching} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <ChevronLeft className="w-4 h-4" /> Prev
              </Button>
              <Button size="sm" variant="outline" className="h-8" disabled={!data?.hasMore || isFetching} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail slide-over */}
      <Sheet open={detailId != null} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
        <SheetContent className="w-[420px] sm:w-[480px] overflow-y-auto" data-testid="voter-detail-sheet">
          <SheetHeader>
            <SheetTitle>{detail ? pickName(detail.fullName, detail.fullNameTa) : (detailLoading ? "Loading…" : "Voter")}</SheetTitle>
            {detail && pickSubName(detail.fullName, detail.fullNameTa) && (
              <SheetDescription>{pickSubName(detail.fullName, detail.fullNameTa)}</SheetDescription>
            )}
          </SheetHeader>
          {detailError && (
            <div className="mt-4 text-sm text-destructive">
              {(detailError as Error).message === "not_found"
                ? "This voter is not available (it may be outside your assigned area)."
                : (detailError as Error).message}
            </div>
          )}
          {detail && (
            <div className="mt-4 space-y-4 text-sm">
              <Field label="EPIC">{detail.epicNumber}</Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Age">{detail.age ?? "—"}</Field>
                <Field label="Gender">{detail.gender ?? "—"}</Field>
              </div>
              {(detail.relationName || detail.relationType) && (
                <Field label={detail.relationType ? `${capitalize(detail.relationType)} name` : "Relation"}>
                  {pickName(detail.relationName ?? "—", detail.relationNameTa)}
                  {pickSubName(detail.relationName ?? "", detail.relationNameTa) && (
                    <span className="block text-xs text-muted-foreground">{pickSubName(detail.relationName ?? "", detail.relationNameTa)}</span>
                  )}
                </Field>
              )}
              {(detail.houseNumber || detail.addressLine) && (
                <Field label="Address">
                  {detail.houseNumber && <div>{detail.houseNumber}</div>}
                  {detail.addressLine && <div className="text-muted-foreground">{detail.addressLine}</div>}
                </Field>
              )}
              <Field label="Ward">
                {detail.wardId != null
                  ? (wardNameById.get(detail.wardId) ?? `Ward #${detail.wardId}`)
                  : "—"}
              </Field>
              <Field label="Booth">
                {detail.boothNo
                  ? <>#{detail.boothNo} {detail.boothName ?? ""}</>
                  : "Unassigned"}
                {detail.partNumber && (
                  <span className="block text-xs text-muted-foreground mt-1">
                    Part {detail.partNumber}{detail.serialInPart ? ` · Sl. ${detail.serialInPart}` : ""}
                  </span>
                )}
              </Field>
              {detail.sourcePdf && (
                <Field label="Source PDF">
                  {canViewSourcePdf && detail.sourceImportId != null ? (
                    <a
                      href={`${BASE}/api/admin/voters/imports/${detail.sourceImportId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-primary hover:underline text-xs"
                      data-testid="voter-source-pdf-link"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {detail.sourcePdf}
                      {detail.sourcePage ? <span className="text-muted-foreground">(p.{detail.sourcePage})</span> : null}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="w-3.5 h-3.5" />
                      {detail.sourcePdf}
                      {detail.sourcePage ? ` (p.${detail.sourcePage})` : ""}
                    </span>
                  )}
                </Field>
              )}
              <TagsPanel voterId={detail.id} initialTags={detail.tags} allTags={allTags} displayLang={displayLang} />
              <NotesPanel voterId={detail.id} me={me} isAdminRole={isAdminRole} />
              <GrievancesPanel voterId={detail.id} />
              <div className="text-xs text-muted-foreground border-t pt-3">
                Last updated {new Date(detail.updatedAt).toLocaleString()}
              </div>
            </div>
          )}
          {detailLoading && !detail && (
            <div className="mt-8 text-center"><Loader2 className="w-5 h-5 animate-spin inline" /></div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-0.5">{label}</div>
      <div>{children}</div>
    </div>
  );
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

interface VoterGrievanceItem {
  id: number;
  ticketNo: string;
  category: string;
  status: string;
  priority: string;
  ward: string | null;
  assignedTo: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

function GrievancesPanel({ voterId }: { voterId: number }) {
  const { data, isLoading, error } = useQuery<{ items: VoterGrievanceItem[] }>({
    queryKey: ["voter-grievances", voterId],
    queryFn: () => authJson<{ items: VoterGrievanceItem[] }>(`/admin/voters/${voterId}/grievances`),
  });
  const items = data?.items ?? [];
  return (
    <div className="border-t pt-3" data-testid="voter-grievances-panel">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
        Grievances ({items.length})
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">Loading…</div>}
      {error && (
        <div className="text-xs text-destructive">
          {(error as Error).message}
        </div>
      )}
      {!isLoading && !error && items.length === 0 && (
        <div className="text-xs text-muted-foreground italic">
          No grievances linked to this voter yet.
        </div>
      )}
      <div className="space-y-2">
        {items.map((g) => (
          <button
            type="button"
            key={g.id}
            className="block w-full text-left rounded border bg-muted/20 p-2 text-sm hover:bg-muted/40 hover:border-primary/40 transition-colors cursor-pointer"
            data-testid={`voter-grievance-${g.id}`}
            title="Open grievance"
            onClick={() => {
              // Stash the grievance id and switch the admin shell to the
              // Grievances tab — GrievanceOfficer reads this on mount.
              sessionStorage.setItem("openGrievanceId", String(g.id));
              window.location.hash = "#grievances";
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-primary font-semibold">{g.ticketNo}</span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(g.createdAt).toLocaleDateString()}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">{g.category}</Badge>
              <Badge variant="outline" className="text-[10px]">{g.status}</Badge>
              <Badge variant="outline" className="text-[10px]">{g.priority}</Badge>
              {g.ward && <span className="text-[10px] text-muted-foreground">· {g.ward}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TagsPanel({
  voterId, initialTags, allTags, displayLang,
}: {
  voterId: number;
  initialTags: VoterTag[];
  allTags: VoterTag[];
  displayLang: Language;
}) {
  const qc = useQueryClient();
  const { data } = useQuery<{ items: VoterTag[] }>({
    queryKey: ["voter-tags", voterId],
    queryFn: () => authJson<{ items: VoterTag[] }>(`/admin/voters/${voterId}/tags`),
    initialData: { items: initialTags },
  });
  const tags = data?.items ?? [];
  const tagIdSet = useMemo(() => new Set(tags.map(t => t.id)), [tags]);

  const save = useMutation({
    mutationFn: async (ids: number[]) => {
      return authJson<{ items: VoterTag[] }>(
        `/admin/voters/${voterId}/tags`,
        { method: "PUT", body: JSON.stringify({ tagIds: ids }) },
      );
    },
    onSuccess: (resp) => {
      qc.setQueryData(["voter-tags", voterId], resp);
      qc.invalidateQueries({ queryKey: ["voter-detail", voterId] });
    },
  });

  function toggle(id: number) {
    const next = tagIdSet.has(id)
      ? tags.filter(t => t.id !== id).map(t => t.id)
      : [...tags.map(t => t.id), id];
    save.mutate(next);
  }

  return (
    <div className="border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Tags</div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" data-testid="button-add-voter-tag">
              <Plus className="w-3 h-3 mr-1" /> Edit
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <div className="text-xs text-muted-foreground mb-2 px-1">Toggle tags:</div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {allTags.length === 0 && (
                <div className="text-xs text-muted-foreground p-2 text-center">No tags defined.</div>
              )}
              {allTags.map(t => (
                <label key={t.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer text-sm">
                  <input
                    type="checkbox" checked={tagIdSet.has(t.id)}
                    onChange={() => toggle(t.id)}
                    disabled={save.isPending}
                  />
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="truncate">{displayLang === "ta" && t.nameTa ? t.nameTa : t.name}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {tags.length === 0 && (
          <span className="text-xs text-muted-foreground italic">No tags yet</span>
        )}
        {tags.map(t => (
          <span
            key={t.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: t.color }}
            data-testid={`voter-tag-chip-${t.id}`}
          >
            {displayLang === "ta" && t.nameTa ? t.nameTa : t.name}
            <button
              type="button"
              className="hover:bg-white/20 rounded-full w-3.5 h-3.5 inline-flex items-center justify-center"
              onClick={() => toggle(t.id)}
              disabled={save.isPending}
              aria-label={`Remove ${t.name}`}
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
      </div>
      {save.error && (
        <div className="text-xs text-destructive mt-1">{(save.error as Error).message}</div>
      )}
    </div>
  );
}

function NotesPanel({
  voterId, me, isAdminRole,
}: {
  voterId: number;
  me: { id: number; role: string } | undefined;
  isAdminRole: boolean;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ items: VoterNote[] }>({
    queryKey: ["voter-notes", voterId],
    queryFn: () => authJson<{ items: VoterNote[] }>(`/admin/voters/${voterId}/notes`),
  });
  const notes = data?.items ?? [];
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingBody, setEditingBody] = useState("");

  const create = useMutation({
    mutationFn: (body: string) => authJson<VoterNote>(
      `/admin/voters/${voterId}/notes`,
      { method: "POST", body: JSON.stringify({ body }) },
    ),
    onSuccess: () => {
      setDraft("");
      qc.invalidateQueries({ queryKey: ["voter-notes", voterId] });
    },
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => authJson<VoterNote>(
      `/admin/voters/${voterId}/notes/${id}`,
      { method: "PUT", body: JSON.stringify({ body }) },
    ),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["voter-notes", voterId] });
    },
  });

  const del = useMutation({
    mutationFn: (id: number) => authJson<{ ok: boolean }>(
      `/admin/voters/${voterId}/notes/${id}`, { method: "DELETE" },
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voter-notes", voterId] }),
  });

  function canEdit(n: VoterNote): boolean {
    if (isAdminRole) return true;
    return me?.id != null && n.authorId === me.id;
  }

  return (
    <div className="border-t pt-3">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Notes</div>
      <div className="space-y-2 mb-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a private note about this voter…"
          rows={2}
          className="text-sm"
          data-testid="textarea-voter-note"
        />
        <div className="flex justify-end">
          <Button
            size="sm" className="h-7 text-xs"
            disabled={!draft.trim() || create.isPending}
            onClick={() => create.mutate(draft.trim())}
            data-testid="button-add-voter-note"
          >
            {create.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Add note
          </Button>
        </div>
        {create.error && (
          <div className="text-xs text-destructive">{(create.error as Error).message}</div>
        )}
      </div>
      {isLoading && <div className="text-xs text-muted-foreground">Loading notes…</div>}
      <div className="space-y-2">
        {notes.length === 0 && !isLoading && (
          <div className="text-xs text-muted-foreground italic">No notes yet.</div>
        )}
        {notes.map(n => (
          <div key={n.id} className="rounded border bg-muted/20 p-2 text-sm" data-testid={`voter-note-${n.id}`}>
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span className="font-medium text-foreground">{n.authorName}</span>
              <span>{new Date(n.createdAt).toLocaleString()}</span>
            </div>
            {editingId === n.id ? (
              <div className="space-y-2">
                <Textarea
                  value={editingBody}
                  onChange={(e) => setEditingBody(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <div className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingId(null)}>Cancel</Button>
                  <Button
                    size="sm" className="h-6 text-xs"
                    disabled={!editingBody.trim() || update.isPending}
                    onClick={() => update.mutate({ id: n.id, body: editingBody.trim() })}
                  >
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="whitespace-pre-wrap break-words">{n.body}</div>
                {canEdit(n) && (
                  <div className="flex justify-end gap-1 mt-1">
                    <Button
                      size="sm" variant="ghost" className="h-6 px-1.5 text-xs"
                      onClick={() => { setEditingId(n.id); setEditingBody(n.body); }}
                      data-testid={`button-edit-voter-note-${n.id}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm" variant="ghost" className="h-6 px-1.5 text-xs text-destructive hover:text-destructive"
                      disabled={del.isPending}
                      onClick={() => {
                        if (window.confirm("Delete this note?")) del.mutate(n.id);
                      }}
                      data-testid={`button-delete-voter-note-${n.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </>
            )}
            {n.updatedAt !== n.createdAt && editingId !== n.id && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                edited {new Date(n.updatedAt).toLocaleString()}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
