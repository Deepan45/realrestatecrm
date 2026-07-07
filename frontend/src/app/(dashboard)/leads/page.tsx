"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import LeadForm from "@/components/LeadForm";
import { Badge, Button, Card, EmptyState, ErrorBanner, Input, Modal, PageHeader, Pagination, Select, Spinner } from "@/components/ui";
import { UploadCloudIcon, UsersIcon } from "@/components/icons";
import {
  LEAD_SOURCES, LEAD_STATUSES, Lead, PROPERTY_TYPES, Paginated, User,
  fmtDate, fmtMoney, labelize,
} from "@/lib/types";

function LeadsContent() {
  const { hasRole } = useAuth();
  const params = useSearchParams();
  const [result, setResult] = useState<Paginated<Lead> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [followUpDue, setFollowUpDue] = useState(params.get("followUpDue") === "true");
  const [staff, setStaff] = useState<User[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<Paginated<Lead>>(`/leads${qs({ q, status, source, propertyType, assignedToId, followUpDue: followUpDue || undefined, page, pageSize: 20 })}`)
      .then((res) => { setResult(res); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load leads"))
      .finally(() => setLoading(false));
  }, [q, status, source, propertyType, assignedToId, followUpDue, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    if (hasRole("SALES_MANAGER")) {
      api.get<{ data: User[] }>("/users?active=true").then((res) =>
        setStaff(res.data.filter((u) => ["SALES_EXECUTIVE", "SALES_MANAGER"].includes(u.role)))
      ).catch(() => {});
    }
  }, [hasRole]);

  async function importCsv(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post<{ created: number; failed: number }>("/leads/import", fd);
      setImportResult(`Imported ${res.created} leads (${res.failed} failed)`);
      load();
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : "Import failed");
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={UsersIcon}
        title="CRM Pipeline"
        subtitle="Track leads from first contact through to conversion"
        actions={hasRole("SALES_MANAGER", "SALES_EXECUTIVE") && (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])}
            />
            <Button variant="secondary" onClick={() => fileRef.current?.click()}><UploadCloudIcon className="mr-1.5 inline h-3.5 w-3.5" />Import CSV</Button>
            <Button onClick={() => setShowCreate(true)}>+ New lead</Button>
          </>
        )}
      />

      {importResult && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-700">
          {importResult} <button className="ml-2 underline" onClick={() => setImportResult(null)}>dismiss</button>
        </div>
      )}
      <ErrorBanner message={error} />

      <Card className="p-3">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
          <Input placeholder="Search name / phone / email…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="col-span-2" />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
          </Select>
          <Select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
            <option value="">All sources</option>
            {LEAD_SOURCES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
          </Select>
          <Select value={propertyType} onChange={(e) => { setPropertyType(e.target.value); setPage(1); }}>
            <option value="">All property types</option>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{labelize(t)}</option>)}
          </Select>
          <div className="flex items-center gap-3">
            {staff.length > 0 && (
              <Select value={assignedToId} onChange={(e) => { setAssignedToId(e.target.value); setPage(1); }}>
                <option value="">All staff</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
            <label className="flex shrink-0 items-center gap-1.5 text-sm text-slate-600">
              <input type="checkbox" checked={followUpDue} onChange={(e) => { setFollowUpDue(e.target.checked); setPage(1); }} />
              Due
            </label>
          </div>
        </div>
      </Card>

      <Card>
        {loading ? (
          <Spinner />
        ) : !result || result.data.length === 0 ? (
          <EmptyState message="No leads match your filters." />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3">Lead</th>
                    <th className="px-4 py-3">Requirement</th>
                    <th className="px-4 py-3">Budget</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned</th>
                    <th className="px-4 py-3">Follow-up</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((lead) => (
                    <tr key={lead.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link href={`/leads/${lead.id}`} className="font-medium text-brand-700 hover:underline">
                          {lead.fullName}
                        </Link>
                        <div className="text-xs text-slate-500">{lead.mobile}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {labelize(lead.propertyType)} {lead.bedrooms != null ? `· ${lead.bedrooms}BR` : ""}
                        <div className="text-xs text-slate-400">{lead.preferredArea || lead.city || "—"}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {lead.budgetMax ? fmtMoney(lead.budgetMax, lead.currency) : "—"}
                      </td>
                      <td className="px-4 py-3"><Badge value={lead.source} /></td>
                      <td className="px-4 py-3"><Badge value={lead.status} /></td>
                      <td className="px-4 py-3 text-slate-600">{lead.assignedTo?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">{fmtDate(lead.followUpAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} />
          </>
        )}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New lead" wide>
        <LeadForm onSaved={() => { setShowCreate(false); load(); }} onCancel={() => setShowCreate(false)} />
      </Modal>
    </div>
  );
}

export default function LeadsPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LeadsContent />
    </Suspense>
  );
}
