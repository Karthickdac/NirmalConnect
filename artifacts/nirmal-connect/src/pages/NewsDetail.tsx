import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Calendar, Share2 } from "lucide-react";
import { useGetNewsArticle, getGetNewsArticleQueryKey } from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";
import { format } from "date-fns";

interface NewsDetailProps { lang: Language; id: string; }

export default function NewsDetail({ lang, id }: NewsDetailProps) {
  const numId = Number(id);
  const { data, isLoading, error } = useGetNewsArticle(numId, {
    query: { enabled: !!numId, queryKey: getGetNewsArticleQueryKey(numId) }
  });

  if (isLoading) return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Skeleton className="h-8 w-48 mb-4" />
      <Skeleton className="h-64 rounded-xl mb-6" />
      <Skeleton className="h-4 w-full mb-2" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );

  if (error || !data) return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-center">
      <p className="text-muted-foreground mb-4">News article not found.</p>
      <Link href="/news"><Button variant="outline">Back to News</Button></Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link href="/news">
        <Button variant="ghost" size="sm" className="mb-6" data-testid="back-to-news">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to News
        </Button>
      </Link>
      <Badge variant="secondary" className="mb-3 capitalize">{data.category}</Badge>
      <h1 className="text-2xl md:text-3xl font-bold mb-3">
        {lang === "ta" && data.titleTa ? data.titleTa : data.title}
      </h1>
      <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
        <span className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {data.publishedAt ? format(new Date(data.publishedAt), "dd MMM yyyy") : format(new Date(data.createdAt), "dd MMM yyyy")}
        </span>
      </div>
      {data.imageUrl && (
        <img src={data.imageUrl} alt={data.title} className="w-full rounded-xl mb-8 object-cover max-h-96" />
      )}
      <div className="prose prose-sm max-w-none dark:prose-invert text-foreground leading-relaxed">
        {lang === "ta" && data.contentTa ? data.contentTa : data.content}
      </div>
    </div>
  );
}
