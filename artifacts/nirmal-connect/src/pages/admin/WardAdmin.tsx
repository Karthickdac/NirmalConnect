import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Users, Phone, Mail, MapPin } from "lucide-react";
import { adminApi } from "./api";

interface Ward {
  id: number;
  name: string;
  area: string | null;
  coordinatorName: string | null;
  coordinatorPhone: string | null;
  coordinatorEmail: string | null;
  population: number | null;
  households: number | null;
  notes: string | null;
  createdAt: string;
}

const emptyForm = {
  name: "", area: "", coordinatorName: "", coordinatorPhone: "",
  coordinatorEmail: "", population: "", households: "", notes: "",
};

export default function WardAdmin() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Ward | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminApi.getWards()
      .then((d: Ward[]) => setWards(d))
      .catch(() => setError("Failed to load wards"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(w: Ward) {
    setEditing(w);
    setForm({
      name: w.name,
      area: w.area ?? "",
      coordinatorName: w.coordinatorName ?? "",
      coordinatorPhone: w.coordinatorPhone ?? "",
      coordinatorEmail: w.coordinatorEmail ?? "",
      population: w.population != null ? String(w.population) : "",
      households: w.households != null ? String(w.households) : "",
      notes: w.notes ?? "",
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { setError("Ward name is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        area: form.area.trim() || null,
        coordinatorName: form.coordinatorName.trim() || null,
        coordinatorPhone: form.coordinatorPhone.trim() || null,
        coordinatorEmail: form.coordinatorEmail.trim() || null,
        population: form.population ? parseInt(form.population) : null,
        households: form.households ? parseInt(form.households) : null,
        notes: form.notes.trim() || null,
      };
      if (editing) {
        await adminApi.updateWard(editing.id, payload);
      } else {
        await adminApi.createWard(payload);
      }
      setOpen(false);
      load();
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this ward? This cannot be undone.")) return;
    await adminApi.deleteWard(id).catch(() => null);
    load();
  }

  const f = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Ward / Area Management</h3>
          <p className="text-sm text-muted-foreground">{wards.length} wards configured</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add Ward
        </Button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
      ) : wards.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No wards configured yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {wards.map(w => (
            <Card key={w.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-semibold text-sm">{w.name}</h4>
                    {w.area && <p className="text-xs text-muted-foreground">{w.area}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(w)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500 hover:bg-red-50" onClick={() => handleDelete(w.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
                {w.coordinatorName && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                      <Users className="w-3 h-3" /> Coordinator
                    </p>
                    <p className="text-sm font-medium">{w.coordinatorName}</p>
                    {w.coordinatorPhone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {w.coordinatorPhone}
                      </p>
                    )}
                    {w.coordinatorEmail && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {w.coordinatorEmail}
                      </p>
                    )}
                  </div>
                )}
                {(w.population != null || w.households != null) && (
                  <div className="flex gap-4 text-xs pt-1 border-t">
                    {w.population != null && (
                      <div><p className="text-muted-foreground">Population</p><p className="font-medium">{w.population.toLocaleString()}</p></div>
                    )}
                    {w.households != null && (
                      <div><p className="text-muted-foreground">Households</p><p className="font-medium">{w.households.toLocaleString()}</p></div>
                    )}
                  </div>
                )}
                {w.notes && <p className="text-xs text-muted-foreground border-t pt-2 line-clamp-2">{w.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Ward" : "Add Ward"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Ward Name *</Label>
                <Input value={form.name} onChange={f("name")} placeholder="e.g., Ward 12 – Alagar Koil Road" className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Area / Zone</Label>
                <Input value={form.area} onChange={f("area")} placeholder="e.g., North Zone" className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Population</Label>
                <Input type="number" value={form.population} onChange={f("population")} placeholder="0" className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Households</Label>
                <Input type="number" value={form.households} onChange={f("households")} placeholder="0" className="mt-1 text-sm" />
              </div>
            </div>
            <div className="border rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Coordinator Details</p>
              <div>
                <Label className="text-xs">Name</Label>
                <Input value={form.coordinatorName} onChange={f("coordinatorName")} placeholder="Coordinator name" className="mt-1 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.coordinatorPhone} onChange={f("coordinatorPhone")} placeholder="+91 …" className="mt-1 text-sm" />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input type="email" value={form.coordinatorEmail} onChange={f("coordinatorEmail")} placeholder="email@…" className="mt-1 text-sm" />
                </div>
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={form.notes} onChange={f("notes")} placeholder="Any special notes about this ward…" rows={2} className="mt-1 text-sm" />
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="bg-primary hover:bg-primary/90">
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Ward"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
