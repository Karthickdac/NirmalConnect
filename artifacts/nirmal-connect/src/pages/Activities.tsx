import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/SectionHeader";
import { Calendar, MapPin } from "lucide-react";
import { useListActivities } from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { format } from "date-fns";

interface ActivitiesProps { lang: Language; }

export default function Activities({ lang }: ActivitiesProps) {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useListActivities({ page, limit: 10 });

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "தினசரி நடவடிக்கைகள்" : "Daily Activities"}
        subtitle={lang === "ta" ? "MLA நிர்மல் குமார் அவர்களின் தினசரி பொது நடவடிக்கைகள்" : "A log of MLA Nirmal Kumar's daily public activities and engagements"}
      />

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="text-center py-12 text-muted-foreground">{t(lang, "noData")}</p>
      ) : (
        <>
          <div className="space-y-4">
            {data.items.map((activity, idx) => (
              <Card key={activity.id} data-testid={`activity-card-${activity.id}`} className="hover:shadow-md transition-all">
                <CardContent className="p-5 flex gap-4">
                  {(activity.thumbnailUrl || activity.imageUrl) && (
                    <img
                      src={activity.thumbnailUrl || activity.imageUrl || undefined}
                      alt={activity.title}
                      loading="lazy"
                      className="flex-shrink-0 w-16 h-16 rounded-lg object-cover"
                    />
                  )}
                  {/* Date pill */}
                  <div className="flex-shrink-0 text-center bg-primary/10 rounded-xl px-3 py-2 min-w-[56px]">
                    <div className="text-xs text-primary font-bold uppercase">
                      {format(new Date(activity.activityDate), "MMM")}
                    </div>
                    <div className="text-xl font-bold text-primary">
                      {format(new Date(activity.activityDate), "dd")}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="font-semibold leading-snug text-sm">
                        {lang === "ta" && activity.titleTa ? activity.titleTa : activity.title}
                      </h3>
                      <Badge variant="secondary" className="text-xs flex-shrink-0 capitalize">{activity.category}</Badge>
                    </div>
                    {(activity.description || activity.descriptionTa) && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {lang === "ta" && activity.descriptionTa ? activity.descriptionTa : activity.description}
                      </p>
                    )}
                    {activity.location && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        {activity.location}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
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
    </div>
  );
}
