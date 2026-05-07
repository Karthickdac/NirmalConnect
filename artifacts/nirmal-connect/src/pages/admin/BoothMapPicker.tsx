import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix the default marker icon paths (Leaflet expects sprite assets next to the
// CSS, but Vite hashes filenames). Use the public CDN copies.
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Tirupparankundram (AC 195), Madurai
const DEFAULT_CENTRE: [number, number] = [9.9252, 78.1198];

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number, lng: number) => void;
}

export default function BoothMapPicker({ lat, lng, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  // Keep onChange in a ref so the click handler always sees the latest one
  // without re-mounting the map.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Mount map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const initial: [number, number] = lat != null && lng != null ? [lat, lng] : DEFAULT_CENTRE;
    const map = L.map(containerRef.current, { zoomControl: true }).setView(initial, lat != null && lng != null ? 16 : 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© OpenStreetMap contributors",
      maxZoom: 19,
    }).addTo(map);
    if (lat != null && lng != null) {
      markerRef.current = L.marker([lat, lng]).addTo(map);
    }
    map.on("click", (e: L.LeafletMouseEvent) => {
      const { lat: la, lng: ln } = e.latlng;
      if (markerRef.current) {
        markerRef.current.setLatLng([la, ln]);
      } else {
        markerRef.current = L.marker([la, ln]).addTo(map);
      }
      onChangeRef.current(Number(la.toFixed(6)), Number(ln.toFixed(6)));
    });
    mapRef.current = map;
    // Trigger a size recalculation once the dialog finishes its enter animation.
    setTimeout(() => map.invalidateSize(), 250);
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external lat/lng updates (e.g. when the user edits the input boxes)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (lat != null && lng != null) {
      if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
      else markerRef.current = L.marker([lat, lng]).addTo(map);
      map.setView([lat, lng], Math.max(map.getZoom(), 15));
    }
  }, [lat, lng]);

  return (
    <div className="space-y-1">
      <div ref={containerRef} className="h-64 w-full rounded-md border bg-gray-100" />
      <p className="text-[11px] text-muted-foreground">
        Click on the map to drop / move the marker. Default centre: Tirupparankundram, Madurai.
      </p>
    </div>
  );
}
