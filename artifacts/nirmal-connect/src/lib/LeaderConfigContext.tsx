import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { Language } from "@/lib/i18n";

export interface LeaderConfig {
  nameEn: string;
  nameTa: string;
  titleEn: string;
  titleTa: string;
  constituencyEn: string;
  constituencyTa: string;
  partyEn: string;
  partyTa: string;
  partyShort: string;
  phone: string;
  whatsapp: string;
  email: string;
  addressEn: string;
  addressTa: string;
  officeHoursEn: string;
  officeHoursTa: string;
  photoUrl: string;
  siteTitle: string;
  logoInitial: string;
  districtEn: string;
  districtTa: string;
}

export const DEFAULT_LEADER_CONFIG: LeaderConfig = {
  nameEn: "C.T.R. Nirmal Kumar",
  nameTa: "சி.டி.ஆர். நிர்மல் குமார்",
  titleEn: "Minister",
  titleTa: "அமைச்சர்",
  constituencyEn: "Tirupparankundram",
  constituencyTa: "திருப்பரங்குன்றம்",
  partyEn: "Tamilaga Vettri Kazhagam (TVK)",
  partyTa: "தமிழக வெற்றி கழகம் (TVK)",
  partyShort: "TVK",
  phone: "+91 (Contact Office)",
  whatsapp: "919876543210",
  email: "office@nirmalconnect.in",
  addressEn: "Minister's Office, Tirupparankundram, Madurai – 625005, Tamil Nadu",
  addressTa: "அமைச்சர் அலுவலகம், திருப்பரங்குன்றம், மதுரை – 625005, தமிழ்நாடு",
  officeHoursEn: "Monday – Saturday: 9:00 AM – 6:00 PM",
  officeHoursTa: "திங்கள் – சனி: காலை 9:00 – மாலை 6:00",
  photoUrl: "",
  siteTitle: "Nirmal Connect",
  logoInitial: "N",
  districtEn: "Madurai",
  districtTa: "மதுரை",
};

const LeaderConfigContext = createContext<LeaderConfig>(DEFAULT_LEADER_CONFIG);

export function LeaderConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<LeaderConfig>(DEFAULT_LEADER_CONFIG);

  useEffect(() => {
    fetch("/api/leader-config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && typeof data === "object") {
          setConfig({ ...DEFAULT_LEADER_CONFIG, ...data });
        }
      })
      .catch(() => {});
  }, []);

  return (
    <LeaderConfigContext.Provider value={config}>
      {children}
    </LeaderConfigContext.Provider>
  );
}

export function useLeaderConfig() {
  return useContext(LeaderConfigContext);
}

export function lc(lang: Language, enVal: string, taVal: string): string {
  return lang === "ta" ? taVal : enVal;
}
