"use client";

import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { Button, ErrorBanner, Field, Input, Select, Textarea } from "@/components/ui";
import { Lead, LEAD_SOURCES, PRIORITIES, PROPERTY_TYPES, User, labelize } from "@/lib/types";
import { useCurrencies } from "@/lib/useCurrencies";

interface Props {
  initial?: Partial<Lead>;
  onSaved: (lead: Lead) => void;
  onCancel: () => void;
}

// Letters, digits, spaces, and the handful of punctuation marks real names use (O'Brien, St. Anne's, campaign suffixes).
const PERSON_NAME_CHARS = /[^a-zA-Z0-9\s'.-]/g;
const PLACE_NAME_CHARS = /[^a-zA-Z\s'.-]/g;
// Digits plus the punctuation a phone number is actually written with.
const PHONE_CHARS = /[^\d+\s().-]/g;

function sanitizeName(v: string) {
  return v.replace(PERSON_NAME_CHARS, "");
}
function sanitizePlace(v: string) {
  return v.replace(PLACE_NAME_CHARS, "");
}
function sanitizePhone(v: string) {
  return v.replace(PHONE_CHARS, "");
}

export default function LeadForm({ initial, onSaved, onCancel }: Props) {
  const isEdit = !!initial?.id;
  const currencies = useCurrencies();
  const [staff, setStaff] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    fullName: initial?.fullName ?? "",
    mobile: initial?.mobile ?? "",
    whatsappNumber: initial?.whatsappNumber ?? "",
    email: initial?.email ?? "",
    country: initial?.country ?? "",
    city: initial?.city ?? "",
    preferredArea: initial?.preferredArea ?? "",
    budgetMin: initial?.budgetMin?.toString() ?? "",
    budgetMax: initial?.budgetMax?.toString() ?? "",
    currency: initial?.currency ?? "INR",
    propertyType: initial?.propertyType ?? "",
    bedrooms: initial?.bedrooms?.toString() ?? "",
    source: initial?.source ?? "MANUAL",
    priority: initial?.priority ?? "MEDIUM",
    assignedToId: initial?.assignedToId ?? "",
    requirementNotes: initial?.requirementNotes ?? "",
  });

  useEffect(() => {
    api.get<{ data: User[] }>("/users?active=true").then((res) =>
      setStaff(res.data.filter((u) => u.role === "SALES_EXECUTIVE" || u.role === "SALES_MANAGER"))
    ).catch(() => {});
  }, []);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!form.fullName.trim()) errs.fullName = "Full name is required";
    if (!form.mobile.trim()) errs.mobile = "Mobile number is required";
    else if (!/^[\d+\s().-]{7,}$/.test(form.mobile)) errs.mobile = "Enter a valid phone number";
    if (form.whatsappNumber && !/^[\d+\s().-]{7,}$/.test(form.whatsappNumber)) errs.whatsappNumber = "Enter a valid phone number";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setError(null);
    const payload = {
      ...form,
      email: form.email || null,
      whatsappNumber: form.whatsappNumber || null,
      budgetMin: form.budgetMin ? Number(form.budgetMin) : null,
      budgetMax: form.budgetMax ? Number(form.budgetMax) : null,
      propertyType: form.propertyType || null,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
      assignedToId: form.assignedToId || null,
      ...(isEdit ? { expectedUpdatedAt: initial!.updatedAt } : {}),
    };
    try {
      const res = isEdit
        ? await api.put<{ data: Lead }>(`/leads/${initial!.id}`, payload)
        : await api.post<{ data: Lead }>("/leads", payload);
      onSaved(res.data);
    } catch (err) {
      // Backend zod rejections come back with per-field paths — point at the actual
      // fields instead of showing an unhelpful flat "Validation failed" banner.
      if (err instanceof ApiError && err.errors?.length) {
        setFieldErrors(Object.fromEntries(err.errors.map((e) => [e.path, e.message])));
        setError("Please fix the highlighted fields below");
      } else {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBanner message={error} />
      <h4 className="border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name *" error={fieldErrors.fullName}>
          <Input required value={form.fullName} onChange={(e) => set("fullName", sanitizeName(e.target.value))} />
        </Field>
        <Field label="Mobile *" error={fieldErrors.mobile}>
          <Input required type="tel" value={form.mobile} onChange={(e) => set("mobile", sanitizePhone(e.target.value))} placeholder="+91 9…" />
        </Field>
        <Field label="WhatsApp number" error={fieldErrors.whatsappNumber}>
          <Input type="tel" value={form.whatsappNumber ?? ""} onChange={(e) => set("whatsappNumber", sanitizePhone(e.target.value))} placeholder="defaults to mobile" />
        </Field>
        <Field label="Email" error={fieldErrors.email}>
          <Input type="email" value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Country" error={fieldErrors.country}>
          <Input value={form.country ?? ""} onChange={(e) => set("country", sanitizePlace(e.target.value))} />
        </Field>
        <Field label="City" error={fieldErrors.city}>
          <Input value={form.city ?? ""} onChange={(e) => set("city", sanitizePlace(e.target.value))} />
        </Field>
      </div>
      <h4 className="border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Requirement</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Preferred area">
          <Input value={form.preferredArea ?? ""} onChange={(e) => set("preferredArea", e.target.value)} />
        </Field>
        <Field label="Property type">
          <Select value={form.propertyType ?? ""} onChange={(e) => set("propertyType", e.target.value)}>
            <option value="">Any</option>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{labelize(t)}</option>)}
          </Select>
        </Field>
        <Field label="Budget min" error={fieldErrors.budgetMin}>
          <Input type="number" min={0} value={form.budgetMin} onChange={(e) => set("budgetMin", e.target.value)} />
        </Field>
        <Field label="Budget max" error={fieldErrors.budgetMax}>
          <Input type="number" min={0} value={form.budgetMax} onChange={(e) => set("budgetMax", e.target.value)} />
        </Field>
        <Field label="Currency">
          <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            {currencies.map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Bedrooms">
          <Input type="number" min={0} value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} />
        </Field>
      </div>
      <h4 className="border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Tracking</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Source">
          <Select value={form.source} onChange={(e) => set("source", e.target.value)}>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
          </Select>
        </Field>
        <Field label="Priority">
          <Select value={form.priority} onChange={(e) => set("priority", e.target.value)}>
            {PRIORITIES.map((p) => <option key={p} value={p}>{labelize(p)}</option>)}
          </Select>
        </Field>
        {!isEdit && (
          <Field label="Assign to">
            <Select value={form.assignedToId ?? ""} onChange={(e) => set("assignedToId", e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      {isEdit && (
        <p className="text-xs text-slate-500">
          To reassign or transfer this lead, use the assign/transfer dropdown on the lead&apos;s detail page.
        </p>
      )}
      <Field label="Requirement notes">
        <Textarea rows={3} value={form.requirementNotes ?? ""} onChange={(e) => set("requirementNotes", e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : isEdit ? "Save changes" : "Create lead"}</Button>
      </div>
    </form>
  );
}
