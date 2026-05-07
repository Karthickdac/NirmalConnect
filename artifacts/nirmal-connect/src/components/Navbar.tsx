import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, Sun, Moon, Globe, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

  return (
    <header
      data-testid="navbar"
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 dark:bg-gray-950/95 backdrop-blur-md shadow-md"
          : "bg-white dark:bg-gray-950"
      }`}
    >
      {/* Top bar */}
      <div className="bg-primary text-primary-foreground">
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
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" data-testid="logo-link">
            <div className="flex items-center gap-3 cursor-pointer">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold text-lg">
                N
              </div>
              <div>
                <p className="font-bold text-sm leading-tight text-foreground">
                  {lang === "ta" ? "சி.டி.ஆர். நிர்மல் குமார்" : "C.T.R. Nirmal Kumar"}
                </p>
                <p className="text-xs text-muted-foreground leading-tight">
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
          <div className="flex items-center gap-2">
            {/* Lang toggle */}
            <button
              data-testid="lang-toggle"
              onClick={() => setLang(lang === "en" ? "ta" : "en")}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border border-border hover:bg-muted transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{lang === "en" ? "தமிழ்" : "English"}</span>
            </button>

            {/* Theme toggle */}
            <button
              data-testid="theme-toggle"
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-md hover:bg-muted transition-colors"
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
              className="xl:hidden p-2 rounded-md hover:bg-muted transition-colors"
            >
              {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="xl:hidden border-t border-border bg-background shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-4 grid grid-cols-2 gap-1">
            {navLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                <span
                  className={`block px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    location === link.href
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted"
                  }`}
                >
                  {t(lang, link.key)}
                </span>
              </Link>
            ))}
            <Link href="/volunteer">
              <span className="block px-3 py-2 rounded-md text-sm font-medium text-foreground/70 hover:text-foreground hover:bg-muted cursor-pointer">
                {t(lang, "volunteer")}
              </span>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
