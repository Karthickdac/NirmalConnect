import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/SectionHeader";
import { Calendar, MapPin } from "lucide-react";
import { useListEvents } from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { format } from "date-fns";

interface EventsProps { lang: Language; }

export default function Events({ lang }: EventsProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListEvents({ page, limit: 9 });

  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "நிகழ்வுகள் & பிரசாரங்கள்" : "Events & Campaigns"}
        subtitle={lang === "ta" ? "வரவிருக்கும் மற்றும் கடந்த நிகழ்வுகள்" : "Upcoming and past events organized by MLA Nirmal Kumar"}
      />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="text-center py-16 text-muted-foreground">{t(lang, "noData")}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {data.items.map((event) => (
              <Link key={event.id} href={`/events/${event.id}`}>
                <Card data-testid={`event-card-${event.id}`} className="group cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1 overflow-hidden h-full">
                  {(event.thumbnailUrl ?? event.imageUrl) && (
                    <div className="h-44 overflow-hidden">
                      <img src={event.thumbnailUrl || event.imageUrl || undefined} alt={event.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </div>
                  )}
                  <CardContent className="p-5">
                    <Badge variant="secondary" className="text-xs capitalize mb-2">{event.category}</Badge>
                    <h3 className="font-semibold mb-3 group-hover:text-primary transition-colors line-clamp-2">
                      {lang === "ta" && event.titleTa ? event.titleTa : event.title}
                    </h3>
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-primary" />
                        {format(new Date(event.eventDate), "dd MMM yyyy, h:mm a")}
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        {event.venue}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
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
