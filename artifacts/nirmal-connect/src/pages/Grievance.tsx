import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { SectionHeader } from "@/components/SectionHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, Search, FileText, Phone, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Language } from "@/lib/i18n";

interface GrievanceProps { lang: Language; }

const CATEGORIES = [
  "Roads", "Water Supply", "EB / Electricity Issues", "Sewage",
  "Healthcare", "Education", "Women Safety", "Corruption",
  "Ration", "Transport", "Pension", "Housing",
  "Agriculture", "Employment", "Others",
];

const CATEGORIES_TA = [
  "சாலை", "குடிநீர்", "மின்சாரம்", "கழிவுநீர்",
  "சுகாதாரம்", "கல்வி", "பெண் பாதுகாப்பு", "ஊழல்",
  "ரேஷன்", "போக்குவரத்து", "ஓய்வூதியம்", "வீட்டுவசதி",
  "விவசாயம்", "வேலைவாய்ப்பு", "பிறவை",
];

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  phone: z.string().min(10, "Valid phone required"),
  category: z.string().min(1, "Category required"),
  description: z.string().min(20, "Please provide at least 20 characters"),
  address: z.string().optional(),
  ward: z.string().optional(),
  anonymous: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

export default function Grievance({ lang }: GrievanceProps) {
  const [submitted, setSubmitted] = useState(false);
  const [ticketNo, setTicketNo] = useState("");
  const [trackInput, setTrackInput] = useState("");
  const [trackResult, setTrackResult] = useState<null | { status: string; category: string }>(null);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", phone: "", category: "", description: "", address: "", ward: "" },
  });

  function onSubmit(values: FormData) {
    const ticket = `GRV-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
    setTicketNo(ticket);
    setSubmitted(true);
  }

  function handleTrack() {
    if (trackInput.startsWith("GRV-")) {
      setTrackResult({ status: "Under Review", category: "General" });
    } else {
      setTrackResult(null);
    }
  }

  const statusColors: Record<string, string> = {
    "Submitted": "bg-blue-100 text-blue-700",
    "Under Review": "bg-yellow-100 text-yellow-700",
    "Assigned": "bg-purple-100 text-purple-700",
    "In Progress": "bg-orange-100 text-orange-700",
    "Resolved": "bg-green-100 text-green-700",
    "Closed": "bg-gray-100 text-gray-700",
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "மக்கள் புகார் மையம்" : "Public Grievance Portal"}
        subtitle={lang === "ta"
          ? "உங்கள் பகுதியில் உள்ள பிரச்சினைகளை நேரடியாக தெரிவியுங்கள்"
          : "Submit complaints directly to MLA Nirmal Kumar's office and track resolution progress"}
      />

      <Tabs defaultValue="submit" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 max-w-md mx-auto">
          <TabsTrigger value="submit" data-testid="tab-submit">
            <FileText className="w-4 h-4 mr-2" />
            {lang === "ta" ? "புகார் அனுப்பு" : "Submit Grievance"}
          </TabsTrigger>
          <TabsTrigger value="track" data-testid="tab-track">
            <Search className="w-4 h-4 mr-2" />
            {lang === "ta" ? "நிலை அறிய" : "Track Status"}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="submit">
          {submitted ? (
            <div className="text-center py-16 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold">
                {lang === "ta" ? "புகார் பதிவு செய்யப்பட்டது!" : "Grievance Submitted Successfully!"}
              </h3>
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 inline-block">
                <p className="text-xs text-muted-foreground mb-1">{lang === "ta" ? "உங்கள் புகார் எண்" : "Your Ticket Number"}</p>
                <p className="text-2xl font-bold text-primary">{ticketNo}</p>
              </div>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                {lang === "ta"
                  ? "இந்த எண்ணை வைத்து நிலையை கண்காணியுங்கள். விரைவில் தொடர்பு கொள்வோம்."
                  : "Save this ticket number to track your grievance status. Our office will contact you shortly."}
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => { setSubmitted(false); form.reset(); }} variant="outline">
                  {lang === "ta" ? "மற்றொரு புகார்" : "Submit Another"}
                </Button>
                <a href={`https://wa.me/919876543210?text=My+grievance+ticket+number+is+${ticketNo}`} target="_blank" rel="noopener noreferrer">
                  <Button className="bg-[#25D366] hover:bg-[#20b558] text-white">
                    <MessageSquare className="w-4 h-4 mr-2" />
                    {lang === "ta" ? "WhatsApp மூலம் அனுப்பு" : "Share via WhatsApp"}
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle>{lang === "ta" ? "புகார் படிவம்" : "Grievance Form"}</CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                        <FormLabel>{lang === "ta" ? "புகார் வகை" : "Complaint Category"} *</FormLabel>
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="ward" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "ta" ? "வார்டு / பகுதி" : "Ward / Area"}</FormLabel>
                          <FormControl><Input data-testid="grievance-ward" {...field} /></FormControl>
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
                    <FormField control={form.control} name="description" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{lang === "ta" ? "புகார் விவரம்" : "Complaint Details"} *</FormLabel>
                        <FormControl>
                          <Textarea
                            data-testid="grievance-description"
                            rows={4}
                            placeholder={lang === "ta" ? "பிரச்சினையை விரிவாக விவரிக்கவும்..." : "Describe the issue in detail..."}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button
                      data-testid="submit-grievance-btn"
                      type="submit"
                      className="w-full bg-primary hover:bg-primary/90 text-white"
                    >
                      {lang === "ta" ? "புகார் அனுப்பு" : "Submit Grievance"}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="track">
          <div className="max-w-lg mx-auto space-y-6">
            <Card>
              <CardHeader><CardTitle>{lang === "ta" ? "புகார் நிலை" : "Track Your Grievance"}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    data-testid="track-ticket-input"
                    placeholder={lang === "ta" ? "புகார் எண் உள்ளிடுங்கள் (GRV-...)" : "Enter ticket number (GRV-...)"}
                    value={trackInput}
                    onChange={(e) => setTrackInput(e.target.value)}
                  />
                  <Button data-testid="track-submit" onClick={handleTrack} className="bg-primary text-white hover:bg-primary/90">
                    <Search className="w-4 h-4" />
                  </Button>
                </div>
                {trackResult ? (
                  <div className="p-4 border rounded-lg space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-semibold">{trackInput}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[trackResult.status] ?? "bg-gray-100 text-gray-700"}`}>
                        {trackResult.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">Category: {trackResult.category}</p>
                    <div className="flex gap-1 flex-wrap">
                      {["Submitted", "Under Review", "Assigned", "In Progress", "Resolved", "Closed"].map((s) => (
                        <div
                          key={s}
                          className={`h-1.5 flex-1 rounded-full ${
                            ["Submitted", "Under Review"].includes(trackResult.status) && s === "Submitted" ? "bg-primary" :
                            trackResult.status === "Under Review" && s === "Under Review" ? "bg-primary" :
                            "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {lang === "ta" ? "உங்கள் புகார் நடவடிக்கையில் உள்ளது." : "Your grievance is being processed by our team."}
                    </p>
                  </div>
                ) : trackInput && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {lang === "ta" ? "புகார் எண் கிடைக்கவில்லை." : "Ticket not found. Please check the number and try again."}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="p-5">
                <h4 className="font-semibold mb-3 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  {lang === "ta" ? "நேரடி தொடர்பு" : "Direct Contact"}
                </h4>
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    {lang === "ta" ? "அலுவலக நேரம்: திங்கள் - சனி, காலை 9 - மாலை 6" : "Office hours: Mon–Sat, 9 AM – 6 PM"}
                  </p>
                  <a href="https://wa.me/919876543210" className="text-primary font-medium hover:underline flex items-center gap-1">
                    <MessageSquare className="w-3.5 h-3.5" />
                    WhatsApp: +91 98765 43210
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
