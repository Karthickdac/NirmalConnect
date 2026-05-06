import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "@/components/SectionHeader";
import { Award, TrendingUp, CheckCircle } from "lucide-react";
import { useGetConstituencyStats } from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";
import { t } from "@/lib/i18n";

interface AchievementsProps { lang: Language; }

export default function Achievements({ lang }: AchievementsProps) {
  const { data: stats, isLoading } = useGetConstituencyStats();

  const achievements = [
    { title: lang === "ta" ? "சாலை கட்டுமானம்" : "Road Construction", desc: lang === "ta" ? "தொகுதியில் புதிய மற்றும் மேம்படுத்தப்பட்ட சாலைகள்" : "New and upgraded roads across the constituency", category: lang === "ta" ? "உள்கட்டமைப்பு" : "Infrastructure" },
    { title: lang === "ta" ? "குடிநீர் திட்டங்கள்" : "Drinking Water Projects", desc: lang === "ta" ? "சுத்தமான குடிநீர் வசதி அனைத்து வார்டுகளிலும்" : "Clean drinking water access provided to all wards", category: lang === "ta" ? "நலன்" : "Welfare" },
    { title: lang === "ta" ? "கல்வி மேம்பாடு" : "Education Enhancement", desc: lang === "ta" ? "பள்ளிகளில் கட்டமைப்பு மேம்பாடு மற்றும் கல்வி உதவி" : "School infrastructure improvement and scholarship programs", category: lang === "ta" ? "கல்வி" : "Education" },
    { title: lang === "ta" ? "சுகாதார சேவைகள்" : "Healthcare Services", desc: lang === "ta" ? "புதிய சுகாதார மையங்கள் மற்றும் மருத்துவ முகாம்கள்" : "New health centers opened and medical camps organized", category: lang === "ta" ? "சுகாதாரம்" : "Healthcare" },
    { title: lang === "ta" ? "வேலைவாய்ப்பு திட்டம்" : "Employment Scheme", desc: lang === "ta" ? "இளைஞர்களுக்கு தொழில் பயிற்சி மற்றும் வேலை வாய்ப்புகள்" : "Skill development and job placement for youth", category: lang === "ta" ? "தொழில்" : "Employment" },
    { title: lang === "ta" ? "பெண்கள் நலன்" : "Women's Welfare", desc: lang === "ta" ? "சுய உதவி குழுக்கள் மற்றும் பெண்கள் அதிகாரமளிப்பு" : "Self-help groups and women empowerment programs", category: lang === "ta" ? "நலன்" : "Welfare" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "சாதனைகள்" : "Key Achievements"}
        subtitle={lang === "ta" ? "திருப்பரங்குன்றம் தொகுதியில் நடந்த முக்கிய சாதனைகள்" : "Major milestones achieved for the Tirupparankundram constituency"}
      />

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {[
            { label: lang === "ta" ? "மொத்த திட்டங்கள்" : "Total Projects", value: stats.totalProjects },
            { label: lang === "ta" ? "நிறைவேறிய திட்டங்கள்" : "Completed", value: stats.completedProjects },
            { label: lang === "ta" ? "நடந்துகொண்டிருக்கும்" : "Ongoing", value: stats.ongoingProjects },
            { label: lang === "ta" ? "பயனாளிகள்" : "Beneficiaries", value: `${stats.beneficiariesServed.toLocaleString()}+` },
          ].map((s, i) => (
            <Card key={i} className="text-center">
              <CardContent className="p-5">
                <div className="text-3xl font-bold text-primary mb-1">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {achievements.map((a, i) => (
          <Card key={i} data-testid={`achievement-card-${i}`} className="hover:shadow-md transition-all">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <span className="text-xs font-medium text-primary uppercase tracking-wide">{a.category}</span>
                  <h3 className="font-semibold mt-0.5 mb-1">{a.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{a.desc}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
