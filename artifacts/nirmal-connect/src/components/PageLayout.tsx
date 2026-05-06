import { Navbar } from "./Navbar";
import { Footer } from "./Footer";
import { WhatsAppButton } from "./WhatsAppButton";
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
      <main className="flex-1 pt-[72px]">
        {children}
      </main>
      <Footer lang={lang} />
      <WhatsAppButton />
    </div>
  );
}
