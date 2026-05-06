import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminApi } from "./api";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";

interface BannerItem {
  id: number;
  title: string;
  titleTa?: string | null;
  subtitle?: string | null;
  subtitleTa?: string | null;
  ctaText?: string | null;
  ctaUrl?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
}

const EMPTY: Partial<BannerItem> = { title: "", titleTa: "", subtitle: "", subtitleTa: "", ctaText: "", ctaUrl: "", imageUrl: "", isActive: true, displayOrder: 0 };

function Field({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
    </div>
  );
}

export default function BannersAdmin() {
  const [items, setItems] = useState<BannerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<BannerItem>>(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    adminApi.getBanners()
      .then((d: BannerItem[]) => setItems(d))
      .catch(() => setError("Failed to load banners"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(EMPTY); setDialogOpen(true); }
  function openEdit(item: BannerItem) { setEditing({ ...item }); setDialogOpen(true); }

  async function save() {
    if (!editing.title?.trim()) return;
    setSaving(true); setError(null);
    try {
      if (editing.id) {
        const updated = await adminApi.updateBanner(editing.id, editing);
        setItems(prev => prev.map(i => i.id === editing.id ? updated as BannerItem : i));
      } else {
        const created = await adminApi.createBanner(editing);
        setItems(prev => [...prev, created as BannerItem]);
      }
      setDialogOpen(false);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function remove(id: number) {
    if (!confirm("Delete this banner?")) return;
    try {
      await adminApi.deleteBanner(id);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e: unknown) { setError((e as Error).message); }
  }

  async function toggleActive(item: BannerItem) {
    try {
      const updated = await adminApi.updateBanner(item.id, { isActive: !item.isActive });
      setItems(prev => prev.map(i => i.id === item.id ? updated as BannerItem : i));
    } catch (e: unknown) { setError((e as Error).message); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Banners & Announcements</h2>
          <p className="text-sm text-muted-foreground">{items.length} banner{items.length !== 1 ? "s" : ""} • {items.filter(i => i.isActive).length} active</p>
        </div>
        <Button size="sm" className="gap-1" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Add Banner
        </Button>
      </div>

      {error && <p className="text-red-500 text-sm bg-red-50 px-3 py-2 rounded">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">No banners created yet</p>
      ) : (
        <div className="space-y-2">
          {items.sort((a, b) => a.displayOrder - b.displayOrder).map(item => (
            <Card key={item.id} className={`hover:shadow-sm transition-shadow ${!item.isActive ? "opacity-60" : ""}`}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-sm">{item.title}</p>
                      {item.titleTa && <p className="text-xs text-muted-foreground">{item.titleTa}</p>}
                      <Badge className={item.isActive ? "bg-green-100 text-green-700 border-green-200" : "bg-gray-100 text-gray-600 border-gray-200"}>
                        {item.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Badge variant="outline" className="text-xs">Order: {item.displayOrder}</Badge>
                    </div>
                    {item.subtitle && <p className="text-xs text-muted-foreground mt-1">{item.subtitle}</p>}
                    {item.ctaText && <p className="text-xs text-primary mt-1">CTA: {item.ctaText} → {item.ctaUrl}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => toggleActive(item)}>
                      {item.isActive ? <ToggleRight className="w-4 h-4 text-green-600" /> : <ToggleLeft className="w-4 h-4 text-gray-400" />}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => openEdit(item)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => remove(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing.id ? "Edit Banner" : "Add Banner"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <Field label="Title (English) *" value={editing.title ?? ""} onChange={v => setEditing(e => ({ ...e, title: v }))} />
            <Field label="Title (Tamil)" value={editing.titleTa ?? ""} onChange={v => setEditing(e => ({ ...e, titleTa: v }))} />
            <Field label="Subtitle (English)" value={editing.subtitle ?? ""} onChange={v => setEditing(e => ({ ...e, subtitle: v }))} />
            <Field label="Subtitle (Tamil)" value={editing.subtitleTa ?? ""} onChange={v => setEditing(e => ({ ...e, subtitleTa: v }))} />
            <Field label="CTA Button Text" value={editing.ctaText ?? ""} onChange={v => setEditing(e => ({ ...e, ctaText: v }))} placeholder="Learn More" />
            <Field label="CTA Button URL" value={editing.ctaUrl ?? ""} onChange={v => setEditing(e => ({ ...e, ctaUrl: v }))} placeholder="/news" />
            <Field label="Background Image URL" value={editing.imageUrl ?? ""} onChange={v => setEditing(e => ({ ...e, imageUrl: v }))} placeholder="https://..." />
            <Field label="Display Order" value={String(editing.displayOrder ?? 0)} onChange={v => setEditing(e => ({ ...e, displayOrder: parseInt(v) || 0 }))} type="number" />
            <div className="flex items-center gap-2">
              <input type="checkbox" id="banner-active" checked={editing.isActive ?? true}
                onChange={e => setEditing(d => ({ ...d, isActive: e.target.checked }))} className="rounded" />
              <label htmlFor="banner-active" className="text-sm">Active (visible on site)</label>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" disabled={saving || !editing.title?.trim()} onClick={save}>
                {saving ? "Saving…" : editing.id ? "Update" : "Create"}
              </Button>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
