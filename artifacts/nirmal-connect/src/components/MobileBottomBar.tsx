import { Link, useLocation } from "wouter";
import { Megaphone, Phone, MessageCircle, Home as HomeIcon } from "lucide-react";
import type { Language } from "@/lib/i18n";

interface MobileBottomBarProps {
  lang: Language;
}

export function MobileBottomBar({ lang }: MobileBottomBarProps) {
  const [location] = useLocation();
  const tx = (en: string, ta: string) => (lang === "ta" ? ta : en);

  const items = [
    {
      key: "home",
      href: "/",
      icon: HomeIcon,
      label: tx("Home", "முகப்பு"),
      type: "link" as const,
    },
    {
      key: "grievance",
      href: "/grievance",
      icon: Megaphone,
      label: tx("Grievance", "புகார்"),
      type: "link" as const,
      highlight: true,
    },
    {
      key: "call",
      href: "tel:+919876543210",
      icon: Phone,
      label: tx("Call", "அழை"),
      type: "external" as const,
    },
    {
      key: "whatsapp",
      href: "https://wa.me/919876543210?text=Hello%2C%20I%20need%20assistance%20from%20the%20office%20of%20MLA%20C.T.R.%20Nirmal%20Kumar",
      icon: MessageCircle,
      label: "WhatsApp",
      type: "external" as const,
      brand: "#25D366",
    },
  ];

  return (
    <nav
      data-testid="mobile-bottom-bar"
      aria-label="Quick actions"
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md border-t border-border shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="grid grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.type === "link" && location === item.href;
          const inner = (
            <span
              className={`relative flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors ${
                active ? "text-primary" : "text-foreground/70"
              }`}
            >
              {item.highlight && (
                <span className="absolute -top-3 w-12 h-12 rounded-full bg-primary shadow-lg flex items-center justify-center">
                  <Icon className="w-5 h-5 text-white" />
                </span>
              )}
              {!item.highlight && (
                <Icon
                  className="w-5 h-5"
                  {...(item.brand ? { style: { color: item.brand } } : {})}
                />
              )}
              <span
                className={`text-[10px] font-medium leading-tight ${
                  item.highlight ? "mt-7" : ""
                }`}
              >
                {item.label}
              </span>
            </span>
          );
          if (item.type === "link") {
            return (
              <li key={item.key}>
                <Link href={item.href}>
                  <span
                    data-testid={`bottom-bar-${item.key}`}
                    className="block cursor-pointer min-h-[56px]"
                  >
                    {inner}
                  </span>
                </Link>
              </li>
            );
          }
          return (
            <li key={item.key}>
              <a
                href={item.href}
                target={item.href.startsWith("http") ? "_blank" : undefined}
                rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                data-testid={`bottom-bar-${item.key}`}
                className="block min-h-[56px]"
              >
                {inner}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
