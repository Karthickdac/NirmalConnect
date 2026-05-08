import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Sun, Moon, Globe, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface NavbarProps {
  lang: Language;
  setLang: (lang: Language) => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
}

const navLinks = [
  { href: "/", key: "home" as const },
  { href: "/about", key: "about" as const },
  { href: "/development", key: "development" as const },
  { href: "/news", key: "news" as const },
  { href: "/events", key: "events" as const },
  { href: "/gallery", key: "gallery" as const },
  { href: "/map", key: "map" as const },
  { href: "/grievance", key: "grievance" as const },
  { href: "/volunteer", key: "volunteer" as const },
  { href: "/contact", key: "contact" as const },
];

export function Navbar({ lang, setLang, darkMode, setDarkMode }: NavbarProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location]);

  // Lock body scroll while the mobile drawer is open so the page behind
  // doesn't ghost-scroll under it.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
    <header
      data-testid="navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 dark:bg-gray-950/95 backdrop-blur-md shadow-md"
          : "bg-white dark:bg-gray-950"
      }`}
    >
      {/* Top bar — hidden on mobile to keep the fixed header compact;
          the same identity is reinforced inside the mobile drawer. */}
      <div className="hidden md:block bg-primary text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 py-1 flex items-center justify-between text-xs">
          <span className="font-medium">
            {lang === "ta" ? "தமிழக வெற்றி கழகம் (TVK)" : "Tamilaga Vettri Kazhagam (TVK)"}
          </span>
          <span>
            {lang === "ta"
              ? "திருப்பரங்குன்றம் தொகுதி சட்டமன்ற உறுப்பினர்"
              : "MLA – Tirupparankundram Constituency, Tamil Nadu"}
          </span>
        </div>
      </div>

      {/* Main nav */}
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14 md:h-16">
          {/* Logo */}
          <Link href="/" data-testid="logo-link">
            <div className="flex items-center gap-2.5 md:gap-3 cursor-pointer">
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-base md:text-lg shadow-sm">
                N
              </div>
              <div className="leading-tight">
                <p className="font-bold text-[13px] md:text-sm text-foreground">
                  {lang === "ta" ? "சி.டி.ஆர். நிர்மல் குமார்" : "C.T.R. Nirmal Kumar"}
                </p>
                <p className="text-[10px] md:text-xs text-muted-foreground">
                  {lang === "ta" ? "சட்டமன்ற உறுப்பினர்" : "MLA, Tirupparankundram"}
                </p>
              </div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden xl:flex items-center gap-1">
            {navLinks.slice(0, 7).map((link) => (
              <Link key={link.href} href={link.href}>
                <span
                  data-testid={`nav-${link.key}`}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    location === link.href
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {t(lang, link.key)}
                </span>
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-1 md:gap-2">
            {/* Lang toggle — compact on mobile */}
            <button
              data-testid="lang-toggle"
              onClick={() => setLang(lang === "en" ? "ta" : "en")}
              className="flex items-center gap-1.5 px-2.5 md:px-3 py-1.5 rounded-md text-xs md:text-sm font-medium border border-border hover:bg-muted transition-colors min-h-[36px]"
              aria-label="Toggle language"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === "en" ? "தமிழ்" : "EN"}</span>
            </button>

            {/* Theme toggle */}
            <button
              data-testid="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-md hover:bg-muted transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label="Toggle theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Grievance CTA */}
            <Link href="/grievance">
              <Button
                data-testid="nav-grievance-cta"
                size="sm"
                className="hidden md:flex bg-primary hover:bg-primary/90 text-white"
              >
                {t(lang, "submitGrievance")}
              </Button>
            </Link>

            {/* Mobile menu */}
            <button
              data-testid="mobile-menu-toggle"
              onClick={() => setOpen(!open)}
              className="xl:hidden p-2 rounded-md hover:bg-muted transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
              aria-label={open ? "Close menu" : "Open menu"}
              aria-expanded={open}
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </header>

    {/* Mobile drawer — full-screen overlay with a left-side panel.
        Lives outside <header> so it can be a true fixed overlay above
        all page content while the header remains fixed at top. */}
    <div
      data-testid="mobile-drawer"
      className={`xl:hidden fixed inset-0 z-[60] transition-opacity duration-200 ${
        open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      }`}
      aria-hidden={!open}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      {/* Sliding panel */}
      <aside
        className={`absolute top-0 right-0 h-full w-[86%] max-w-sm bg-background shadow-2xl flex flex-col transform transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
      >
        {/* Drawer header */}
        <div className="bg-primary text-primary-foreground px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white text-primary flex items-center justify-center font-bold">
              N
            </div>
            <div className="leading-tight">
              <p className="font-bold text-sm">
                {lang === "ta" ? "சி.டி.ஆர். நிர்மல் குமார்" : "C.T.R. Nirmal Kumar"}
              </p>
              <p className="text-[11px] opacity-90">
                {lang === "ta" ? "தமிழக வெற்றி கழகம்" : "Tamilaga Vettri Kazhagam"}
              </p>
            </div>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="p-2 rounded-md hover:bg-white/15 transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Links */}
        <nav className="flex-1 overflow-y-auto px-2 py-3">
          <ul className="space-y-0.5">
            {navLinks.map((link) => {
              const active = location === link.href;
              return (
                <li key={link.href}>
                  <Link href={link.href}>
                    <span
                      data-testid={`drawer-nav-${link.key}`}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg text-[15px] font-medium transition-colors cursor-pointer min-h-[48px] ${
                        active
                          ? "bg-primary/10 text-primary"
                          : "text-foreground/85 hover:bg-muted active:bg-muted"
                      }`}
                    >
                      <span>{t(lang, link.key)}</span>
                      {active && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Drawer footer CTA */}
        <div
          className="px-4 pt-3 pb-4 border-t border-border bg-muted/30"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <Link href="/grievance">
            <Button
              data-testid="drawer-grievance-cta"
              className="w-full bg-primary hover:bg-primary/90 text-white h-12 text-base font-semibold"
            >
              <Megaphone className="w-4 h-4 mr-2" />
              {t(lang, "submitGrievance")}
            </Button>
          </Link>
          <p className="text-[11px] text-muted-foreground text-center mt-2">
            {lang === "ta"
              ? "திருப்பரங்குன்றம் தொகுதி – மதுரை"
              : "Tirupparankundram Constituency – Madurai"}
          </p>
        </div>
      </aside>
    </div>
    </>
  );
}
