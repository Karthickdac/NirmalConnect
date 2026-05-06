import { SectionHeader } from "@/components/SectionHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, BookOpen, MapPin, Users, Heart, Star } from "lucide-react";
import type { Language } from "@/lib/i18n";
import leaderPhoto from "@assets/image_1778085777744.png";

interface AboutProps { lang: Language; }

export default function About({ lang }: AboutProps) {
  const highlights = [
    { icon: MapPin, label: lang === "ta" ? "தொகுதி" : "Constituency", value: lang === "ta" ? "திருப்பரங்குன்றம்" : "Tirupparankundram, Madurai" },
    { icon: Users, label: lang === "ta" ? "கட்சி" : "Party", value: "Tamilaga Vettri Kazhagam (TVK)" },
    { icon: Award, label: lang === "ta" ? "பதவி" : "Position", value: lang === "ta" ? "சட்டமன்ற உறுப்பினர்" : "Member of Legislative Assembly" },
    { icon: Star, label: lang === "ta" ? "கவனிப்பு" : "Focus", value: lang === "ta" ? "மக்கள் நலன்" : "Public Welfare & Development" },
  ];

  const values = [
    { title: lang === "ta" ? "வெளிப்படைத்தன்மை" : "Transparency", desc: lang === "ta" ? "மக்களுக்கு நேர்மையான ஆட்சி" : "Honest governance and open communication with citizens" },
    { title: lang === "ta" ? "வளர்ச்சி" : "Development", desc: lang === "ta" ? "தொகுதியில் முன்னேற்றம்" : "Infrastructure, education, and livelihood improvement" },
    { title: lang === "ta" ? "சேவை" : "Service", desc: lang === "ta" ? "மக்களுக்கு 24/7 சேவை" : "Dedicated public service and grievance resolution" },
    { title: lang === "ta" ? "ஒற்றுமை" : "Unity", desc: lang === "ta" ? "சமூக ஒற்றுமை மற்றும் அமைதி" : "Social harmony and inclusive growth for all communities" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "தலைவரைப் பற்றி" : "About the Leader"}
        subtitle={lang === "ta" ? "சி.டி.ஆர். நிர்மல் குமார் அவர்களின் அரசியல் வாழ்க்கை" : "Learn about Hon. C.T.R. Nirmal Kumar, MLA of Tirupparankundram"}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mb-16">
        {/* Leader card */}
        <div className="lg:col-span-1">
          <div className="bg-gradient-to-b from-primary/10 to-transparent rounded-2xl p-6 text-center">
            <div className="w-36 h-36 rounded-full overflow-hidden mx-auto mb-4 shadow-xl ring-4 ring-primary/30">
              <img
                src={leaderPhoto}
                alt={lang === "ta" ? "சி.டி.ஆர். நிர்மல் குமார்" : "C.T.R. Nirmal Kumar"}
                className="w-full h-full object-cover"
              />
            </div>
            <h2 className="text-xl font-bold mb-1">
              {lang === "ta" ? "சி.டி.ஆர். நிர்மல் குமார்" : "C.T.R. Nirmal Kumar"}
            </h2>
            <p className="text-primary text-sm font-medium mb-1">
              {lang === "ta" ? "சட்டமன்ற உறுப்பினர்" : "Member of Legislative Assembly"}
            </p>
            <p className="text-muted-foreground text-xs">
              {lang === "ta" ? "திருப்பரங்குன்றம் தொகுதி" : "Tirupparankundram Constituency"}
            </p>
            <div className="mt-4 pt-4 border-t border-border">
              <Badge className="bg-primary/10 text-primary border-primary/20">TVK</Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 mt-4">
            {highlights.map((h, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-card rounded-lg border border-border">
                <h.icon className="w-4 h-4 text-primary flex-shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{h.label}</p>
                  <p className="text-sm font-medium">{h.value}</p>
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
              {lang === "ta" ? "வாழ்க்கை வரலாறு" : "Biography"}
            </h3>
            <div className="space-y-4 text-muted-foreground leading-relaxed">
              <p>
                {lang === "ta"
                  ? "சி.டி.ஆர். நிர்மல் குமார் அவர்கள் திருப்பரங்குன்றம் தொகுதியின் சட்டமன்ற உறுப்பினராக திகழ்கிறார். தமிழக வெற்றி கழகம் (TVK) கட்சியின் சார்பில் மக்கள் நலனுக்காக அயராது உழைக்கும் இவர், தொகுதியின் வளர்ச்சிக்கு பல்வேறு திட்டங்களை அமல்படுத்தி வருகிறார்."
                  : "Hon. C.T.R. Nirmal Kumar serves as the Member of Legislative Assembly for the Tirupparankundram constituency under the Tamilaga Vettri Kazhagam (TVK) party. A dedicated public servant committed to the holistic development of Tirupparankundram, he has been instrumental in bringing transformative change to the constituency."}
              </p>
              <p>
                {lang === "ta"
                  ? "மக்களுடன் நேரடியாக தொடர்பு வைத்துக்கொண்டு, அவர்களின் பிரச்சினைகளை உடனடியாக தீர்க்கும் இவர், திருப்பரங்குன்றத்தின் உள்கட்டமைப்பு வளர்ச்சி, கல்வி மேம்பாடு, சுகாதார சேவைகள் ஆகியவற்றில் குறிப்பிடத்தக்க பங்காற்றியுள்ளார்."
                  : "Known for his ground-level approach and direct engagement with citizens, he has made significant strides in infrastructure development, educational improvement, and healthcare access within Tirupparankundram. His administration is characterized by transparency, accountability, and a genuine commitment to public service."}
              </p>
              <p>
                {lang === "ta"
                  ? "இளைஞர்களின் வாய்ப்புகளை மேம்படுத்தவும், கிராம மக்களின் வாழ்க்கை தரத்தை உயர்த்தவும் பல்வேறு திட்டங்களை இவர் செயல்படுத்தி வருகிறார். அவரது தலைமையில் தொகுதி புதிய உயரங்களை எட்டியுள்ளது."
                  : "Under his leadership, the constituency has witnessed unprecedented development in roads, drinking water infrastructure, schools, and primary health centers. He remains accessible to all citizens through his office's open-door policy and the digital grievance platform."}
              </p>
            </div>
          </div>

          {/* Values */}
          <div>
            <h3 className="text-lg font-bold mb-4">
              {lang === "ta" ? "மதிப்புகள் & நோக்கங்கள்" : "Values & Vision"}
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
        </div>
      </div>
    </div>
  );
}
