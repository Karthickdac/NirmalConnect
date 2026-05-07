import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { getToken } from "@/lib/auth";
import { useGetMe } from "@workspace/api-client-react";
import {
  Loader2, Search, ChevronLeft, ChevronRight, Tag as TagIcon,
  Users, Split, Merge, RefreshCw,
} from "lucide-react";
import type { Language } from "@/lib/i18n";
import { useVoterTags, type VoterTag } from "./VoterTagsAdmin";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

interface HouseholdRow {
  id: number;
  pollingStationId: number | null;
  addressKey: string;
  label: string | null;
  manuallyEdited: boolean;
  boothNo: string | null;
  boothName: string | null;
  memberCount: number;
}

interface HouseholdMember {
  id: number;
  epicNumber: string;
  fullName: string;
  fullNameTa: string | null;
  age: number | null;
  gender: string | null;
  relationType: string | null;
  relationName: string | null;
  houseNumber: string | null;
}

interface HouseholdTagSummary {
  tagId: number;
  name: string;
  nameTa: string | null;
  color: string;
  count: number;
}

interface HouseholdDetail extends HouseholdRow {
  createdAt: string;
  updatedAt: string;
  members: HouseholdMember[];
  tagSummary: HouseholdTagSummary[];
}

interface ListResponse {
  items: HouseholdRow[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

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

interface HouseholdsTabProps {
  lang?: Language;
  /** Optional household to open immediately on mount (deep-link). */
  initialOpenId?: number | null;
  /** Cleared after the deep-link is consumed. */
  onInitialOpenConsumed?: () => void;
}

export default function HouseholdsTab({
  lang = "ta", initialOpenId = null, onInitialOpenConsumed,
}: HouseholdsTabProps) {
  const { data: me } = useGetMe();
  const isAdminRole = me?.role === "super_admin" || me?.role === "admin";
  const { data: tagCatalog } = useVoterTags();
  const allTags = useMemo(() => tagCatalog?.items ?? [], [tagCatalog]);

  const [q, setQ] = useState("");
  const [tagAll, setTagAll] = useState<number[]>([]);
  const [page, setPage] = useState(1);
  const limit = 25;

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (tagAll.length > 0) p.set("tagAll", tagAll.join(","));
    p.set("page", String(page));
    p.set("limit", String(limit));
    return p.toString();
  }, [q, tagAll, page]);

  const { data, isFetching, error } = useQuery<ListResponse>({
    queryKey: ["households-list", queryString],
    queryFn: () => authJson<ListResponse>(`/admin/households?${queryString}`),
    staleTime: 15_000,
  });

  const [detailId, setDetailId] = useState<number | null>(null);
  // One-time deep-link from the voter detail panel. Run as an effect
  // so we don't call setState during render.
  useEffect(() => {
    if (initialOpenId != null) {
      setDetailId(initialOpenId);
      onInitialOpenConsumed?.();
    }
  }, [initialOpenId, onInitialOpenConsumed]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const qc = useQueryClient();
  const regroup = useMutation({
    mutationFn: () => authJson<{ ok: boolean; scannedVoters: number; householdsCreated: number; householdsUpdated: number; votersAssigned: number }>(
      `/admin/households/regroup`, { method: "POST" },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["households-list"] });
    },
  });

  return (
    <div className="space-y-4" data-testid="households-tab-content">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="relative flex-1 min-w-[260px]">
              <label className="text-xs font-medium block mb-1">
                {lang === "ta" ? "தேடல்" : "Search"}
              </label>
              <Search className="w-4 h-4 absolute left-2 top-[30px] text-muted-foreground" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder={lang === "ta" ? "முகவரி அல்லது குடும்ப பெயர்…" : "Address or family label…"}
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }}
                data-testid="input-household-search"
              />
            </div>
            <div className="min-w-[220px]">
              <label className="text-xs font-medium block mb-1">
                {lang === "ta" ? "குறிச்சொல் கலவை" : "Tag composition (ALL of)"}
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 text-xs justify-start font-normal w-full" data-testid="button-household-tag-filter">
                    <TagIcon className="w-3.5 h-3.5 mr-1.5" />
                    {tagAll.length === 0
                      ? (lang === "ta" ? "எந்த குறிச்சொல்லும்" : "Any composition")
                      : `${tagAll.length} required tag${tagAll.length === 1 ? "" : "s"}`}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-2" align="start">
                  <div className="text-xs text-muted-foreground mb-2 px-1">
                    {lang === "ta"
                      ? "ஒவ்வொரு குறிச்சொல்லுக்கும் ≥1 உறுப்பினர்:"
                      : "Households with ≥1 member of each:"}
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {allTags.length === 0 && (
                      <div className="text-xs text-muted-foreground px-2 py-3 text-center">No tags defined yet.</div>
                    )}
                    {allTags.map((t: VoterTag) => {
                      const checked = tagAll.includes(t.id);
                      return (
                        <label key={t.id} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/40 cursor-pointer text-sm">
                          <input
                            type="checkbox" checked={checked}
                            onChange={(e) => {
                              setPage(1);
                              setTagAll((prev) => e.target.checked
                                ? Array.from(new Set([...prev, t.id]))
                                : prev.filter((id) => id !== t.id));
                            }}
                          />
                          <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                          <span className="truncate">{lang === "ta" && t.nameTa ? t.nameTa : t.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  {tagAll.length > 0 && (
                    <button
                      type="button"
                      className="w-full mt-2 text-xs text-muted-foreground hover:text-foreground py-1 border-t"
                      onClick={() => { setTagAll([]); setPage(1); }}
                    >
                      Clear
                    </button>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            {isAdminRole && (
              <div className="ml-auto">
                <Button
                  size="sm" variant="outline" className="h-9"
                  disabled={regroup.isPending}
                  onClick={() => regroup.mutate()}
                  data-testid="button-household-regroup"
                  title={lang === "ta" ? "தானியங்கி குழு மீண்டும் இயக்கு" : "Re-run auto-grouping"}
                >
                  {regroup.isPending
                    ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    : <RefreshCw className="w-4 h-4 mr-1.5" />}
                  {lang === "ta" ? "மீண்டும் குழுப்படுத்து" : "Re-group"}
                </Button>
              </div>
            )}
          </div>
          {regroup.isSuccess && regroup.data && (
            <div className="text-xs text-muted-foreground">
              Done — scanned {regroup.data.scannedVoters} voters · {regroup.data.householdsCreated} new households · {regroup.data.votersAssigned} voters reassigned.
            </div>
          )}
          {regroup.error && (
            <div className="text-xs text-destructive">{(regroup.error as Error).message}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-2 border-b text-xs text-muted-foreground flex items-center justify-between">
            <span>
              {isFetching
                ? "Loading…"
                : (error
                  ? <span className="text-destructive">Error: {(error as Error).message}</span>
                  : `${total.toLocaleString()} household${total === 1 ? "" : "s"}`)}
            </span>
            {total > 0 && <span>Page {page} of {totalPages}</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  {["Label / Address", "Booth", "Members", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((h) => (
                  <tr key={h.id} className="hover:bg-muted/20" data-testid={`household-row-${h.id}`}>
                    <td className="px-4 py-2">
                      <div className="font-medium">{h.label ?? <span className="text-muted-foreground italic">— No label —</span>}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-md">{h.addressKey || "(no address)"}</div>
                    </td>
                    <td className="px-4 py-2 text-xs">{h.boothNo ? `#${h.boothNo} ${h.boothName ?? ""}` : "—"}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-xs"><Users className="w-3 h-3 mr-1" />{h.memberCount}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      {h.manuallyEdited
                        ? <Badge variant="secondary" className="text-[10px]">Manually edited</Badge>
                        : <span className="text-xs text-muted-foreground">Auto</span>}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" className="h-7 text-xs"
                        onClick={() => setDetailId(h.id)}
                        data-testid={`button-view-household-${h.id}`}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && !isFetching && (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-12">
                    {lang === "ta" ? "எந்த குடும்பமும் கிடைக்கவில்லை." : "No households found."}
                  </td></tr>
                )}
                {isFetching && items.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-muted-foreground py-12">
                    <Loader2 className="w-5 h-5 animate-spin inline" />
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          {total > 0 && (
            <div className="px-4 py-2 border-t flex items-center justify-end gap-2">
              <Button size="sm" variant="outline" className="h-8" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="w-4 h-4" /> Prev
              </Button>
              <Button size="sm" variant="outline" className="h-8" disabled={!data?.hasMore || isFetching} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <HouseholdDetailSheet
        householdId={detailId}
        onClose={() => setDetailId(null)}
        lang={lang}
      />
    </div>
  );
}

function HouseholdDetailSheet({
  householdId, onClose, lang,
}: {
  householdId: number | null;
  onClose: () => void;
  lang: Language;
}) {
  const qc = useQueryClient();
  const { data, isFetching, error } = useQuery<HouseholdDetail>({
    queryKey: ["household-detail", householdId],
    queryFn: () => authJson<HouseholdDetail>(`/admin/households/${householdId}`),
    enabled: householdId != null,
    staleTime: 15_000,
    retry: false,
  });

  const [splitSel, setSplitSel] = useState<Set<number>>(new Set());
  const [mergeTargetId, setMergeTargetId] = useState<string>("");

  // Reset selection whenever the sheet closes / switches household.
  useEffect(() => {
    setSplitSel(new Set());
    setMergeTargetId("");
  }, [householdId]);

  const split = useMutation({
    mutationFn: (voterIds: number[]) => authJson<{ ok: boolean; newHouseholdId: number; movedCount: number }>(
      `/admin/households/${householdId}/split`,
      { method: "POST", body: JSON.stringify({ voterIds }) },
    ),
    onSuccess: () => {
      setSplitSel(new Set());
      qc.invalidateQueries({ queryKey: ["household-detail", householdId] });
      qc.invalidateQueries({ queryKey: ["households-list"] });
    },
  });

  const merge = useMutation({
    mutationFn: (targetId: number) => authJson<{ ok: boolean; movedCount: number; targetId: number }>(
      `/admin/households/merge`,
      { method: "POST", body: JSON.stringify({ sourceId: householdId, targetId }) },
    ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["households-list"] });
      onClose();
    },
  });

  function toggleMember(id: number) {
    setSplitSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Sheet open={householdId != null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent className="w-[480px] sm:w-[560px] overflow-y-auto" data-testid="household-detail-sheet">
        <SheetHeader>
          <SheetTitle>
            {data?.label ?? (isFetching ? "Loading…" : (lang === "ta" ? "குடும்பம்" : "Household"))}
          </SheetTitle>
          {data && (
            <SheetDescription>
              {data.boothNo ? `Booth #${data.boothNo} ${data.boothName ?? ""} · ` : ""}
              {data.members.length} member{data.members.length === 1 ? "" : "s"}
              {data.manuallyEdited && " · manually edited"}
            </SheetDescription>
          )}
        </SheetHeader>
        {error && (
          <div className="mt-4 text-sm text-destructive">
            {(error as Error).message === "not_found"
              ? "This household is not available (may be outside your assigned area)."
              : (error as Error).message}
          </div>
        )}
        {data && (
          <div className="mt-4 space-y-4 text-sm">
            <div>
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Address</div>
              <div className="text-xs text-muted-foreground">{data.addressKey || "(no address)"}</div>
            </div>

            {data.tagSummary.length > 0 && (
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Tag composition</div>
                <div className="flex flex-wrap gap-1.5">
                  {data.tagSummary.map((t) => (
                    <span key={t.tagId}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                      style={{ backgroundColor: t.color }}>
                      {lang === "ta" && t.nameTa ? t.nameTa : t.name} · {t.count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Members</div>
                {splitSel.size > 0 && (
                  <Button
                    size="sm" className="h-7 text-xs"
                    disabled={split.isPending || splitSel.size === data.members.length}
                    onClick={() => split.mutate(Array.from(splitSel))}
                    data-testid="button-household-split"
                    title={lang === "ta" ? "தேர்வு செய்தவர்களை புதிய குடும்பமாக்கு" : "Move selected into a new household"}
                  >
                    {split.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                    <Split className="w-3 h-3 mr-1" />
                    Split {splitSel.size}
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                {data.members.map((m) => (
                  <label key={m.id}
                    className="flex items-center gap-2 rounded border bg-muted/20 p-2 hover:bg-muted/40 cursor-pointer"
                    data-testid={`household-member-${m.id}`}>
                    <input
                      type="checkbox" checked={splitSel.has(m.id)}
                      onChange={() => toggleMember(m.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {lang === "ta" && m.fullNameTa ? m.fullNameTa : m.fullName}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono">{m.epicNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        {m.age ? `${m.age}yr` : ""}
                        {m.gender ? ` · ${m.gender}` : ""}
                        {m.relationName ? ` · c/o ${m.relationName}` : ""}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {split.error && (
                <div className="text-xs text-destructive mt-1">{(split.error as Error).message}</div>
              )}
            </div>

            <MergePanel
              householdId={householdId!}
              boothId={data.pollingStationId}
              currentId={data.id}
              merge={merge}
              mergeTargetId={mergeTargetId}
              setMergeTargetId={setMergeTargetId}
              lang={lang}
            />

            <div className="text-xs text-muted-foreground border-t pt-3">
              Last updated {new Date(data.updatedAt).toLocaleString()}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function MergePanel({
  householdId, boothId, currentId, merge, mergeTargetId, setMergeTargetId, lang,
}: {
  householdId: number;
  boothId: number | null;
  currentId: number;
  merge: ReturnType<typeof useMutation<{ ok: boolean; movedCount: number; targetId: number }, Error, number>>;
  mergeTargetId: string;
  setMergeTargetId: (s: string) => void;
  lang: Language;
}) {
  // Pull other households in the same booth as merge candidates.
  const { data } = useQuery<ListResponse>({
    queryKey: ["households-merge-candidates", boothId],
    queryFn: () => authJson<ListResponse>(`/admin/households?boothId=${boothId}&limit=100`),
    enabled: boothId != null,
    staleTime: 30_000,
  });
  const candidates = (data?.items ?? []).filter((h) => h.id !== currentId);
  void householdId;
  return (
    <div className="border-t pt-3 space-y-2">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {lang === "ta" ? "மற்றொரு குடும்பத்துடன் இணை" : "Merge into another household"}
      </div>
      <div className="flex gap-2 items-center">
        <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
          <SelectTrigger className="h-8 text-xs flex-1" data-testid="select-merge-target">
            <SelectValue placeholder={lang === "ta" ? "இலக்கு குடும்பம்…" : "Pick target…"} />
          </SelectTrigger>
          <SelectContent>
            {candidates.length === 0 && (
              <SelectItem value="none" disabled>No other households in this booth.</SelectItem>
            )}
            {candidates.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {(c.label ?? c.addressKey ?? `#${c.id}`).slice(0, 60)} · {c.memberCount}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm" className="h-8 text-xs"
          disabled={!mergeTargetId || mergeTargetId === "none" || merge.isPending}
          onClick={() => merge.mutate(parseInt(mergeTargetId, 10))}
          data-testid="button-household-merge"
        >
          {merge.isPending && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
          <Merge className="w-3 h-3 mr-1" /> Merge
        </Button>
      </div>
      {merge.error && (
        <div className="text-xs text-destructive">{(merge.error as Error).message}</div>
      )}
    </div>
  );
}
