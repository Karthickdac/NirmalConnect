import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import { BarChart3, MapPin, Filter as FilterIcon, AlertTriangle, Download, FileText, TrendingUp } from "lucide-react";
import { getToken } from "@/lib/auth";
import type { Language } from "@/lib/i18n";
import { tAnalytics } from "@/lib/mapI18n";
import { exportAnalyticsCsv, exportAnalyticsPdf } from "@/lib/analyticsExport";

const ConstituencyMap = lazy(() => import("@/components/maps/ConstituencyMap"));

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const COLORS = ["#c9181e", "#d4af37", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#65a30d", "#7c3aed"];

interface AnalyticsResponse {
  filters: { from?: string; to?: string; category?: string; status?: string; officerIds?: number[] };
  totals: { grievances: number; mapped: number; unmapped: number };
  heatPoints: Array<{ lat: number; lng: number; weight: number }>;
  byWard: Array<{ wardId: number; name: string; nameTa: string | null; count: number; avgResolutionHours: number | null }>;
  byWardTop10: Array<{ wardId: number; name: string; nameTa: string | null; count: number; avgResolutionHours: number | null }>;
  byWardCategory: Array<{ wardId: number; wardName: string; wardNameTa: string | null; category: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  byOfficer: Array<{ officerId: number; name: string; role: string | null; total: number; open: number }>;
  trend: Array<{ bucket: string; submitted: number; resolved: number }>;
  trendGranularity: "day" | "week" | "month";
  cachedAt: string;
  cacheTtlSeconds: number;
}

interface OfficersResponse {
  items: Array<{ id: number; name: string; role: string }>;
}

interface AnalyticsProps {
  lang: Language;
  officerWardIds?: number[];
  officerAreaIds?: number[];
  officerPollingStationIds?: number[];
}

const STATUS_OPTIONS = ["Submitted", "Under Review", "Assigned", "In Progress", "Resolved", "Closed"] as const;
const CATEGORY_OPTIONS = ["Roads", "Water Supply", "EB / Electricity Issues", "Sewage", "Healthcare", "Education", "Women Safety", "Corruption", "Ration", "Transport", "Pension", "Housing", "Agriculture", "Employment", "Others"] as const;

export default function Analytics({ lang, officerWardIds, officerAreaIds, officerPollingStationIds }: AnalyticsProps) {
  const t = (k: Parameters<typeof tAnalytics>[1]) => tAnalytics(lang, k);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [officerIds, setOfficerIds] = useState<number[]>([]);

  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [officers, setOfficers] = useState<OfficersResponse["items"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);

  const chartsRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  async function handleCsv() {
    if (!data || exporting) return;
    setExporting("csv");
    try { exportAnalyticsCsv(data); } finally { setExporting(null); }
  }

  async function handlePdf() {
    if (!data || exporting) return;
    setExporting("pdf");
    try {
      await exportAnalyticsPdf(data, { chartsEl: chartsRef.current, mapEl: mapRef.current });
    } catch (e) {
      console.error("[analytics] pdf export failed", e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(null);
    }
  }

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (category) p.set("category", category);
    if (status) p.set("status", status);
    if (officerIds.length > 0) p.set("officerIds", officerIds.join(","));
    return p.toString();
  }, [from, to, category, status, officerIds]);

  useEffect(() => {
    const token = getToken();
    fetch(`${BASE}/api/admin/analytics/officers`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error("Failed"))))
      .then((j: OfficersResponse) => setOfficers(j.items))
      .catch(() => { /* non-fatal */ });
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const token = getToken();
    fetch(`${BASE}/api/admin/analytics/grievances${queryString ? `?${queryString}` : ""}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(async r => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({ error: "Request failed" }));
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        return r.json() as Promise<AnalyticsResponse>;
      })
      .then(j => { if (!cancelled) setData(j); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [queryString]);

  return (
    <div className="space-y-6" data-testid="admin-analytics">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" />
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {data && (
            <div className="text-xs text-muted-foreground">
              {t("cachedFor")} {data.cacheTtlSeconds}s
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!data || loading || exporting !== null}
            onClick={handleCsv}
            data-testid="analytics-download-csv"
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            {exporting === "csv" ? t("exporting") : t("downloadCsv")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!data || loading || exporting !== null}
            onClick={handlePdf}
            data-testid="analytics-download-pdf"
            className="gap-2"
          >
            <FileText className="w-4 h-4" />
            {exporting === "pdf" ? t("exporting") : t("downloadPdf")}
          </Button>
        </div>
      </div>

      {/* Filter bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FilterIcon className="w-4 h-4" /> {t("filters")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("from")}</label>
              <input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                data-testid="analytics-filter-from"
                className="w-full text-sm border rounded px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("to")}</label>
              <input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                data-testid="analytics-filter-to"
                className="w-full text-sm border rounded px-2 py-1.5"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("category")}</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                data-testid="analytics-filter-category"
                className="w-full text-sm border rounded px-2 py-1.5"
              >
                <option value="">{t("any")}</option>
                {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{t("status")}</label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                data-testid="analytics-filter-status"
                className="w-full text-sm border rounded px-2 py-1.5"
              >
                <option value="">{t("any")}</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                {t("officer")} {officerIds.length > 0 && <span className="text-primary">({officerIds.length})</span>}
              </label>
              <select
                multiple
                value={officerIds.map(String)}
                onChange={e => {
                  const selected = Array.from(e.target.selectedOptions).map(o => parseInt(o.value, 10));
                  setOfficerIds(selected);
                }}
                data-testid="analytics-filter-officer"
                className="w-full text-sm border rounded px-2 py-1.5 h-[80px]"
                size={4}
              >
                {officers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>
          {(from || to || category || status || officerIds.length > 0) && (
            <div className="mt-3">
              <button
                onClick={() => { setFrom(""); setTo(""); setCategory(""); setStatus(""); setOfficerIds([]); }}
                className="text-xs text-primary hover:underline"
                data-testid="analytics-filter-clear"
              >
                {t("clear")}
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded p-3">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="text-center py-10 text-sm text-muted-foreground">{t("loading")}</div>
      )}

      {data && (
        <>
          {/* KPI strip + unmapped warning */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{t("totalGrievances")}</div>
                <div className="text-2xl font-bold mt-1" data-testid="analytics-total">{data.totals.grievances}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground">{t("mapped")}</div>
                <div className="text-2xl font-bold mt-1 text-green-600">{data.totals.mapped}</div>
              </CardContent>
            </Card>
            <Card className={data.totals.unmapped > 0 ? "border-amber-300" : ""}>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  {data.totals.unmapped > 0 && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                  {t("unmapped")}
                </div>
                <div className={`text-2xl font-bold mt-1 ${data.totals.unmapped > 0 ? "text-amber-600" : ""}`} data-testid="analytics-unmapped">
                  {data.totals.unmapped}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Trend over time */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                {t("trendTitle")}
                <span className="text-xs font-normal text-muted-foreground ml-1">
                  {data.trendGranularity === "day" ? t("trendByDay") : data.trendGranularity === "week" ? t("trendByWeek") : t("trendByMonth")}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data.trend.length === 0 || data.trend.every(p => p.submitted === 0 && p.resolved === 0) ? (
                <div className="text-center text-sm text-muted-foreground py-10" data-testid="analytics-trend-empty">
                  {t("trendEmpty")}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data.trend} data-testid="analytics-trend-chart">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="submitted" name={t("trendSubmitted")} stroke="#c9181e" strokeWidth={2} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="resolved" name={t("trendResolved")} stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Charts grid */}
          <div ref={chartsRef} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top wards bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("topWards")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.byWardTop10.map(w => ({ name: lang === "ta" && w.nameTa ? w.nameTa : w.name, count: w.count }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} interval={0} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#c9181e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Categories pie */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("byCategory")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={data.byCategory}
                      dataKey="count"
                      nameKey="category"
                      cx="50%" cy="50%"
                      innerRadius={50} outerRadius={95}
                      paddingAngle={2}
                    >
                      {data.byCategory.map((_, i) => (
                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Avg resolution by ward */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("avgResolution")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.byWard
                    .filter(w => w.avgResolutionHours != null)
                    .map(w => ({ name: lang === "ta" && w.nameTa ? w.nameTa : w.name, hours: w.avgResolutionHours }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} interval={0} />
                    <YAxis tick={{ fontSize: 11 }} label={{ value: "h", angle: -90, position: "insideLeft", fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="hours" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Officer caseload */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("officerCaseload")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.byOfficer.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="open" name={t("open")} stackId="a" fill="#f97316" />
                    <Bar dataKey="total" name={t("total")} stackId="b" fill="#16a34a" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Category breakdown per ward (stacked) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">{t("categoryByWard")}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={(() => {
                  // Pivot byWardCategory[] into [{ name, [cat]: count, ... }]
                  const topWardIds = new Set(data.byWardTop10.map(w => w.wardId));
                  const rowsByWard = new Map<number, Record<string, string | number>>();
                  for (const row of data.byWardCategory) {
                    if (!topWardIds.has(row.wardId)) continue;
                    const key = lang === "ta" && row.wardNameTa ? row.wardNameTa : row.wardName;
                    const r = rowsByWard.get(row.wardId) ?? { name: key };
                    r[row.category] = (r[row.category] as number ?? 0) + row.count;
                    rowsByWard.set(row.wardId, r);
                  }
                  return Array.from(rowsByWard.values());
                })()}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-25} textAnchor="end" height={60} interval={0} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {data.byCategory.slice(0, 8).map((c, i) => (
                    <Bar key={c.category} dataKey={c.category} stackId="cats" fill={COLORS[i % COLORS.length]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Map with heatmap overlay */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <MapPin className="w-4 h-4" /> {t("heatmapTitle")}
              </CardTitle>
              {data.totals.unmapped > 0 && (
                <p className="text-xs text-amber-600 flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3" />
                  {data.totals.unmapped} {t("unmappedNote")}
                </p>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <div ref={mapRef}>
              <Suspense fallback={<div className="text-sm text-muted-foreground p-4">{t("loading")}</div>}>
                <ConstituencyMap
                  lang={lang}
                  adminMode
                  officerWardIds={officerWardIds}
                  officerAreaIds={officerAreaIds}
                  officerPollingStationIds={officerPollingStationIds}
                  height="600px"
                  heatPoints={data.heatPoints}
                />
              </Suspense>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
