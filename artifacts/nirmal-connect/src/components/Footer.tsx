import { Link } from "wouter";
import { Phone, Mail, MapPin, ExternalLink } from "lucide-react";
import type { Language } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface FooterProps {
  lang: Language;
}

export function Footer({ lang }: FooterProps) {
  return (
    <footer className="bg-gray-950 dark:bg-black text-gray-300 mt-16">
      {/* TVK band */}
      <div className="h-1 bg-gradient-to-r from-primary via-yellow-400 to-primary" />

      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-bold">N</div>
              <div>
                <p className="font-bold text-white text-sm">Nirmal Connect</p>
                <p className="text-xs text-gray-400">{lang === "ta" ? "அதிகாரப்பூர்வ தளம்" : "Official Platform"}</p>
              </div>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">
              {lang === "ta"
                ? "சி.டி.ஆர். நிர்மல் குமார் அவர்களின் அதிகாரப்பூர்வ டிஜிட்டல் தளம்"
                : "The official digital platform of Hon. C.T.R. Nirmal Kumar, MLA – Tirupparankundram."}
            </p>
            <div className="mt-4">
              <span className="text-xs px-2 py-1 rounded bg-primary/20 text-primary font-medium">
                TVK – Tamilaga Vettri Kazhagam
              </span>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">{lang === "ta" ? "விரைவு இணைப்புகள்" : "Quick Links"}</h3>
            <ul className="space-y-2">
              {[
                { href: "/", label: lang === "ta" ? "முகப்பு" : "Home" },
                { href: "/about", label: lang === "ta" ? "பற்றி" : "About Leader" },
                { href: "/development", label: lang === "ta" ? "வளர்ச்சி பணிகள்" : "Development Works" },
                { href: "/news", label: lang === "ta" ? "செய்திகள்" : "News & Updates" },
                { href: "/events", label: lang === "ta" ? "நிகழ்வுகள்" : "Events" },
                { href: "/achievements", label: lang === "ta" ? "சாதனைகள்" : "Achievements" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>
                    <span className="text-sm text-gray-400 hover:text-primary transition-colors cursor-pointer">
                      {link.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Services */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">{lang === "ta" ? "பொது சேவைகள்" : "Public Services"}</h3>
            <ul className="space-y-2">
              {[
                { href: "/grievance", label: lang === "ta" ? "புகார் மையம்" : "Grievance Portal" },
                { href: "/volunteer", label: lang === "ta" ? "தன்னார்வலர்" : "Volunteer" },
                { href: "/welfare", label: lang === "ta" ? "நலத் திட்டங்கள்" : "Welfare Schemes" },
                { href: "/contact", label: lang === "ta" ? "தொடர்பு" : "Contact Office" },
                { href: "/faq", label: "FAQ" },
                { href: "/emergency", label: lang === "ta" ? "அவசர உதவி" : "Emergency Contacts" },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href}>
                    <span className="text-sm text-gray-400 hover:text-primary transition-colors cursor-pointer">
                      {link.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-4 text-sm uppercase tracking-wider">{lang === "ta" ? "தொடர்பு" : "Contact"}</h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-sm text-gray-400">
                  {lang === "ta" ? <>சட்டமன்ற உறுப்பினர் அலுவலகம், திருப்பரங்குன்றம்,<br />மதுரை – 625005, தமிழ்நாடு</> : <>MLA Office, Tirupparankundram,<br />Madurai – 625005, Tamil Nadu</>}
                </span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm text-gray-400">+91 (Contact Office)</span>
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary flex-shrink-0" />
                <span className="text-sm text-gray-400">office@nirmalconnect.in</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} Nirmal Connect. {lang === "ta" ? "சி.டி.ஆர். நிர்மல் குமார் அவர்களின் அதிகாரப்பூர்வ தளம்." : "Official platform of C.T.R. Nirmal Kumar."}
          </p>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <span className="text-xs text-gray-500 hover:text-gray-300 transition-colors cursor-pointer">{lang === "ta" ? "நிர்வாகி உள்நுழைவு" : "Admin Login"}</span>
            </Link>
            <span className="text-xs text-gray-600">|</span>
            <span className="text-xs text-gray-500">{lang === "ta" ? "தனியுரிமைக் கொள்கை" : "Privacy Policy"}</span>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-800/50 text-center">
          <p className="text-base md:text-lg text-gray-400">
            {lang === "ta" ? "வழங்கியவர்" : "Powered by"}{" "}
            <a
              href="https://www.automystics.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary/80 transition-colors font-semibold inline-flex items-center gap-1.5"
            >
              www.automystics.com
              <ExternalLink className="w-4 h-4" />
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
