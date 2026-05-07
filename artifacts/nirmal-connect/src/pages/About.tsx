import { useEffect, useState } from "react";
import type { Language } from "@/lib/i18n";
import { AboutView, DEFAULT_ABOUT_CONFIG, type AboutConfig } from "@/components/AboutView";

const BASE = import.meta.env.VITE_API_URL ?? "/api";

interface AboutProps { lang: Language; }

export default function About({ lang }: AboutProps) {
  const [config, setConfig] = useState<AboutConfig>(DEFAULT_ABOUT_CONFIG);

  // Fetch live CMS content from the public endpoint (GET /api/about).
  // The endpoint is unauthenticated and returns null when no CMS row
  // is saved yet, in which case we keep DEFAULT_ABOUT_CONFIG.
  useEffect(() => {
    fetch(`${BASE}/about`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Partial<AboutConfig> | null) => {
        if (d && typeof d === "object") {
          setConfig((prev) => ({ ...prev, ...d }));
        }
      })
      .catch(() => { /* network error → keep DEFAULT_ABOUT_CONFIG */ });
  }, []);

  return <AboutView config={config} lang={lang} />;
}
