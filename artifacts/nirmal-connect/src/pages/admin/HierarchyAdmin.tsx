import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ChevronRight, ChevronDown, Plus, Pencil, Trash2, MapPin, Map as MapIcon,
  Building2, Layers, Route, Vote, Loader2,
} from "lucide-react";
import { adminApi } from "./api";

const BoothMapPicker = lazy(() => import("./BoothMapPicker"));

// ── Types (loose — admin-only, mirrors backend response) ──
interface ZoneNode {
  id: number; name: string; nameTa: string | null; slug: string; type: string; description: string | null;
  wards: WardNode[];
}
interface WardNode {
  id: number; name: string; nameTa: string | null; slug: string | null; wardType: string | null;
  zoneId: number | null; pincode: string | null; latitude: number | null; longitude: number | null;
  coordinatorName: string | null; coordinatorPhone: string | null; coordinatorEmail: string | null;
  population: number | null; households: number | null; notes: string | null;
  boothCount: number; areas: AreaNode[];
}
interface AreaNode {
  id: number; wardId: number; name: string; nameTa: string | null; areaType: string | null;
  notes: string | null; streets: StreetNode[];
}
interface StreetNode {
  id: number; areaId: number; name: string; nameTa: string | null; pincode: string | null;
}
interface Booth {
  id: number; boothNo: string; slNo: number | null; name: string; nameTa: string | null;
  address: string | null; addressTa: string | null; wardId: number | null; areaId: number | null;
  pincode: string | null; voterType: string; latitude: number | null; longitude: number | null;
}
interface Pincode {
  id: number; code: string; label: string | null; labelTa: string | null; notes: string | null;
  wardIds: number[];
}

type EditorKind = "zone" | "ward" | "area" | "street" | "booth";
interface EditorState {
  kind: EditorKind;
  // For create: { kind, parentId? }; for edit: { kind, item }
  item?: Record<string, unknown>;
  parentId?: number;
}

// ─────────────────────────────────────────────────────────
// Generic helper: bilingual name input
// ─────────────────────────────────────────────────────────
function BilingualName({
  en, ta, onEn, onTa, requiredEn = true, label = "Name",
}: {
  en: string; ta: string; onEn: (v: string) => void; onTa: (v: string) => void;
  requiredEn?: boolean; label?: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <Label className="text-xs">{label} (English) {requiredEn && "*"}</Label>
        <Input value={en} onChange={(e) => onEn(e.target.value)} className="mt-1 text-sm" />
      </div>
      <div>
        <Label className="text-xs">{label} (தமிழ்)</Label>
        <Input value={ta} onChange={(e) => onTa(e.target.value)} className="mt-1 text-sm" lang="ta" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Modal editor for any node type
// ─────────────────────────────────────────────────────────
function NodeEditor({
  state, zones, wards, onClose, onSaved,
}: {
  state: EditorState | null;
  zones: ZoneNode[];
  wards: WardNode[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<Record<string, string | number | null>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!state) return;
    const item = state.item ?? {};
    switch (state.kind) {
      case "zone":
        setForm({
          name: String(item.name ?? ""), nameTa: String(item.nameTa ?? ""),
          slug: String(item.slug ?? ""), type: String(item.type ?? "corporation"),
          description: String(item.description ?? ""),
        });
        break;
      case "ward":
        setForm({
          name: String(item.name ?? ""), nameTa: String(item.nameTa ?? ""),
          slug: String(item.slug ?? ""), wardType: String(item.wardType ?? ""),
          zoneId: (item.zoneId as number | null) ?? state.parentId ?? null,
          pincode: String(item.pincode ?? ""),
          coordinatorName: String(item.coordinatorName ?? ""),
          coordinatorPhone: String(item.coordinatorPhone ?? ""),
          coordinatorEmail: String(item.coordinatorEmail ?? ""),
          population: (item.population as number | null) ?? "",
          households: (item.households as number | null) ?? "",
          notes: String(item.notes ?? ""),
        });
        break;
      case "area":
        setForm({
          name: String(item.name ?? ""), nameTa: String(item.nameTa ?? ""),
          wardId: (item.wardId as number | null) ?? state.parentId ?? null,
          areaType: String(item.areaType ?? ""),
          notes: String(item.notes ?? ""),
        });
        break;
      case "street":
        setForm({
          name: String(item.name ?? ""), nameTa: String(item.nameTa ?? ""),
          areaId: (item.areaId as number | null) ?? state.parentId ?? null,
          pincode: String(item.pincode ?? ""),
        });
        break;
      case "booth":
        setForm({
          boothNo: String(item.boothNo ?? ""),
          slNo: (item.slNo as number | null) ?? "",
          name: String(item.name ?? ""), nameTa: String(item.nameTa ?? ""),
          address: String(item.address ?? ""), addressTa: String(item.addressTa ?? ""),
          wardId: (item.wardId as number | null) ?? state.parentId ?? null,
          areaId: (item.areaId as number | null) ?? null,
          pincode: String(item.pincode ?? ""),
          voterType: String(item.voterType ?? "all"),
          latitude: (item.latitude as number | null) ?? "",
          longitude: (item.longitude as number | null) ?? "",
        });
        break;
    }
    setError(null);
  }, [state]);

  if (!state) return null;
  const isEdit = !!state.item;
  const setField = (k: string, v: string | number | null) => setForm(prev => ({ ...prev, [k]: v }));
  const titles: Record<EditorKind, string> = {
    zone: "Zone / மண்டலம்",
    ward: "Ward / வார்டு",
    area: "Area / பகுதி",
    street: "Street / தெரு",
    booth: "Polling Station / வாக்குச்சாவடி",
  };

  // Build options for ward/area pickers when relevant
  const wardOptions = wards.map(w => ({ id: w.id, label: `${w.name}${w.nameTa ? " / " + w.nameTa : ""}` }));
  const areaOptionsForWard = (wardId: number | null) => {
    if (!wardId) return [];
    const w = wards.find(x => x.id === wardId);
    return (w?.areas ?? []).map(a => ({ id: a.id, label: `${a.name}${a.nameTa ? " / " + a.nameTa : ""}` }));
  };

  async function save() {
    if (!String(form.name ?? "").trim() && state!.kind !== "booth") {
      setError("English name is required"); return;
    }
    if (state!.kind === "booth" && !String(form.boothNo ?? "").trim()) {
      setError("Booth number is required"); return;
    }
    setSaving(true);
    setError(null);
    try {
      const k = state!.kind;
      // Normalise empty strings → null for nullable fields
      const norm = (v: string | number | null): string | number | null => {
        if (v === "" || v == null) return null;
        return v;
      };
      const intOrNull = (v: string | number | null): number | null => {
        if (v === "" || v == null) return null;
        const n = typeof v === "number" ? v : parseInt(v as string);
        return Number.isFinite(n) ? n : null;
      };
      const floatOrNull = (v: string | number | null): number | null => {
        if (v === "" || v == null) return null;
        const n = typeof v === "number" ? v : parseFloat(v as string);
        return Number.isFinite(n) ? n : null;
      };

      const id = (state!.item?.id as number | undefined) ?? null;
      if (k === "zone") {
        const payload = {
          name: String(form.name).trim(),
          nameTa: norm(String(form.nameTa).trim()),
          slug: String(form.slug || form.name).trim().toLowerCase().replace(/\s+/g, "-"),
          type: String(form.type || "corporation"),
          description: norm(String(form.description ?? "").trim()),
        };
        if (isEdit && id) await adminApi.updateZone(id, payload); else await adminApi.createZone(payload);
      } else if (k === "ward") {
        const payload = {
          name: String(form.name).trim(),
          nameTa: norm(String(form.nameTa).trim()),
          slug: norm(String(form.slug ?? "").trim()),
          wardType: norm(String(form.wardType ?? "").trim()),
          zoneId: form.zoneId == null ? null : Number(form.zoneId),
          pincode: norm(String(form.pincode ?? "").trim()),
          coordinatorName: norm(String(form.coordinatorName ?? "").trim()),
          coordinatorPhone: norm(String(form.coordinatorPhone ?? "").trim()),
          coordinatorEmail: norm(String(form.coordinatorEmail ?? "").trim()),
          population: intOrNull(form.population),
          households: intOrNull(form.households),
          notes: norm(String(form.notes ?? "").trim()),
        };
        if (isEdit && id) await adminApi.updateHWard(id, payload); else await adminApi.createHWard(payload);
      } else if (k === "area") {
        if (form.wardId == null) { setError("Pick a parent ward first"); setSaving(false); return; }
        const payload = {
          wardId: Number(form.wardId),
          name: String(form.name).trim(),
          nameTa: norm(String(form.nameTa).trim()),
          areaType: norm(String(form.areaType ?? "").trim()),
          notes: norm(String(form.notes ?? "").trim()),
        };
        if (isEdit && id) await adminApi.updateArea(id, payload); else await adminApi.createArea(payload);
      } else if (k === "street") {
        if (form.areaId == null) { setError("Pick a parent area first"); setSaving(false); return; }
        const payload = {
          areaId: Number(form.areaId),
          name: String(form.name).trim(),
          nameTa: norm(String(form.nameTa).trim()),
          pincode: norm(String(form.pincode ?? "").trim()),
        };
        if (isEdit && id) await adminApi.updateStreet(id, payload); else await adminApi.createStreet(payload);
      } else if (k === "booth") {
        const payload = {
          boothNo: String(form.boothNo).trim(),
          slNo: intOrNull(form.slNo),
          name: String(form.name).trim() || `Booth ${String(form.boothNo).trim()}`,
          nameTa: norm(String(form.nameTa).trim()),
          address: norm(String(form.address ?? "").trim()),
          addressTa: norm(String(form.addressTa ?? "").trim()),
          wardId: form.wardId == null ? null : Number(form.wardId),
          areaId: form.areaId == null ? null : Number(form.areaId),
          pincode: norm(String(form.pincode ?? "").trim()),
          voterType: String(form.voterType || "all"),
          latitude: floatOrNull(form.latitude),
          longitude: floatOrNull(form.longitude),
        };
        if (isEdit && id) await adminApi.updateBooth(id, payload); else await adminApi.createBooth(payload);
      }
      onSaved();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={!!state} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit " : "Add "} {titles[state.kind]}
          </DialogTitle>
          <DialogDescription className="text-xs">
            English name is required. Tamil (தமிழ்) is optional — leave blank if you don't have an authoritative translation. தமிழ் பெயர் கட்டாயமில்லை.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">
          {state.kind === "zone" && (
            <>
              <BilingualName
                en={String(form.name ?? "")} ta={String(form.nameTa ?? "")}
                onEn={(v) => setField("name", v)} onTa={(v) => setField("nameTa", v)}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Slug</Label>
                  <Input value={String(form.slug ?? "")} onChange={(e) => setField("slug", e.target.value)} placeholder="auto from name" className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Type</Label>
                  <Select value={String(form.type ?? "corporation")} onValueChange={(v) => setField("type", v)}>
                    <SelectTrigger className="mt-1 text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="corporation">Corporation / நகராட்சி</SelectItem>
                      <SelectItem value="rural">Rural / கிராமப்புற</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea rows={2} value={String(form.description ?? "")} onChange={(e) => setField("description", e.target.value)} className="mt-1 text-sm" />
              </div>
            </>
          )}

          {state.kind === "ward" && (
            <>
              <BilingualName
                en={String(form.name ?? "")} ta={String(form.nameTa ?? "")}
                onEn={(v) => setField("name", v)} onTa={(v) => setField("nameTa", v)}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Parent Zone *</Label>
                  <Select value={form.zoneId == null ? "" : String(form.zoneId)} onValueChange={(v) => setField("zoneId", v ? Number(v) : null)}>
                    <SelectTrigger className="mt-1 text-sm h-9"><SelectValue placeholder="— None —" /></SelectTrigger>
                    <SelectContent>
                      {zones.map(z => <SelectItem key={z.id} value={String(z.id)}>{z.name}{z.nameTa ? ` / ${z.nameTa}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Ward Type</Label>
                  <Select value={String(form.wardType ?? "")} onValueChange={(v) => setField("wardType", v)}>
                    <SelectTrigger className="mt-1 text-sm h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="corporation_ward">Corporation Ward</SelectItem>
                      <SelectItem value="madurai_corp_zone">Corporation Zone</SelectItem>
                      <SelectItem value="town_panchayat">Town Panchayat</SelectItem>
                      <SelectItem value="panchayat">Village Panchayat</SelectItem>
                      <SelectItem value="revenue_village">Revenue Village</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Slug</Label>
                  <Input value={String(form.slug ?? "")} onChange={(e) => setField("slug", e.target.value)} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Pincode</Label>
                  <Input value={String(form.pincode ?? "")} onChange={(e) => setField("pincode", e.target.value)} className="mt-1 text-sm" maxLength={6} />
                </div>
                <div>
                  <Label className="text-xs">Population</Label>
                  <Input type="number" value={String(form.population ?? "")} onChange={(e) => setField("population", e.target.value)} className="mt-1 text-sm" />
                </div>
              </div>
              <div className="border rounded-md p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Coordinator</p>
                <Input placeholder="Name" value={String(form.coordinatorName ?? "")} onChange={(e) => setField("coordinatorName", e.target.value)} className="text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <Input placeholder="Phone" value={String(form.coordinatorPhone ?? "")} onChange={(e) => setField("coordinatorPhone", e.target.value)} className="text-sm" />
                  <Input placeholder="Email" type="email" value={String(form.coordinatorEmail ?? "")} onChange={(e) => setField("coordinatorEmail", e.target.value)} className="text-sm" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} value={String(form.notes ?? "")} onChange={(e) => setField("notes", e.target.value)} className="mt-1 text-sm" />
              </div>
            </>
          )}

          {state.kind === "area" && (
            <>
              <BilingualName
                en={String(form.name ?? "")} ta={String(form.nameTa ?? "")}
                onEn={(v) => setField("name", v)} onTa={(v) => setField("nameTa", v)}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Parent Ward *</Label>
                  <Select value={form.wardId == null ? "" : String(form.wardId)} onValueChange={(v) => setField("wardId", v ? Number(v) : null)}>
                    <SelectTrigger className="mt-1 text-sm h-9"><SelectValue placeholder="— Select ward —" /></SelectTrigger>
                    <SelectContent>
                      {wardOptions.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Area Type</Label>
                  <Input value={String(form.areaType ?? "")} onChange={(e) => setField("areaType", e.target.value)} placeholder="colony / nagar / etc." className="mt-1 text-sm" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} value={String(form.notes ?? "")} onChange={(e) => setField("notes", e.target.value)} className="mt-1 text-sm" />
              </div>
            </>
          )}

          {state.kind === "street" && (
            <>
              <BilingualName
                en={String(form.name ?? "")} ta={String(form.nameTa ?? "")}
                onEn={(v) => setField("name", v)} onTa={(v) => setField("nameTa", v)}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Parent Area *</Label>
                  <Select value={form.areaId == null ? "" : String(form.areaId)} onValueChange={(v) => setField("areaId", v ? Number(v) : null)}>
                    <SelectTrigger className="mt-1 text-sm h-9"><SelectValue placeholder="— Select area —" /></SelectTrigger>
                    <SelectContent>
                      {wards.flatMap(w => w.areas.map(a => (
                        <SelectItem key={a.id} value={String(a.id)}>{w.name} → {a.name}</SelectItem>
                      )))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Pincode</Label>
                  <Input value={String(form.pincode ?? "")} onChange={(e) => setField("pincode", e.target.value)} maxLength={6} className="mt-1 text-sm" />
                </div>
              </div>
            </>
          )}

          {state.kind === "booth" && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Booth No *</Label>
                  <Input value={String(form.boothNo ?? "")} onChange={(e) => setField("boothNo", e.target.value)} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Sl No</Label>
                  <Input type="number" value={String(form.slNo ?? "")} onChange={(e) => setField("slNo", e.target.value)} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Voter Type</Label>
                  <Select value={String(form.voterType ?? "all")} onValueChange={(v) => setField("voterType", v)}>
                    <SelectTrigger className="mt-1 text-sm h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="men_only">Men only</SelectItem>
                      <SelectItem value="women_only">Women only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <BilingualName
                label="Booth Name"
                en={String(form.name ?? "")} ta={String(form.nameTa ?? "")}
                onEn={(v) => setField("name", v)} onTa={(v) => setField("nameTa", v)}
                requiredEn={false}
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Address (English)</Label>
                  <Textarea rows={2} value={String(form.address ?? "")} onChange={(e) => setField("address", e.target.value)} className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Address (தமிழ்)</Label>
                  <Textarea rows={2} value={String(form.addressTa ?? "")} onChange={(e) => setField("addressTa", e.target.value)} className="mt-1 text-sm" lang="ta" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Ward</Label>
                  <Select value={form.wardId == null ? "" : String(form.wardId)} onValueChange={(v) => { setField("wardId", v ? Number(v) : null); setField("areaId", null); }}>
                    <SelectTrigger className="mt-1 text-sm h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {wardOptions.map(w => <SelectItem key={w.id} value={String(w.id)}>{w.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Area</Label>
                  <Select value={form.areaId == null ? "" : String(form.areaId)} onValueChange={(v) => setField("areaId", v ? Number(v) : null)}>
                    <SelectTrigger className="mt-1 text-sm h-9"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {areaOptionsForWard(form.wardId == null ? null : Number(form.wardId)).map(a => (
                        <SelectItem key={a.id} value={String(a.id)}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Pincode</Label>
                  <Input value={String(form.pincode ?? "")} onChange={(e) => setField("pincode", e.target.value)} maxLength={6} className="mt-1 text-sm" />
                </div>
              </div>
              <div className="border rounded-md p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                  <MapIcon className="w-3.5 h-3.5" /> GPS Coordinates
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Latitude</Label>
                    <Input type="number" step="any" value={String(form.latitude ?? "")} onChange={(e) => setField("latitude", e.target.value)} className="mt-1 text-sm" />
                  </div>
                  <div>
                    <Label className="text-xs">Longitude</Label>
                    <Input type="number" step="any" value={String(form.longitude ?? "")} onChange={(e) => setField("longitude", e.target.value)} className="mt-1 text-sm" />
                  </div>
                </div>
                <Suspense fallback={<div className="h-64 grid place-items-center text-xs text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /></div>}>
                  <BoothMapPicker
                    lat={form.latitude === "" || form.latitude == null ? null : Number(form.latitude)}
                    lng={form.longitude === "" || form.longitude == null ? null : Number(form.longitude)}
                    onChange={(la, ln) => { setField("latitude", la); setField("longitude", ln); }}
                  />
                </Suspense>
              </div>
            </>
          )}

          {error && <p className="text-red-500 text-sm" data-testid="hierarchy-form-error">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90">
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────
// Booths panel (loaded on demand when a ward is expanded)
// ─────────────────────────────────────────────────────────
function BoothsPanel({
  wardId, openEdit, onChanged,
}: { wardId: number; openEdit: (s: EditorState) => void; onChanged: () => void }) {
  const [booths, setBooths] = useState<Booth[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    setError(null);
    adminApi.getWardBooths(wardId).then(setBooths).catch((e) => setError((e as Error).message));
  };
  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [wardId]);

  async function del(b: Booth) {
    if (!confirm(`Delete booth ${b.boothNo} – ${b.name}?`)) return;
    try { await adminApi.deleteBooth(b.id); reload(); onChanged(); } catch (e) { alert((e as Error).message); }
  }

  return (
    <div className="ml-6 mt-2 space-y-2 border-l-2 border-blue-100 pl-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-blue-700 flex items-center gap-1">
          <Vote className="w-3.5 h-3.5" /> Polling Stations / வாக்குச்சாவடிகள்
        </p>
        <Button size="sm" variant="ghost" className="h-6 text-xs gap-1" onClick={() => openEdit({ kind: "booth", parentId: wardId })}>
          <Plus className="w-3 h-3" /> Add booth
        </Button>
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
      {!booths ? (
        <p className="text-xs text-muted-foreground">Loading booths…</p>
      ) : booths.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">No booths yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-1.5">
          {booths.map(b => (
            <div key={b.id} className="flex items-start justify-between gap-2 text-xs border rounded p-2 bg-white">
              <div className="min-w-0">
                <p className="font-medium truncate">
                  <span className="inline-block min-w-[2rem] text-blue-700 font-mono">{b.boothNo}</span>
                  {b.name}
                </p>
                {b.nameTa && <p className="text-muted-foreground truncate" lang="ta">{b.nameTa}</p>}
                <p className="text-muted-foreground flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {b.latitude != null && b.longitude != null
                    ? `${b.latitude.toFixed(4)}, ${b.longitude.toFixed(4)}`
                    : "GPS not set"}
                </p>
              </div>
              <div className="flex gap-0.5 shrink-0">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit({ kind: "booth", item: b as unknown as Record<string, unknown> })}>
                  <Pencil className="w-3 h-3" />
                </Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => del(b)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Tree
// ─────────────────────────────────────────────────────────
function Tree({
  zones, orphanWards, openEdit, onChanged,
}: {
  zones: ZoneNode[];
  orphanWards: WardNode[];
  openEdit: (s: EditorState) => void;
  onChanged: () => void;
}) {
  const [expandedZones, setExpZ] = useState<Set<number>>(new Set());
  const [expandedWards, setExpW] = useState<Set<number>>(new Set());
  const [expandedAreas, setExpA] = useState<Set<number>>(new Set());

  const toggle = <T,>(set: Set<T>, setter: (s: Set<T>) => void, k: T) => {
    const n = new Set(set);
    if (n.has(k)) n.delete(k); else n.add(k);
    setter(n);
  };

  async function delZone(z: ZoneNode) {
    if (!confirm(`Delete zone "${z.name}"?`)) return;
    try { await adminApi.deleteZone(z.id); onChanged(); } catch (e) { alert((e as Error).message); }
  }
  async function delWard(w: WardNode) {
    if (!confirm(`Delete ward "${w.name}"?`)) return;
    try { await adminApi.deleteHWard(w.id); onChanged(); } catch (e) { alert((e as Error).message); }
  }
  async function delArea(a: AreaNode) {
    if (!confirm(`Delete area "${a.name}"?`)) return;
    try { await adminApi.deleteArea(a.id); onChanged(); } catch (e) { alert((e as Error).message); }
  }
  async function delStreet(s: StreetNode) {
    if (!confirm(`Delete street "${s.name}"?`)) return;
    try { await adminApi.deleteStreet(s.id); onChanged(); } catch (e) { alert((e as Error).message); }
  }

  const renderWard = (w: WardNode) => {
    const open = expandedWards.has(w.id);
    return (
      <div key={w.id} className="border-l-2 border-amber-200 pl-3 ml-4">
        <div className="flex items-center gap-1 py-1 group">
          <button className="text-amber-700 hover:bg-amber-50 rounded p-0.5" onClick={() => toggle(expandedWards, setExpW, w.id)} aria-label="Toggle ward">
            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="text-sm font-medium">{w.name}</span>
          {w.nameTa && <span className="text-xs text-muted-foreground" lang="ta">/ {w.nameTa}</span>}
          <span className="text-[11px] text-muted-foreground ml-1">
            ({w.areas.length} areas · {w.boothCount} booths)
          </span>
          <div className="ml-auto opacity-0 group-hover:opacity-100 flex gap-0.5">
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit({ kind: "area", parentId: w.id })} title="Add area"><Plus className="w-3 h-3" /></Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit({ kind: "ward", item: w as unknown as Record<string, unknown> })}><Pencil className="w-3 h-3" /></Button>
            <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => delWard(w)}><Trash2 className="w-3 h-3" /></Button>
          </div>
        </div>
        {open && (
          <>
            {w.areas.map(a => {
              const aOpen = expandedAreas.has(a.id);
              return (
                <div key={a.id} className="border-l-2 border-emerald-200 pl-3 ml-4">
                  <div className="flex items-center gap-1 py-1 group">
                    <button className="text-emerald-700 hover:bg-emerald-50 rounded p-0.5" onClick={() => toggle(expandedAreas, setExpA, a.id)}>
                      {aOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <Layers className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-sm">{a.name}</span>
                    {a.nameTa && <span className="text-xs text-muted-foreground" lang="ta">/ {a.nameTa}</span>}
                    <span className="text-[11px] text-muted-foreground ml-1">({a.streets.length} streets)</span>
                    <div className="ml-auto opacity-0 group-hover:opacity-100 flex gap-0.5">
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit({ kind: "street", parentId: a.id })} title="Add street"><Plus className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit({ kind: "area", item: a as unknown as Record<string, unknown> })}><Pencil className="w-3 h-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => delArea(a)}><Trash2 className="w-3 h-3" /></Button>
                    </div>
                  </div>
                  {aOpen && a.streets.map(s => (
                    <div key={s.id} className="ml-8 py-0.5 group flex items-center gap-1 text-xs">
                      <Route className="w-3 h-3 text-purple-600 shrink-0" />
                      <span>{s.name}</span>
                      {s.nameTa && <span className="text-muted-foreground" lang="ta">/ {s.nameTa}</span>}
                      {s.pincode && <span className="text-muted-foreground">· {s.pincode}</span>}
                      <div className="ml-auto opacity-0 group-hover:opacity-100 flex gap-0.5">
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => openEdit({ kind: "street", item: s as unknown as Record<string, unknown> })}><Pencil className="w-2.5 h-2.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-5 w-5 text-red-500" onClick={() => delStreet(s)}><Trash2 className="w-2.5 h-2.5" /></Button>
                      </div>
                    </div>
                  ))}
                  {aOpen && a.streets.length === 0 && (
                    <p className="ml-8 text-[11px] text-muted-foreground italic">No streets yet.</p>
                  )}
                </div>
              );
            })}
            <BoothsPanel wardId={w.id} openEdit={openEdit} onChanged={onChanged} />
          </>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1">
      {zones.map(z => {
        const open = expandedZones.has(z.id);
        return (
          <div key={z.id} className="rounded-md border bg-white">
            <div className="flex items-center gap-1 p-2 group">
              <button className="text-blue-700 hover:bg-blue-50 rounded p-0.5" onClick={() => toggle(expandedZones, setExpZ, z.id)} aria-label="Toggle zone">
                {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
              <span className="font-semibold text-sm">{z.name}</span>
              {z.nameTa && <span className="text-xs text-muted-foreground" lang="ta">/ {z.nameTa}</span>}
              <span className="text-[11px] text-muted-foreground ml-1">({z.wards.length} wards)</span>
              <div className="ml-auto opacity-0 group-hover:opacity-100 flex gap-0.5">
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit({ kind: "ward", parentId: z.id })} title="Add ward"><Plus className="w-3 h-3" /></Button>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit({ kind: "zone", item: z as unknown as Record<string, unknown> })}><Pencil className="w-3 h-3" /></Button>
                <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => delZone(z)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            </div>
            {open && (
              <div className="pb-2">
                {z.wards.length === 0 && <p className="ml-8 text-xs text-muted-foreground italic py-1">No wards in this zone.</p>}
                {z.wards.map(renderWard)}
              </div>
            )}
          </div>
        );
      })}
      {orphanWards.length > 0 && (
        <div className="rounded-md border bg-yellow-50/40 border-yellow-200">
          <div className="p-2 text-xs font-semibold text-yellow-800 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" /> Wards without a zone ({orphanWards.length})
          </div>
          <div className="pb-2">{orphanWards.map(renderWard)}</div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Pincodes tab
// ─────────────────────────────────────────────────────────
function PincodesPanel({ wards }: { wards: WardNode[] }) {
  const [items, setItems] = useState<Pincode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Pincode | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ code: "", label: "", labelTa: "", notes: "", wardIds: [] as number[] });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminApi.getPincodes()
      .then((d: Pincode[]) => setItems(d))
      .catch(() => setError("Failed to load pincodes"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  function openCreate() {
    setEditing(null);
    setForm({ code: "", label: "", labelTa: "", notes: "", wardIds: [] });
    setFormErr(null); setOpen(true);
  }
  function openEdit(p: Pincode) {
    setEditing(p);
    setForm({ code: p.code, label: p.label ?? "", labelTa: p.labelTa ?? "", notes: p.notes ?? "", wardIds: p.wardIds });
    setFormErr(null); setOpen(true);
  }
  function toggleWard(id: number) {
    setForm(prev => ({
      ...prev,
      wardIds: prev.wardIds.includes(id) ? prev.wardIds.filter(x => x !== id) : [...prev.wardIds, id],
    }));
  }

  async function save() {
    if (!/^\d{6}$/.test(form.code.trim())) {
      setFormErr("Pincode must be 6 digits"); return;
    }
    setSaving(true); setFormErr(null);
    try {
      const payload = {
        code: form.code.trim(),
        label: form.label.trim() || null,
        labelTa: form.labelTa.trim() || null,
        notes: form.notes.trim() || null,
        wardIds: form.wardIds,
      };
      if (editing) await adminApi.updatePincode(editing.id, payload);
      else await adminApi.createPincode(payload);
      setOpen(false); load();
    } catch (e) { setFormErr((e as Error).message); }
    finally { setSaving(false); }
  }
  async function del(p: Pincode) {
    if (!confirm(`Delete pincode ${p.code}?`)) return;
    try { await adminApi.deletePincode(p.id); load(); } catch (e) { alert((e as Error).message); }
  }

  const wardLabel = (id: number) => {
    const w = wards.find(x => x.id === id);
    return w ? `${w.name}${w.nameTa ? " / " + w.nameTa : ""}` : `#${id}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{items.length} pincodes mapped</p>
        <Button size="sm" onClick={openCreate} className="gap-2"><Plus className="w-4 h-4" /> Add Pincode</Button>
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {items.map(p => (
            <Card key={p.id}>
              <CardContent className="p-3 space-y-1.5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-mono font-semibold text-sm">{p.code}</p>
                    {p.label && <p className="text-xs">{p.label}</p>}
                    {p.labelTa && <p className="text-xs text-muted-foreground" lang="ta">{p.labelTa}</p>}
                  </div>
                  <div className="flex gap-0.5">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => openEdit(p)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500" onClick={() => del(p)}><Trash2 className="w-3 h-3" /></Button>
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  <span className="font-medium">Wards:</span>{" "}
                  {p.wardIds.length === 0 ? (
                    <span className="italic">None mapped</span>
                  ) : (
                    p.wardIds.map(wardLabel).join(", ")
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full text-center py-6">No pincodes yet.</p>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Pincode" : "Add Pincode"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Pincode *</Label>
                <Input value={form.code} maxLength={6} onChange={(e) => setForm(p => ({ ...p, code: e.target.value.replace(/\D/g, "") }))} className="mt-1 text-sm font-mono" />
              </div>
              <div>
                <Label className="text-xs">Label (English)</Label>
                <Input value={form.label} onChange={(e) => setForm(p => ({ ...p, label: e.target.value }))} className="mt-1 text-sm" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Label (தமிழ்)</Label>
                <Input value={form.labelTa} onChange={(e) => setForm(p => ({ ...p, labelTa: e.target.value }))} className="mt-1 text-sm" lang="ta" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Notes</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} className="mt-1 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1 block">Associated Wards (select any number)</Label>
              <div className="border rounded-md p-2 max-h-48 overflow-y-auto space-y-1 bg-gray-50">
                {wards.length === 0 && <p className="text-xs text-muted-foreground">No wards available.</p>}
                {wards.map(w => (
                  <label key={w.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-white px-1 py-0.5 rounded">
                    <input
                      type="checkbox"
                      checked={form.wardIds.includes(w.id)}
                      onChange={() => toggleWard(w.id)}
                    />
                    <span>{w.name}{w.nameTa ? ` / ${w.nameTa}` : ""}</span>
                  </label>
                ))}
              </div>
            </div>
            {formErr && <p className="text-red-500 text-sm">{formErr}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-primary hover:bg-primary/90">
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Pincode"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Top-level component
// ─────────────────────────────────────────────────────────
export default function HierarchyAdmin() {
  const [zones, setZones] = useState<ZoneNode[]>([]);
  const [orphanWards, setOrphanWards] = useState<WardNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);

  const flatWards = useMemo<WardNode[]>(() => [
    ...zones.flatMap(z => z.wards),
    ...orphanWards,
  ], [zones, orphanWards]);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.getHierarchyTree()
      .then((d: { zones: ZoneNode[]; orphanWards: WardNode[] }) => {
        // Defensive: ensure nested arrays always exist so the UI never crashes
        // on a partial response.
        const fixWard = (w: WardNode): WardNode => ({
          ...w,
          areas: (w.areas ?? []).map(a => ({ ...a, streets: a.streets ?? [] })),
        });
        setZones((d.zones ?? []).map(z => ({ ...z, wards: (z.wards ?? []).map(fixWard) })));
        setOrphanWards((d.orphanWards ?? []).map(fixWard));
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const totals = useMemo(() => {
    const wardCount = flatWards.length;
    const areaCount = flatWards.reduce((s, w) => s + w.areas.length, 0);
    const streetCount = flatWards.reduce((s, w) => s + w.areas.reduce((ss, a) => ss + a.streets.length, 0), 0);
    const boothCount = flatWards.reduce((s, w) => s + w.boothCount, 0);
    return { wardCount, areaCount, streetCount, boothCount };
  }, [flatWards]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-lg font-semibold">Constituency Hierarchy / தொகுதி கட்டமைப்பு</h3>
          <p className="text-xs text-muted-foreground">
            {zones.length} zones · {totals.wardCount} wards · {totals.areaCount} areas · {totals.streetCount} streets · {totals.boothCount} booths
          </p>
        </div>
        <Button size="sm" onClick={() => setEditor({ kind: "zone" })} className="gap-1">
          <Plus className="w-4 h-4" /> Add Zone
        </Button>
      </div>

      <Tabs defaultValue="tree">
        <TabsList>
          <TabsTrigger value="tree">Tree</TabsTrigger>
          <TabsTrigger value="pincodes">Pincodes</TabsTrigger>
        </TabsList>

        <TabsContent value="tree" className="mt-3">
          {error && <p className="text-red-500 text-sm" data-testid="hierarchy-load-error">{error}</p>}
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading hierarchy…</p>
          ) : (
            <Tree zones={zones} orphanWards={orphanWards} openEdit={setEditor} onChanged={load} />
          )}
        </TabsContent>

        <TabsContent value="pincodes" className="mt-3">
          <PincodesPanel wards={flatWards} />
        </TabsContent>
      </Tabs>

      <NodeEditor
        state={editor}
        zones={zones}
        wards={flatWards}
        onClose={() => setEditor(null)}
        onSaved={load}
      />
    </div>
  );
}
