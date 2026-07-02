"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";
import { labelize } from "@/lib/types";

interface DashboardData {
  totalLeads: number;
  newToday: number;
  propertiesAvailable: number;
  propertiesSharedToday: number;
  whatsappSentToday: number;
  partnerSharedLeads: number;
  conversionRate: number;
  followUpsDueToday: number;
  leadsBySource: { source: string; count: number }[];
  leadsByStage: { stage: string; count: number }[];
  leadsByStaff: { staffId: string; name: string; count: number }[];
}

function Stat({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  const inner = (
    <Card className="group relative overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500/60 via-brand-400/30 to-transparent opacity-0 transition group-hover:opacity-100" />
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-slate-800">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function BarList({ title, rows }: { title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Card className="p-4">
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {rows.length === 0 && <p className="text-sm text-slate-400">No data yet</p>}
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-2 text-sm">
            <span className="w-40 shrink-0 truncate text-slate-600">{r.label}</span>
            <div className="h-2.5 flex-1 rounded-full bg-slate-100">
              <div className="h-2.5 rounded-full bg-brand-500" style={{ width: `${(r.count / max) * 100}%` }} />
            </div>
            <span className="w-8 text-right font-medium">{r.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ data: DashboardData }>("/reports/dashboard")
      .then((res) => setData(res.data))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <Spinner />;

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">Dashboard</h1>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total leads" value={data.totalLeads} href="/leads" />
        <Stat label="New today" value={data.newToday} />
        <Stat label="Follow-ups due" value={data.followUpsDueToday} hint="today" href="/leads?followUpDue=true" />
        <Stat label="Conversion rate" value={`${data.conversionRate}%`} />
        <Stat label="Properties available" value={data.propertiesAvailable} href="/properties" />
        <Stat label="Shared today" value={data.propertiesSharedToday} hint="via WhatsApp" />
        <Stat label="WhatsApp sent today" value={data.whatsappSentToday} />
        <Stat label="Partner-shared leads" value={data.partnerSharedLeads} href="/partners" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarList title="Leads by source" rows={data.leadsBySource.map((s) => ({ label: labelize(s.source), count: s.count }))} />
        <BarList title="Leads by pipeline stage" rows={data.leadsByStage.filter((s) => s.count > 0).map((s) => ({ label: labelize(s.stage), count: s.count }))} />
      </div>
      {data.leadsByStaff.length > 0 && (
        <BarList title="Leads per staff member" rows={data.leadsByStaff.map((s) => ({ label: s.name, count: s.count }))} />
      )}
    </div>
  );
}
