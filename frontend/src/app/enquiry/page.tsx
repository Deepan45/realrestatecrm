"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, ErrorBanner, Field, Input, Select, Textarea } from "@/components/ui";
import { CheckIcon } from "@/components/icons";

const PROPERTY_TYPES = ["APARTMENT", "VILLA", "TOWNHOUSE", "PENTHOUSE", "STUDIO", "PLOT", "OFFICE", "RETAIL", "WAREHOUSE", "OTHER"];

const initialForm = {
  fullName: "",
  mobile: "",
  whatsappNumber: "",
  email: "",
  country: "",
  city: "",
  preferredArea: "",
  budgetMin: "",
  budgetMax: "",
  propertyType: "",
  bedrooms: "",
  requirementNotes: "",
};

export default function EnquiryPage() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function set<K extends keyof typeof initialForm>(key: K, value: (typeof initialForm)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/leads/capture", {
        fullName: form.fullName,
        mobile: form.mobile,
        whatsappNumber: form.whatsappNumber || form.mobile,
        email: form.email,
        country: form.country || null,
        city: form.city || null,
        preferredArea: form.preferredArea || null,
        budgetMin: form.budgetMin ? Number(form.budgetMin) : null,
        budgetMax: form.budgetMax ? Number(form.budgetMax) : null,
        propertyType: form.propertyType || null,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
        requirementNotes: form.requirementNotes || null,
        source: "WEBSITE_FORM",
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong, please try again");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4 py-10">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand-700/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-gold-500/10 blur-3xl" />
      </div>
      <Card className="relative w-full max-w-2xl p-8 shadow-pop ring-1 ring-white/10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-bold text-white shadow-lg shadow-brand-600/30 ring-1 ring-white/20">
            R
          </div>
          <h1 className="text-xl font-semibold tracking-tight">RealRest</h1>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold-600">Real Estate CRM</p>
          <p className="mt-3 text-sm text-slate-500">
            Tell us what you are looking for and our team will get back to you shortly.
          </p>
        </div>

        {submitted ? (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100"><CheckIcon className="h-6 w-6 text-emerald-600" /></div>
            <h2 className="text-lg font-semibold text-slate-800">Thank you!</h2>
            <p className="mt-2 text-sm text-slate-500">
              Your enquiry has been received. One of our consultants will contact you soon.
            </p>
            <Button className="mt-6" variant="secondary" onClick={() => { setForm(initialForm); setSubmitted(false); }}>
              Submit another enquiry
            </Button>
          </div>
        ) : (
          <>
            <ErrorBanner message={error} />
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name *">
                  <Input required minLength={2} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} placeholder="Your name" />
                </Field>
                <Field label="Mobile *">
                  <Input required minLength={5} type="tel" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} placeholder="+91 9xxxx xxxxx" />
                </Field>
                <Field label="WhatsApp number">
                  <Input type="tel" value={form.whatsappNumber} onChange={(e) => set("whatsappNumber", e.target.value)} placeholder="Same as mobile if empty" />
                </Field>
                <Field label="Email">
                  <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@example.com" />
                </Field>
                <Field label="Country">
                  <Input value={form.country} onChange={(e) => set("country", e.target.value)} placeholder="e.g. India" />
                </Field>
                <Field label="City">
                  <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="e.g. Chennai" />
                </Field>
                <Field label="Preferred area">
                  <Input value={form.preferredArea} onChange={(e) => set("preferredArea", e.target.value)} placeholder="e.g. Anna Nagar" />
                </Field>
                <Field label="Property type">
                  <Select value={form.propertyType} onChange={(e) => set("propertyType", e.target.value)}>
                    <option value="">Any</option>
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Bedrooms">
                  <Select value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)}>
                    <option value="">Any</option>
                    <option value="0">Studio</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>{n} BR{n === 5 ? "+" : ""}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Budget (INR)">
                  <div className="flex gap-2">
                    <Input type="number" min={0} value={form.budgetMin} onChange={(e) => set("budgetMin", e.target.value)} placeholder="Min" />
                    <Input type="number" min={0} value={form.budgetMax} onChange={(e) => set("budgetMax", e.target.value)} placeholder="Max" />
                  </div>
                </Field>
              </div>
              <Field label="Anything else we should know?">
                <Textarea rows={3} value={form.requirementNotes} onChange={(e) => set("requirementNotes", e.target.value)} placeholder="Requirements, timeline, questions…" />
              </Field>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Submitting…" : "Submit enquiry"}
              </Button>
              <p className="text-center text-xs text-slate-400">
                By submitting, you agree to be contacted by our team about your enquiry.
              </p>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
