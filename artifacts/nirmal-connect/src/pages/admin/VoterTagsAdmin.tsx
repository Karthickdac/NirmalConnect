import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { getToken } from "@/lib/auth";
import { useGetMe } from "@workspace/api-client-react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

export interface VoterTag {
  id: number;
  name: string;
  nameTa: string | null;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const tok = getToken();
  return fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(tok ? { Authorization: `Bearer ${tok}` } : {}),
      ...(init.headers ?? {}),
    },
  });
}

async function jsonOrThrow<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${r.status}`);
  }
  return r.json() as Promise<T>;
}

export function useVoterTags() {
  return useQuery<{ items: VoterTag[] }>({
    queryKey: ["voter-tags"],
    queryFn: () => authFetch("/admin/voter-tags").then((r) => jsonOrThrow<{ items: VoterTag[] }>(r)),
    staleTime: 60_000,
  });
}

interface FormState {
  id: number | null;
  name: string;
  nameTa: string;
  color: string;
  sortOrder: string;
}

const EMPTY_FORM: FormState = { id: null, name: "", nameTa: "", color: "#6366f1", sortOrder: "100" };

export default function VoterTagsAdmin() {
  const { data: me } = useGetMe();
  const isSuperAdmin = me?.role === "super_admin";
  const qc = useQueryClient();
  const { data, isFetching, error } = useVoterTags();
  const [form, setForm] = useState<FormState | null>(null);

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        name: f.name.trim(),
        nameTa: f.nameTa.trim() || null,
        color: f.color,
        sortOrder: Number.parseInt(f.sortOrder || "100", 10) || 100,
      };
      const r = f.id == null
        ? await authFetch("/admin/voter-tags", { method: "POST", body: JSON.stringify(payload) })
        : await authFetch(`/admin/voter-tags/${f.id}`, { method: "PUT", body: JSON.stringify(payload) });
      return jsonOrThrow<VoterTag>(r);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["voter-tags"] });
      setForm(null);
    },
  });

  const del = useMutation({
    mutationFn: async (id: number) => {
      const r = await authFetch(`/admin/voter-tags/${id}`, { method: "DELETE" });
      return jsonOrThrow(r);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voter-tags"] }),
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Voter Tags</h2>
          <p className="text-sm text-muted-foreground">
            Bilingual labels applied to voters during outreach. Officers and coordinators
            can assign these tags to voters in their assigned area; only super admins can
            edit the catalog.
          </p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setForm({ ...EMPTY_FORM })} data-testid="button-new-voter-tag">
            <Plus className="w-4 h-4 mr-1" /> New tag
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-2 border-b text-xs text-muted-foreground">
            {isFetching && items.length === 0 ? "Loading…" : (
              error ? <span className="text-destructive">Error: {(error as Error).message}</span>
              : `${items.length} tag${items.length === 1 ? "" : "s"}`
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  {["Tag", "Tamil", "Order", ""].map(h => (
                    <th key={h} className="text-left px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map(t => (
                  <tr key={t.id} className="hover:bg-muted/20" data-testid={`row-voter-tag-${t.id}`}>
                    <td className="px-4 py-2">
                      <span
                        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: t.color }}
                      >
                        {t.name}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-sm">{t.nameTa ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{t.sortOrder}</td>
                    <td className="px-4 py-2 text-right space-x-1">
                      {isSuperAdmin && (
                        <>
                          <Button
                            size="sm" variant="ghost" className="h-7 text-xs"
                            onClick={() => setForm({
                              id: t.id, name: t.name, nameTa: t.nameTa ?? "",
                              color: t.color, sortOrder: String(t.sortOrder),
                            })}
                            data-testid={`button-edit-voter-tag-${t.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm" variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            disabled={del.isPending}
                            onClick={() => {
                              if (window.confirm(`Delete tag "${t.name}"? All voter assignments will also be removed.`)) {
                                del.mutate(t.id);
                              }
                            }}
                            data-testid={`button-delete-voter-tag-${t.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && !isFetching && (
                  <tr><td colSpan={4} className="text-center text-muted-foreground py-12">
                    No tags yet. {isSuperAdmin && "Click \"New tag\" to add one."}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={form != null} onOpenChange={(o) => { if (!o) setForm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form?.id == null ? "New voter tag" : "Edit voter tag"}</DialogTitle>
          </DialogHeader>
          {form && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">Name (English)</label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  data-testid="input-voter-tag-name"
                />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Name (Tamil)</label>
                <Input
                  value={form.nameTa}
                  onChange={(e) => setForm({ ...form, nameTa: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium block mb-1">Colour</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="h-9 w-12 rounded border cursor-pointer"
                    />
                    <Input
                      value={form.color}
                      onChange={(e) => setForm({ ...form, color: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1">Sort order</label>
                  <Input
                    type="number" min={0} max={9999}
                    value={form.sortOrder}
                    onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
                  />
                </div>
              </div>
              {save.error && (
                <div className="text-sm text-destructive">{(save.error as Error).message}</div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setForm(null)}>Cancel</Button>
            <Button
              onClick={() => form && save.mutate(form)}
              disabled={save.isPending || !form?.name.trim()}
              data-testid="button-save-voter-tag"
            >
              {save.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
