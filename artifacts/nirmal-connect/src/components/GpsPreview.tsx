import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconUrl from "leaflet/dist/images/marker-icon.png";
import iconRetinaUrl from "leaflet/dist/images/marker-icon-2x.png";
import shadowUrl from "leaflet/dist/images/marker-shadow.png";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import { MapPin, ExternalLink } from "lucide-react";
import type { Language } from "@/lib/i18n";

L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

interface Props {
  lat: number;
  lng: number;
  lang: Language;
}

export default function GpsPreview({ lat, lng, lang }: Props) {
  const gmapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
  const osmUrl = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-semibold flex items-center gap-2">
        <MapPin className="w-4 h-4 text-primary" />
        {lang === "ta" ? "GPS இடம்" : "GPS Location"}
        <span className="text-xs font-mono font-normal text-muted-foreground">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </span>
      </h4>
      <div className="rounded-lg overflow-hidden border h-48">
        <MapContainer
          center={[lat, lng]}
          zoom={16}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
          attributionControl={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution="&copy; OpenStreetMap"
          />
          <Marker position={[lat, lng]} />
        </MapContainer>
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <a
          href={gmapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          {lang === "ta" ? "Google Maps-ல் திற" : "Open in Google Maps"}
        </a>
        <span className="text-muted-foreground">·</span>
        <a
          href={osmUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-primary hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          OpenStreetMap
        </a>
      </div>
    </div>
  );
}
