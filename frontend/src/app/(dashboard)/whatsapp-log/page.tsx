"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Card, EmptyState, ErrorBanner, PageHeader, Pagination, Spinner } from "@/components/ui";
import { MessageCircleIcon } from "@/components/icons";
import { fmtDate } from "@/lib/types";

interface WhatsAppLogEntry {
  id: string;
  toNumber: string;
  body: string;
  status: string;
  error?: string | null;
  providerMessageId?: string | null;
  createdAt: string;
  lead: { id: string; fullName: string };
  sentBy: { name: string };
  template?: { name: string } | null;
}

export default function WhatsAppLogPage() {
  const [result, setResult] = useState<{ data: WhatsAppLogEntry[]; total: number; page: number; pageSize: number } | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<{ data: WhatsAppLogEntry[]; total: number; page: number; pageSize: number }>(`/whatsapp/logs?page=${page}&pageSize=25`)
      .then((res) => { setResult(res); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load WhatsApp log"))
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(load, [load]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={MessageCircleIcon}
        title="WhatsApp Log"
        subtitle="Every message sent from the CRM — property shares, automated stage messages, and partner referrals. Managers see everyone's sends; staff see their own."
      />
      <ErrorBanner message={error} />

      <Card>
        {loading ? (
          <Spinner />
        ) : !result || result.data.length === 0 ? (
          <EmptyState message="No WhatsApp messages sent yet." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Sent by</th>
                    <th className="px-4 py-3">Template</th>
                    <th className="px-4 py-3">Message</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((log) => (
                    <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50 align-top">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{fmtDate(log.createdAt, true)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/leads/${log.lead.id}`} className="font-medium text-brand-700 hover:underline">{log.lead.fullName}</Link>
                        <div className="text-xs text-slate-400">{log.toNumber}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{log.sentBy.name}</td>
                      <td className="px-4 py-3 text-slate-600">{log.template?.name ?? "—"}</td>
                      <td className="max-w-sm px-4 py-3 text-xs text-slate-500">
                        <p className="line-clamp-2 whitespace-pre-wrap">{log.body}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge value={log.status} />
                        {log.error && <div className="mt-1 max-w-[180px] text-xs text-red-600">{log.error}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
