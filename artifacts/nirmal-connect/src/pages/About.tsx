import { useEffect, useState } from "react";
import { SectionHeader } from "@/components/SectionHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, BookOpen, MapPin, Users, Heart, Star, Phone, Mail, Briefcase, GraduationCap, Facebook, Twitter, Instagram, Youtube } from "lucide-react";
import type { Language } from "@/lib/i18n";
import leaderPhoto from "@assets/image_1778085777744.png";

interface AboutConfig {
  name: string;
  nameTa: string;
  designation: string;
  designationTa: string;
  constituency: string;
  constituencyTa: string;
  party: string;
  partyTa: string;
  photoUrl: string;
  bioBrief: string;
  bioBriefTa: string;
  bioFull: string;
  bioFullTa: string;
  education: string;
  born: string;
  phone: string;
  email: string;
  officeAddress: string;
  officeAddressTa: string;
  facebook: string;
  twitter: string;
  instagram: string;
  youtube: string;
  highlights: { title: string; titleTa: string; value: string; icon: string }[];
}

const DEFAULT_CONFIG: AboutConfig = {
  name: "C.T.R. Nirmal Kumar",
  nameTa: "சி.டி.ஆர். நிர்மல் குமார்",
  designation: "Member of Legislative Assembly",
  designationTa: "சட்டமன்ற உறுப்பினர்",
  constituency: "Tirupparankundram",
  constituencyTa: "திருப்பரங்குன்றம்",
  party: "Tamilaga Vettri Kazhagam (TVK)",
  partyTa: "தமிழக வெற்றி கழகம்",
  photoUrl: "",
  bioBrief: "Hon. C.T.R. Nirmal Kumar serves as the Member of Legislative Assembly for the Tirupparankundram constituency under the Tamilaga Vettri Kazhagam (TVK) party.",
  bioBriefTa: "சி.டி.ஆர். நிர்மல் குமார் அவர்கள் திருப்பரங்குன்றம் தொகுதியின் சட்டமன்ற உறுப்பினராக திகழ்கிறார்.",
  bioFull: "A dedicated public servant committed to the holistic development of Tirupparankundram, he has been instrumental in bringing transformative change to the constituency. Known for his ground-level approach and direct engagement with citizens, he has made significant strides in infrastructure development, educational improvement, and healthcare access. Under his leadership, the constituency has witnessed unprecedented development in roads, drinking water infrastructure, schools, and primary health centers.",
  bioFullTa: "மக்களுடன் நேரடியாக தொடர்பு வைத்துக்கொண்டு, அவர்களின் பிரச்சினைகளை உடனடியாக தீர்க்கும் இவர், திருப்பரங்குன்றத்தின் உள்கட்டமைப்பு வளர்ச்சி, கல்வி மேம்பாடு, சுகாதார சேவைகள் ஆகியவற்றில் குறிப்பிடத்தக்க பங்காற்றியுள்ளார்.",
  education: "",
  born: "",
  phone: "+91 98765 43210",
  email: "mla.tirupparankundram@tn.gov.in",
  officeAddress: "MLA Office, Tirupparankundram, Madurai District, Tamil Nadu - 625005",
  officeAddressTa: "சட்டமன்ற உறுப்பினர் அலுவலகம், திருப்பரங்குன்றம், மதுரை மாவட்டம்",
  facebook: "",
  twitter: "",
  instagram: "",
  youtube: "",
  highlights: [
    { title: "Roads Built", titleTa: "சாலைகள்", value: "120+ km", icon: "Road" },
    { title: "Schools Upgraded", titleTa: "பள்ளிகள்", value: "45+", icon: "School" },
    { title: "Water Projects", titleTa: "நீர் திட்டங்கள்", value: "30+", icon: "Droplets" },
    { title: "Jobs Created", titleTa: "வேலைவாய்ப்பு", value: "5000+", icon: "Briefcase" },
  ],
};

const BASE = import.meta.env.VITE_API_URL ?? "/api";

interface AboutProps { lang: Language; }

export default function About({ lang }: AboutProps) {
  const [config, setConfig] = useState<AboutConfig>(DEFAULT_CONFIG);

  useEffect(() => {
    fetch(`${BASE}/about`)
      .then(r => r.ok ? r.json() : null)
      .then((d: AboutConfig | null) => { if (d) setConfig(prev => ({ ...prev, ...d })); })
      .catch(() => {/* use defaults */});
  }, []);

  const t = (en: string, ta: string) => lang === "ta" ? ta : en;

  const infoItems = [
    { icon: MapPin, label: t("Constituency", "தொகுதி"), value: t(config.constituency, config.constituencyTa) },
    { icon: Users, label: t("Party", "கட்சி"), value: t(config.party, config.partyTa) },
    { icon: Award, label: t("Position", "பதவி"), value: t(config.designation, config.designationTa) },
    ...(config.born ? [{ icon: Heart, label: t("Born", "பிறந்த நாள்"), value: config.born }] : []),
    ...(config.education ? [{ icon: GraduationCap, label: t("Education", "கல்வி"), value: config.education }] : []),
    { icon: Phone, label: t("Phone", "தொலைபேசி"), value: config.phone },
    { icon: Mail, label: t("Email", "மின்னஞ்சல்"), value: config.email },
  ];

  const photoSrc = config.photoUrl || leaderPhoto;

  const socialLinks = [
    { icon: Facebook, url: config.facebook, label: "Facebook" },
    { icon: Twitter, url: config.twitter, label: "Twitter" },
    { icon: Instagram, url: config.instagram, label: "Instagram" },
    { icon: Youtube, url: config.youtube, label: "YouTube" },
  ].filter(s => s.url);

  const values = [
    { title: t("Transparency", "வெளிப்படைத்தன்மை"), desc: t("Honest governance and open communication with citizens", "மக்களுக்கு நேர்மையான ஆட்சி") },
    { title: t("Development", "வளர்ச்சி"), desc: t("Infrastructure, education, and livelihood improvement", "தொகுதியில் முன்னேற்றம்") },
    { title: t("Service", "சேவை"), desc: t("Dedicated public service and grievance resolution", "மக்களுக்கு 24/7 சேவை") },
    { title: t("Unity", "ஒற்றுமை"), desc: t("Social harmony and inclusive growth for all communities", "சமூக ஒற்றுமை மற்றும் அமைதி") },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <SectionHeader
        title={t("About the Leader", "தலைவரைப் பற்றி")}
        subtitle={t(
          "Learn about Hon. C.T.R. Nirmal Kumar, MLA of Tirupparankundram",
          "சி.டி.ஆர். நிர்மல் குமார் அவர்களின் அரசியல் வாழ்க்கை"
        )}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mb-16">
        {/* Leader card */}
        <div className="lg:col-span-1">
          <div className="bg-gradient-to-b from-primary/10 to-transparent rounded-2xl p-6 text-center">
            <div className="w-36 h-36 rounded-full overflow-hidden mx-auto mb-4 shadow-xl ring-4 ring-primary/30">
              <img
                src={photoSrc}
                alt={t(config.name, config.nameTa)}
                className="w-full h-full object-cover"
              />
            </div>
            <h2 className="text-xl font-bold mb-1">
              {t(config.name, config.nameTa)}
            </h2>
            <p className="text-primary text-sm font-medium mb-1">
              {t(config.designation, config.designationTa)}
            </p>
            <p className="text-muted-foreground text-xs">
              {t(config.constituency, config.constituencyTa)}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <Badge className="bg-primary/10 text-primary border-primary/20">TVK</Badge>
            </div>
            {socialLinks.length > 0 && (
              <div className="mt-4 flex items-center justify-center gap-3">
                {socialLinks.map(s => (
                  <a key={s.label} href={s.url} target="_blank" rel="noreferrer"
                    className="p-2 rounded-full bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors">
                    <s.icon className="w-4 h-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 mt-4">
            {infoItems.map((h, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
                <h.icon className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{h.label}</p>
                  <p className="text-sm font-medium truncate">{h.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bio */}
        <div className="lg:col-span-2 space-y-6">
          <div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-primary" />
              {t("Biography", "வாழ்க்கை வரலாறு")}
            </h3>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              {(t(config.bioBrief, config.bioBriefTa)) && (
                <p>{t(config.bioBrief, config.bioBriefTa)}</p>
              )}
              {(t(config.bioFull, config.bioFullTa)) && (
                <p>{t(config.bioFull, config.bioFullTa)}</p>
              )}
            </div>
          </div>

          {/* Achievement highlights from CMS */}
          {config.highlights && config.highlights.length > 0 && (
            <div>
              <h3 className="text-lg font-bold mb-4">
                {t("Key Achievements", "முக்கிய சாதனைகள்")}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {config.highlights.map((h, i) => (
                  <Card key={i} className="text-center border-primary/20 hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <p className="text-2xl font-bold text-primary">{h.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t(h.title, h.titleTa)}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Values */}
          <div>
            <h3 className="text-lg font-bold mb-4">
              {t("Values & Vision", "மதிப்புகள் & நோக்கங்கள்")}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {values.map((v, i) => (
                <Card key={i} className="border-l-4 border-l-primary">
                  <CardContent className="p-4">
                    <h4 className="font-semibold mb-1">{v.title}</h4>
                    <p className="text-sm text-muted-foreground">{v.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Office address */}
          {config.officeAddress && (
            <div className="p-4 bg-muted/40 rounded-xl border">
              <h4 className="font-semibold text-sm mb-2 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                {t("Office Address", "அலுவலக முகவரி")}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t(config.officeAddress, config.officeAddressTa || config.officeAddress)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
