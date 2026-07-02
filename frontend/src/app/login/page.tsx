"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button, Card, ErrorBanner, Field, Input } from "@/components/ui";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      if (forgotMode) {
        const res = await api.post<{ message: string }>("/auth/forgot-password", { email });
        setInfo(res.message);
      } else {
        await login(email, password);
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-brand-700/30 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-gold-500/10 blur-3xl" />
      </div>
      <Card className="relative w-full max-w-md p-8 shadow-pop ring-1 ring-white/10">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-2xl font-bold text-white shadow-lg shadow-brand-600/30 ring-1 ring-white/20">
            R
          </div>
          <h1 className="text-xl font-semibold tracking-tight">RealRest</h1>
          <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-gold-600">Real Estate CRM</p>
          <p className="mt-3 text-sm text-slate-500">
            {forgotMode ? "Enter your email to receive a reset link" : "Sign in to your workspace"}
          </p>
        </div>
        <ErrorBanner message={error} />
        {info && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700">{info}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Email">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
          </Field>
          {!forgotMode && (
            <Field label="Password">
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
            </Field>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Please wait…" : forgotMode ? "Send reset link" : "Sign in"}
          </Button>
        </form>
        <button
          className="mt-4 w-full text-center text-xs text-brand-600 hover:underline"
          onClick={() => { setForgotMode(!forgotMode); setError(null); setInfo(null); }}
        >
          {forgotMode ? "← Back to login" : "Forgot password?"}
        </button>
        <p className="mt-6 rounded-lg bg-slate-50 p-3 text-center text-xs text-slate-500">
          Demo: admin@realrest.example / Admin@1234
        </p>
      </Card>
    </div>
  );
}
