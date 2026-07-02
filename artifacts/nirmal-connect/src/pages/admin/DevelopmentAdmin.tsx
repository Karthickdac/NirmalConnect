import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { adminApi } from "./api";

interface DevProject {
  id: number;
  title: string;
  titleTa?: string | null;
  category: string;
  categoryTa?: string | null;
  status: string;
  sortOrder: number;
  createdAt: string;
}

const STATUS_OPTIONS = ["Completed", "Ongoing", "Planned"];
const CATEGORY_OPTIONS = ["Roads", "Water", "Education", "Health", "Housing", "Employment", "Infrastructure", "Other"];

const emptyForm = {
  title: "",
  titleTa: "",
  category: "Roads",
  categoryTa: "",
  status: "Ongoing",
  sortOrder: "0",
};

const statusColor: Record<string, string> = {
  Completed: "bg-green-100 text-green-700",
  Ongoing: "bg-blue-100 text-blue-700",
  Planned: "bg-yellow-100 text-yellow-700",
};

export default function DevelopmentAdmin() {
  const [items, setItems] = useState<DevProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<DevProject | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminApi.getDevelopmentProjects()
      .then((d: DevProject[]) => setItems(d))
      .catch(() => setError("Failed to load development projects"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(item: DevProject) {
    setEditing(item);
    setForm({
      title: item.title,
      titleTa: item.titleTa ?? "",
      category: item.category,
      categoryTa: item.categoryTa ?? "",
      status: item.status,
      sortOrder: String(item.sortOrder),
    });
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        titleTa: form.titleTa || null,
        category: form.category,
        categoryTa: form.categoryTa || null,
        status: form.status,
        sortOrder: parseInt(form.sortOrder) || 0,
      };
      if (editing) await adminApi.updateDevelopmentProject(editing.id, payload);
      else await adminApi.createDevelopmentProject(payload);
      setOpen(false);
      load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this development project?")) return;
    await adminApi.deleteDevelopmentProject(id).catch(() => null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Development Projects</h2>
          <p className="text-sm text-muted-foreground">{items.length} projects</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add Project
        </Button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">No projects yet. Click "Add Project" to create one.</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{item.title}</p>
                    <Badge variant="secondary" className="text-xs">{item.category}</Badge>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[item.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {item.status}
                    </span>
                  </div>
                  {item.titleTa && (
                    <p className="text-xs text-muted-foreground mt-0.5">{item.titleTa}</p>
                  )}
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
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Project" : "New Development Project"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Title (English) *</Label>
                <Input
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                  className="mt-1 text-sm"
                  placeholder="e.g. Road widening project"
                />
              </div>
              <div>
                <Label className="text-xs">Title (Tamil)</Label>
                <Input
                  value={form.titleTa}
                  onChange={e => setForm(f => ({ ...f, titleTa: e.target.value }))}
                  className="mt-1 text-sm"
                  placeholder="தமிழில் தலைப்பு"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="mt-1 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORY_OPTIONS.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Category (Tamil)</Label>
                <Input
                  value={form.categoryTa}
                  onChange={e => setForm(f => ({ ...f, categoryTa: e.target.value }))}
                  className="mt-1 text-sm"
                  placeholder="பிரிவு தமிழில்"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="mt-1 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Sort Order</Label>
                <Input
                  type="number"
                  value={form.sortOrder}
                  onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
                  className="mt-1 text-sm"
                  placeholder="0"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.title}
              className="bg-primary hover:bg-primary/90"
            >
              {saving ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
