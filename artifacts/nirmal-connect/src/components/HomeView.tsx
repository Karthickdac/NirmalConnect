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
import cmVijayPhoto from "@assets/image_1780074852655.png";
import { type LeaderConfig, DEFAULT_LEADER_CONFIG } from "@/lib/LeaderConfigContext";

export function createDefaultHomeHero(lc: LeaderConfig): HomeHeroConfig {
  return {
    badge: `${lc.partyShort} – ${lc.partyEn}`,
    badgeTa: lc.partyTa,
    headline: lc.nameEn,
    headlineTa: lc.nameTa,
    subheadline: `${lc.titleEn} – ${lc.constituencyEn} Constituency, Tamil Nadu`,
    subheadlineTa: `${lc.titleTa} – ${lc.constituencyTa} தொகுதி`,
    description: `A leader dedicated to the people of ${lc.constituencyEn} — committed to development, transparency, and citizen welfare.`,
    descriptionTa: `மக்களுக்காக பாடுபடும் தலைவரின் வழியில் உறுதிபூண்ட மக்களின் குரல்`,
    primaryCtaLabel: "Submit Feedback",
    primaryCtaLabelTa: "கருத்து தெரிவிக்க",
    primaryCtaHref: "/grievance",
    secondaryCtaLabel: "Join the Movement",
    secondaryCtaLabelTa: "இயக்கத்தில் இணையுங்கள்",
    secondaryCtaHref: "/volunteer",
    photoUrl: lc.photoUrl || "",
    statsHeadline: "Constituency Development at a Glance",
    statsHeadlineTa: "தொகுதி வளர்ச்சி புள்ளிவிவரம்",
    statsSubheadline: `Key development milestones in ${lc.constituencyEn}`,
    statsSubheadlineTa: `${lc.constituencyTa}தில் நடந்த வளர்ச்சி பணிகள்`,
    grievanceCtaTitle: "Your Voice Matters",
    grievanceCtaTitleTa: "உங்கள் கருத்து முக்கியம்",
    grievanceCtaBody: "Share feedback, suggestions or report issues directly to the office. Submit and track your response in real time.",
    grievanceCtaBodyTa: "உங்கள் கருத்து, ஆலோசனை அல்லது பிரச்சினைகளை நேரடியாக தெரிவியுங்கள். அனுப்பி நிலையை கண்காணியுங்கள்.",
    volunteerCtaTitle: "Join the Movement",
    volunteerCtaTitleTa: "இயக்கத்தில் இணையுங்கள்",
    volunteerCtaBody: `Be part of positive change in ${lc.constituencyEn}. Register as a volunteer and contribute to our community.`,
    volunteerCtaBodyTa: `${lc.constituencyTa}யின் வளர்ச்சிக்கு பங்காற்றுங்கள். தன்னார்வலராக பதிவு செய்யுங்கள்.`,
  };
}

export const DEFAULT_HOME_HERO: HomeHeroConfig = createDefaultHomeHero(DEFAULT_LEADER_CONFIG);

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
      {/* ── HERO — Three-column portrait layout ── */}
      <section className={`relative ${heroMinH} flex items-stretch overflow-hidden tvk-hero-gradient`}>
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-96 rounded-full bg-yellow-400/10 blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full bg-red-900/40 blur-3xl" />
        </div>

        <div className={`relative ${embedded ? "w-full" : "max-w-7xl mx-auto"} w-full px-4 py-6 flex flex-col lg:grid lg:grid-cols-[1fr_1.3fr_1fr] gap-4 lg:gap-6 items-end`}>

          {/* ── LEFT: CM Vijay tall portrait (desktop only) ── */}
          <div className="hidden lg:flex flex-col justify-end h-full pb-0">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-yellow-400/30 h-[72vh] max-h-[560px]">
              <img
                src={cmVijayPhoto}
                alt="Chief Minister C. Joseph Vijay"
                className="w-full h-full object-cover object-top"
              />
              {/* Bottom name overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-16 pb-5 px-4 text-center">
                <span className="inline-block bg-yellow-400 text-yellow-900 text-[10px] font-bold px-3 py-0.5 rounded-full mb-2 tracking-wide uppercase">
                  {tx("Chief Minister · Tamil Nadu", "முதலமைச்சர் · தமிழ்நாடு")}
                </span>
                <p className="text-white font-bold text-base leading-tight">{tx("C. Joseph Vijay", "C. ஜோசப் விஜய்")}</p>
                <p className="text-white/70 text-xs mt-0.5">{tx("President, TVK", "தமிழக வெற்றி கழகம் தலைவர்")}</p>
              </div>
            </div>
          </div>

          {/* ── CENTER: text content ── */}
          <div className="text-white text-center flex flex-col justify-center py-8 lg:py-12">

            {/* Mobile portraits — side by side */}
            <div className="lg:hidden flex justify-center gap-4 mb-6">
              <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border-[3px] border-yellow-400 shadow-xl">
                  <img src={cmVijayPhoto} alt="CM Vijay" className="w-full h-full object-cover object-top" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5 text-center">
                    <span className="text-yellow-300 text-[8px] font-bold">{tx("CM", "முதலமைச்சர்")}</span>
                  </div>
                </div>
                <p className="text-white/90 text-[10px] font-medium">{tx("C. Joseph Vijay", "C. ஜோசப் விஜய்")}</p>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden border-[3px] border-white/40 shadow-xl">
                  <img src={photoSrc} alt="MLA Nirmal Kumar" className="w-full h-full object-cover" />
                  <div className="absolute bottom-0 inset-x-0 bg-black/60 py-0.5 text-center">
                    <span className="text-white/90 text-[8px] font-bold">MLA</span>
                  </div>
                </div>
                <p className="text-white/90 text-[10px] font-medium">{tx("C.T.R. Nirmal", "C.T.R. நிர்மல்")}</p>
              </div>
            </div>

            {/* TVK badge */}
            <div className="mb-4">
              <Badge className="bg-yellow-400/20 text-yellow-300 border-yellow-400/40 text-xs font-semibold px-4 py-1 tracking-wide">
                {tx(config.badge, config.badgeTa)}
              </Badge>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold leading-tight mb-3">
              {tx(config.headline, config.headlineTa)}
            </h1>
            <p className="text-yellow-300 font-semibold text-sm sm:text-base md:text-lg mb-3 leading-snug">
              {tx(config.subheadline, config.subheadlineTa)}
            </p>
            <p className="text-white/75 text-sm md:text-base max-w-md mx-auto mb-7 leading-relaxed">
              {tx(config.description, config.descriptionTa)}
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
              <Link href={config.primaryCtaHref || "/grievance"}>
                <Button data-testid="hero-grievance-btn" className="w-full sm:w-auto bg-yellow-400 hover:bg-yellow-300 text-yellow-900 h-12 px-7 text-sm font-bold shadow-lg">
                  {tx(config.primaryCtaLabel, config.primaryCtaLabelTa)}
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Button>
              </Link>
              <Link href={config.secondaryCtaHref || "/volunteer"}>
                <Button data-testid="hero-volunteer-btn" variant="outline" className="w-full sm:w-auto border-white/40 text-white hover:bg-white/10 h-12 px-7 text-sm">
                  {tx(config.secondaryCtaLabel, config.secondaryCtaLabelTa)}
                </Button>
              </Link>
            </div>

            {/* Stats strip */}
            <div className="grid grid-cols-3 gap-2 max-w-xs mx-auto w-full">
              <div className="glass-card rounded-xl py-3 px-2 text-center">
                <div className="text-lg font-bold text-yellow-400">{summary?.totalVolunteers?.toLocaleString() ?? "—"}+</div>
                <div className="text-[10px] text-white/70 mt-0.5 leading-tight">{tx("Volunteers", "தன்னார்வலர்கள்")}</div>
              </div>
              <div className="glass-card rounded-xl py-3 px-2 text-center">
                <div className="text-lg font-bold text-yellow-400">{summary?.totalEvents ?? "—"}</div>
                <div className="text-[10px] text-white/70 mt-0.5 leading-tight">{tx("Events", "நிகழ்வுகள்")}</div>
              </div>
              <div className="glass-card rounded-xl py-3 px-2 text-center">
                <div className="text-lg font-bold text-yellow-400">{summary?.totalNews ?? "—"}</div>
                <div className="text-[10px] text-white/70 mt-0.5 leading-tight">{tx("News", "செய்திகள்")}</div>
              </div>
            </div>
          </div>

          {/* ── RIGHT: MLA Nirmal Kumar tall portrait (desktop only) ── */}
          <div className="hidden lg:flex flex-col justify-end h-full pb-0">
            <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-white/20 h-[72vh] max-h-[560px]">
              <img
                src={photoSrc}
                alt={tx(config.headline, config.headlineTa)}
                className="w-full h-full object-cover object-top"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent pt-12 pb-5 px-4 text-center">
                <span className="inline-block bg-primary/90 text-white text-[10px] font-bold px-3 py-0.5 rounded-full mb-2 tracking-wide uppercase border border-white/20">
                  {tx("MLA · Tirupparankundram", "சட்டமன்ற உறுப்பினர் · திருப்பரங்குன்றம்")}
                </span>
                <p className="text-white font-bold text-base leading-tight">{tx(config.headline, config.headlineTa)}</p>
                <p className="text-white/70 text-xs mt-0.5">{tx(config.subheadline, config.subheadlineTa)}</p>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ── CONSTITUENCY STATS BAR ── */}
      {stats && (
        <div className="bg-gray-900 text-white border-b border-gray-800">
          <div className={`${embedded ? "w-full" : "max-w-7xl mx-auto"} px-4 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-px bg-white/10`}>
            {[
              { label: tx("Roads (km)", "சாலை (கி.மீ)"), value: stats.roadsBuiltKm },
              { label: tx("Water Projects", "நீர் திட்டங்கள்"), value: stats.waterProjectsCompleted },
              { label: tx("Schools Upgraded", "மேம்படுத்திய பள்ளிகள்"), value: stats.schoolsUpgraded },
              { label: tx("Jobs Created", "உருவாக்கிய வேலைகள்"), value: stats.jobsCreated },
              { label: tx("Beneficiaries", "பயனாளிகள்"), value: stats.beneficiariesServed },
            ].map((s) => (
              <div key={s.label} className="bg-gray-900 px-4 py-3 text-center">
                <div className="text-yellow-400 font-bold text-xl">{s.value.toLocaleString()}+</div>
                <div className="text-gray-400 text-[11px] mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

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

      {/* Latest News — featured layout */}
      <section className={`py-12 md:py-16 ${embedded ? "w-full" : "max-w-7xl mx-auto"} px-4`}>
        <div className="flex items-center justify-between mb-8">
          <SectionHeader title={tx("Latest News & Announcements", "சமீபத்திய செய்திகள்")} centered={false} />
          <Link href="/news">
            <Button variant="outline" size="sm" data-testid="view-all-news">
              {t(lang, "viewAll")} <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
        {!featuredNews ? (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <Skeleton className="h-80 rounded-xl lg:col-span-3" />
            <div className="lg:col-span-2 flex flex-col gap-4">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          </div>
        ) : featuredNews.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">{t(lang, "noData")}</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Featured large card */}
            <Link href={`/news/${featuredNews[0].id}`} className="lg:col-span-3">
              <Card data-testid={`news-card-${featuredNews[0].id}`} className="group cursor-pointer hover:shadow-xl transition-all overflow-hidden h-full">
                {(featuredNews[0].thumbnailUrl ?? featuredNews[0].imageUrl) ? (
                  <div className="h-52 md:h-64 overflow-hidden">
                    <img
                      src={featuredNews[0].thumbnailUrl || featuredNews[0].imageUrl || undefined}
                      alt={featuredNews[0].title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                ) : (
                  <div className="h-52 md:h-64 bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                    <Megaphone className="w-12 h-12 text-primary/30" />
                  </div>
                )}
                <CardContent className="p-5">
                  {featuredNews[0].category && (
                    <Badge className="text-xs mb-3 bg-primary text-white">{featuredNews[0].category}</Badge>
                  )}
                  <h3 className="font-bold text-lg leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-2">
                    {tx(featuredNews[0].title, featuredNews[0].titleTa || featuredNews[0].title)}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {featuredNews[0].publishedAt ? format(new Date(featuredNews[0].publishedAt), "dd MMM yyyy") : ""}
                  </p>
                </CardContent>
              </Card>
            </Link>

            {/* Side stack — 3 smaller cards */}
            <div className="lg:col-span-2 flex flex-col gap-3">
              {featuredNews.slice(1, 4).map((article) => (
                <Link key={article.id} href={`/news/${article.id}`}>
                  <Card data-testid={`news-card-${article.id}`} className="group cursor-pointer hover:shadow-md transition-all overflow-hidden flex-1">
                    <CardContent className="p-0 flex gap-0">
                      {(article.thumbnailUrl ?? article.imageUrl) && (
                        <div className="w-24 h-24 flex-shrink-0 overflow-hidden">
                          <img
                            src={article.thumbnailUrl || article.imageUrl || undefined}
                            alt={article.title}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        </div>
                      )}
                      <div className="p-3 flex flex-col justify-between min-w-0">
                        {article.category && <Badge variant="secondary" className="text-[10px] mb-1 w-fit">{article.category}</Badge>}
                        <h3 className="font-semibold text-sm leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                          {tx(article.title, article.titleTa || article.title)}
                        </h3>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {article.publishedAt ? format(new Date(article.publishedAt), "dd MMM yyyy") : ""}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
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
