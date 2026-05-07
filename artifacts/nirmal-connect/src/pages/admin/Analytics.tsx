import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { BarChart3, MapPin, Filter as FilterIcon, AlertTriangle } from "lucide-react";
import { getToken } from "@/lib/auth";
import type { Language } from "@/lib/i18n";
import { tAnalytics } from "@/lib/mapI18n";

const ConstituencyMap = lazy(() => import("@/components/maps/ConstituencyMap"));

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
const COLORS = ["#c9181e", "#d4af37", "#2563eb", "#16a34a", "#9333ea", "#ea580c", "#0891b2", "#db2777", "#65a30d", "#7c3aed"];

interface AnalyticsResponse {
  filters: { from?: string; to?: string; category?: string; status?: string; officerId?: number };
  totals: { grievances: number; mapped: number; unmapped: number };
  heatPoints: Array<{ lat: number; lng: number; weight: number }>;
  byWard: Array<{ wardId: number; name: string; nameTa: string | null; count: number; avgResolutionHours: number | null }>;
  byCategory: Array<{ category: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
  byOfficer: Array<{ officerId: number; name: string; role: string | null; total: number; open: number }>;
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

const STATUS_OPTIONS = ["Submitted", "In Progress", "Resolved", "Closed", "Rejected"];
const CATEGORY_OPTIONS = ["Roads", "Water", "Electricity", "Sanitation", "Healthcare", "Education", "Public Safety", "Other"];

export default function Analytics({ lang, officerWardIds, officerAreaIds, officerPollingStationIds }: AnalyticsProps) {
  const t = (k: Parameters<typeof tAnalytics>[1]) => tAnalytics(lang, k);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [officerId, setOfficerId] = useState("");

  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [officers, setOfficers] = useState<OfficersResponse["items"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (category) p.set("category", category);
    if (status) p.set("status", status);
    if (officerId) p.set("officerId", officerId);
    return p.toString();
  }, [from, to, category, status, officerId]);

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
        {data && (
          <div className="text-xs text-muted-foreground">
            {t("cachedFor")} {data.cacheTtlSeconds}s
          </div>
        )}
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
              <label className="block text-xs text-muted-foreground mb-1">{t("officer")}</label>
              <select
                value={officerId}
                onChange={e => setOfficerId(e.target.value)}
                data-testid="analytics-filter-officer"
                className="w-full text-sm border rounded px-2 py-1.5"
              >
                <option value="">{t("any")}</option>
                {officers.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>
          {(from || to || category || status || officerId) && (
            <div className="mt-3">
              <button
                onClick={() => { setFrom(""); setTo(""); setCategory(""); setStatus(""); setOfficerId(""); }}
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

          {/* Charts grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top wards bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{t("topWards")}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={data.byWard.map(w => ({ name: lang === "ta" && w.nameTa ? w.nameTa : w.name, count: w.count }))}>
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
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
