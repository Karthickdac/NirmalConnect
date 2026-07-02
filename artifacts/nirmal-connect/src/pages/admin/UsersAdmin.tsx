import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, KeyRound } from "lucide-react";
import { adminApi } from "./api";

interface AdminUser {
  id: number;
  email: string;
  name: string;
  role: string;
  isActive: string;
  createdAt: string;
}

const ROLE_OPTIONS = [
  { value: "super_admin", label: "Super Admin" },
  { value: "minister", label: "Minister" },
  { value: "pa_staff", label: "PA Staff" },
  { value: "constituency_coordinator", label: "Constituency Coordinator" },
  { value: "media_team", label: "Media Team" },
  { value: "grievance_officer", label: "Grievance Officer" },
];

const roleLabel = (v: string) => ROLE_OPTIONS.find((r) => r.value === v)?.label ?? v;

const roleColor: Record<string, string> = {
  super_admin: "bg-red-100 text-red-700",
  minister: "bg-purple-100 text-purple-700",
  pa_staff: "bg-blue-100 text-blue-700",
  constituency_coordinator: "bg-amber-100 text-amber-700",
  media_team: "bg-pink-100 text-pink-700",
  grievance_officer: "bg-green-100 text-green-700",
};

const emptyForm = {
  name: "",
  email: "",
  password: "",
  role: "grievance_officer",
  isActive: "true",
};

export default function UsersAdmin() {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    adminApi.getUsers()
      .then((d: AdminUser[]) => setItems(d))
      .catch(() => setError("Failed to load users"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setOpen(true);
  }

  function openEdit(item: AdminUser) {
    setEditing(item);
    setForm({
      name: item.name,
      email: item.email,
      password: "",
      role: item.role,
      isActive: item.isActive,
    });
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        const payload: Record<string, string> = {
          name: form.name,
          email: form.email,
          role: form.role,
          isActive: form.isActive,
        };
        if (form.password) payload.password = form.password;
        await adminApi.updateUser(editing.id, payload);
      } else {
        await adminApi.createUser({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          isActive: form.isActive,
        });
      }
      setOpen(false);
      load();
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: AdminUser) {
    if (!confirm(`Delete user "${item.name}" (${item.email})? They will no longer be able to log in.`)) return;
    try {
      await adminApi.deleteUser(item.id);
      load();
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to delete user");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">User Management</h2>
          <p className="text-sm text-muted-foreground">{items.length} staff accounts</p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-primary hover:bg-primary/90" data-testid="button-add-user">
          <Plus className="w-4 h-4" /> Add User
        </Button>
      </div>

      {error && !open && <p className="text-red-500 text-sm" data-testid="text-users-error">{error}</p>}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">No users found.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((u) => (
            <Card key={u.id} data-testid={`user-row-${u.id}`}>
              <CardContent className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{u.name}</span>
                    <Badge className={`${roleColor[u.role] ?? "bg-gray-100 text-gray-700"} border-0`}>{roleLabel(u.role)}</Badge>
                    {u.isActive !== "true" && <Badge variant="outline" className="text-red-600 border-red-300">Inactive</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground truncate">{u.email}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openEdit(u)} data-testid={`button-edit-user-${u.id}`}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => handleDelete(u)} data-testid={`button-delete-user-${u.id}`}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit User" : "Add User"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <div className="space-y-1">
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="input-user-name" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-user-email" />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" />
                {editing ? "New Password (leave blank to keep current)" : "Password (min 8 characters)"}
              </Label>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="input-user-password" />
            </div>
            <div className="space-y-1">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                <SelectTrigger data-testid="select-user-role"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.isActive} onValueChange={(v) => setForm({ ...form, isActive: v })}>
                <SelectTrigger data-testid="select-user-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Active</SelectItem>
                  <SelectItem value="false">Inactive (cannot log in)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.name || !form.email || (!editing && form.password.length < 8)}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-save-user"
            >
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
