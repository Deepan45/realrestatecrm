"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, Select, Spinner } from "@/components/ui";
import { PartnerCompany, Role, User, fmtDate, labelize } from "@/lib/types";

const ROLES: Role[] = ["SUPER_ADMIN", "SALES_MANAGER", "SALES_EXECUTIVE", "PROPERTY_STAFF", "PARTNER_USER"];
const emptyForm = { name: "", email: "", password: "", role: "SALES_EXECUTIVE" as Role, phone: "", partnerCompanyId: "" };

export default function UsersPage() {
  const { user: me, hasRole } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [partners, setPartners] = useState<PartnerCompany[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<{ data: User[] }>("/users").then((r) => setUsers(r.data)).catch((e) => setError(e.message));
    api.get<{ data: PartnerCompany[] }>("/partners").then((r) => setPartners(r.data)).catch(() => {});
  }, []);

  useEffect(load, [load]);

  if (!hasRole()) return <p className="text-sm text-slate-500">Only the super admin can manage users.</p>;

  function openForm(u?: User) {
    setEditing(u ?? null);
    setForm(u
      ? { name: u.name, email: u.email, password: "", role: u.role, phone: u.phone ?? "", partnerCompanyId: u.partnerCompanyId ?? "" }
      : { ...emptyForm });
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = {
      name: form.name,
      email: form.email,
      role: form.role,
      phone: form.phone || undefined,
      partnerCompanyId: form.role === "PARTNER_USER" ? form.partnerCompanyId || null : null,
    };
    if (form.password) payload.password = form.password;
    try {
      if (editing) await api.put(`/users/${editing.id}`, payload);
      else await api.post("/users", payload);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(u: User) {
    await api.put(`/users/${u.id}`, { isActive: !u.isActive }).catch((e) => setError(e.message));
    load();
  }

  if (!users) return <Spinner />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">User management</h1>
        <Button onClick={() => openForm()}>+ Add user</Button>
      </div>
      <ErrorBanner message={error} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Partner company</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">{u.name}</td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3"><Badge value={u.role} /></td>
                  <td className="px-4 py-3 text-slate-600">{u.partnerCompany?.name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Badge value={u.isActive ? "ACTIVE" : "INACTIVE"} />
                  </td>
                  <td className="px-4 py-3 text-slate-500">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openForm(u)}>Edit</Button>
                      {u.id !== me?.id && (
                        <Button variant={u.isActive ? "danger" : "secondary"} size="sm" onClick={() => toggleActive(u)}>
                          {u.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit user" : "Add user"}>
        <form onSubmit={save} className="space-y-4">
          <Field label="Name *">
            <Input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Email *">
            <Input type="email" required value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label={editing ? "New password (leave blank to keep)" : "Password *"}>
            <Input type="password" minLength={8} required={!editing} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
          <Field label="Role *">
            <Select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
              {ROLES.map((r) => <option key={r} value={r}>{labelize(r)}</option>)}
            </Select>
          </Field>
          {form.role === "PARTNER_USER" && (
            <Field label="Partner company *">
              <Select required value={form.partnerCompanyId} onChange={(e) => setForm((f) => ({ ...f, partnerCompanyId: e.target.value }))}>
                <option value="">Select…</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
