import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { useWards } from "@/lib/useWards";
import { getToken } from "@/lib/auth";
import { useGetMe } from "@workspace/api-client-react";
import { Loader2, Search, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import type { Language } from "@/lib/i18n";

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
}

interface SearchResponse {
  items: VoterRow[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

interface BoothOption { id: number; boothNo: string; name: string }

async function authJson<T>(path: string): Promise<T> {
  const tok = getToken();
  const r = await fetch(`${BASE}/api${path}`, {
    headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
  });
  if (r.status === 404) throw new Error("not_found");
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
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
  const [filters, setFilters] = useState({
    q: "", wardId: "all", boothId: "all", gender: "all", minAge: "", maxAge: "",
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
    });
  }
  function clearFilters() {
    setQInput(""); setWardInput("all"); setBoothInput("all");
    setGenderInput("all"); setMinAgeInput(""); setMaxAgeInput("");
    setFilters({ q: "", wardId: "all", boothId: "all", gender: "all", minAge: "", maxAge: "" });
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
