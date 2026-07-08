"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { useExitIntent } from "@/hooks/useExitIntent";
import { Button, ErrorBanner, Input } from "@/components/ui";
import { CheckIcon, XIcon } from "@/components/icons";

/** Mobile-and-desktop exit-intent popup offering local price ranges in exchange for a phone number. */
export default function ExitIntentModal() {
  const { triggered, dismiss } = useExitIntent();
  const [mobile, setMobile] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  if (!triggered) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post("/leads/capture", {
        fullName: `Exit-intent lead (${mobile})`,
        mobile,
        whatsappNumber: mobile,
        source: "WEBSITE_FORM",
        requirementNotes: "Exit-intent popup — requested local price ranges",
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="animate-fade-in fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={dismiss}>
      <div className="animate-pop-in relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-pop" onClick={(e) => e.stopPropagation()}>
        <button onClick={dismiss} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600"><XIcon className="h-4 w-4" /></button>
        {submitted ? (
          <div className="py-4 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100"><CheckIcon className="h-5 w-5 text-emerald-600" /></div>
            <p className="text-sm font-medium text-slate-800">Thanks! We'll text you the price guide shortly.</p>
          </div>
        ) : (
          <>
            <h3 className="text-lg font-semibold text-slate-800">Wait — before you go</h3>
            <p className="mt-1.5 text-sm text-slate-500">
              Get today's local property price ranges sent straight to your phone, free.
            </p>
            <ErrorBanner message={error} />
            <form onSubmit={submit} className="mt-4 space-y-3">
              <Input required minLength={5} type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 9xxxx xxxxx" />
              <Button type="submit" disabled={busy} className="w-full">{busy ? "Sending…" : "Send me the price guide"}</Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
