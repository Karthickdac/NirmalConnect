import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, MapPin, Clock } from "lucide-react";
import { useGetEvent, getGetEventQueryKey } from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";
import { format } from "date-fns";

interface EventDetailProps { lang: Language; id: string; }

export default function EventDetail({ lang, id }: EventDetailProps) {
  const numId = Number(id);
  const { data, isLoading, error } = useGetEvent(numId, {
    query: { enabled: !!numId, queryKey: getGetEventQueryKey(numId) }
  });

  if (isLoading) return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Skeleton className="h-8 w-48 mb-4" /><Skeleton className="h-64 rounded-xl mb-6" />
    </div>
  );

  if (error || !data) return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-center">
      <p className="text-muted-foreground mb-4">Event not found.</p>
      <Link href="/events"><Button variant="outline">Back to Events</Button></Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link href="/events">
        <Button variant="ghost" size="sm" className="mb-6" data-testid="back-to-events">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Events
        </Button>
      </Link>
      <Badge variant="secondary" className="mb-3 capitalize">{data.category}</Badge>
      <h1 className="text-2xl md:text-3xl font-bold mb-4">
        {lang === "ta" && data.titleTa ? data.titleTa : data.title}
      </h1>
      {data.imageUrl && (
        <img src={data.imageUrl} alt={data.title} className="w-full rounded-xl mb-6 object-cover max-h-80" />
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <Calendar className="w-5 h-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Date & Time</p>
            <p className="font-medium text-sm">{format(new Date(data.eventDate), "dd MMM yyyy, h:mm a")}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
          <MapPin className="w-5 h-5 text-primary" />
          <div>
            <p className="text-xs text-muted-foreground">Venue</p>
            <p className="font-medium text-sm">{data.venue}</p>
          </div>
        </div>
      </div>
      {(data.description || data.descriptionTa) && (
        <div className="prose prose-sm max-w-none dark:prose-invert">
          {lang === "ta" && data.descriptionTa ? data.descriptionTa : data.description}
        </div>
      )}
    </div>
  );
}
