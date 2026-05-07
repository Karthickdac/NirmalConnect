import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, MapPin, CalendarDays } from "lucide-react";
import { adminApi } from "./api";
import RichTextEditor from "@/components/RichTextEditor";
import ImageUploader from "@/components/ImageUploader";

interface EventItem {
  id: number;
  title: string;
  titleTa?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  venue: string;
  eventDate: string;
  endDate?: string | null;
  category: string;
  createdAt: string;
}

const emptyForm = {
  title: "", titleTa: "", description: "", descriptionTa: "",
  imageUrl: "", venue: "", eventDate: "", endDate: "", category: "general",
};

export default function EventsAdmin() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (p = page) => {
    setLoading(true);
    adminApi.getEvents(p, 15)
      .then((d: { items: EventItem[]; total: number }) => { setItems(d.items); setTotal(d.total); })
      .catch(() => setError("Failed to load events"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(item: EventItem) {
    setEditing(item);
    setForm({
      title: item.title, titleTa: item.titleTa ?? "", description: item.description ?? "",
      descriptionTa: "", imageUrl: item.imageUrl ?? "", venue: item.venue,
      eventDate: item.eventDate.slice(0, 10), endDate: item.endDate?.slice(0, 10) ?? "",
      category: item.category,
    });
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        ...form, imageUrl: form.imageUrl || null, titleTa: form.titleTa || null,
        description: form.description || null, endDate: form.endDate || null,
      };
      if (editing) await adminApi.updateEvent(editing.id, payload);
      else await adminApi.createEvent(payload);
      setOpen(false);
      load(page);
    } catch (e: unknown) { setError((e as Error).message); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this event?")) return;
    await adminApi.deleteEvent(id).catch(() => null);
    load();
  }

  const totalPages = Math.ceil(total / 15);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Events</h2>
          <p className="text-sm text-muted-foreground">{total} events</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add Event
        </Button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const isPast = new Date(item.eventDate) < new Date();
            return (
              <Card key={item.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="text-center shrink-0 w-12">
                    <p className="text-lg font-bold text-primary leading-none">
                      {new Date(item.eventDate).getDate()}
                    </p>
                    <p className="text-xs text-muted-foreground uppercase">
                      {new Date(item.eventDate).toLocaleString("en", { month: "short" })}
                    </p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{item.title}</p>
                      <Badge variant="outline" className="text-xs">{item.category}</Badge>
                      {isPast && <Badge className="bg-gray-100 text-gray-500 text-xs">Past</Badge>}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <MapPin className="w-3 h-3" /> {item.venue}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(item)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Event" : "New Event"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Title (English) *</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Title (Tamil)</Label>
                <Input value={form.titleTa} onChange={e => setForm(f => ({ ...f, titleTa: e.target.value }))} className="mt-1 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <RichTextEditor
                value={form.description}
                onChange={html => setForm(f => ({ ...f, description: html }))}
                placeholder="Event description…"
                minHeight={120}
              />
            </div>
            <div>
              <Label className="text-xs">Venue *</Label>
              <Input value={form.venue} onChange={e => setForm(f => ({ ...f, venue: e.target.value }))} className="mt-1 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Event Date *</Label>
                <Input type="date" value={form.eventDate} onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">End Date</Label>
                <Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} className="mt-1 text-sm" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="mt-1 text-sm" />
            </div>
            <ImageUploader
              label="Image"
              value={form.imageUrl}
              onChange={(url) => setForm(f => ({ ...f, imageUrl: url }))}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title || !form.venue || !form.eventDate} className="bg-primary hover:bg-primary/90">
              {saving ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
