import { useEffect, useState } from "react";
import {
  useGetSiteSummary,
  useGetConstituencyStats,
  useGetFeaturedNews,
  useGetUpcomingEvents,
  useGetRecentActivities,
  useListGallery,
} from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";
import { HomeView, createDefaultHomeHero, type HomeHeroConfig } from "@/components/HomeView";
import { useLeaderConfig } from "@/lib/LeaderConfigContext";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

interface HomeProps {
  lang: Language;
}

export default function Home({ lang }: HomeProps) {
  const leaderConfig = useLeaderConfig();
  const { data: summary } = useGetSiteSummary();
  const { data: stats } = useGetConstituencyStats();
  const { data: featuredNews } = useGetFeaturedNews({ limit: 4 });
  const { data: upcomingEvents } = useGetUpcomingEvents({ limit: 3 });
  const { data: recentActivities } = useGetRecentActivities({ limit: 5 });
  const { data: gallery } = useListGallery({ limit: 8, type: "photo" });

  // Hero copy: starts from leader config defaults, then DB CMS overrides any field.
  const [dbHeroOverrides, setDbHeroOverrides] = useState<Partial<HomeHeroConfig>>({});
  useEffect(() => {
    fetch(`${BASE}/home-hero`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Partial<HomeHeroConfig> | null) => {
        if (d && typeof d === "object") setDbHeroOverrides(d);
      })
      .catch(() => { /* keep defaults */ });
  }, []);
  const hero: HomeHeroConfig = { ...createDefaultHomeHero(leaderConfig), ...dbHeroOverrides };

  return (
    <HomeView
      config={hero}
      lang={lang}
      summary={summary as { totalVolunteers?: number; totalEvents?: number; totalNews?: number } | undefined}
      stats={stats}
      featuredNews={featuredNews}
      upcomingEvents={upcomingEvents}
      recentActivities={recentActivities}
      gallery={gallery}
    />
  );
}
