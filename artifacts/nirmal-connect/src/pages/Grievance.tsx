import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { SectionHeader } from "@/components/SectionHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  CheckCircle, Search, FileText, Phone, MessageSquare,
  Copy, AlertCircle, TrendingUp, Clock, CheckCheck, Loader2,
  Paperclip, X, MapPin, Building2, FileVideo, FileAudio, FileImage, FileIcon as FileIconLucide,
} from "lucide-react";
import type { Language } from "@/lib/i18n";
import { submitGrievance, trackGrievance, getGrievanceHeatmap } from "@workspace/api-client-react";
import type { GrievanceTrackResponse } from "@workspace/api-client-react";
import { useWards } from "@/lib/useWards";
import GpsPicker, { type GpsValue } from "@/components/GpsPicker";
import ConstituencyCombobox from "@/components/ConstituencyCombobox";
import { TN_DISTRICTS } from "@/lib/tnConstituencies";

interface GrievanceProps { lang: Language; }

/** Submit grievance as multipart/form-data when files are attached. */
async function submitGrievanceWithFiles(
  data: {
    name: string; phone: string; category: string; description: string;
    address?: string | null; ward?: string | null; anonymous?: boolean;
    areaId?: number | null; pollingStationId?: number | null;
    latitude?: number | null; longitude?: number | null;
    complaintScope?: string; district?: string | null; constituency?: string | null;
  },
  files: File[]
): Promise<{ ticketNo: string }> {
  const fd = new globalThis.FormData();
  fd.append("name", data.name);
  fd.append("phone", data.phone);
  fd.append("category", data.category);
  fd.append("description", data.description);
  if (data.address) fd.append("address", data.address);
  if (data.ward) fd.append("ward", data.ward);
  if (data.areaId) fd.append("areaId", String(data.areaId));
  if (data.pollingStationId) fd.append("pollingStationId", String(data.pollingStationId));
  if (data.latitude != null && data.longitude != null) {
    fd.append("latitude", String(data.latitude));
    fd.append("longitude", String(data.longitude));
  }
  fd.append("anonymous", String(data.anonymous ?? false));
  if (data.complaintScope) fd.append("complaintScope", data.complaintScope);
  if (data.district) fd.append("district", data.district);
  if (data.constituency) fd.append("constituency", data.constituency);
  files.forEach((f) => fd.append("attachments", f));
  const res = await fetch("/api/grievances/submit", { method: "POST", body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Submit failed");
  }
  return res.json() as Promise<{ ticketNo: string }>;
}

const CATEGORIES = [
  "Suggestion", "Appreciation", "Service Request",
  "Roads", "Water Supply", "EB / Electricity Issues", "Sewage",
  "Healthcare", "Education", "Women Safety",
  "Ration", "Transport", "Pension", "Housing",
  "Agriculture", "Employment", "Others",
];
const CATEGORIES_TA = [
  "ஆலோசனை", "பாராட்டு", "சேவை கோரிக்கை",
  "சாலை", "குடிநீர்", "மின்சாரம்", "கழிவுநீர்",
  "சுகாதாரம்", "கல்வி", "பெண் பாதுகாப்பு",
  "ரேஷன்", "போக்குவரத்து", "ஓய்வூதியம்", "வீட்டுவசதி",
  "விவசாயம்", "வேலைவாய்ப்பு", "பிறவை",
];

const STATUS_FLOW = ["Submitted", "Under Review", "Assigned", "In Progress", "Resolved", "Closed"];
const STATUS_COLORS: Record<string, string> = {
  "Submitted": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  "Under Review": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300",
  "Assigned": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  "In Progress": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  "Resolved": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  "Closed": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};
const STATUS_TA: Record<string, string> = {
  "Submitted": "பதிவு செய்யப்பட்டது",
  "Under Review": "ஆய்வில் உள்ளது",
  "Assigned": "ஒதுக்கப்பட்டது",
  "In Progress": "நடவடிக்கையில் உள்ளது",
  "Resolved": "தீர்க்கப்பட்டது",
  "Closed": "மூடப்பட்டது",
};

const CHART_COLORS = ["#CC0000", "#e53e3e", "#fc8181", "#feb2b2", "#fed7d7", "#fff5f5",
  "#FFD700", "#f6c200", "#b7791f", "#975a16", "#1a365d", "#2c7a7b", "#276749", "#553c9a", "#702459"];

const schema = z.object({
  name: z.string().min(2, "Name required"),
  phone: z.string().min(7, "Valid phone required"),
  category: z.string().min(1, "Category required"),
  description: z.string().min(20, "Provide at least 20 characters"),
  address: z.string().optional(),
  ward: z.string().optional(),
  wardId: z.number().int().positive().optional(),
  areaId: z.number().int().positive().optional(),
  pollingStationId: z.number().int().positive().optional(),
  anonymous: z.boolean().optional(),
  complaintScope: z.enum(["constituency", "statewide"]).default("constituency"),
  district: z.string().optional(),
  constituencyName: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

function fileIcon(file: File) {
  const t = file.type.toLowerCase();
  const n = file.name.toLowerCase();
  if (t.startsWith("video/") || /\.(mp4|mov|avi|webm|mkv)$/.test(n))
    return <FileVideo className="w-3 h-3 text-purple-500 shrink-0" />;
  if (t.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac)$/.test(n))
    return <FileAudio className="w-3 h-3 text-blue-500 shrink-0" />;
  if (t.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|svg)$/.test(n))
    return <FileImage className="w-3 h-3 text-green-500 shrink-0" />;
  return <FileIconLucide className="w-3 h-3 text-orange-500 shrink-0" />;
}

interface AreaOption { id: number; name: string; nameTa?: string | null }
interface BoothOption { id: number; boothNo: string; name: string }

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
async function fetchAreasByWard(wardId: number): Promise<AreaOption[]> {
  const res = await fetch(`${BASE}/api/wards/${wardId}/areas`);
  if (!res.ok) return [];
  return res.json() as Promise<AreaOption[]>;
}
async function fetchBoothsByWard(wardId: number): Promise<BoothOption[]> {
  const res = await fetch(`${BASE}/api/wards/${wardId}/polling-stations`);
  if (!res.ok) return [];
  return res.json() as Promise<BoothOption[]>;
}

function StatusTimeline({ status, lang }: { status: string; lang: Language }) {
  const idx = STATUS_FLOW.indexOf(status);
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {STATUS_FLOW.map((s, i) => (
          <div key={s} className={`h-2 flex-1 rounded-full transition-colors ${i <= idx ? "bg-primary" : "bg-muted"}`} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{lang === "ta" ? "பதிவு" : "Filed"}</span>
        <span>{lang === "ta" ? "தீர்வு" : "Resolved"}</span>
      </div>
    </div>
  );
}

function TrackResult({ data, lang, ticketNo }: { data: GrievanceTrackResponse; lang: Language; ticketNo: string }) {
  const statusLabel = lang === "ta" ? (STATUS_TA[data.status] ?? data.status) : data.status;
  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-xl space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-mono font-bold text-primary">{ticketNo}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${STATUS_COLORS[data.status] ?? "bg-muted text-muted-foreground"}`}>
            {statusLabel}
          </span>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p><span className="font-medium">{lang === "ta" ? "வகை:" : "Category:"}</span> {data.category}</p>
          {data.ward && <p><span className="font-medium">{lang === "ta" ? "வார்டு:" : "Ward:"}</span> {data.ward}</p>}
          <p><span className="font-medium">{lang === "ta" ? "தொகுதி:" : "Constituency:"}</span> {data.constituency}</p>
          <p className="text-xs">{lang === "ta" ? "பதிவு:" : "Filed:"} {new Date(data.createdAt).toLocaleDateString("ta-IN")}</p>
        </div>
        <StatusTimeline status={data.status} lang={lang} />
      </div>

      {data.statusLog.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{lang === "ta" ? "நிலை வரலாறு" : "Status Timeline"}</h4>
          <div className="space-y-2">
            {data.statusLog.map((log) => (
              <div key={log.id} className="flex gap-3 text-sm">
                <div className="flex flex-col items-center">
                  <div className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                  <div className="w-px flex-1 bg-border mt-1" />
                </div>
                <div className="pb-3">
                  <p className="font-medium">
                    {lang === "ta" ? (STATUS_TA[log.toStatus] ?? log.toStatus) : log.toStatus}
                  </p>
                  {log.note && <p className="text-muted-foreground text-xs">{log.note}</p>}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {log.changedByName} · {new Date(log.createdAt).toLocaleString("ta-IN")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.remarks.filter((r) => r.isPublic).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">{lang === "ta" ? "அலுவலக குறிப்புகள்" : "Office Remarks"}</h4>
          {data.remarks.filter((r) => r.isPublic).map((r) => (
            <div key={r.id} className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p>{r.remark}</p>
              <p className="text-xs text-muted-foreground">{r.authorName} · {new Date(r.createdAt).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Grievance({ lang }: GrievanceProps) {
  const [submitted, setSubmitted] = useState(false);
  const [ticketNo, setTicketNo] = useState("");
  const [trackInput, setTrackInput] = useState("");
  const [trackData, setTrackData] = useState<GrievanceTrackResponse | null>(null);
  const [trackError, setTrackError] = useState("");
  const [copied, setCopied] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [gps, setGps] = useState<GpsValue | null>(null);
  const { data: wardList = [] } = useWards();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", category: "", description: "", address: "", ward: "", anonymous: false, complaintScope: "constituency", district: "", constituencyName: "" },
  });

  // Resolve currently-chosen ward id from its name (the form stores ward as
  // a string for backwards compat) so we can drive the cascading queries.
  const watchedWard = form.watch("ward");
  const watchedScope = form.watch("complaintScope");
  const watchedDistrict = form.watch("district");
  const selectedWardId = wardList.find((w) => w.name === watchedWard)?.id ?? null;

  const { data: areaOptions = [] } = useQuery({
    queryKey: ["ward-areas", selectedWardId],
    queryFn: () => (selectedWardId ? fetchAreasByWard(selectedWardId) : Promise.resolve([])),
    enabled: !!selectedWardId,
    staleTime: 5 * 60_000,
  });
  const { data: boothOptions = [] } = useQuery({
    queryKey: ["ward-booths", selectedWardId],
    queryFn: () => (selectedWardId ? fetchBoothsByWard(selectedWardId) : Promise.resolve([])),
    enabled: !!selectedWardId,
    staleTime: 5 * 60_000,
  });

  const submitMutation = useMutation({
    mutationFn: (data: FormData) => {
      const isStatewide = data.complaintScope === "statewide";
      const payload = {
        name: data.name,
        phone: data.phone,
        category: data.category,
        description: data.description,
        address: data.address || null,
        ward: isStatewide ? null : (data.ward || null),
        areaId: isStatewide ? null : (data.areaId ?? null),
        pollingStationId: isStatewide ? null : (data.pollingStationId ?? null),
        latitude: gps?.lat ?? null,
        longitude: gps?.lng ?? null,
        anonymous: data.anonymous ?? false,
        complaintScope: data.complaintScope ?? "constituency",
        district: isStatewide ? (data.district || null) : null,
        constituency: isStatewide ? (data.constituencyName || null) : "Tirupparankundram",
      };
      if (attachedFiles.length > 0) {
        return submitGrievanceWithFiles(payload, attachedFiles);
      }
      return submitGrievance({ ...payload, ward: payload.ward ?? undefined, constituency: payload.constituency ?? undefined });
    },
    onSuccess: (result) => {
      setTicketNo(result.ticketNo);
      setSubmitted(true);
      setAttachedFiles([]);
      setGps(null);
    },
    onError: () => {
      form.setError("root", { message: lang === "ta" ? "சேவை தடைபட்டது. மீண்டும் முயற்சிக்கவும்." : "Service error. Please try again." });
    },
  });

  const { data: heatmapData } = useQuery({
    queryKey: ["grievance-heatmap"],
    queryFn: () => getGrievanceHeatmap(),
    staleTime: 60_000,
  });

  function onSubmit(values: FormData) {
    submitMutation.mutate(values);
  }

  async function handleTrack() {
    const ticket = trackInput.trim();
    if (!ticket) return;
    setIsTracking(true);
    setTrackError("");
    setTrackData(null);
    try {
      const result = await trackGrievance(ticket);
      setTrackData(result);
    } catch {
      setTrackError(lang === "ta" ? "குறிப்பு எண் கிடைக்கவில்லை." : "Reference not found. Check the number and try again.");
    } finally {
      setIsTracking(false);
    }
  }

  function copyTicket() {
    navigator.clipboard.writeText(ticketNo).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const resolvedPct = heatmapData
    ? Math.round((heatmapData.resolved / Math.max(heatmapData.total, 1)) * 100)
    : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-12 space-y-12">
      <SectionHeader
        title={lang === "ta" ? "மக்கள் கருத்து மையம்" : "Public Feedback Portal"}
        subtitle={lang === "ta"
          ? "உங்கள் கருத்து, ஆலோசனை அல்லது பிரச்சினைகளை நேரடியாக தெரிவியுங்கள்"
          : "Share your feedback, suggestions or issues directly with MLA Nirmal Kumar's office"}
      />

      <Tabs defaultValue="submit" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3 max-w-lg mx-auto">
          <TabsTrigger value="submit" data-testid="tab-submit">
            <FileText className="w-4 h-4 mr-2" />
            {lang === "ta" ? "கருத்து அனுப்பு" : "Submit"}
          </TabsTrigger>
          <TabsTrigger value="track" data-testid="tab-track">
            <Search className="w-4 h-4 mr-2" />
            {lang === "ta" ? "நிலை அறிய" : "Track"}
          </TabsTrigger>
          <TabsTrigger value="stats" data-testid="tab-stats">
            <TrendingUp className="w-4 h-4 mr-2" />
            {lang === "ta" ? "புள்ளிவிவரம்" : "Stats"}
          </TabsTrigger>
        </TabsList>

        {/* ── Submit Tab ── */}
        <TabsContent value="submit">
          {submitted ? (
            <div className="text-center py-16 space-y-5 max-w-sm mx-auto">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold">
                {lang === "ta" ? "கருத்து பதிவு செய்யப்பட்டது!" : "Feedback Submitted!"}
              </h3>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 space-y-2">
                <p className="text-xs text-muted-foreground">{lang === "ta" ? "உங்கள் குறிப்பு எண்" : "Your Reference Number"}</p>
                <p className="text-2xl font-bold text-primary font-mono tracking-wider">{ticketNo}</p>
                <Button variant="ghost" size="sm" onClick={copyTicket} className="gap-1.5">
                  {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? (lang === "ta" ? "நகலெடுக்கப்பட்டது" : "Copied!") : (lang === "ta" ? "நகலெடு" : "Copy")}
                </Button>
              </div>
              <p className="text-muted-foreground text-sm">
                {lang === "ta"
                  ? "இந்த எண்ணை வைத்து Track தாவலில் நிலையை கண்காணியுங்கள்."
                  : "Use this number in the Track tab to follow your feedback status."}
              </p>
              <div className="flex gap-3 justify-center flex-wrap">
                <Button onClick={() => { setSubmitted(false); form.reset(); }} variant="outline">
                  {lang === "ta" ? "மற்றொரு கருத்து" : "Submit Another"}
                </Button>
                <a
                  href={`https://wa.me/919876543210?text=${encodeURIComponent(`My feedback reference: ${ticketNo}`)}`}
                  target="_blank" rel="noopener noreferrer"
                >
                  <Button className="bg-[#25D366] hover:bg-[#20b558] text-white gap-2">
                    <MessageSquare className="w-4 h-4" />
                    {lang === "ta" ? "WhatsApp மூலம் பகிர்" : "Share via WhatsApp"}
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle>{lang === "ta" ? "கருத்து படிவம்" : "Feedback Form"}</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                    {/* Complaint Scope Toggle */}
                    <FormField control={form.control} name="complaintScope" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{lang === "ta" ? "கருத்து வகை" : "Feedback Type"} *</FormLabel>
                        <div className="grid grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              field.onChange("constituency");
                              form.setValue("district", "");
                              form.setValue("constituencyName", "");
                            }}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                              field.value === "constituency"
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/40"
                            }`}
                          >
                            <MapPin className={`w-4 h-4 shrink-0 ${field.value === "constituency" ? "text-primary" : "text-muted-foreground"}`} />
                            <div>
                              <p className={`text-sm font-semibold ${field.value === "constituency" ? "text-primary" : ""}`}>
                                {lang === "ta" ? "தொகுதி புகார்" : "Constituency"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {lang === "ta" ? "திருப்பரங்குன்றம்" : "Tirupparankundram"}
                              </p>
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              field.onChange("statewide");
                              form.setValue("ward", "");
                              form.setValue("areaId", undefined);
                              form.setValue("pollingStationId", undefined);
                            }}
                            className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                              field.value === "statewide"
                                ? "border-orange-500 bg-orange-50 dark:bg-orange-950/20"
                                : "border-border hover:border-orange-300"
                            }`}
                          >
                            <Building2 className={`w-4 h-4 shrink-0 ${field.value === "statewide" ? "text-orange-500" : "text-muted-foreground"}`} />
                            <div>
                              <p className={`text-sm font-semibold ${field.value === "statewide" ? "text-orange-600" : ""}`}>
                                {lang === "ta" ? "அமைச்சர் அலுவலகம்" : "Ministerial"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {lang === "ta" ? "தமிழ்நாடு முழுவதும்" : "Statewide / TN"}
                              </p>
                            </div>
                          </button>
                        </div>
                      </FormItem>
                    )} />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "ta" ? "பெயர்" : "Your Name"} *</FormLabel>
                          <FormControl><Input data-testid="grievance-name" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "ta" ? "தொலைபேசி" : "Phone Number"} *</FormLabel>
                          <FormControl><Input data-testid="grievance-phone" type="tel" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>

                    <FormField control={form.control} name="category" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{lang === "ta" ? "கருத்து வகை" : "Feedback Category"} *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="grievance-category">
                              <SelectValue placeholder={lang === "ta" ? "வகையை தேர்ந்தெடுங்கள்" : "Select category"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {CATEGORIES.map((cat, i) => (
                              <SelectItem key={cat} value={cat}>
                                {lang === "ta" ? CATEGORIES_TA[i] : cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* Constituency scope: ward / area / booth pickers */}
                    {watchedScope !== "statewide" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="ward" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "ta" ? "வார்டு / பகுதி" : "Ward / Area"}</FormLabel>
                          <Select
                            onValueChange={(v) => {
                              field.onChange(v);
                              // Reset cascaded selections whenever the parent ward changes
                              form.setValue("areaId", undefined);
                              form.setValue("pollingStationId", undefined);
                            }}
                            value={field.value || ""}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="grievance-ward">
                                <SelectValue placeholder={
                                  wardList.length === 0
                                    ? (lang === "ta" ? "வார்டுகள் இல்லை" : "No wards configured")
                                    : (lang === "ta" ? "வார்டை தேர்ந்தெடுங்கள்" : "Select a ward")
                                } />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {wardList.map((w) => (
                                <SelectItem key={w.id} value={w.name}>
                                  {w.name}{w.area ? ` — ${w.area}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="address" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "ta" ? "முகவரி" : "Address"}</FormLabel>
                          <FormControl><Input data-testid="grievance-address" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    )}

                    {/* Statewide scope: district dropdown + constituency typeahead */}
                    {watchedScope === "statewide" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="district" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "ta" ? "மாவட்டம்" : "District"}</FormLabel>
                          <Select
                            onValueChange={(v) => {
                              field.onChange(v);
                              form.setValue("constituencyName", "");
                            }}
                            value={field.value || ""}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder={lang === "ta" ? "மாவட்டம் தேர்வு" : "Select district"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {TN_DISTRICTS.map((d) => (
                                <SelectItem key={d} value={d}>{d}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="constituencyName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "ta" ? "சட்டமன்றத் தொகுதி" : "Constituency"}</FormLabel>
                          <FormControl>
                            <ConstituencyCombobox
                              value={field.value ?? ""}
                              onChange={field.onChange}
                              lang={lang}
                              filterByDistrict={watchedDistrict || undefined}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    )}

                    {/* Cascading area + polling-station — only when a ward is chosen (constituency scope) */}
                    {watchedScope !== "statewide" && selectedWardId && (areaOptions.length > 0 || boothOptions.length > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {areaOptions.length > 0 && (
                          <FormField control={form.control} name="areaId" render={({ field }) => (
                            <FormItem>
                              <FormLabel>{lang === "ta" ? "பகுதி (விரும்பினால்)" : "Area (optional)"}</FormLabel>
                              <Select
                                onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                                value={field.value ? String(field.value) : "none"}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="grievance-area">
                                    <SelectValue placeholder={lang === "ta" ? "பகுதி தேர்வு" : "Select area"} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">{lang === "ta" ? "—" : "—"}</SelectItem>
                                  {areaOptions.map((a) => (
                                    <SelectItem key={a.id} value={String(a.id)}>
                                      {lang === "ta" && a.nameTa ? a.nameTa : a.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                        )}
                        {boothOptions.length > 0 && (
                          <FormField control={form.control} name="pollingStationId" render={({ field }) => (
                            <FormItem>
                              <FormLabel>{lang === "ta" ? "வாக்குச்சாவடி (விரும்பினால்)" : "Polling Booth (optional)"}</FormLabel>
                              <Select
                                onValueChange={(v) => field.onChange(v === "none" ? undefined : Number(v))}
                                value={field.value ? String(field.value) : "none"}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid="grievance-booth">
                                    <SelectValue placeholder={lang === "ta" ? "சாவடி தேர்வு" : "Select booth"} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="none">{lang === "ta" ? "—" : "—"}</SelectItem>
                                  {boothOptions.map((b) => (
                                    <SelectItem key={b.id} value={String(b.id)}>
                                      #{b.boothNo} — {b.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )} />
                        )}
                      </div>
                    )}

                    <FormField control={form.control} name="description" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{lang === "ta" ? "உங்கள் கருத்து" : "Your Feedback"} *</FormLabel>
                        <FormControl>
                          <Textarea
                            data-testid="grievance-description"
                            rows={4}
                            placeholder={lang === "ta" ? "உங்கள் கருத்து அல்லது பிரச்சினையை விரிவாக விவரிக்கவும்..." : "Share your feedback, suggestion or describe the issue in detail..."}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="anonymous" render={({ field }) => (
                      <FormItem className="flex items-center gap-3 space-y-0">
                        <FormControl>
                          <Checkbox
                            data-testid="grievance-anonymous"
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                        <FormLabel className="font-normal cursor-pointer">
                          {lang === "ta" ? "அநாமதேய புகார் (பெயர் மறைக்கப்படும்)" : "Submit anonymously (name hidden from public)"}
                        </FormLabel>
                      </FormItem>
                    )} />

                    {/* Photo attachments */}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">
                        {lang === "ta" ? "புகைப்படங்கள் (விரும்பினால், அதிகபட்சம் 3)" : "Photos (optional, up to 3)"}
                      </p>
                      <label className="flex items-center gap-2 cursor-pointer border border-dashed rounded-lg p-3 hover:bg-muted/40 transition-colors">
                        <Paperclip className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground">
                          {lang === "ta" ? "படங்களை தேர்வு செய்யவும்" : "Choose images"}
                        </span>
                        <input
                          data-testid="grievance-attachments"
                          type="file"
                          accept="image/*,.pdf"
                          multiple
                          className="sr-only"
                          onChange={(e) => {
                            const picked = Array.from(e.target.files ?? []).slice(0, 3);
                            setAttachedFiles(picked);
                          }}
                        />
                      </label>
                      {attachedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {attachedFiles.map((f, i) => (
                            <span key={i} className="flex items-center gap-1.5 text-xs bg-muted rounded-full px-3 py-1">
                              <Paperclip className="w-3 h-3" />{f.name}
                              <button
                                type="button"
                                onClick={() => setAttachedFiles((prev) => prev.filter((_, j) => j !== i))}
                                className="ml-1 hover:text-destructive"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <GpsPicker value={gps} onChange={setGps} lang={lang} />

                    {form.formState.errors.root && (
                      <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg p-3">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {form.formState.errors.root.message}
                      </div>
                    )}

                    <Button
                      data-testid="submit-grievance-btn"
                      type="submit"
                      disabled={submitMutation.isPending}
                      className="w-full bg-primary hover:bg-primary/90 text-white"
                    >
                      {submitMutation.isPending
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{lang === "ta" ? "அனுப்புகிறது..." : "Submitting..."}</>
                        : lang === "ta" ? "கருத்து அனுப்பு" : "Submit Feedback"
                      }
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Track Tab ── */}
        <TabsContent value="track">
          <div className="max-w-lg mx-auto space-y-5">
            <Card>
              <CardHeader><CardTitle>{lang === "ta" ? "கருத்து நிலை அறிய" : "Track Your Feedback"}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    data-testid="track-ticket-input"
                    placeholder={lang === "ta" ? "குறிப்பு எண் (GRV-...)" : "Reference number (GRV-...)"}
                    value={trackInput}
                    onChange={(e) => setTrackInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleTrack()}
                  />
                  <Button
                    data-testid="track-submit"
                    onClick={handleTrack}
                    disabled={isTracking || !trackInput.trim()}
                    className="bg-primary text-white hover:bg-primary/90 shrink-0"
                  >
                    {isTracking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>

                {trackError && (
                  <div className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {trackError}
                  </div>
                )}

                {trackData && <TrackResult data={trackData} lang={lang} ticketNo={trackInput.trim()} />}
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-5 space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  {lang === "ta" ? "நேரடி தொடர்பு" : "Direct Contact"}
                </h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p className="flex items-center gap-2"><Clock className="w-3.5 h-3.5" />
                    {lang === "ta" ? "திங்கள் – சனி, காலை 9 – மாலை 6" : "Mon – Sat, 9 AM – 6 PM"}
                  </p>
                  <a
                    href="https://wa.me/919876543210"
                    target="_blank" rel="noopener noreferrer"
                    className="text-primary font-medium hover:underline flex items-center gap-1"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    WhatsApp: +91 98765 43210
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── Stats / Heatmap Tab ── */}
        <TabsContent value="stats">
          <div className="space-y-6">
            {/* Summary cards */}
            {heatmapData ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {[
                    {
                      label: lang === "ta" ? "மொத்த கருத்துகள்" : "Total Submissions",
                      value: heatmapData.total,
                      icon: <FileText className="w-5 h-5 text-primary" />,
                    },
                    {
                      label: lang === "ta" ? "தீர்க்கப்பட்டவை" : "Resolved",
                      value: heatmapData.resolved,
                      icon: <CheckCircle className="w-5 h-5 text-green-600" />,
                    },
                    {
                      label: lang === "ta" ? "நிலுவையில் உள்ளவை" : "Pending",
                      value: heatmapData.total - heatmapData.resolved,
                      icon: <Clock className="w-5 h-5 text-yellow-600" />,
                    },
                    {
                      label: lang === "ta" ? "தீர்வு விகிதம்" : "Resolution Rate",
                      value: `${resolvedPct}%`,
                      icon: <TrendingUp className="w-5 h-5 text-blue-600" />,
                    },
                  ].map(({ label, value, icon }) => (
                    <Card key={label}>
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">{icon}</div>
                        <div>
                          <p className="text-2xl font-bold">{value}</p>
                          <p className="text-xs text-muted-foreground">{label}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {heatmapData.byCategory.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {lang === "ta" ? "வகை வாரியான கருத்துகள்" : "Feedback by Category"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={heatmapData.byCategory} margin={{ top: 5, right: 10, left: 0, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                          <XAxis
                            dataKey="category"
                            tick={{ fontSize: 11 }}
                            angle={-40}
                            textAnchor="end"
                            interval={0}
                          />
                          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                            formatter={(value) => [value, lang === "ta" ? "கருத்துகள்" : "Submissions"]}
                          />
                          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                            {heatmapData.byCategory.map((_entry, i) => (
                              <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {heatmapData.byWard.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">
                        {lang === "ta" ? "வார்டு வாரியான கருத்துகள்" : "Feedback by Ward"}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {heatmapData.byWard.map(({ ward, count: cnt }, i) => (
                          <div key={ward} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                              <span className="text-sm font-medium truncate">{ward}</span>
                            </div>
                            <Badge variant="secondary">{cnt}</Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {heatmapData.total === 0 && (
                  <div className="text-center py-16 text-muted-foreground">
                    <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p>{lang === "ta" ? "இன்னும் கருத்துகள் இல்லை." : "No feedback submitted yet."}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
