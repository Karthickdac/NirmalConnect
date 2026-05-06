import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";
import { adminApi } from "./api";

interface FaqItem {
  id: number;
  question: string;
  questionTa?: string | null;
  answer: string;
  answerTa?: string | null;
  order: number;
}

const emptyForm = { question: "", questionTa: "", answer: "", answerTa: "", order: 0 };

export default function FaqsAdmin() {
  const [items, setItems] = useState<FaqItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FaqItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminApi.getFaqs()
      .then((d: FaqItem[]) => setItems(d))
      .catch(() => setError("Failed to load FAQs"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, order: items.length });
    setOpen(true);
  }

  function openEdit(item: FaqItem) {
    setEditing(item);
    setForm({
      question: item.question, questionTa: item.questionTa ?? "",
      answer: item.answer, answerTa: item.answerTa ?? "", order: item.order,
    });
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        questionTa: form.questionTa || null,
        answerTa: form.answerTa || null,
      };
      if (editing) await adminApi.updateFaq(editing.id, payload);
      else await adminApi.createFaq(payload);
      setOpen(false);
      load();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this FAQ?")) return;
    await adminApi.deleteFaq(id).catch(() => null);
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">FAQs</h2>
          <p className="text-sm text-muted-foreground">{items.length} questions</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary hover:bg-primary/90">
          <Plus className="w-4 h-4" /> Add FAQ
        </Button>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      {loading ? (
        <p className="text-muted-foreground text-sm py-8 text-center">Loading…</p>
      ) : items.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground text-sm">No FAQs yet. Add your first one.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-start gap-3">
                <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.question}</p>
                  {item.questionTa && <p className="text-xs text-muted-foreground">{item.questionTa}</p>}
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.answer}</p>
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
            <DialogTitle>{editing ? "Edit FAQ" : "New FAQ"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs">Question (English) *</Label>
              <Input value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Question (Tamil)</Label>
              <Input value={form.questionTa} onChange={e => setForm(f => ({ ...f, questionTa: e.target.value }))} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Answer (English) *</Label>
              <Textarea value={form.answer} onChange={e => setForm(f => ({ ...f, answer: e.target.value }))} rows={4} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Answer (Tamil)</Label>
              <Textarea value={form.answerTa} onChange={e => setForm(f => ({ ...f, answerTa: e.target.value }))} rows={3} className="mt-1 text-sm" />
            </div>
            <div>
              <Label className="text-xs">Display Order</Label>
              <Input type="number" value={form.order} onChange={e => setForm(f => ({ ...f, order: parseInt(e.target.value) || 0 }))} className="mt-1 text-sm w-24" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.question || !form.answer} className="bg-primary hover:bg-primary/90">
              {saving ? "Saving…" : editing ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
