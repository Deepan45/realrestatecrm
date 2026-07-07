"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, qs } from "@/lib/api";
import { Badge, Card, EmptyState, ErrorBanner, PageHeader, Spinner } from "@/components/ui";
import { CalendarIcon } from "@/components/icons";
import { Lead, Paginated, fmtDate, labelize } from "@/lib/types";

function isPast(iso?: string | null) {
  return !!iso && new Date(iso).getTime() < Date.now();
}

export default function SiteVisitsPage() {
  const [result, setResult] = useState<Paginated<Lead> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<Paginated<Lead>>(`/leads${qs({ hasFollowUp: "true", sort: "followUpAt:asc", pageSize: 50 })}`)
      .then((res) => { setResult(res); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load appointments"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const leads = result?.data ?? [];
  const upcoming = leads.filter((l) => !isPast(l.followUpAt));
  const overdue = leads.filter((l) => isPast(l.followUpAt));

  return (
    <div className="space-y-4">
      <PageHeader icon={CalendarIcon} title="Site Visits & Appointments" subtitle="Every lead with a scheduled follow-up or site visit, earliest first" />

      <ErrorBanner message={error} />

      <Card>
        {loading ? (
          <Spinner />
        ) : leads.length === 0 ? (
          <EmptyState message="No appointments scheduled. Set a follow-up date on a lead to see it here." />
        ) : (
          <div className="divide-y divide-slate-100">
            {overdue.length > 0 && (
              <div className="bg-red-50/50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-red-600">
                Overdue ({overdue.length})
              </div>
            )}
            {overdue.map((lead) => <VisitRow key={lead.id} lead={lead} overdue />)}
            {upcoming.length > 0 && (
              <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Upcoming ({upcoming.length})
              </div>
            )}
            {upcoming.map((lead) => <VisitRow key={lead.id} lead={lead} />)}
          </div>
        )}
      </Card>
    </div>
  );
}

function VisitRow({ lead, overdue }: { lead: Lead; overdue?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
      <div className="min-w-0">
        <Link href={`/leads/${lead.id}`} className="font-medium text-brand-700 hover:underline">
          {lead.fullName}
        </Link>
        <div className="text-xs text-slate-500">
          {lead.mobile} · {labelize(lead.propertyType)}{lead.bedrooms != null ? ` · ${lead.bedrooms}BR` : ""} · {lead.preferredArea || lead.city || "—"}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Badge value={lead.status} />
        <span className={`text-sm font-medium ${overdue ? "text-red-600" : "text-slate-700"}`}>
          {fmtDate(lead.followUpAt, true)}
        </span>
      </div>
    </div>
  );
}
