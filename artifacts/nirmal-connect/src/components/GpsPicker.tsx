import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import { Button } from "@/components/ui/button";
import { Crosshair, MapPin, X, Loader2 } from "lucide-react";
import type { Language } from "@/lib/i18n";

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

const DEFAULT_CENTER: [number, number] = [9.901, 78.078];
const DEFAULT_ZOOM = 13;
const PIN_ZOOM = 16;

export interface GpsValue {
  lat: number;
  lng: number;
}
interface Props {
  value: GpsValue | null;
  onChange: (v: GpsValue | null) => void;
  lang: Language;
}

function ClickHandler({ onPick }: { onPick: (v: GpsValue) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function Recenter({ value }: { value: GpsValue | null }) {
  const map = useMapEvents({});
  const last = useRef<string>("");
  useEffect(() => {
    if (!value) return;
    const key = `${value.lat.toFixed(5)},${value.lng.toFixed(5)}`;
    if (key === last.current) return;
    last.current = key;
    map.setView([value.lat, value.lng], Math.max(map.getZoom(), PIN_ZOOM));
  }, [value, map]);
  return null;
}

export default function GpsPicker({ value, onChange, lang }: Props) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function useMyLocation() {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError(lang === "ta" ? "உங்கள் உலாவியில் GPS கிடைக்கவில்லை." : "Geolocation isn't available in your browser.");
      return;
    }
    setError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        setLocating(false);
        setError(
          err.code === err.PERMISSION_DENIED
            ? (lang === "ta" ? "GPS அனுமதி மறுக்கப்பட்டது." : "Location permission was denied.")
            : (lang === "ta" ? "GPS தற்போது கிடைக்கவில்லை." : "Couldn't get your location right now."),
        );
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm font-medium flex items-center gap-1.5">
          <MapPin className="w-4 h-4 text-primary" />
          {lang === "ta" ? "இடம் (விரும்பினால்)" : "Location (optional)"}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={useMyLocation}
            disabled={locating}
            data-testid="gps-use-my-location"
            className="gap-1.5"
          >
            {locating
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Crosshair className="w-3.5 h-3.5" />}
            {lang === "ta" ? "என் இடம்" : "Use my location"}
          </Button>
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => { setError(null); onChange(null); }}
              data-testid="gps-clear"
              className="gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              {lang === "ta" ? "அழி" : "Clear"}
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {lang === "ta"
          ? "வரைபடத்தில் தொட்டு அல்லது குறியை இழுத்து சரியான இடத்தைக் குறிக்கவும்."
          : "Tap the map (or drag the pin) to mark the exact location of the issue."}
      </p>
      <div className="h-56 w-full rounded-lg overflow-hidden border" data-testid="gps-map">
        <MapContainer
          center={value ? [value.lat, value.lng] : DEFAULT_CENTER}
          zoom={value ? PIN_ZOOM : DEFAULT_ZOOM}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickHandler onPick={onChange} />
          <Recenter value={value} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const ll = m.getLatLng();
                  onChange({ lat: ll.lat, lng: ll.lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      {value && (
        <p className="text-xs text-muted-foreground font-mono" data-testid="gps-coords">
          {value.lat.toFixed(5)}, {value.lng.toFixed(5)}
        </p>
      )}
      {error && (
        <p className="text-xs text-destructive" data-testid="gps-error">{error}</p>
      )}
    </div>
  );
}
