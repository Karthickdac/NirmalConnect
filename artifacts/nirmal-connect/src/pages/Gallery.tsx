import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/SectionHeader";
import { Play } from "lucide-react";
import { useListGallery } from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface GalleryProps { lang: Language; }

export default function Gallery({ lang }: GalleryProps) {
  const [mediaType, setMediaType] = useState<"photo" | "video" | undefined>(undefined);
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListGallery({ page, limit: 16, type: mediaType });

  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "ஊடக தொகுப்பு" : "Media Gallery"}
        subtitle={lang === "ta" ? "நிகழ்வுகள் மற்றும் நடவடிக்கைகளின் படங்கள் மற்றும் வீடியோக்கள்" : "Photos and videos from events, activities, and public programs"}
      />

      <div className="flex gap-2 mb-8 justify-center flex-wrap">
        {[
          { label: lang === "ta" ? "அனைத்தும்" : "All", value: undefined },
          { label: lang === "ta" ? "படங்கள்" : "Photos", value: "photo" as const },
          { label: lang === "ta" ? "வீடியோ" : "Videos", value: "video" as const },
        ].map((f) => (
          <Button
            key={String(f.value)}
            data-testid={`gallery-filter-${f.value ?? "all"}`}
            variant={mediaType === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => { setMediaType(f.value); setPage(1); }}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{t(lang, "noData")}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data.items.map((item) => (
              <div key={item.id} data-testid={`gallery-item-${item.id}`} className="relative aspect-square rounded-lg overflow-hidden group cursor-pointer bg-muted">
                <img
                  src={item.thumbnailUrl ?? item.mediaUrl}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                />
                {item.mediaType === "video" && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Play className="w-10 h-10 text-white" fill="white" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="text-white text-xs truncate">{item.title}</p>
                </div>
              </div>
            ))}
          </div>
          {data.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-10">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <span className="px-3 py-1.5 text-sm">Page {page} of {data.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
