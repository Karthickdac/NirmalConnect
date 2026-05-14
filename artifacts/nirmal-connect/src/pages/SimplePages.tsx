import { Card, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/SectionHeader";
import { Badge } from "@/components/ui/badge";
import { Phone, AlertTriangle, Heart, ExternalLink, FileText } from "lucide-react";
import type { Language } from "@/lib/i18n";
import { useLeaderConfig } from "@/lib/LeaderConfigContext";

interface SimplePageProps { lang: Language; }

export function Journey({ lang }: SimplePageProps) {
  const lc = useLeaderConfig();
  const c = lang === "ta" ? lc.constituencyTa : lc.constituencyEn;
  const n = lang === "ta" ? lc.nameTa : lc.nameEn;

  const milestones = [
    { year: "2024", title: lang === "ta" ? "அமைச்சராக தேர்வு" : "Elected as Minister", desc: lang === "ta" ? `${c} தொகுதியில் மக்களின் ஆதரவுடன் சட்டமன்றத்திற்கு தேர்வு` : `Won the ${c} assembly seat with overwhelming public support` },
    { year: "2023", title: lang === "ta" ? "TVK இல் சேர்வு" : "Joined TVK", desc: lang === "ta" ? "தமிழக வெற்றி கழகத்தில் இணைந்து மக்கள் சேவையில் ஈடுபடுதல்" : "Joined Tamilaga Vettri Kazhagam and began grassroots public service" },
    { year: "2020", title: lang === "ta" ? "சமூக சேவை தொடக்கம்" : "Community Service Begins", desc: lang === "ta" ? `${c} பகுதியில் சமூக நலப் பணிகள் தொடங்கினார்` : `Began active community welfare work in ${c} area` },
    { year: "2015", title: lang === "ta" ? "கல்வி முடிவு" : "Higher Education", desc: lang === "ta" ? "உயர்கல்வி முடித்து சமூக நலப் பணிகளில் கவனம் செலுத்தினார்" : "Completed higher education and focused on public welfare activities" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "அரசியல் பயணம்" : "Political Journey"}
        subtitle={lang === "ta" ? `${n}ின் அரசியல் வாழ்க்கை பயணம்` : `The political journey of ${n}`}
      />
      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-border" />
        <div className="space-y-8 pl-12">
          {milestones.map((m, i) => (
            <div key={i} data-testid={`milestone-${i}`} className="relative">
              <div className="absolute -left-12 w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">{m.year.slice(2)}</div>
              <Card>
                <CardContent className="p-5">
                  <Badge className="bg-primary/10 text-primary border-0 mb-2 text-xs">{m.year}</Badge>
                  <h3 className="font-semibold mb-1">{m.title}</h3>
                  <p className="text-sm text-muted-foreground">{m.desc}</p>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Development({ lang }: SimplePageProps) {
  const lc = useLeaderConfig();
  const c = lang === "ta" ? lc.constituencyTa : lc.constituencyEn;

  const projects = [
    { cat: lang === "ta" ? "சாலை" : "Roads", title: lang === "ta" ? `${c} – மதுரை இணைப்பு சாலை மேம்பாடு` : `${c}–Madurai Connectivity Road Upgrade`, status: "Completed" },
    { cat: lang === "ta" ? "நீர்" : "Water", title: lang === "ta" ? `${c} குடிநீர் திட்டம் – 10 வார்டுகள்` : `Drinking Water Project – 10 Wards Coverage`, status: "Completed" },
    { cat: lang === "ta" ? "கல்வி" : "Education", title: lang === "ta" ? "அரசு பள்ளிகளில் கட்டமைப்பு மேம்பாடு (15 பள்ளிகள்)" : "Govt. School Infrastructure Upgrade – 15 Schools", status: "Ongoing" },
    { cat: lang === "ta" ? "சுகாதாரம்" : "Health", title: lang === "ta" ? "மகளிர் சுகாதார மையம் திறப்பு" : "Women's Health Center Inauguration", status: "Completed" },
    { cat: lang === "ta" ? "வீட்டுவசதி" : "Housing", title: lang === "ta" ? "இல்லமில்லாத குடும்பங்களுக்கு வீட்டுவசதி" : "Housing scheme for 200 homeless families", status: "Ongoing" },
    { cat: lang === "ta" ? "தொழில்" : "Employment", title: lang === "ta" ? "தொழில் பயிற்சி மையம் திறப்பு" : "Skill Development Center Opening", status: "Completed" },
  ];
  const statusColor: Record<string, string> = { Completed: "bg-green-100 text-green-700", Ongoing: "bg-blue-100 text-blue-700", Planned: "bg-yellow-100 text-yellow-700" };
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <SectionHeader title={lang === "ta" ? "தொகுதி வளர்ச்சி பணிகள்" : "Constituency Development Works"} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {projects.map((p, i) => (
          <Card key={i} data-testid={`project-card-${i}`} className="hover:shadow-md transition-all">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2 mb-2">
                <Badge variant="secondary" className="text-xs">{p.cat}</Badge>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[p.status]}`}>{p.status}</span>
              </div>
              <p className="font-medium text-sm">{p.title}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function Welfare({ lang }: SimplePageProps) {
  const lc = useLeaderConfig();
  const c = lang === "ta" ? lc.constituencyTa : lc.constituencyEn;

  const schemes = [
    { title: lang === "ta" ? "முதியோர் ஓய்வூதியம்" : "Old Age Pension", dept: lang === "ta" ? "சமூக நலன் துறை" : "Social Welfare Dept" },
    { title: lang === "ta" ? "கல்வி உதவித்தொகை" : "Education Scholarship", dept: lang === "ta" ? "கல்வி துறை" : "Education Dept" },
    { title: lang === "ta" ? "மகளிர் சுய உதவி குழு" : "Women Self-Help Groups", dept: lang === "ta" ? "மகளிர் மற்றும் குழந்தை வளர்ச்சி" : "WCD Dept" },
    { title: lang === "ta" ? "இலவச வீட்டுவசதி" : "Free Housing Scheme", dept: lang === "ta" ? "வீட்டுவசதி துறை" : "Housing Dept" },
    { title: lang === "ta" ? "கிராமப்புற வேலைவாய்ப்பு" : "MGNREGS Employment", dept: lang === "ta" ? "வேலைவாய்ப்பு துறை" : "Employment Dept" },
    { title: lang === "ta" ? "இலவச மருத்துவ காப்பீடு" : "Free Health Insurance", dept: lang === "ta" ? "சுகாதாரம் துறை" : "Health Dept" },
  ];
  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "நலத் திட்டங்கள்" : "Welfare Schemes"}
        subtitle={lang === "ta" ? "மக்களுக்கான அரசு நலத் திட்டங்கள்" : `Government welfare schemes available to residents of ${c}`}
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {schemes.map((s, i) => (
          <Card key={i} data-testid={`scheme-${i}`} className="hover:shadow-sm transition-all">
            <CardContent className="p-5 flex items-start gap-3">
              <Heart className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-sm mb-0.5">{s.title}</h3>
                <p className="text-xs text-muted-foreground">{s.dept}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-8 bg-primary/5 border-primary/20">
        <CardContent className="p-5 text-center">
          <p className="text-sm text-muted-foreground">
            {lang === "ta"
              ? "மேலும் தகவல்களுக்கு அலுவலகத்தை தொடர்பு கொள்ளவும் அல்லது புகார் மையம் வழியாக விண்ணப்பிக்கவும்"
              : "For more details on any scheme, contact the office or apply through the grievance portal"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export function PressReleases({ lang }: SimplePageProps) {
  const lc = useLeaderConfig();
  const n = lang === "ta" ? lc.nameTa : lc.nameEn;
  const c = lang === "ta" ? lc.constituencyTa : lc.constituencyEn;

  const releases = [
    { date: "15 Apr 2025", title: lang === "ta" ? `தொகுதியில் 50 கி.மீ சாலை கட்டுமானம் நிறைவு – ${n} அறிவிப்பு` : `${n} Announces Completion of 50 km Road Construction` },
    { date: "02 Mar 2025", title: lang === "ta" ? `${c} குடிநீர் திட்டம் – மக்களுக்கு நேர்மையான சேவை` : `${c} Drinking Water Project Successfully Completed` },
    { date: "20 Jan 2025", title: lang === "ta" ? "5000 மக்களுக்கு மருத்துவ முகாம் – இலவச சிகிச்சை வழங்கப்பட்டது" : "Free Medical Camp Provides Treatment to 5,000 Residents" },
  ];
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <SectionHeader title={lang === "ta" ? "பத்திரிகை வெளியீடுகள்" : "Press Releases"} />
      <div className="space-y-4">
        {releases.map((r, i) => (
          <Card key={i} data-testid={`press-${i}`} className="hover:shadow-md transition-all cursor-pointer group">
            <CardContent className="p-5 flex items-start gap-4">
              <FileText className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">{r.date}</p>
                <h3 className="font-medium text-sm group-hover:text-primary transition-colors">{r.title}</h3>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function Donate({ lang }: SimplePageProps) {
  const lc = useLeaderConfig();
  const c = lang === "ta" ? lc.constituencyTa : lc.constituencyEn;

  return (
    <div className="max-w-3xl mx-auto px-4 py-12 text-center">
      <SectionHeader
        title={lang === "ta" ? "நன்கொடை / ஆதரவு" : "Donate / Support"}
        subtitle={lang === "ta" ? `${c} தொகுதியின் வளர்ச்சியில் பங்காற்றுங்கள்` : `Support development initiatives in ${c} constituency`}
      />
      <Card className="max-w-md mx-auto">
        <CardContent className="p-8 space-y-4">
          <Heart className="w-12 h-12 text-primary mx-auto" />
          <h3 className="font-bold text-xl">{lang === "ta" ? "மக்களுக்காக கொடுங்கள்" : "Give for the People"}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed">
            {lang === "ta"
              ? `உங்கள் பங்களிப்பு ${c} தொகுதியின் வளர்ச்சிக்கு உதவும்.`
              : "Your contribution supports welfare programs, community events, and constituency development initiatives."}
          </p>
          <p className="text-sm font-medium">
            {lang === "ta" ? "தொடர்புக்கு:" : "For donation inquiries, contact the office:"}
          </p>
          <a href={`mailto:${lc.email}`} className="text-primary hover:underline text-sm">
            {lc.email}
          </a>
        </CardContent>
      </Card>
    </div>
  );
}

export function Emergency({ lang }: SimplePageProps) {
  const lc = useLeaderConfig();
  const c = lang === "ta" ? lc.constituencyTa : lc.constituencyEn;

  const contacts = [
    { label: lang === "ta" ? "காவல் துறை (Emergency)" : "Police Emergency", number: "100", color: "bg-blue-600" },
    { label: lang === "ta" ? "தீயணைப்பு படை" : "Fire & Rescue", number: "101", color: "bg-red-600" },
    { label: lang === "ta" ? "ஆம்புலன்ஸ்" : "Ambulance", number: "102", color: "bg-green-600" },
    { label: lang === "ta" ? "தேசிய அவசர கால சேவை" : "National Emergency", number: "112", color: "bg-yellow-600" },
    { label: lang === "ta" ? "அமைச்சர் அலுவலகம்" : "Minister's Office", number: lc.phone, color: "bg-primary" },
    { label: lang === "ta" ? "மாவட்ட ஆட்சியர் அலுவலகம்" : "District Collector Office", number: "0452-2526526", color: "bg-gray-700" },
  ];
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "அவசர தொடர்பு எண்கள்" : "Emergency Contacts"}
        subtitle={lang === "ta" ? "அவசரகால சூழ்நிலைகளில் இந்த எண்களை தொடர்பு கொள்ளுங்கள்" : `Important contact numbers for emergency situations in ${c}`}
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {contacts.map((c, i) => (
          <a key={i} href={`tel:${c.number}`} data-testid={`emergency-contact-${i}`}>
            <Card className="hover:shadow-md transition-all cursor-pointer">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${c.color} flex items-center justify-center`}>
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold">{c.number}</p>
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                </div>
              </CardContent>
            </Card>
          </a>
        ))}
      </div>
      <Card className="mt-6 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-yellow-800 dark:text-yellow-300">
            {lang === "ta"
              ? "உயிர் பாதிக்கும் அவசர நிலையில் 112 ஐ தொடர்பு கொள்ளுங்கள்"
              : "For life-threatening emergencies, call 112 immediately"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
