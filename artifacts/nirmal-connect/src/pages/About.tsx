import { useEffect, useState } from "react";
import type { Language } from "@/lib/i18n";
import { AboutView, createDefaultAboutConfig, type AboutConfig } from "@/components/AboutView";
import { useLeaderConfig } from "@/lib/LeaderConfigContext";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

interface AboutProps { lang: Language; }

export default function About({ lang }: AboutProps) {
  const leaderConfig = useLeaderConfig();
  const [dbOverrides, setDbOverrides] = useState<Partial<AboutConfig>>({});

  // Fetch live CMS content from the public endpoint (GET /api/about).
  // Leader config fills the defaults; DB overrides any individual field.
  useEffect(() => {
    fetch(`${BASE}/about`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Partial<AboutConfig> | null) => {
        if (d && typeof d === "object") setDbOverrides(d);
      })
      .catch(() => { /* network error → keep leader defaults */ });
  }, []);

  const config: AboutConfig = { ...createDefaultAboutConfig(leaderConfig), ...dbOverrides };

  return <AboutView config={config} lang={lang} />;
}
