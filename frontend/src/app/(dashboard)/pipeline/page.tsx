"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, ErrorBanner, PageHeader, Select, Spinner } from "@/components/ui";
import { KanbanIcon } from "@/components/icons";
import { Lead, PIPELINE_STAGES, PipelineStage, fmtMoney, labelize } from "@/lib/types";

type Board = Record<string, { leads: Lead[]; total: number }>;

const STAGE_COLORS: Record<string, string> = {
  NEW_LEAD: "border-t-blue-400",
  INITIAL_CONTACT: "border-t-cyan-400",
  REQUIREMENT_ANALYSIS: "border-t-sky-400",
  PROPERTY_MATCHING: "border-t-indigo-400",
  PROPERTY_SHARED: "border-t-violet-400",
  FOLLOW_UP_PENDING: "border-t-amber-400",
  SITE_VISIT_SCHEDULED: "border-t-emerald-400",
  SITE_VISIT_COMPLETED: "border-t-lime-500",
  NEGOTIATION: "border-t-orange-400",
  BANK_LOAN: "border-t-teal-400",
  SHARED_TO_PARTNER: "border-t-fuchsia-400",
  REGISTRATION: "border-t-green-500",
  LOST_CLOSED: "border-t-slate-300",
};

export default function PipelinePage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  const load = useCallback(() => {
    api.get<{ data: Board }>("/leads/board").then((res) => setBoard(res.data)).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  async function moveLead(leadId: string, toStage: PipelineStage) {
    if (!board) return;
    // Optimistic move
    const prev = board;
    const next: Board = Object.fromEntries(
      Object.entries(board).map(([stage, col]) => {
        const hadIt = col.leads.some((l) => l.id === leadId);
        return [stage, { leads: col.leads.filter((l) => l.id !== leadId), total: hadIt ? col.total - 1 : col.total }];
      })
    );
    const lead = Object.values(prev).flatMap((col) => col.leads).find((l) => l.id === leadId);
    if (lead) {
      const target = next[toStage] ?? { leads: [], total: 0 };
      next[toStage] = { leads: [{ ...lead, stage: toStage }, ...target.leads], total: target.total + 1 };
    }
    setBoard(next);
    try {
      await api.post(`/leads/${leadId}/change-stage`, { stage: toStage });
    } catch (e) {
      setBoard(prev);
      setError(e instanceof Error ? e.message : "Move failed");
    }
  }

  if (error && !board) return <p className="text-sm text-red-600">{error}</p>;
  if (!board) return <Spinner />;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={KanbanIcon}
        title="Pipeline Board"
        subtitle="Drag cards between stages — statuses and automations follow"
      />
      <ErrorBanner message={error} />
      <div className="flex gap-3 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => {
          const { leads, total } = board[stage] ?? { leads: [], total: 0 };
          return (
            <div
              key={stage}
              className={`w-64 shrink-0 rounded-xl border border-slate-200 border-t-4 bg-slate-100/60 ${STAGE_COLORS[stage]} ${dropTarget === stage ? "ring-2 ring-brand-400" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDropTarget(stage); }}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => {
                e.preventDefault();
                setDropTarget(null);
                const leadId = e.dataTransfer.getData("leadId");
                if (leadId) moveLead(leadId, stage);
              }}
            >
              <div className="flex items-center justify-between px-3 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{labelize(stage)}</span>
                <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{total}</span>
              </div>
              {total > leads.length && (
                <p className="px-3 pb-1.5 text-[11px] text-amber-600">Showing newest {leads.length} of {total} — see the Leads list to find the rest.</p>
              )}
              <div className="max-h-[70vh] space-y-2 overflow-y-auto px-2 pb-2">
                {leads.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.setData("leadId", lead.id); setDragging(lead.id); }}
                    onDragEnd={() => setDragging(null)}
                    className={`cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow ${dragging === lead.id ? "opacity-50" : ""}`}
                  >
                    <Link href={`/leads/${lead.id}`} className="block">
                      <div className="mb-1 flex items-start justify-between gap-1">
                        <span className="text-sm font-medium text-slate-800">{lead.fullName}</span>
                        <Badge value={lead.priority} />
                      </div>
                      <div className="text-xs text-slate-500">
                        {labelize(lead.propertyType)}{lead.bedrooms != null ? ` · ${lead.bedrooms}BR` : ""}
                        {lead.preferredArea || lead.city ? ` · ${lead.preferredArea || lead.city}` : ""}
                      </div>
                      {lead.budgetMax && <div className="mt-1 text-xs font-medium text-slate-600">{fmtMoney(lead.budgetMax, lead.currency)}</div>}
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{lead.assignedTo?.name ?? "Unassigned"}</span>
                        <Badge value={lead.source} />
                      </div>
                    </Link>
                    {/* Drag-and-drop doesn't fire on touch devices — this select is the
                        only way to change stage on mobile/tablet. */}
                    <Select
                      className="mt-2 py-1 text-[11px]"
                      value={stage}
                      onChange={(e) => moveLead(lead.id, e.target.value as PipelineStage)}
                    >
                      {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
                    </Select>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
