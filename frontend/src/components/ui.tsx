"use client";

import { forwardRef } from "react";
import { IconType, XIcon } from "@/components/icons";

// ── Minimal UI kit (shadcn-style, Tailwind only) ─────────────────────

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost"; size?: "sm" | "md" }
>(function Button({ variant = "primary", size = "md", className = "", ...props }, ref) {
  const variants = {
    primary: "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-sm shadow-brand-600/30 hover:from-brand-600 hover:to-brand-700 disabled:from-brand-500/60 disabled:to-brand-600/60",
    secondary: "border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50",
    danger: "bg-red-600 text-white shadow-sm shadow-red-600/25 hover:bg-red-700",
    ghost: "text-slate-600 hover:bg-slate-100",
  };
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm" };
  return (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-1 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = "", ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 ${className}`}
        {...props}
      />
    );
  }
);

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = "", children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 ${className}`}
        {...props}
      >
        {children}
      </select>
    );
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = "", ...props }, ref) {
    return (
      <textarea
        ref={ref}
        className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 ${className}`}
        {...props}
      />
    );
  }
);

export function Field({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

const badgeTones: Record<string, string> = {
  // lead statuses
  NEW: "bg-blue-50 text-blue-700 ring-blue-200",
  CONTACTED: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  PROPERTY_SHARED: "bg-violet-50 text-violet-700 ring-violet-200",
  FOLLOW_UP: "bg-amber-50 text-amber-700 ring-amber-200",
  INTERESTED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  NEGOTIATION: "bg-orange-50 text-orange-700 ring-orange-200",
  SHARED_TO_PARTNER: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  CONVERTED: "bg-green-100 text-green-800 ring-green-300",
  CLOSED_LOST: "bg-slate-100 text-slate-600 ring-slate-300",
  INVALID: "bg-red-50 text-red-700 ring-red-200",
  // availability
  AVAILABLE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  BOOKED: "bg-amber-50 text-amber-700 ring-amber-200",
  SOLD: "bg-slate-100 text-slate-600 ring-slate-300",
  RENTED: "bg-blue-50 text-blue-700 ring-blue-200",
  INACTIVE: "bg-slate-100 text-slate-500 ring-slate-200",
  // priority
  LOW: "bg-slate-50 text-slate-600 ring-slate-200",
  MEDIUM: "bg-blue-50 text-blue-700 ring-blue-200",
  HIGH: "bg-orange-50 text-orange-700 ring-orange-200",
  URGENT: "bg-red-50 text-red-700 ring-red-200",
  // partner share
  ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  ACCEPTED: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  IN_PROGRESS: "bg-blue-50 text-blue-700 ring-blue-200",
  CLIENT_CONTACTED: "bg-violet-50 text-violet-700 ring-violet-200",
  PROPERTY_SENT: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  REJECTED: "bg-red-50 text-red-700 ring-red-200",
  CLOSED: "bg-slate-100 text-slate-600 ring-slate-300",
  SENT: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  DELIVERED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  FAILED: "bg-red-50 text-red-700 ring-red-200",
  QUEUED: "bg-amber-50 text-amber-700 ring-amber-200",
};

export function Badge({ value, className = "" }: { value: string; className?: string }) {
  const tone = badgeTones[value] ?? "bg-slate-50 text-slate-600 ring-slate-200";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${tone} ${className}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200/80 bg-white shadow-card ${className}`}>{children}</div>;
}

export function PageHeader({
  icon: Icon, title, subtitle, actions,
}: { icon: IconType; title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-brand-100 ring-1 ring-inset ring-brand-100">
          <Icon className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-800">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="animate-fade-in fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm sm:p-8" onClick={onClose}>
      <div
        className={`animate-pop-in w-full ${wide ? "max-w-4xl" : "max-w-lg"} rounded-2xl bg-white shadow-pop ring-1 ring-slate-900/5`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><XIcon className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-8 w-8 animate-spin rounded-full border-[2.5px] border-brand-100 border-t-brand-600" />
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-12 text-center text-sm text-slate-500">{message}</div>;
}

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{message}</div>;
}

export function Pagination({
  page, pageSize, total, onPage,
}: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-600">
      <span>
        Page {page} of {pages} · {total} records
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Prev</Button>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</Button>
      </div>
    </div>
  );
}
