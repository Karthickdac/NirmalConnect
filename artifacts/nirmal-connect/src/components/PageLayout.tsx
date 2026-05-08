import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { WhatsAppButton } from "./WhatsAppButton";
import { MobileBottomBar } from "./MobileBottomBar";
import type { Language } from "@/lib/i18n";

interface PageLayoutProps {
  lang: Language;
  setLang: (l: Language) => void;
  darkMode: boolean;
  setDarkMode: (v: boolean) => void;
  children: React.ReactNode;
}

export function PageLayout({ lang, setLang, darkMode, setDarkMode, children }: PageLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar lang={lang} setLang={setLang} darkMode={darkMode} setDarkMode={setDarkMode} />
      {/* pt offsets the fixed navbar (top bar collapses on mobile so header
          is shorter there); pb makes room for the mobile bottom action bar. */}
      <main className="flex-1 pt-14 md:pt-[72px] pb-16 md:pb-0">
        {children}
      </main>
      <Footer lang={lang} />
      <WhatsAppButton />
      <MobileBottomBar lang={lang} />
    </div>
  );
}
