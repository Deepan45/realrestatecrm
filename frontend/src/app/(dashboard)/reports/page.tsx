"use client";

import { useCallback, useEffect, useState } from "react";
import { api, qs } from "@/lib/api";
import { Button, Card, Input, PageHeader, Spinner } from "@/components/ui";
import { TrendingUpIcon } from "@/components/icons";
import { fmtDate, labelize } from "@/lib/types";

interface LeadReport {
  bySource: { source: string; _count: number }[];
  byStatus: { status: string; _count: number }[];
  visaLeadCount: number;
  lostLeads: { id: string; fullName: string; source: string; assignedTo?: { name: string } | null; updatedAt: string }[];
}

interface StaffRow {
  staffId: string; name: string; leadsAssigned: number; converted: number;
  conversionRate: number; whatsappSent: number; partnerShares: number; siteVisitsCompleted: number;
}

interface PartnerRow {
  partnerId: string; name: string; leadsReceived: number; converted: number;
  conversionRate: number; byStatus: { status: string; count: number }[];
}

interface MonthRow { month: string; total: number; converted: number; pipelineValue: number }

interface PropertyEngagementRow { propertyId: string; title: string; location: string; status: string; views: number; shortlists: number }

interface BuyerBehavior { repeatInquirers: number; convertedLeadCount: number; avgDecisionDays: number; avgShortlistSize: number }

export default function ReportsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [leadReport, setLeadReport] = useState<LeadReport | null>(null);
  const [staffReport, setStaffReport] = useState<StaffRow[] | null>(null);
  const [partnerReport, setPartnerReport] = useState<PartnerRow[] | null>(null);
  const [monthly, setMonthly] = useState<MonthRow[] | null>(null);
  const [propertyEngagement, setPropertyEngagement] = useState<PropertyEngagementRow[] | null>(null);
  const [buyerBehavior, setBuyerBehavior] = useState<BuyerBehavior | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const range = qs({ from, to });
    Promise.all([
      api.get<{ data: LeadReport }>(`/reports/leads${range}`),
      api.get<{ data: StaffRow[] }>(`/reports/staff${range}`),
      api.get<{ data: PartnerRow[] }>("/reports/partners"),
      api.get<{ data: MonthRow[] }>("/reports/monthly"),
      api.get<{ data: PropertyEngagementRow[] }>(`/reports/property-engagement${range}`),
      api.get<{ data: BuyerBehavior }>(`/reports/buyer-behavior${range}`),
    ])
      .then(([l, s, p, m, pe, bb]) => {
        setLeadReport(l.data);
        setStaffReport(s.data);
        setPartnerReport(p.data);
        setMonthly(m.data);
        setPropertyEngagement(pe.data);
        setBuyerBehavior(bb.data);
      })
      .catch((e) => setError(e.message));
  }, [from, to]);

  useEffect(load, [load]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!leadReport || !staffReport || !partnerReport || !monthly || !propertyEngagement || !buyerBehavior) return <Spinner />;

  const maxMonth = Math.max(...monthly.map((m) => m.total), 1);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={TrendingUpIcon}
        title="Reports & Analytics"
        subtitle="Performance across leads, staff, partners, and inventory"
        actions={
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
            <span className="text-slate-400">to</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-auto" />
            {(from || to) && <Button variant="secondary" size="sm" onClick={() => { setFrom(""); setTo(""); }}>Clear</Button>}
          </div>
        }
      />

      {/* Monthly trend */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Monthly leads (last 12 months)</h3>
        {monthly.length === 0 ? <p className="text-sm text-slate-400">No data yet.</p> : (
          <div className="flex h-40 items-end gap-2 overflow-x-auto">
            {monthly.map((m) => (
              <div key={m.month} className="flex min-w-[28px] flex-1 flex-col items-center gap-1">
                <div className="flex w-full flex-1 items-end justify-center gap-0.5">
                  <div className="w-1/2 rounded-t bg-brand-400" style={{ height: `${(m.total / maxMonth) * 100}%` }} title={`${m.total} leads`} />
                  <div className="w-1/2 rounded-t bg-emerald-400" style={{ height: `${(m.converted / maxMonth) * 100}%` }} title={`${m.converted} converted`} />
                </div>
                <span className="text-[10px] text-slate-500">{m.month.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex gap-4">
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-400" />Total</span>
            <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-400" />Converted</span>
          </div>
          <span>
            Pipeline value (this period's budgets):{" "}
            <span className="font-semibold text-slate-700">
              {monthly.reduce((sum, m) => sum + m.pipelineValue, 0).toLocaleString("en-IN")}
            </span>
          </span>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Leads by source</h3>
          <table className="w-full text-sm">
            <tbody>
              {leadReport.bySource.map((r) => (
                <tr key={r.source} className="border-b border-slate-100">
                  <td className="py-1.5 text-slate-600">{labelize(r.source)}</td>
                  <td className="py-1.5 text-right font-medium">{r._count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold">Leads by status</h3>
          <table className="w-full text-sm">
            <tbody>
              {leadReport.byStatus.map((r) => (
                <tr key={r.status} className="border-b border-slate-100">
                  <td className="py-1.5 text-slate-600">{labelize(r.status)}</td>
                  <td className="py-1.5 text-right font-medium">{r._count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Staff performance */}
      <Card>
        <div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold">Staff performance</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2.5">Staff</th>
                <th className="px-4 py-2.5 text-right">Leads</th>
                <th className="px-4 py-2.5 text-right">Converted</th>
                <th className="px-4 py-2.5 text-right">Conv. rate</th>
                <th className="px-4 py-2.5 text-right">WhatsApp sent</th>
                <th className="px-4 py-2.5 text-right">Partner shares</th>
                <th className="px-4 py-2.5 text-right">Site visits done</th>
              </tr>
            </thead>
            <tbody>
              {staffReport.map((r) => (
                <tr key={r.staffId} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right">{r.leadsAssigned}</td>
                  <td className="px-4 py-2.5 text-right">{r.converted}</td>
                  <td className="px-4 py-2.5 text-right">{r.conversionRate}%</td>
                  <td className="px-4 py-2.5 text-right">{r.whatsappSent}</td>
                  <td className="px-4 py-2.5 text-right">{r.partnerShares}</td>
                  <td className="px-4 py-2.5 text-right">{r.siteVisitsCompleted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Partner performance */}
      <Card>
        <div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold">Partner company performance</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2.5">Partner</th>
                <th className="px-4 py-2.5 text-right">Leads received</th>
                <th className="px-4 py-2.5 text-right">Converted</th>
                <th className="px-4 py-2.5 text-right">Conv. rate</th>
                <th className="px-4 py-2.5">Status breakdown</th>
              </tr>
            </thead>
            <tbody>
              {partnerReport.map((r) => (
                <tr key={r.partnerId} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 font-medium">{r.name}</td>
                  <td className="px-4 py-2.5 text-right">{r.leadsReceived}</td>
                  <td className="px-4 py-2.5 text-right">{r.converted}</td>
                  <td className="px-4 py-2.5 text-right">{r.conversionRate}%</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">
                    {r.byStatus.map((s) => `${labelize(s.status)}: ${s.count}`).join(" · ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Buyer behavior */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Buyer behavior</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            ["Repeat inquirers", buyerBehavior.repeatInquirers],
            ["Converted leads", buyerBehavior.convertedLeadCount],
            ["Avg. decision time", `${buyerBehavior.avgDecisionDays}d`],
            ["Avg. shortlist size", buyerBehavior.avgShortlistSize],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg bg-slate-50 p-3 text-center">
              <div className="text-lg font-semibold text-slate-800">{value}</div>
              <div className="text-xs text-slate-500">{label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Property engagement */}
      <Card>
        <div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold">Property engagement</h3></div>
        <div className="max-h-96 overflow-x-auto overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                <th className="px-4 py-2.5">Property</th>
                <th className="px-4 py-2.5">Location</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Views</th>
                <th className="px-4 py-2.5 text-right">Shortlisted</th>
              </tr>
            </thead>
            <tbody>
              {propertyEngagement.slice(0, 25).map((r) => (
                <tr key={r.propertyId} className="border-b border-slate-100">
                  <td className="px-4 py-2.5 font-medium">{r.title}</td>
                  <td className="px-4 py-2.5 text-slate-500">{r.location}</td>
                  <td className="px-4 py-2.5 text-slate-500">{labelize(r.status)}</td>
                  <td className="px-4 py-2.5 text-right">{r.views}</td>
                  <td className="px-4 py-2.5 text-right">{r.shortlists}</td>
                </tr>
              ))}
              {propertyEngagement.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">No property views recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Lost leads */}
      <Card>
        <div className="border-b border-slate-200 px-4 py-3"><h3 className="text-sm font-semibold">Recently lost leads</h3></div>
        {leadReport.lostLeads.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-400">No lost leads in this range.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {leadReport.lostLeads.map((l) => (
              <div key={l.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <span className="font-medium">{l.fullName}</span>
                <span className="text-xs text-slate-500">{labelize(l.source)} · {l.assignedTo?.name ?? "Unassigned"} · {fmtDate(l.updatedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
