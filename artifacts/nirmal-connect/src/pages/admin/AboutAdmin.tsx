import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Save, RefreshCw, Eye, EyeOff, AlertCircle } from "lucide-react";
import { adminApi } from "./api";
import { AboutView, DEFAULT_ABOUT_CONFIG, type AboutConfig } from "@/components/AboutView";
import { useUnsavedChangesGuard } from "@/lib/unsavedChanges";

const DEFAULT_CONFIG: AboutConfig = {
  ...DEFAULT_ABOUT_CONFIG,
  bioBrief: "Serving the people of Tirupparankundram with dedication and commitment.",
  bioBriefTa: "திருப்பரங்குன்றம் மக்களுக்கு அர்ப்பணிப்புடன் சேவை செய்கிறோம்.",
  bioFull: "",
  bioFullTa: "",
};

const URL_RE = /^https?:\/\/[^\s]+$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateConfig(c: AboutConfig): Record<string, string> {
  const errs: Record<string, string> = {};
  if (!c.name.trim()) errs.name = "Name is required";
  if (!c.designation.trim()) errs.designation = "Designation is required";
  if (!c.constituency.trim()) errs.constituency = "Constituency is required";
  if (!c.party.trim()) errs.party = "Party is required";
  if (!c.bioBrief.trim()) errs.bioBrief = "Brief bio is required";
  if (!c.phone.trim()) errs.phone = "Phone is required";
  if (!c.email.trim()) errs.email = "Email is required";
  else if (!EMAIL_RE.test(c.email.trim())) errs.email = "Invalid email address";

  const photo = c.photoUrl.trim();
  if (photo && !URL_RE.test(photo) && !photo.startsWith("/uploads/") && !photo.startsWith("/api/uploads/")) {
    errs.photoUrl = "Must be a valid URL or /uploads/ path";
  }
  (["facebook", "twitter", "instagram", "youtube"] as const).forEach((k) => {
    const v = c[k].trim();
    if (v && !URL_RE.test(v)) errs[k] = "Must be a valid http(s) URL";
  });
  return errs;
}

export default function AboutAdmin() {
  const [config, setConfig] = useState<AboutConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(true);
  const [previewLang, setPreviewLang] = useState<"en" | "ta">("en");
  // Snapshot of the last saved (or freshly loaded) config, used to detect
  // unsaved edits. Compared via JSON serialization for value equality.
  const [savedSnapshot, setSavedSnapshot] = useState<string>(() => JSON.stringify(DEFAULT_CONFIG));

  useEffect(() => {
    adminApi.getAbout()
      .then((d: AboutConfig | null) => {
        const next = d ? { ...DEFAULT_CONFIG, ...d } : DEFAULT_CONFIG;
        setConfig(next);
        setSavedSnapshot(JSON.stringify(next));
      })
      .catch(() => setError("Failed to load about config"))
      .finally(() => setLoading(false));
  }, []);

  const isDirty = useMemo(() => JSON.stringify(config) !== savedSnapshot, [config, savedSnapshot]);

  // Auto-clear the green "saved" toast after 3 seconds, with proper cleanup
  // so it can't fire after unmount or stack across rapid saves.
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 3000);
    return () => clearTimeout(t);
  }, [saved]);

  // Register with the surrounding admin shell so that switching sidebar
  // sections, browser back/forward, and reload/close all prompt before
  // discarding unsaved edits.
  useUnsavedChangesGuard(isDirty);

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
    const errs = validateConfig(config);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setError("Please fix the errors below before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await adminApi.updateAbout(config);
      // Refresh the dirty baseline so the unsaved-changes banner clears.
      setSavedSnapshot(JSON.stringify(config));
      setSaved(true);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const errClass = (k: string) => fieldErrors[k] ? "border-red-500 focus-visible:ring-red-500" : "";
  const errMsg = (k: string) => fieldErrors[k] ? <p className="text-xs text-red-500 mt-1">{fieldErrors[k]}</p> : null;

  if (loading) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold">About Page CMS</h2>
          <p className="text-sm text-muted-foreground">Edit the leader's bio, contact details, and highlights. Changes appear in the live preview as you type.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview((v) => !v)}
            data-testid="about-preview-toggle"
            className="gap-1.5"
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {showPreview ? "Hide preview" : "Show preview"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href="/about" target="_blank" className="gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Open public page
            </a>
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2 bg-primary hover:bg-primary/90">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saved ? "Saved!" : saving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </div>

      {isDirty && (
        <p
          data-testid="about-unsaved-banner"
          className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-md px-3 py-2 flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>You have unsaved changes. Don't forget to click <strong>Save Changes</strong> before leaving this page.</span>
        </p>
      )}
      {error && <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
      {saved && !isDirty && <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-md px-3 py-2">Changes saved successfully.</p>}

      <div className={showPreview ? "grid grid-cols-1 xl:grid-cols-2 gap-6 items-start" : ""}>
        <div className={`space-y-6 ${showPreview ? "" : "max-w-3xl"}`}>

      {/* Basic Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Full Name (English) *</Label>
              <Input value={config.name} onChange={e => set("name", e.target.value)} className={`mt-1 text-sm ${errClass("name")}`} />
              {errMsg("name")}
            </div>
            <div>
              <Label className="text-xs">பெயர் (Tamil)</Label>
              <Input value={config.nameTa} onChange={e => set("nameTa", e.target.value)} className="mt-1 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Designation *</Label>
              <Input value={config.designation} onChange={e => set("designation", e.target.value)} className={`mt-1 text-sm ${errClass("designation")}`} />
              {errMsg("designation")}
            </div>
            <div>
              <Label className="text-xs">பதவி (Tamil)</Label>
              <Input value={config.designationTa} onChange={e => set("designationTa", e.target.value)} className="mt-1 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Constituency *</Label>
              <Input value={config.constituency} onChange={e => set("constituency", e.target.value)} className={`mt-1 text-sm ${errClass("constituency")}`} />
              {errMsg("constituency")}
            </div>
            <div>
              <Label className="text-xs">தொகுதி (Tamil)</Label>
              <Input value={config.constituencyTa} onChange={e => set("constituencyTa", e.target.value)} className="mt-1 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Party *</Label>
              <Input value={config.party} onChange={e => set("party", e.target.value)} className={`mt-1 text-sm ${errClass("party")}`} />
              {errMsg("party")}
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
            <Input value={config.photoUrl} onChange={e => set("photoUrl", e.target.value)} placeholder="https://… or /uploads/…" className={`mt-1 text-sm ${errClass("photoUrl")}`} />
            {errMsg("photoUrl")}
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
            <Label className="text-xs">Brief Bio (English) * — shown on hero section</Label>
            <Textarea value={config.bioBrief} onChange={e => set("bioBrief", e.target.value)} rows={2} className={`mt-1 text-sm ${errClass("bioBrief")}`} />
            {errMsg("bioBrief")}
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
              <Label className="text-xs">Phone *</Label>
              <Input value={config.phone} onChange={e => set("phone", e.target.value)} className={`mt-1 text-sm ${errClass("phone")}`} />
              {errMsg("phone")}
            </div>
            <div>
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={config.email} onChange={e => set("email", e.target.value)} className={`mt-1 text-sm ${errClass("email")}`} />
              {errMsg("email")}
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
              <Input value={config.facebook} onChange={e => set("facebook", e.target.value)} placeholder="https://facebook.com/…" className={`mt-1 text-sm ${errClass("facebook")}`} />
              {errMsg("facebook")}
            </div>
            <div>
              <Label className="text-xs">Twitter/X URL</Label>
              <Input value={config.twitter} onChange={e => set("twitter", e.target.value)} placeholder="https://x.com/…" className={`mt-1 text-sm ${errClass("twitter")}`} />
              {errMsg("twitter")}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Instagram URL</Label>
              <Input value={config.instagram} onChange={e => set("instagram", e.target.value)} placeholder="https://instagram.com/…" className={`mt-1 text-sm ${errClass("instagram")}`} />
              {errMsg("instagram")}
            </div>
            <div>
              <Label className="text-xs">YouTube URL</Label>
              <Input value={config.youtube} onChange={e => set("youtube", e.target.value)} placeholder="https://youtube.com/…" className={`mt-1 text-sm ${errClass("youtube")}`} />
              {errMsg("youtube")}
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

        {showPreview && (
          <div className="xl:sticky xl:top-4 self-start" data-testid="about-preview-panel">
            <Card className="overflow-hidden">
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2 bg-muted/40 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Eye className="w-4 h-4 text-primary" /> Live preview
                </CardTitle>
                <div className="flex gap-1 rounded-md border bg-background p-0.5">
                  <button
                    type="button"
                    onClick={() => setPreviewLang("en")}
                    data-testid="about-preview-lang-en"
                    className={`px-2 py-0.5 text-xs rounded ${previewLang === "en" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewLang("ta")}
                    data-testid="about-preview-lang-ta"
                    className={`px-2 py-0.5 text-xs rounded ${previewLang === "ta" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    தமிழ்
                  </button>
                </div>
              </CardHeader>
              <CardContent className="p-4 max-h-[calc(100vh-12rem)] overflow-y-auto bg-background">
                <AboutView config={config} lang={previewLang} embedded />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
