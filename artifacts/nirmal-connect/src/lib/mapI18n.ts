import type { Language } from "./i18n";

// Bilingual labels for the constituency map. Tamil keys are first-class
// (no English fall-through) so the public Tamil view never leaks English.

// Map-only translations are kept in a separate module so the public-site
// bundle does not pay for them on pages that never render the Leaflet map.
export const mapTranslations = {
  en: {
    pageTitle: "Constituency Map",
    pageSubtitle: "Wards, polling stations, and grievances across Tirupparankundram (AC 195).",
    layers: "Layers",
    zones: "Zones",
    wards: "Wards",
    booths: "Polling stations",
    grievances: "Open grievances",
    jumpToWard: "Jump to ward",
    selectWard: "— Select ward —",
    onlyMyWard: "Show only my assigned ward",
    boundaryNotMapped: "Boundary not yet mapped",
    booth: "Booth",
    ward: "Ward",
    grievance: "Grievance",
    status: "Status",
    category: "Category",
    loading: "Loading map…",
    failed: "Could not load map data",
    attribution: "Map data © OpenStreetMap contributors. Boundary data: see lib/db/data/data-sources.md.",
    outline: "Constituency outline",
    constituencyOutline: "Madurai Municipal Corporation",
    osmAttribution: "Source: OpenStreetMap (ODbL-1.0).",
  },
  ta: {
    pageTitle: "தொகுதி வரைபடம்",
    pageSubtitle: "திருப்பரங்குன்றம் (AC 195) வார்டுகள், வாக்குச்சாவடிகள் மற்றும் புகார்கள்.",
    layers: "அடுக்குகள்",
    zones: "மண்டலங்கள்",
    wards: "வார்டுகள்",
    booths: "வாக்குச்சாவடிகள்",
    grievances: "திறந்த புகார்கள்",
    jumpToWard: "வார்டுக்கு செல்",
    selectWard: "— வார்டை தேர்ந்தெடு —",
    onlyMyWard: "எனக்கு ஒதுக்கப்பட்ட வார்டை மட்டும் காட்டு",
    boundaryNotMapped: "எல்லை இன்னும் வரைபடப்படுத்தப்படவில்லை",
    booth: "வாக்குச்சாவடி",
    ward: "வார்டு",
    grievance: "புகார்",
    status: "நிலை",
    category: "வகை",
    loading: "வரைபடம் ஏற்றப்படுகிறது…",
    failed: "வரைபடத் தகவலை ஏற்ற முடியவில்லை",
    attribution: "வரைபடத் தகவல் © OpenStreetMap பங்களிப்பாளர்கள். எல்லைத் தகவல்: lib/db/data/data-sources.md.",
    outline: "தொகுதி எல்லை",
    constituencyOutline: "மதுரை மாநகராட்சி",
    osmAttribution: "மூலம்: OpenStreetMap (ODbL-1.0).",
  },
} as const;

export function tMap(lang: Language, key: keyof typeof mapTranslations.en): string {
  return mapTranslations[lang][key] || mapTranslations.en[key];
}
