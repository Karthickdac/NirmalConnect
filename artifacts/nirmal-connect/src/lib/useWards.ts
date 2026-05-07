import { useQuery } from "@tanstack/react-query";

export interface WardSummary {
  id: number;
  name: string;
  area: string | null;
}

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

async function fetchWards(): Promise<WardSummary[]> {
  const res = await fetch(`${BASE}/api/wards`);
  if (!res.ok) throw new Error("Failed to load wards");
  return res.json();
}

export function useWards() {
  return useQuery({
    queryKey: ["public-wards"],
    queryFn: fetchWards,
    staleTime: 5 * 60_000,
  });
}
