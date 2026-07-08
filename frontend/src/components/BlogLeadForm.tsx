"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { Button, ErrorBanner, Field, Input } from "@/components/ui";
import { CheckIcon } from "@/components/icons";

/** Sticky lead-capture form for blog article sidebars — same public /leads/capture endpoint as the enquiry page. */
export default function BlogLeadForm({ sourceTag }: { sourceTag: string }) {
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/leads/capture", {
        fullName,
        mobile,
        whatsappNumber: mobile,
        source: "WEBSITE_FORM",
        requirementNotes: `Blog: ${sourceTag}`,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong, please try again");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
        <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100"><CheckIcon className="h-5 w-5 text-emerald-600" /></div>
        <p className="text-sm font-medium text-emerald-800">Thanks! We'll be in touch shortly.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <h3 className="text-sm font-semibold text-slate-800">Talk to a property expert</h3>
      <p className="mt-1 text-xs text-slate-500">Get personalized recommendations — no obligation.</p>
      <ErrorBanner message={error} />
      <form onSubmit={submit} className="mt-3 space-y-3">
        <Field label="Name">
          <Input required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
        </Field>
        <Field label="Mobile">
          <Input required minLength={5} type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 9xxxx xxxxx" />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">{busy ? "Sending…" : "Request a callback"}</Button>
      </form>
    </div>
  );
}
