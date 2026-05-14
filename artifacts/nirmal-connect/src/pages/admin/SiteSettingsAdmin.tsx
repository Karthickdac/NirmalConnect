import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApi } from "./api";
import { Save, Globe, Phone, AlertTriangle } from "lucide-react";

interface SocialLinks { facebook: string; twitter: string; instagram: string; youtube: string; whatsapp: string; }
interface ContactInfo { phone: string; email: string; address: string; addressTa: string; officeHours: string; }
interface EmergencyContacts { primary: string; secondary: string; police: string; ambulance: string; }

const defaultSocial: SocialLinks = { facebook: "", twitter: "", instagram: "", youtube: "", whatsapp: "" };
const defaultContact: ContactInfo = { phone: "+91 98765 43210", email: "mla.tirupparankundram@tn.gov.in", address: "Minister's Office, Tirupparankundram, Madurai District, Tamil Nadu - 625005", addressTa: "அமைச்சர் அலுவலகம், திருப்பரங்குன்றம்", officeHours: "Mon–Fri 10 AM – 5 PM" };
const defaultEmergency: EmergencyContacts = { primary: "+91 98765 43210", secondary: "+91 98765 43211", police: "100", ambulance: "108" };

function Field({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
    </div>
  );
}

export default function SiteSettingsAdmin() {
  const [social, setSocial] = useState<SocialLinks>(defaultSocial);
  const [contact, setContact] = useState<ContactInfo>(defaultContact);
  const [emergency, setEmergency] = useState<EmergencyContacts>(defaultEmergency);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.getSettings().then((d: Record<string, unknown>) => {
      if (d.social_links) setSocial({ ...defaultSocial, ...(d.social_links as Partial<SocialLinks>) });
      if (d.contact_info) setContact({ ...defaultContact, ...(d.contact_info as Partial<ContactInfo>) });
      if (d.emergency_contacts) setEmergency({ ...defaultEmergency, ...(d.emergency_contacts as Partial<EmergencyContacts>) });
    }).catch(() => {});
  }, []);

  async function save(key: string, value: unknown) {
    setSaving(key); setError(null);
    try {
      await adminApi.updateSetting(key, value);
      setSaved(key);
      setTimeout(() => setSaved(null), 2000);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSaving(null); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">Site Settings</h2>
        <p className="text-sm text-muted-foreground">Manage contact details, social links, and emergency numbers shown site-wide</p>
      </div>
      {error && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded">{error}</p>}

      {/* Social Links */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Globe className="w-4 h-4 text-primary" /> Social Media Links</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Facebook URL" value={social.facebook} onChange={v => setSocial(s => ({ ...s, facebook: v }))} placeholder="https://facebook.com/..." />
          <Field label="Twitter / X URL" value={social.twitter} onChange={v => setSocial(s => ({ ...s, twitter: v }))} placeholder="https://twitter.com/..." />
          <Field label="Instagram URL" value={social.instagram} onChange={v => setSocial(s => ({ ...s, instagram: v }))} placeholder="https://instagram.com/..." />
          <Field label="YouTube Channel URL" value={social.youtube} onChange={v => setSocial(s => ({ ...s, youtube: v }))} placeholder="https://youtube.com/..." />
          <Field label="WhatsApp Number" value={social.whatsapp} onChange={v => setSocial(s => ({ ...s, whatsapp: v }))} placeholder="+91 98765 43210" />
          <Button size="sm" className="gap-1" disabled={saving === "social_links"} onClick={() => save("social_links", social)}>
            <Save className="w-3.5 h-3.5" />
            {saved === "social_links" ? "Saved!" : saving === "social_links" ? "Saving…" : "Save Social Links"}
          </Button>
        </CardContent>
      </Card>

      {/* Contact Info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Phone className="w-4 h-4 text-primary" /> Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Primary Phone" value={contact.phone} onChange={v => setContact(c => ({ ...c, phone: v }))} />
          <Field label="Email Address" value={contact.email} onChange={v => setContact(c => ({ ...c, email: v }))} type="email" />
          <Field label="Office Address (English)" value={contact.address} onChange={v => setContact(c => ({ ...c, address: v }))} />
          <Field label="Office Address (Tamil)" value={contact.addressTa} onChange={v => setContact(c => ({ ...c, addressTa: v }))} />
          <Field label="Office Hours" value={contact.officeHours} onChange={v => setContact(c => ({ ...c, officeHours: v }))} placeholder="Mon–Fri 10 AM – 5 PM" />
          <Button size="sm" className="gap-1" disabled={saving === "contact_info"} onClick={() => save("contact_info", contact)}>
            <Save className="w-3.5 h-3.5" />
            {saved === "contact_info" ? "Saved!" : saving === "contact_info" ? "Saving…" : "Save Contact Info"}
          </Button>
        </CardContent>
      </Card>

      {/* Emergency Contacts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-primary" /> Emergency Contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Field label="Primary Emergency Number" value={emergency.primary} onChange={v => setEmergency(e => ({ ...e, primary: v }))} />
          <Field label="Secondary Number" value={emergency.secondary} onChange={v => setEmergency(e => ({ ...e, secondary: v }))} />
          <Field label="Police (local)" value={emergency.police} onChange={v => setEmergency(e => ({ ...e, police: v }))} placeholder="100" />
          <Field label="Ambulance" value={emergency.ambulance} onChange={v => setEmergency(e => ({ ...e, ambulance: v }))} placeholder="108" />
          <Button size="sm" className="gap-1" disabled={saving === "emergency_contacts"} onClick={() => save("emergency_contacts", emergency)}>
            <Save className="w-3.5 h-3.5" />
            {saved === "emergency_contacts" ? "Saved!" : saving === "emergency_contacts" ? "Saving…" : "Save Emergency Contacts"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
