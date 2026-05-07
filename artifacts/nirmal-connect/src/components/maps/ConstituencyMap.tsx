import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
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
  useMap,
} from "react-leaflet";
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
  boundary: any | null;
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
  latitude: number | null;
  longitude: number | null;
}
interface GrievancePin {
  id: number;
  status: string;
  category: string | null;
  wardId: number | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

interface MapData {
  zones: Zone[];
  wards: Ward[];
  pollingStations: Booth[];
}

type LayerKey = "zones" | "wards" | "booths" | "grievances";
const LAYER_STORAGE_KEY = "nirmal_map_layers_v1";

function loadLayerPrefs(): Record<LayerKey, boolean> {
  const def: Record<LayerKey, boolean> = {
    zones: true,
    wards: true,
    booths: true,
    grievances: false,
  };
  if (typeof window === "undefined") return def;
  try {
    const raw = localStorage.getItem(LAYER_STORAGE_KEY);
    if (!raw) return def;
    const parsed = JSON.parse(raw);
    return { ...def, ...parsed };
  } catch {
    return def;
  }
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
  /** Officer focus: when set, the "show only my ward" toggle is offered */
  officerWardIds?: number[];
  /** Optional fixed height (defaults to full available height) */
  height?: string;
}

export default function ConstituencyMap({
  lang,
  adminMode = false,
  officerWardIds,
  height,
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
        return r.json();
      })
      .then((d: MapData) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(String(e?.message ?? e)); });
    return () => { cancelled = true; };
  }, []);

  // Lazy-load grievance pins only when the user enables the layer.
  useEffect(() => {
    if (!layers.grievances || pinsLoadedRef.current) return;
    pinsLoadedRef.current = true;
    fetch(`${BASE}/api/map/grievance-pins`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: GrievancePin[]) => setPins(rows))
      .catch(() => { pinsLoadedRef.current = false; });
  }, [layers.grievances]);

  function toggleLayer(k: LayerKey) {
    setLayers((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try { localStorage.setItem(LAYER_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  const filteredWards = useMemo(() => {
    if (!data) return [];
    if (mineOnly && officerWardIds && officerWardIds.length > 0) {
      const set = new Set(officerWardIds);
      return data.wards.filter((w) => set.has(w.id));
    }
    return data.wards;
  }, [data, mineOnly, officerWardIds]);

  const filteredBooths = useMemo(() => {
    if (!data) return [];
    if (mineOnly && officerWardIds && officerWardIds.length > 0) {
      const set = new Set(officerWardIds);
      return data.pollingStations.filter((b) => b.wardId != null && set.has(b.wardId));
    }
    return data.pollingStations;
  }, [data, mineOnly, officerWardIds]);

  const filteredPins = useMemo(() => {
    if (mineOnly && officerWardIds && officerWardIds.length > 0) {
      const set = new Set(officerWardIds);
      return pins.filter((p) => p.wardId != null && set.has(p.wardId));
    }
    return pins;
  }, [pins, mineOnly, officerWardIds]);

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
            {(["zones", "wards", "booths", "grievances"] as LayerKey[]).map((k) => (
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

        {adminMode && officerWardIds && officerWardIds.length > 0 && (
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

          {data && layers.wards && (
            <LayerGroup>
              {filteredWards.map((w) => {
                if (w.hasBoundary && w.boundary) {
                  return (
                    <GeoJSON
                      key={`b-${w.id}`}
                      data={w.boundary as any}
                      style={{ color: "#0ea5e9", weight: 2, fillOpacity: 0.12 }}
                    >
                      <Popup>
                        <strong>{lang === "ta" && w.nameTa ? w.nameTa : w.name}</strong>
                      </Popup>
                    </GeoJSON>
                  );
                }
                if (w.latitude != null && w.longitude != null) {
                  return (
                    <CircleMarker
                      key={`c-${w.id}`}
                      center={[w.latitude, w.longitude]}
                      radius={8}
                      pathOptions={{ color: "#f59e0b", fillColor: "#fde68a", fillOpacity: 0.8, weight: 2 }}
                    >
                      <Popup>
                        <strong>{lang === "ta" && w.nameTa ? w.nameTa : w.name}</strong>
                        <div className="text-xs mt-1 text-amber-700">{tr.boundaryNotMapped}</div>
                      </Popup>
                    </CircleMarker>
                  );
                }
                return null;
              })}
            </LayerGroup>
          )}

          {data && layers.booths && (
            <LayerGroup>
              {filteredBooths.map((b) => (
                <Marker key={b.id} position={[b.latitude!, b.longitude!]}>
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">
                        {tr.booth} #{b.boothNo}
                      </div>
                      <div>{lang === "ta" && b.nameTa ? b.nameTa : b.name}</div>
                      {(lang === "ta" && b.addressTa ? b.addressTa : b.address) && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {lang === "ta" && b.addressTa ? b.addressTa : b.address}
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
            </LayerGroup>
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
