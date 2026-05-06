import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, RefreshCw, Eye } from "lucide-react";
import { adminApi } from "./api";

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
  bioBrief: "Serving the people of Tirupparankundram with dedication and commitment.",
  bioBriefTa: "திருப்பரங்குன்றம் மக்களுக்கு அர்ப்பணிப்புடன் சேவை செய்கிறோம்.",
  bioFull: "",
  bioFullTa: "",
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

export default function AboutAdmin() {
  const [config, setConfig] = useState<AboutConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getAbout()
      .then((d: AboutConfig | null) => { if (d) setConfig({ ...DEFAULT_CONFIG, ...d }); })
      .catch(() => setError("Failed to load about config"))
      .finally(() => setLoading(false));
  }, []);

  const set = <K extends keyof AboutConfig>(key: K, value: AboutConfig[K]) =>
    setConfig(c => ({ ...c, [key]: value }));

  const setHighlight = (i: number, field: keyof AboutConfig["highlights"][0], value: string) =>
    setConfig(c => ({
      ...c,
      highlights: c.highlights.map((h, idx) => idx === i ? { ...h, [field]: value } : h),
    }));

  const addHighlight = () =>
    setConfig(c => ({ ...c, highlights: [...c.highlights, { title: "", titleTa: "", value: "", icon: "Star" }] }));

  const removeHighlight = (i: number) =>
    setConfig(c => ({ ...c, highlights: c.highlights.filter((_, idx) => idx !== i) }));

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateAbout(config);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">About Page CMS</h2>
          <p className="text-sm text-muted-foreground">Edit the leader's bio, contact details, and highlights. Changes appear live on the About page.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href="/about" target="_blank" className="gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Preview
            </a>
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-primary hover:bg-primary/90">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? "Saved!" : saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {error && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
      {saved && <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-md px-3 py-2">Changes saved successfully.</p>}

      {/* Basic Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Full Name (English)</Label>
              <Input value={config.name} onChange={e => set("name", e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">பெயர் (Tamil)</Label>
              <Input value={config.nameTa} onChange={e => set("nameTa", e.target.value)} className="mt-1 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Designation</Label>
              <Input value={config.designation} onChange={e => set("designation", e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">பதவி (Tamil)</Label>
              <Input value={config.designationTa} onChange={e => set("designationTa", e.target.value)} className="mt-1 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Constituency</Label>
              <Input value={config.constituency} onChange={e => set("constituency", e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">தொகுதி (Tamil)</Label>
              <Input value={config.constituencyTa} onChange={e => set("constituencyTa", e.target.value)} className="mt-1 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Party</Label>
              <Input value={config.party} onChange={e => set("party", e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">கட்சி (Tamil)</Label>
              <Input value={config.partyTa} onChange={e => set("partyTa", e.target.value)} className="mt-1 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Date of Birth</Label>
              <Input value={config.born} onChange={e => set("born", e.target.value)} placeholder="e.g. 15 April 1975" className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Education</Label>
              <Input value={config.education} onChange={e => set("education", e.target.value)} placeholder="e.g. B.E. (Civil Engineering)" className="mt-1 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Profile Photo URL</Label>
            <Input value={config.photoUrl} onChange={e => set("photoUrl", e.target.value)} placeholder="https://…" className="mt-1 text-sm" />
          </div>
        </CardContent>
      </Card>

      {/* Biography */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Biography</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Brief Bio (English) — shown on hero section</Label>
            <Textarea value={config.bioBrief} onChange={e => set("bioBrief", e.target.value)} rows={2} className="mt-1 text-sm" />
          </div>
          <div>
            <Label className="text-xs">சுருக்க வாழ்க்கை வரலாறு (Tamil)</Label>
            <Textarea value={config.bioBriefTa} onChange={e => set("bioBriefTa", e.target.value)} rows={2} className="mt-1 text-sm" />
          </div>
          <div>
            <Label className="text-xs">Full Biography (English)</Label>
            <Textarea value={config.bioFull} onChange={e => set("bioFull", e.target.value)} rows={5} placeholder="Full biography text…" className="mt-1 text-sm" />
          </div>
          <div>
            <Label className="text-xs">முழு வாழ்க்கை வரலாறு (Tamil)</Label>
            <Textarea value={config.bioFullTa} onChange={e => set("bioFullTa", e.target.value)} rows={4} className="mt-1 text-sm" />
          </div>
        </CardContent>
      </Card>

      {/* Key Achievements */}
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold">Achievement Highlights</CardTitle>
          <Button size="sm" variant="outline" onClick={addHighlight} className="h-7 text-xs">+ Add</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {config.highlights.map((h, i) => (
            <div key={i} className="grid grid-cols-4 gap-2 items-end border-b pb-3 last:border-b-0 last:pb-0">
              <div>
                <Label className="text-xs">Title (EN)</Label>
                <Input value={h.title} onChange={e => setHighlight(i, "title", e.target.value)} className="mt-1 text-xs h-8" />
              </div>
              <div>
                <Label className="text-xs">தலைப்பு (TA)</Label>
                <Input value={h.titleTa} onChange={e => setHighlight(i, "titleTa", e.target.value)} className="mt-1 text-xs h-8" />
              </div>
              <div>
                <Label className="text-xs">Value</Label>
                <Input value={h.value} onChange={e => setHighlight(i, "value", e.target.value)} placeholder="e.g. 120+ km" className="mt-1 text-xs h-8" />
              </div>
              <Button size="sm" variant="ghost" className="h-8 text-red-500 hover:bg-red-50" onClick={() => removeHighlight(i)}>✕</Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Phone</Label>
              <Input value={config.phone} onChange={e => set("phone", e.target.value)} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input value={config.email} onChange={e => set("email", e.target.value)} className="mt-1 text-sm" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Office Address (English)</Label>
            <Textarea value={config.officeAddress} onChange={e => set("officeAddress", e.target.value)} rows={2} className="mt-1 text-sm" />
          </div>
          <div>
            <Label className="text-xs">அலுவலக முகவரி (Tamil)</Label>
            <Textarea value={config.officeAddressTa} onChange={e => set("officeAddressTa", e.target.value)} rows={2} className="mt-1 text-sm" />
          </div>
        </CardContent>
      </Card>

      {/* Social Links */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Social Media Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Facebook URL</Label>
              <Input value={config.facebook} onChange={e => set("facebook", e.target.value)} placeholder="https://facebook.com/…" className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Twitter/X URL</Label>
              <Input value={config.twitter} onChange={e => set("twitter", e.target.value)} placeholder="https://x.com/…" className="mt-1 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Instagram URL</Label>
              <Input value={config.instagram} onChange={e => set("instagram", e.target.value)} placeholder="https://instagram.com/…" className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">YouTube URL</Label>
              <Input value={config.youtube} onChange={e => set("youtube", e.target.value)} placeholder="https://youtube.com/…" className="mt-1 text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-8">
        <Button onClick={handleSave} disabled={saving} size="lg" className="gap-2 bg-primary hover:bg-primary/90">
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saved ? "Saved!" : "Save All Changes"}
        </Button>
      </div>
    </div>
  );
}
