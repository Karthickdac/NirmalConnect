import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { ArrowRight, Calendar, Megaphone, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/SectionHeader";
import type { Language } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { format } from "date-fns";
import leaderPhoto from "@assets/image_1778085777744.png";

export interface HomeHeroConfig {
  badge: string;
  badgeTa: string;
  headline: string;
  headlineTa: string;
  subheadline: string;
  subheadlineTa: string;
  description: string;
  descriptionTa: string;
  primaryCtaLabel: string;
  primaryCtaLabelTa: string;
  primaryCtaHref: string;
  secondaryCtaLabel: string;
  secondaryCtaLabelTa: string;
  secondaryCtaHref: string;
  photoUrl: string;
  statsHeadline: string;
  statsHeadlineTa: string;
  statsSubheadline: string;
  statsSubheadlineTa: string;
  grievanceCtaTitle: string;
  grievanceCtaTitleTa: string;
  grievanceCtaBody: string;
  grievanceCtaBodyTa: string;
  volunteerCtaTitle: string;
  volunteerCtaTitleTa: string;
  volunteerCtaBody: string;
  volunteerCtaBodyTa: string;
}

export const DEFAULT_HOME_HERO: HomeHeroConfig = {
  badge: "TVK – Tamilaga Vettri Kazhagam",
  badgeTa: "தமிழக வெற்றி கழகம்",
  headline: "C.T.R. Nirmal Kumar",
  headlineTa: "சி.டி.ஆர். நிர்மல் குமார்",
  subheadline: "MLA – Tirupparankundram Constituency, Tamil Nadu",
  subheadlineTa: "சட்டமன்ற உறுப்பினர் – திருப்பரங்குன்றம் தொகுதி",
  description:
    "A leader dedicated to the people of Tirupparankundram — committed to development, transparency, and citizen welfare.",
  descriptionTa:
    "மக்களுக்காக பாடுபடும் தலைவர். வளர்ச்சியில் உறுதிபூண்ட திருப்பரங்குன்றத்தின் குரல்.",
  primaryCtaLabel: "Submit Grievance",
  primaryCtaLabelTa: "புகார் அளிக்க",
  primaryCtaHref: "/grievance",
  secondaryCtaLabel: "Join the Movement",
  secondaryCtaLabelTa: "இயக்கத்தில் இணையுங்கள்",
  secondaryCtaHref: "/volunteer",
  photoUrl: "",
  statsHeadline: "Constituency Development at a Glance",
  statsHeadlineTa: "தொகுதி வளர்ச்சி புள்ளிவிவரம்",
  statsSubheadline: "Key development milestones in Tirupparankundram",
  statsSubheadlineTa: "திருப்பரங்குன்றத்தில் நடந்த வளர்ச்சி பணிகள்",
  grievanceCtaTitle: "Your Voice Matters",
  grievanceCtaTitleTa: "உங்கள் குரல் முக்கியம்",
  grievanceCtaBody:
    "Report issues in your area directly to the MLA's office. Submit your grievance and track its resolution in real time.",
  grievanceCtaBodyTa:
    "உங்கள் பகுதியில் உள்ள பிரச்சினைகளை நேரடியாக தெரிவியுங்கள். புகார் அனுப்பி நிலையை கண்காணியுங்கள்.",
  volunteerCtaTitle: "Join the Movement",
  volunteerCtaTitleTa: "இயக்கத்தில் இணையுங்கள்",
  volunteerCtaBody:
    "Be part of positive change in Tirupparankundram. Register as a volunteer and contribute to our community.",
  volunteerCtaBodyTa:
    "திருப்பரங்குன்றத்தின் வளர்ச்சிக்கு பங்காற்றுங்கள். தன்னார்வலராக பதிவு செய்யுங்கள்.",
};

export interface HomeStats {
  roadsBuiltKm: number;
  waterProjectsCompleted: number;
  schoolsUpgraded: number;
  jobsCreated: number;
  beneficiariesServed: number;
}

export interface HomeSummary {
  totalVolunteers?: number | null;
  totalEvents?: number | null;
  totalNews?: number | null;
}

export interface HomeNewsItem {
  id: number;
  title: string;
  titleTa?: string | null;
  category?: string | null;
  publishedAt?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
}

export interface HomeEventItem {
  id: number;
  title: string;
  titleTa?: string | null;
  eventDate: string;
  venue?: string | null;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
}

export interface HomeActivityItem {
  title: string;
  titleTa?: string | null;
  location?: string | null;
  activityDate: string;
}

export interface HomeGalleryItem {
  id: number;
  title: string;
  thumbnailUrl?: string | null;
  mediaUrl: string;
}

export interface HomeViewProps {
  config: HomeHeroConfig;
  lang: Language;
  summary?: HomeSummary | null;
  stats?: HomeStats | null;
  featuredNews?: HomeNewsItem[] | null;
  upcomingEvents?: HomeEventItem[] | null;
  recentActivities?: HomeActivityItem[] | null;
  gallery?: { items: HomeGalleryItem[] } | null;
  /** When true, disables count-up animations and fixed viewport heights so the
   *  view fits inside the admin preview panel. */
  embedded?: boolean;
}

function useCountUp(target: number, duration = 2000, enabled = true) {
  const [count, setCount] = useState(enabled ? 0 : target);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!enabled) { setCount(target); return; }
    if (target === 0) { setCount(0); return; }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          const start = Date.now();
          const tick = () => {
            const elapsed = Date.now() - start;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target, duration, enabled]);

  return { count, ref };
}

function StatCard({ label, value, unit = "", animate }: { label: string; value: number; unit?: string; animate: boolean }) {
  const { count, ref } = useCountUp(value, 2000, animate);
  return (
    <div ref={ref} className="glass-card rounded-xl p-5 text-center text-white" data-testid="stat-card">
      <div className="text-3xl md:text-4xl font-bold text-yellow-400">
        {count.toLocaleString()}{unit}
      </div>
      <div className="text-sm text-white/80 mt-1">{label}</div>
    </div>
  );
}

export function HomeView({
  config,
  lang,
  summary,
  stats,
  featuredNews,
  upcomingEvents,
  recentActivities,
  gallery,
  embedded = false,
}: HomeViewProps) {
  const tx = (en: string, ta: string) => (lang === "ta" ? (ta || en) : en);
  const photoSrc = config.photoUrl || leaderPhoto;
  const heroMinH = embedded ? "min-h-[420px]" : "min-h-[90vh]";
  const animate = !embedded;

  return (
    <div>
      {/* Hero Section */}
      <section className={`relative ${heroMinH} flex items-center overflow-hidden tvk-hero-gradient`}>
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-72 h-72 rounded-full bg-yellow-400 blur-3xl" />
          <div className="absolute bottom-20 right-10 w-96 h-96 rounded-full bg-red-400 blur-3xl" />
        </div>

        <div className={`relative ${embedded ? "w-full" : "max-w-7xl mx-auto"} px-4 py-12 md:py-20 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center`}>
          <div className="text-white">
            <Badge className="mb-4 bg-yellow-400/20 text-yellow-300 border-yellow-400/30 text-xs font-medium px-3 py-1">
              {tx(config.badge, config.badgeTa)}
            </Badge>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight mb-4">
              {tx(config.headline, config.headlineTa)}
            </h1>
            <p className="text-lg md:text-2xl text-yellow-300 font-semibold mb-4 md:mb-6">
              {tx(config.subheadline, config.subheadlineTa)}
            </p>
            <p className="text-white/75 text-sm md:text-lg max-w-lg mb-6 md:mb-8 leading-relaxed">
              {tx(config.description, config.descriptionTa)}
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href={config.primaryCtaHref || "/grievance"}>
                <Button data-testid="hero-grievance-btn" className="bg-primary hover:bg-primary/90 text-white px-6 py-3 text-base">
                  {tx(config.primaryCtaLabel, config.primaryCtaLabelTa)}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link href={config.secondaryCtaHref || "/volunteer"}>
                <Button data-testid="hero-volunteer-btn" variant="outline" className="border-white/30 text-white hover:bg-white/10 px-6 py-3 text-base">
                  {tx(config.secondaryCtaLabel, config.secondaryCtaLabelTa)}
                </Button>
              </Link>
            </div>
          </div>

          <div className={`${embedded ? "flex" : "hidden lg:flex"} justify-center`}>
            <div className="glass-card rounded-2xl p-6 md:p-8 max-w-sm w-full text-center text-white">
              <div className="w-24 h-24 md:w-28 md:h-28 rounded-full overflow-hidden border-4 border-yellow-400 mx-auto mb-4 shadow-2xl">
                <img src={photoSrc} alt={tx(config.headline, config.headlineTa)} className="w-full h-full object-cover" />
              </div>
              <div className="text-4xl md:text-5xl font-bold text-yellow-400 mb-2">
                {summary?.totalVolunteers?.toLocaleString() ?? "—"}+
              </div>
              <p className="text-white/80 text-sm">
                {tx("Volunteers & Supporters", "தன்னார்வலர்கள்")}
              </p>
              <div className="mt-4 md:mt-6 grid grid-cols-2 gap-3">
                <div className="bg-white/10 rounded-lg p-3">
                  <div className="font-bold text-lg">{summary?.totalEvents ?? "—"}</div>
                  <div className="text-xs text-white/70">{tx("Events", "நிகழ்வுகள்")}</div>
                </div>
                <div className="bg-white/10 rounded-lg p-3">
                  <div className="font-bold text-lg">{summary?.totalNews ?? "—"}</div>
                  <div className="text-xs text-white/70">{tx("News Items", "செய்திகள்")}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Activity Ticker */}
      {recentActivities && recentActivities.length > 0 && (
        <div className="bg-primary text-white py-2 overflow-hidden border-b border-primary/50">
          <div className="flex items-center">
            <div className="flex-shrink-0 px-4 py-0.5 bg-yellow-400 text-yellow-900 font-bold text-xs uppercase tracking-wide">
              {tx("LIVE", "நேரலை")}
            </div>
            <div className="overflow-hidden flex-1">
              <div className={`flex gap-12 whitespace-nowrap ${animate ? "animate-ticker" : ""}`}>
                {[...recentActivities, ...recentActivities].map((a, i) => (
                  <span key={i} className="text-sm">
                    <span className="text-yellow-300 mr-2">★</span>
                    {tx(a.title, a.titleTa || a.title)}
                    {a.location && ` – ${a.location}`}{" "}
                    <span className="text-white/60 text-xs">{format(new Date(a.activityDate), "dd MMM")}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Constituency Stats */}
      {stats && (
        <section className="py-12 md:py-16 tvk-hero-gradient text-white">
          <div className={`${embedded ? "w-full" : "max-w-7xl mx-auto"} px-4`}>
            <div className="text-center mb-8 md:mb-10">
              <h2 className="text-xl md:text-3xl font-bold text-white">
                {tx(config.statsHeadline, config.statsHeadlineTa)}
              </h2>
              <p className="text-white/70 mt-2 text-sm md:text-base">
                {tx(config.statsSubheadline, config.statsSubheadlineTa)}
              </p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
              <StatCard animate={animate} label={tx("Roads Built (km)", "சாலை கட்டப்பட்டது (கி.மீ)")} value={stats.roadsBuiltKm} />
              <StatCard animate={animate} label={tx("Water Projects", "நீர் திட்டங்கள்")} value={stats.waterProjectsCompleted} />
              <StatCard animate={animate} label={tx("Schools Upgraded", "மேம்படுத்திய பள்ளிகள்")} value={stats.schoolsUpgraded} />
              <StatCard animate={animate} label={tx("Jobs Created", "உருவாக்கிய வேலைகள்")} value={stats.jobsCreated} unit="+" />
              <StatCard animate={animate} label={tx("Beneficiaries Served", "பயனாளிகள்")} value={stats.beneficiariesServed} unit="+" />
            </div>
          </div>
        </section>
      )}

      {/* Latest News */}
      <section className={`py-12 md:py-16 ${embedded ? "w-full" : "max-w-7xl mx-auto"} px-4`}>
        <div className="flex items-center justify-between mb-8 md:mb-10">
          <SectionHeader title={tx("Latest News & Announcements", "சமீபத்திய செய்திகள்")} centered={false} />
          <Link href="/news">
            <Button variant="outline" size="sm" data-testid="view-all-news">
              {t(lang, "viewAll")} <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
        {!featuredNews ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
          </div>
        ) : featuredNews.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t(lang, "noData")}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {featuredNews.map((article) => (
              <Link key={article.id} href={`/news/${article.id}`}>
                <Card data-testid={`news-card-${article.id}`} className="group cursor-pointer hover:shadow-lg transition-all hover:-translate-y-1 overflow-hidden">
                  {(article.thumbnailUrl ?? article.imageUrl) && (
                    <div className="h-40 overflow-hidden">
                      <img src={article.thumbnailUrl || article.imageUrl || undefined} alt={article.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <CardContent className="p-4">
                    {article.category && <Badge variant="secondary" className="text-xs mb-2">{article.category}</Badge>}
                    <h3 className="font-semibold text-sm leading-snug mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                      {tx(article.title, article.titleTa || article.title)}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {article.publishedAt ? format(new Date(article.publishedAt), "dd MMM yyyy") : ""}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Upcoming Events */}
      {upcomingEvents && upcomingEvents.length > 0 && (
        <section className="py-12 md:py-16 bg-muted/30">
          <div className={`${embedded ? "w-full" : "max-w-7xl mx-auto"} px-4`}>
            <div className="flex items-center justify-between mb-8 md:mb-10">
              <SectionHeader title={tx("Upcoming Events", "வரவிருக்கும் நிகழ்வுகள்")} centered={false} />
              <Link href="/events">
                <Button variant="outline" size="sm" data-testid="view-all-events">
                  {t(lang, "viewAll")} <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {upcomingEvents.map((event) => (
                <Link key={event.id} href={`/events/${event.id}`}>
                  <Card data-testid={`event-card-${event.id}`} className="group cursor-pointer hover:shadow-md transition-all overflow-hidden">
                    {(event.thumbnailUrl ?? event.imageUrl) && (
                      <div className="h-36 overflow-hidden">
                        <img src={event.thumbnailUrl || event.imageUrl || undefined} alt={event.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      </div>
                    )}
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="text-xs font-medium text-primary">
                          {format(new Date(event.eventDate), "dd MMM yyyy, h:mm a")}
                        </span>
                      </div>
                      <h3 className="font-semibold text-sm leading-snug mb-1 group-hover:text-primary transition-colors">
                        {tx(event.title, event.titleTa || event.title)}
                      </h3>
                      {event.venue && <p className="text-xs text-muted-foreground">{event.venue}</p>}
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Gallery Strip */}
      {gallery?.items && gallery.items.length > 0 && (
        <section className={`py-12 md:py-16 ${embedded ? "w-full" : "max-w-7xl mx-auto"} px-4`}>
          <div className="flex items-center justify-between mb-8 md:mb-10">
            <SectionHeader title={tx("Photo Gallery", "படத் தொகுப்பு")} centered={false} />
            <Link href="/gallery">
              <Button variant="outline" size="sm" data-testid="view-all-gallery">
                {t(lang, "viewAll")} <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {gallery.items.slice(0, 8).map((item) => (
              <div key={item.id} data-testid={`gallery-item-${item.id}`} className="aspect-square rounded-lg overflow-hidden group cursor-pointer">
                <img src={item.thumbnailUrl || item.mediaUrl} alt={item.title} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Grievance CTA */}
      <section className="py-16 md:py-20 bg-primary text-white">
        <div className={`${embedded ? "w-full" : "max-w-4xl mx-auto"} px-4 text-center`}>
          <Megaphone className="w-10 h-10 md:w-12 md:h-12 text-yellow-300 mx-auto mb-4" />
          <h2 className="text-2xl md:text-4xl font-bold mb-4">
            {tx(config.grievanceCtaTitle, config.grievanceCtaTitleTa)}
          </h2>
          <p className="text-white/80 text-base md:text-lg mb-8 max-w-2xl mx-auto">
            {tx(config.grievanceCtaBody, config.grievanceCtaBodyTa)}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/grievance">
              <Button data-testid="cta-submit-grievance" className="bg-white text-primary hover:bg-yellow-50 font-semibold px-8 py-3">
                {t(lang, "submitGrievance")}
              </Button>
            </Link>
            <Link href="/grievance">
              <Button data-testid="cta-track-grievance" variant="outline" className="border-white/40 text-white hover:bg-white/10 px-8 py-3">
                {t(lang, "trackGrievance")}
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Volunteer CTA */}
      <section className={`py-12 md:py-16 ${embedded ? "w-full" : "max-w-7xl mx-auto"} px-4`}>
        <div className="rounded-2xl overflow-hidden bg-gradient-to-r from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 p-6 md:p-12 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-xl md:text-3xl font-bold mb-2">
              {tx(config.volunteerCtaTitle, config.volunteerCtaTitleTa)}
            </h2>
            <p className="text-muted-foreground max-w-md text-sm md:text-base">
              {tx(config.volunteerCtaBody, config.volunteerCtaBodyTa)}
            </p>
          </div>
          <Link href="/volunteer">
            <Button data-testid="cta-volunteer" className="bg-primary text-white hover:bg-primary/90 px-8 py-3 text-base font-semibold flex-shrink-0">
              {t(lang, "registerNow")}
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
