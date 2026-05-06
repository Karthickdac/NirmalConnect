import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/SectionHeader";
import { Phone, Mail, MapPin, Clock, MessageSquare } from "lucide-react";
import type { Language } from "@/lib/i18n";

interface ContactProps { lang: Language; }

export default function Contact({ lang }: ContactProps) {
  const contacts = [
    { icon: Phone, label: lang === "ta" ? "தொலைபேசி" : "Phone", value: "+91 (Contact Office)", href: "tel:+91" },
    { icon: Mail, label: "Email", value: "office@nirmalconnect.in", href: "mailto:office@nirmalconnect.in" },
    { icon: MessageSquare, label: "WhatsApp", value: "+91 98765 43210", href: "https://wa.me/919876543210" },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "தொடர்பு கொள்ளுங்கள்" : "Contact the Office"}
        subtitle={lang === "ta" ? "எங்களை தொடர்பு கொள்ள பல்வேறு வழிகள் உள்ளன" : "Multiple ways to reach MLA Nirmal Kumar's constituency office"}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        <div className="space-y-5">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm mb-1">{lang === "ta" ? "அலுவலக முகவரி" : "Office Address"}</p>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    MLA Office, Tirupparankundram,<br />
                    Madurai – 625005,<br />
                    Tamil Nadu, India
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm mb-1">{lang === "ta" ? "அலுவலக நேரம்" : "Office Hours"}</p>
                  <p className="text-muted-foreground text-sm">
                    {lang === "ta"
                      ? "திங்கள் – சனி: காலை 9:00 – மாலை 6:00\nஞாயிறு: மூடல்"
                      : "Monday – Saturday: 9:00 AM – 6:00 PM\nSunday: Closed"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {contacts.map((c, i) => (
            <a key={i} href={c.href} target={c.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
              <Card className="hover:shadow-md transition-all cursor-pointer border-l-4 border-l-primary">
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <c.icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className="font-medium text-sm">{c.value}</p>
                  </div>
                </CardContent>
              </Card>
            </a>
          ))}
        </div>

        {/* Map placeholder + info */}
        <div className="space-y-5">
          <div className="rounded-xl overflow-hidden border border-border h-64 bg-muted flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <MapPin className="w-10 h-10 mx-auto mb-2 text-primary" />
              <p className="font-medium">Tirupparankundram</p>
              <p className="text-sm">Madurai, Tamil Nadu</p>
            </div>
          </div>

          <Card className="bg-primary text-primary-foreground">
            <CardContent className="p-5 text-center">
              <MessageSquare className="w-8 h-8 mx-auto mb-3 text-yellow-300" />
              <h3 className="font-bold mb-1">
                {lang === "ta" ? "WhatsApp மூலம் தொடர்பு கொள்ளுங்கள்" : "Connect via WhatsApp"}
              </h3>
              <p className="text-white/80 text-sm mb-3">
                {lang === "ta" ? "உடனடி மறுமொழிக்கு WhatsApp பயன்படுத்துங்கள்" : "For quick responses, reach us on WhatsApp"}
              </p>
              <a
                href="https://wa.me/919876543210?text=Hello%2C%20I%20need%20assistance"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block bg-[#25D366] text-white px-6 py-2 rounded-lg font-semibold hover:bg-[#20b558] transition-colors text-sm"
                data-testid="contact-whatsapp"
              >
                Chat on WhatsApp
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
