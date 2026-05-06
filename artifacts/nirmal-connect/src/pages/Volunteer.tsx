import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { SectionHeader } from "@/components/SectionHeader";
import { CheckCircle, Users, Heart, Star } from "lucide-react";
import { useRegisterVolunteer } from "@workspace/api-client-react";
import type { Language } from "@/lib/i18n";

interface VolunteerProps { lang: Language; }

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  phone: z.string().min(10, "Valid phone number required"),
  email: z.string().email("Valid email required").optional().or(z.literal("")),
  ward: z.string().optional(),
  constituency: z.string().min(1, "Constituency is required"),
  skills: z.string().optional(),
  message: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function Volunteer({ lang }: VolunteerProps) {
  const [submitted, setSubmitted] = useState(false);
  const mutation = useRegisterVolunteer();

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "", phone: "", email: "", ward: "",
      constituency: "Tirupparankundram", skills: "", message: "",
    },
  });

  function onSubmit(values: FormData) {
    mutation.mutate(
      { data: { ...values, email: values.email || undefined } },
      { onSuccess: () => setSubmitted(true) }
    );
  }

  const benefits = [
    { icon: Users, text: lang === "ta" ? "மக்களுடன் நேரடி தொடர்பு" : "Direct engagement with the community" },
    { icon: Heart, text: lang === "ta" ? "சமூக சேவை வாய்ப்புகள்" : "Opportunities to serve the public" },
    { icon: Star, text: lang === "ta" ? "தலைமை திறன் வளர்ச்சி" : "Leadership development opportunities" },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <SectionHeader
        title={lang === "ta" ? "தன்னார்வலராக பதிவு செய்யுங்கள்" : "Volunteer Registration"}
        subtitle={lang === "ta"
          ? "திருப்பரங்குன்றத்தின் வளர்ச்சிக்கு பங்காற்றுங்கள்"
          : "Join our growing team of volunteers dedicated to serving Tirupparankundram"}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Benefits */}
        <div className="space-y-6">
          <h3 className="font-semibold text-lg">
            {lang === "ta" ? "ஏன் தன்னார்வலராக இணைய வேண்டும்?" : "Why Volunteer?"}
          </h3>
          {benefits.map((b, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <b.icon className="w-5 h-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground mt-1.5">{b.text}</p>
            </div>
          ))}
          <div className="p-4 bg-primary/5 rounded-xl border border-primary/20 mt-6">
            <p className="text-sm font-medium text-primary">
              {lang === "ta" ? "நீங்கள் மாற்றத்தின் ஒரு பகுதியாகலாம்!" : "Be part of the change!"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {lang === "ta"
                ? "உங்கள் சிறு பங்களிப்பு பெரும் மாற்றத்தை ஏற்படுத்தும்"
                : "Every contribution makes a difference in our constituency"}
            </p>
          </div>
        </div>

        {/* Form */}
        <div className="lg:col-span-2">
          {submitted ? (
            <div className="text-center py-16 space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-bold">
                {lang === "ta" ? "வெற்றிகரமாக பதிவு செய்யப்பட்டது!" : "Registration Successful!"}
              </h3>
              <p className="text-muted-foreground max-w-sm mx-auto text-sm">
                {lang === "ta"
                  ? "உங்கள் பதிவு பெறப்பட்டது. நாங்கள் விரைவில் உங்களை தொடர்பு கொள்வோம்."
                  : "Your registration has been received. We'll contact you shortly to welcome you to the team."}
              </p>
              <Button onClick={() => setSubmitted(false)} variant="outline">Register Another</Button>
            </div>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  {lang === "ta" ? "பதிவு படிவம்" : "Registration Form"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="name" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "ta" ? "முழு பெயர்" : "Full Name"} *</FormLabel>
                          <FormControl><Input data-testid="input-name" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "ta" ? "தொலைபேசி எண்" : "Phone Number"} *</FormLabel>
                          <FormControl><Input data-testid="input-phone" type="tel" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <FormField control={form.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl><Input data-testid="input-email" type="email" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="ward" render={({ field }) => (
                        <FormItem>
                          <FormLabel>{lang === "ta" ? "வார்டு / பகுதி" : "Ward / Area"}</FormLabel>
                          <FormControl><Input data-testid="input-ward" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="constituency" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{lang === "ta" ? "தொகுதி" : "Constituency"} *</FormLabel>
                        <FormControl><Input data-testid="input-constituency" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="skills" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{lang === "ta" ? "திறன்கள்" : "Skills / Expertise"}</FormLabel>
                        <FormControl><Input data-testid="input-skills" placeholder={lang === "ta" ? "உ.ம்: தொடர்பு, நடத்தை..." : "e.g. Communication, Event management..."} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="message" render={({ field }) => (
                      <FormItem>
                        <FormLabel>{lang === "ta" ? "செய்தி" : "Message (Optional)"}</FormLabel>
                        <FormControl><Textarea data-testid="input-message" rows={3} {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <Button
                      data-testid="submit-volunteer"
                      type="submit"
                      className="w-full bg-primary hover:bg-primary/90 text-white"
                      disabled={mutation.isPending}
                    >
                      {mutation.isPending
                        ? (lang === "ta" ? "சமர்ப்பிக்கிறது..." : "Submitting...")
                        : (lang === "ta" ? "பதிவு செய்யுங்கள்" : "Register as Volunteer")}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
