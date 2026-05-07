import { lazy, Suspense } from "react";
import type { Language } from "@/lib/i18n";
import { mapTranslations } from "@/lib/mapI18n";

// Lazy-load the Leaflet bundle so the rest of the site is not bloated
// for visitors who never open the map.
const ConstituencyMap = lazy(() => import("@/components/maps/ConstituencyMap"));

export default function MapPage({ lang }: { lang: Language }) {
  const tr = mapTranslations[lang];
  return (
    <div className="flex flex-col" data-testid="map-page">
      <div className="px-4 sm:px-6 py-4 border-b bg-white">
        <h1 className="text-xl font-bold text-gray-900">{tr.pageTitle}</h1>
        <p className="text-sm text-muted-foreground">{tr.pageSubtitle}</p>
      </div>
      <Suspense
        fallback={
          <div className="flex items-center justify-center h-[60vh] text-sm text-muted-foreground">
            {tr.loading}
          </div>
        }
      >
        <ConstituencyMap lang={lang} height="calc(100vh - 72px - 73px)" />
      </Suspense>
    </div>
  );
}
