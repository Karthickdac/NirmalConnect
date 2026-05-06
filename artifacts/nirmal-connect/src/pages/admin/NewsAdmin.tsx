import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { adminApi } from "./api";
import RichTextEditor from "@/components/RichTextEditor";

interface NewsItem {
  id: number;
  title: string;
  titleTa?: string | null;
  content: string;
  contentTa?: string | null;
  imageUrl?: string | null;
  category: string;
  featured: boolean;
  publishedAt?: string | null;
  createdAt: string;
}

interface NewsAdminProps {
  fixedCategory?: string;
  categoryLabel?: string;
  sectionTitle?: string;
}

export default function NewsAdmin({ fixedCategory, categoryLabel = "Article", sectionTitle = "News & Announcements" }: NewsAdminProps) {
  const defaultCategory = fixedCategory ?? "general";
  const [items, setItems] = useState<NewsItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<NewsItem | null>(null);
  const [form, setForm] = useState({ title: "", titleTa: "", content: "", contentTa: "", imageUrl: "", category: defaultCategory, featured: false, publishedAt: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (p = page) => {
    setLoading(true);
    adminApi.getNews(p, 15, fixedCategory)
      .then((d: { items: NewsItem[]; total: number }) => { setItems(d.items); setTotal(d.total); })
      .catch(() => setError("Failed to load news"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [page]);

  function openCreate() {
    setEditing(null);
    setForm({ title: "", titleTa: "", content: "", contentTa: "", imageUrl: "", category: defaultCategory, featured: false, publishedAt: "" });
    setOpen(true);
  }

  function openEdit(item: NewsItem) {
    setEditing(item);
    setForm({
      title: item.title, titleTa: item.titleTa ?? "", content: item.content,
      contentTa: item.contentTa ?? "", imageUrl: item.imageUrl ?? "",
      category: item.category, featured: item.featured,
      publishedAt: item.publishedAt ? item.publishedAt.slice(0, 10) : "",
    });
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        imageUrl: form.imageUrl || null,
        titleTa: form.titleTa || null,
        contentTa: form.contentTa || null,
        publishedAt: form.publishedAt || null,
      };
      if (editing) {
        await adminApi.updateNews(editing.id, payload);
      } else {
        await adminApi.createNews(payload);
      }
      setOpen(false);
      setPage(1);
      load(1);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this article?")) return;
    await adminApi.deleteNews(id).catch(() => null);
    load();
  }

  const totalPages = Math.ceil(total / 15);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{sectionTitle}</h2>
          <p className="text-sm text-muted-foreground">{total} articles{fixedCategory ? ` (${fixedCategory})` : ""}</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add {categoryLabel || "Article"}
        </Button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-sm py-8 text-center">No articles yet</p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-start gap-4">
                {item.imageUrl && (
                  <img src={item.imageUrl} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm truncate">{item.title}</p>
                    {item.featured && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Featured</Badge>}
                    <Badge variant="outline" className="text-xs">{item.category}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{item.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(item.createdAt).toLocaleDateString("en-IN")}
                  </p>
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
            <DialogTitle>{editing ? `Edit ${categoryLabel || "Article"}` : `New ${categoryLabel || "Article"}`}</DialogTitle>
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
              <Label className="text-xs">Content (English) *</Label>
              <RichTextEditor
                value={form.content}
                onChange={html => setForm(f => ({ ...f, content: html }))}
                placeholder="Write article content here…"
                minHeight={140}
              />
            </div>
            <div>
              <Label className="text-xs">Content (Tamil)</Label>
              <RichTextEditor
                value={form.contentTa}
                onChange={html => setForm(f => ({ ...f, contentTa: html }))}
                placeholder="தமிழில் உள்ளடக்கத்தை இங்கே எழுதுங்கள்…"
                minHeight={100}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Image URL</Label>
                <Input value={form.imageUrl} onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))} placeholder="https://…" className="mt-1 text-sm" />
              </div>
              <div>
                <Label className="text-xs">{categoryLabel ? "Category" : "Category"}</Label>
                <Input value={form.category} readOnly={!!fixedCategory}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className={`mt-1 text-sm ${fixedCategory ? "bg-muted" : ""}`} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Published At</Label>
                <Input type="date" value={form.publishedAt} onChange={e => setForm(f => ({ ...f, publishedAt: e.target.value }))} className="mt-1 text-sm" />
              </div>
              <div className="flex items-center gap-2 mt-5">
                <input type="checkbox" id="featured" checked={form.featured} onChange={e => setForm(f => ({ ...f, featured: e.target.checked }))} className="rounded" />
                <label htmlFor="featured" className="text-sm cursor-pointer">Featured article</label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.title || !form.content} className="bg-primary hover:bg-primary/90">
              {saving ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
