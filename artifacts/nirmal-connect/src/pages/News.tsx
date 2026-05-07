import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/SectionHeader";
import { Search, Calendar } from "lucide-react";
import { useListNews } from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { format } from "date-fns";

interface NewsProps { lang: Language; }

const CATEGORIES = ["All", "General", "Development", "Welfare", "Event", "Announcement"];

export default function News({ lang }: NewsProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isLoading } = useListNews({ page, limit: 12 });

  const filtered = data?.items.filter((a) => {
    const title = (lang === "ta" && a.titleTa ? a.titleTa : a.title).toLowerCase();
    return title.includes(search.toLowerCase());
  }) ?? [];

  return (
    <section className="max-w-7xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "செய்திகள் & அறிவிப்புகள்" : "News & Announcements"}
        subtitle={lang === "ta" ? "சமீபத்திய செய்திகள் மற்றும் அறிவிப்புகளை இங்கே காணலாம்" : "Stay informed with the latest news and announcements from MLA Nirmal Kumar's office"}
      />

      <div className="mb-6 max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="news-search"
            placeholder={lang === "ta" ? "செய்தி தேடுக..." : "Search news..."}
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">{t(lang, "noData")}</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((article) => (
              <Link key={article.id} href={`/news/${article.id}`}>
                <Card data-testid={`news-card-${article.id}`} className="group cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1 overflow-hidden h-full">
                  {(article.thumbnailUrl ?? article.imageUrl) && (
                    <div className="h-48 overflow-hidden">
                      <img src={article.thumbnailUrl || article.imageUrl || undefined} alt={article.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <CardContent className="p-5 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-xs capitalize">{article.category}</Badge>
                      {article.featured && <Badge className="bg-primary text-white text-xs">Featured</Badge>}
                    </div>
                    <h3 className="font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2">
                      {lang === "ta" && article.titleTa ? article.titleTa : article.title}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {lang === "ta" && article.contentTa ? article.contentTa : article.content}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-auto pt-2">
                      <Calendar className="w-3 h-3" />
                      {article.publishedAt ? format(new Date(article.publishedAt), "dd MMM yyyy") : format(new Date(article.createdAt), "dd MMM yyyy")}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          {data && data.totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-10">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} data-testid="news-prev">Previous</Button>
              <span className="px-3 py-1.5 text-sm">Page {page} of {data.totalPages}</span>
              <Button variant="outline" size="sm" disabled={page === data.totalPages} onClick={() => setPage(p => p + 1)} data-testid="news-next">Next</Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
