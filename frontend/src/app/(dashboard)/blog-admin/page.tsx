"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, ErrorBanner, Field, Input, Modal, PageHeader, Spinner, Textarea } from "@/components/ui";
import { NewspaperIcon } from "@/components/icons";
import { BlogPost, fmtDate } from "@/lib/types";

const emptyForm = { slug: "", title: "", excerpt: "", coverImageUrl: "", body: "", isPublished: false };

export default function BlogAdminPage() {
  const { hasRole } = useAuth();
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<BlogPost | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get<{ data: BlogPost[] }>("/blog/admin/all").then((r) => setPosts(r.data)).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  if (!hasRole("SALES_MANAGER")) return <p className="text-sm text-slate-500">Only sales managers can manage the blog.</p>;

  function openForm(p?: BlogPost) {
    setEditing(p ?? null);
    setForm(p
      ? { slug: p.slug, title: p.title, excerpt: p.excerpt ?? "", coverImageUrl: p.coverImageUrl ?? "", body: p.body, isPublished: p.isPublished }
      : { ...emptyForm });
    setShowForm(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) await api.put(`/blog/${editing.id}`, form);
      else await api.post("/blog", form);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: BlogPost) {
    if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    await api.del(`/blog/${p.id}`).catch((e) => setError(e.message));
    load();
  }

  if (!posts) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={NewspaperIcon}
        title="Blog"
        subtitle="Articles that power the public insights &amp; guides site"
        actions={<Button onClick={() => openForm()}>+ New post</Button>}
      />
      <ErrorBanner message={error} />
      <Card>
        <div className="divide-y divide-slate-100">
          {posts.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.title}</span>
                  <Badge value={p.isPublished ? "ACTIVE" : "INACTIVE"} className={p.isPublished ? "" : ""} />
                </div>
                <p className="text-xs text-slate-400">/blog/{p.slug} · {fmtDate(p.createdAt)}</p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="secondary" size="sm" onClick={() => openForm(p)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => remove(p)}>Delete</Button>
              </div>
            </div>
          ))}
          {posts.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No posts yet.</p>}
        </div>
      </Card>

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? "Edit post" : "New post"} wide>
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Slug * (lowercase, hyphens only)">
              <Input required disabled={!!editing} value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="chennai-market-outlook-2026" />
            </Field>
            <Field label="Title *">
              <Input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </Field>
          </div>
          <Field label="Cover image URL">
            <Input value={form.coverImageUrl} onChange={(e) => setForm((f) => ({ ...f, coverImageUrl: e.target.value }))} placeholder="https://…" />
          </Field>
          <Field label="Excerpt">
            <Input value={form.excerpt} onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))} placeholder="Short teaser shown on the listing page" />
          </Field>
          <Field label="Body *">
            <Textarea rows={10} required value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm((f) => ({ ...f, isPublished: e.target.checked }))} />
            Published (visible on the public site)
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
