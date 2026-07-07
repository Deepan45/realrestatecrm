"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, Spinner } from "@/components/ui";
import {
  BarChartIcon, BriefcaseIcon, BuildingIcon, CalendarIcon,
  IconType, KanbanIcon, MessageCircleIcon, SendIcon, SparklesIcon, TargetIcon, UsersIcon,
} from "@/components/icons";
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

const TONES: Record<string, { bg: string; ring: string; text: string }> = {
  blue: { bg: "from-blue-50 to-blue-100", ring: "ring-blue-100", text: "text-blue-600" },
  emerald: { bg: "from-emerald-50 to-emerald-100", ring: "ring-emerald-100", text: "text-emerald-600" },
  amber: { bg: "from-amber-50 to-amber-100", ring: "ring-amber-100", text: "text-amber-600" },
  violet: { bg: "from-violet-50 to-violet-100", ring: "ring-violet-100", text: "text-violet-600" },
  cyan: { bg: "from-cyan-50 to-cyan-100", ring: "ring-cyan-100", text: "text-cyan-600" },
  indigo: { bg: "from-indigo-50 to-indigo-100", ring: "ring-indigo-100", text: "text-indigo-600" },
  green: { bg: "from-green-50 to-green-100", ring: "ring-green-100", text: "text-green-600" },
  fuchsia: { bg: "from-fuchsia-50 to-fuchsia-100", ring: "ring-fuchsia-100", text: "text-fuchsia-600" },
};

function Stat({
  icon: Icon, tone, label, value, hint, href,
}: { icon: IconType; tone: keyof typeof TONES; label: string; value: string | number; hint?: string; href?: string }) {
  const t = TONES[tone];
  const inner = (
    <Card className="group relative overflow-hidden p-4 transition hover:-translate-y-0.5 hover:shadow-card-hover">
      <div className="flex items-start gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${t.bg} ring-1 ring-inset ${t.ring}`}>
          <Icon className={`h-5 w-5 ${t.text}`} />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-0.5 truncate text-2xl font-semibold tracking-tight text-slate-800">{value}</div>
          {hint && <div className="mt-0.5 text-xs text-slate-400">{hint}</div>}
        </div>
      </div>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

function BarList({ icon: Icon, title, rows }: { icon: IconType; title: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <Card className="p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="h-4 w-4 text-slate-500" /> {title}
      </h3>
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

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user } = useAuth();
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
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-800">
          {greeting()}{user ? `, ${user.name.split(" ")[0]}` : ""}
        </h1>
        <p className="text-sm text-slate-500">Here&rsquo;s what&rsquo;s happening across your pipeline today.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={UsersIcon} tone="blue" label="Total leads" value={data.totalLeads} href="/leads" />
        <Stat icon={SparklesIcon} tone="emerald" label="New today" value={data.newToday} />
        <Stat icon={CalendarIcon} tone="amber" label="Follow-ups due" value={data.followUpsDueToday} hint="today" href="/leads?followUpDue=true" />
        <Stat icon={TargetIcon} tone="violet" label="Conversion rate" value={`${data.conversionRate}%`} />
        <Stat icon={BuildingIcon} tone="cyan" label="Properties available" value={data.propertiesAvailable} href="/properties" />
        <Stat icon={SendIcon} tone="indigo" label="Shared today" value={data.propertiesSharedToday} hint="via WhatsApp" />
        <Stat icon={MessageCircleIcon} tone="green" label="WhatsApp sent today" value={data.whatsappSentToday} />
        <Stat icon={BriefcaseIcon} tone="fuchsia" label="Partner-shared leads" value={data.partnerSharedLeads} href="/partners" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <BarList icon={BarChartIcon} title="Leads by source" rows={data.leadsBySource.map((s) => ({ label: labelize(s.source), count: s.count }))} />
        <BarList icon={KanbanIcon} title="Leads by pipeline stage" rows={data.leadsByStage.filter((s) => s.count > 0).map((s) => ({ label: labelize(s.stage), count: s.count }))} />
      </div>
      {data.leadsByStaff.length > 0 && (
        <BarList icon={UsersIcon} title="Leads per staff member" rows={data.leadsByStaff.map((s) => ({ label: s.name, count: s.count }))} />
      )}
    </div>
  );
}
