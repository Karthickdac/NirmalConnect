import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.heat";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  GeoJSON,
  CircleMarker,
  LayerGroup,
  Tooltip,
  useMap,
} from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Language } from "@/lib/i18n";
import { mapTranslations, tMap } from "@/lib/mapI18n";

// Fix the broken default icon URLs that Vite's bundler exposes as
// hashed assets — Leaflet's stock paths point at /images/* which 404.
L.Icon.Default.mergeOptions({
  iconUrl,
  iconRetinaUrl,
  shadowUrl,
});

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

// Thiruparankundram constituency centroid (approx, AC 195 Madurai).
const DEFAULT_CENTER: [number, number] = [9.901, 78.078];
const DEFAULT_ZOOM = 13;
const CLUSTER_DISABLE_ZOOM = 16; // show individual markers when zoomed in

type WardBoundaryFeature = Feature<Geometry, { wardId: number; name?: string }>;

interface Zone {
  id: number;
  name: string;
  nameTa: string | null;
  type: string | null;
}
interface Ward {
  id: number;
  name: string;
  nameTa: string | null;
  zoneId: number | null;
  wardType: string | null;
  latitude: number | null;
  longitude: number | null;
  boundary: WardBoundaryFeature | null;
  hasBoundary: boolean;
}
interface Booth {
  id: number;
  boothNo: string;
  name: string;
  nameTa: string | null;
  address: string | null;
  addressTa: string | null;
  wardId: number | null;
  areaId: number | null;
  latitude: number | null;
  longitude: number | null;
}
interface GrievancePin {
  id: number;
  status: string;
  category: string | null;
  wardId: number | null;
  areaId: number | null;
  pollingStationId: number | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

interface MapData {
  zones: Zone[];
  wards: Ward[];
  pollingStations: Booth[];
  constituencyOutlines?: FeatureCollection;
}

type LayerKey = "zones" | "wards" | "booths" | "grievances" | "outline" | "heatmap";
const LAYER_STORAGE_KEY = "nirmal_map_layers_v1";

function loadLayerPrefs(): Record<LayerKey, boolean> {
  const def: Record<LayerKey, boolean> = {
    outline: true,
    zones: true,
    wards: true,
    booths: true,
    grievances: false,
    heatmap: false,
  };
  if (typeof window === "undefined") return def;
  try {
    const raw = localStorage.getItem(LAYER_STORAGE_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw) as Partial<Record<LayerKey, boolean>>;
    return { ...def, ...parsed };
  } catch {
    return def;
  }
}


// Renders a Leaflet.heat overlay using the imperative Leaflet plugin
// API. We mount/unmount inside a React-Leaflet child so the layer is
// tied to the parent <MapContainer> lifecycle.
function HeatmapLayer({
  points,
  enabled,
}: {
  points: Array<{ lat: number; lng: number; weight: number }>;
  enabled: boolean;
}) {
  const map = useMap();
  const layerRef = useRef<L.Layer | null>(null);
  useEffect(() => {
    if (!enabled || points.length === 0) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
      return;
    }
    const tuples = points.map(p => [p.lat, p.lng, p.weight] as [number, number, number]);
    // Type assertion — leaflet.heat augments the L namespace at runtime.
    const layer = (L as unknown as { heatLayer: (pts: Array<[number, number, number]>, opts?: Record<string, unknown>) => L.Layer }).heatLayer(tuples, {
      radius: 28,
      blur: 22,
      maxZoom: 17,
      minOpacity: 0.35,
      gradient: { 0.2: "#1d4ed8", 0.4: "#22c55e", 0.6: "#eab308", 0.8: "#f97316", 1.0: "#dc2626" },
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current);
        layerRef.current = null;
      }
    };
  }, [points, enabled, map]);
  return null;
}

function FlyToWard({ ward }: { ward: Ward | null }) {
  const map = useMap();
  useEffect(() => {
    if (!ward || ward.latitude == null || ward.longitude == null) return;
    map.flyTo([ward.latitude, ward.longitude], 15, { duration: 0.8 });
  }, [ward, map]);
  return null;
}

export interface ConstituencyMapProps {
  lang: Language;
  /** Admin embed mode: shows the jump-to-ward dropdown above the map */
  adminMode?: boolean;
  /** Officer focus: union of every ward implied by the officer's
   * ward / area / booth assignments (server-derived). Used as the
   * coarsest fallback when no area or booth assignments exist. */
  officerWardIds?: number[];
  /** Officer focus: explicit area-level assignments. Booths are filtered
   * to only those whose `areaId` is in this set when present. */
  officerAreaIds?: number[];
  /** Officer focus: explicit polling-station scope for booth-level
   * assignments — the most-specific filter, applied first. */
  officerPollingStationIds?: number[];
  /** Optional fixed height (defaults to full available height) */
  height?: string;
  /** Optional pre-aggregated heatmap points (lat, lng, weight). When
   * provided, the "heatmap" layer becomes selectable and renders a
   * Leaflet.heat overlay instead of fetching its own data. */
  heatPoints?: Array<{ lat: number; lng: number; weight: number }>;
}

export default function ConstituencyMap({
  lang,
  adminMode = false,
  officerWardIds,
  officerAreaIds,
  officerPollingStationIds,
  height,
  heatPoints,
}: ConstituencyMapProps) {
  const [data, setData] = useState<MapData | null>(null);
  const [pins, setPins] = useState<GrievancePin[]>([]);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>(loadLayerPrefs);
  const [error, setError] = useState<string | null>(null);
  const [jumpWardId, setJumpWardId] = useState<number | null>(null);
  const [mineOnly, setMineOnly] = useState(false);
  const pinsLoadedRef = useRef(false);

  const tr = mapTranslations[lang];

  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}/api/map/data`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load map data");
        return r.json() as Promise<MapData>;
      })
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => { cancelled = true; };
  }, []);

  // Lazy-load grievance pins only when the user enables the layer.
  useEffect(() => {
    if (!layers.grievances || pinsLoadedRef.current) return;
    pinsLoadedRef.current = true;
    fetch(`${BASE}/api/map/grievance-pins`)
      .then((r) => (r.ok ? (r.json() as Promise<GrievancePin[]>) : Promise.resolve([] as GrievancePin[])))
      .then((rows) => setPins(rows))
      .catch(() => { pinsLoadedRef.current = false; });
  }, [layers.grievances]);

  function toggleLayer(k: LayerKey) {
    setLayers((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try { localStorage.setItem(LAYER_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Compute zone centroids by averaging the GPS of wards inside each zone.
  // We don't have native zone polygons, so the "zones" layer renders a
  // labelled CircleMarker at each zone's centroid — the toggle is real.
  const zoneCentroids = useMemo(() => {
    if (!data) return [];
    const buckets = new Map<number, { sumLat: number; sumLng: number; n: number; zone: Zone }>();
    for (const z of data.zones) buckets.set(z.id, { sumLat: 0, sumLng: 0, n: 0, zone: z });
    for (const w of data.wards) {
      if (w.zoneId == null || w.latitude == null || w.longitude == null) continue;
      const b = buckets.get(w.zoneId);
      if (!b) continue;
      b.sumLat += w.latitude;
      b.sumLng += w.longitude;
      b.n += 1;
    }
    return Array.from(buckets.values())
      .filter((b) => b.n > 0)
      .map((b) => ({
        zone: b.zone,
        lat: b.sumLat / b.n,
        lng: b.sumLng / b.n,
        wardCount: b.n,
      }));
  }, [data]);

  const filteredWards = useMemo(() => {
    if (!data) return [] as Ward[];
    if (mineOnly && officerWardIds && officerWardIds.length > 0) {
      const set = new Set(officerWardIds);
      return data.wards.filter((w) => set.has(w.id));
    }
    return data.wards;
  }, [data, mineOnly, officerWardIds]);

  const filteredBooths = useMemo(() => {
    if (!data) return [] as Booth[];
    if (!mineOnly) return data.pollingStations;
    const stationSet = new Set(officerPollingStationIds ?? []);
    const areaSet = new Set(officerAreaIds ?? []);
    const wardSet = new Set(officerWardIds ?? []);
    // Most-specific-first scoping: booth → area → ward. We never widen
    // an area- or booth-scoped officer up to the parent ward, since that
    // would expose data outside their actual assignment.
    if (stationSet.size > 0) {
      return data.pollingStations.filter((b) => stationSet.has(b.id));
    }
    if (areaSet.size > 0) {
      return data.pollingStations.filter(
        (b) => b.areaId != null && areaSet.has(b.areaId),
      );
    }
    if (wardSet.size > 0) {
      return data.pollingStations.filter(
        (b) => b.wardId != null && wardSet.has(b.wardId),
      );
    }
    return data.pollingStations;
  }, [data, mineOnly, officerWardIds, officerAreaIds, officerPollingStationIds]);

  const filteredPins = useMemo(() => {
    if (!mineOnly) return pins;
    const stationSet = new Set(officerPollingStationIds ?? []);
    const areaSet = new Set(officerAreaIds ?? []);
    const wardSet = new Set(officerWardIds ?? []);
    // Mirror the booth-layer scoping: most-specific assignment wins so
    // an area- or booth-scoped officer never sees grievance pins from
    // outside their assignment, even though all parent wards still
    // appear on the wards layer for context.
    if (stationSet.size > 0) {
      return pins.filter((p) => p.pollingStationId != null && stationSet.has(p.pollingStationId));
    }
    if (areaSet.size > 0) {
      return pins.filter((p) => p.areaId != null && areaSet.has(p.areaId));
    }
    if (wardSet.size > 0) {
      return pins.filter((p) => p.wardId != null && wardSet.has(p.wardId));
    }
    return pins;
  }, [pins, mineOnly, officerWardIds, officerAreaIds, officerPollingStationIds]);

  const jumpWard = useMemo(
    () => (jumpWardId ? (data?.wards.find((w) => w.id === jumpWardId) ?? null) : null),
    [jumpWardId, data],
  );

  const containerStyle = { height: height ?? "calc(100vh - 72px)" };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-red-600">
        {tr.failed}: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col lg:flex-row" style={containerStyle} data-testid="constituency-map">
      {/* Sidebar */}
      <aside className="w-full lg:w-64 shrink-0 border-r bg-white p-4 space-y-4 overflow-y-auto">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{tr.layers}</h3>
          <ul className="mt-2 space-y-1.5">
            {((heatPoints ? ["outline", "zones", "wards", "booths", "grievances", "heatmap"] : ["outline", "zones", "wards", "booths", "grievances"]) as LayerKey[]).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <input
                  id={`layer-${k}`}
                  type="checkbox"
                  checked={layers[k]}
                  onChange={() => toggleLayer(k)}
                  data-testid={`map-layer-${k}`}
                  className="h-4 w-4"
                />
                <label htmlFor={`layer-${k}`} className="text-sm text-gray-700 cursor-pointer">
                  {tMap(lang, k)}
                </label>
              </li>
            ))}
          </ul>
        </div>

        {adminMode && data && (
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{tr.jumpToWard}</h3>
            <select
              value={jumpWardId ?? ""}
              onChange={(e) => setJumpWardId(e.target.value ? Number(e.target.value) : null)}
              data-testid="map-jump-ward"
              className="mt-2 w-full text-sm border rounded px-2 py-1.5"
            >
              <option value="">{tr.selectWard}</option>
              {data.wards.map((w) => (
                <option key={w.id} value={w.id}>
                  {lang === "ta" && w.nameTa ? w.nameTa : w.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {adminMode && ((officerWardIds && officerWardIds.length > 0) || (officerPollingStationIds && officerPollingStationIds.length > 0)) && (
          <div className="flex items-center gap-2">
            <input
              id="mine-only"
              type="checkbox"
              checked={mineOnly}
              onChange={(e) => setMineOnly(e.target.checked)}
              data-testid="map-mine-only"
              className="h-4 w-4"
            />
            <label htmlFor="mine-only" className="text-sm text-gray-700 cursor-pointer">
              {tr.onlyMyWard}
            </label>
          </div>
        )}

        <p className="text-xs text-muted-foreground border-t pt-3">
          {tr.attribution}
        </p>
      </aside>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={DEFAULT_CENTER}
          zoom={DEFAULT_ZOOM}
          style={{ width: "100%", height: "100%" }}
          scrollWheelZoom
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />

          {data?.constituencyOutlines && layers.outline && data.constituencyOutlines.features.length > 0 && (
            <GeoJSON
              key="constituency-outline"
              data={data.constituencyOutlines}
              style={{ color: "#0f172a", weight: 2, fillColor: "#1e293b", fillOpacity: 0.04, dashArray: "6 4" }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">{tr.constituencyOutline}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {tr.osmAttribution}
                  </div>
                </div>
              </Popup>
            </GeoJSON>
          )}

          {data && layers.zones && (
            <LayerGroup>
              {zoneCentroids.map((z) => (
                <CircleMarker
                  key={`z-${z.zone.id}`}
                  center={[z.lat, z.lng]}
                  radius={14}
                  pathOptions={{ color: "#7c3aed", fillColor: "#c4b5fd", fillOpacity: 0.45, weight: 2 }}
                >
                  <Tooltip permanent direction="top" offset={[0, -8]} className="zone-label">
                    {lang === "ta" && z.zone.nameTa ? z.zone.nameTa : z.zone.name}
                  </Tooltip>
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">
                        {lang === "ta" && z.zone.nameTa ? z.zone.nameTa : z.zone.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {z.wardCount} {tr.wards.toLowerCase()}
                      </div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </LayerGroup>
          )}

          {data && layers.wards && (
            <LayerGroup>
              {filteredWards.map((w) => {
                if (w.hasBoundary && w.boundary) {
                  return (
                    <GeoJSON
                      key={`b-${w.id}`}
                      data={w.boundary}
                      style={{ color: "#0ea5e9", weight: 2, fillOpacity: 0.12 }}
                    >
                      <Popup>
                        <strong>{lang === "ta" && w.nameTa ? w.nameTa : w.name}</strong>
                      </Popup>
                    </GeoJSON>
                  );
                }
                if (w.latitude != null && w.longitude != null) {
                  const primary = lang === "ta" && w.nameTa ? w.nameTa : w.name;
                  return (
                    <CircleMarker
                      key={`c-${w.id}`}
                      center={[w.latitude, w.longitude]}
                      radius={8}
                      pathOptions={{ color: "#f59e0b", fillColor: "#fde68a", fillOpacity: 0.8, weight: 2 }}
                    >
                      {/* Always-visible label for unmapped wards so the
                          centroid pin is identifiable at a glance,
                          per task spec ("labelled centroid pin"). */}
                      <Tooltip
                        direction="top"
                        offset={[0, -8]}
                        opacity={0.95}
                        permanent
                        className="ward-centroid-label"
                      >
                        {primary} <span style={{ opacity: 0.7 }}>· {tr.boundaryNotMapped}</span>
                      </Tooltip>
                      <Popup>
                        <div>
                          <strong>{w.name}</strong>
                          {w.nameTa && (
                            <div className="text-xs" lang="ta">{w.nameTa}</div>
                          )}
                          <div className="text-xs mt-1 text-amber-700">{tr.boundaryNotMapped}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                }
                return null;
              })}
            </LayerGroup>
          )}

          {data && layers.booths && (
            <MarkerClusterGroup
              chunkedLoading
              disableClusteringAtZoom={CLUSTER_DISABLE_ZOOM}
              spiderfyOnMaxZoom={false}
            >
              {filteredBooths.map((b) => (
                <Marker key={b.id} position={[b.latitude!, b.longitude!]}>
                  {/* Bilingual popup per task spec — always show both
                      English and Tamil when the Tamil field exists,
                      gracefully omitting the missing side. */}
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">
                        {tr.booth} #{b.boothNo}
                      </div>
                      <div>{b.name}</div>
                      {b.nameTa && (
                        <div lang="ta">{b.nameTa}</div>
                      )}
                      {b.address && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {b.address}
                        </div>
                      )}
                      {b.addressTa && (
                        <div className="text-xs text-muted-foreground" lang="ta">
                          {b.addressTa}
                        </div>
                      )}
                      {b.wardId && (
                        <div className="text-xs mt-1">
                          {tr.ward}: {wardLabel(data!.wards, b.wardId, lang)}
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          )}

          {layers.grievances && (
            <LayerGroup>
              {filteredPins.map((p) => (
                <CircleMarker
                  key={`g-${p.id}`}
                  center={[p.latitude!, p.longitude!]}
                  radius={5}
                  pathOptions={{
                    color: p.status === "Resolved" ? "#16a34a" : "#dc2626",
                    fillColor: p.status === "Resolved" ? "#86efac" : "#fca5a5",
                    fillOpacity: 0.85,
                    weight: 1,
                  }}
                >
                  <Popup>
                    <div className="text-xs">
                      <div className="font-semibold">{tr.grievance} #{p.id}</div>
                      <div>{tr.status}: {p.status}</div>
                      {p.category && <div>{tr.category}: {p.category}</div>}
                    </div>
                  </Popup>
                </CircleMarker>
              ))}
            </LayerGroup>
          )}

          <HeatmapLayer points={heatPoints ?? []} enabled={!!heatPoints && layers.heatmap} />
          <FlyToWard ward={jumpWard} />
        </MapContainer>

        {!data && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 text-sm">
            {tr.loading}
          </div>
        )}
      </div>
    </div>
  );
}

function wardLabel(wards: Ward[], id: number, lang: Language): string {
  const w = wards.find((x) => x.id === id);
  if (!w) return String(id);
  return lang === "ta" && w.nameTa ? w.nameTa : w.name;
}
