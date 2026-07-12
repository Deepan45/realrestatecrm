"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api, downloadFile, qs, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBanner, Input, PageHeader, Pagination, Select, Spinner } from "@/components/ui";
import { AVAILABILITY, PROPERTY_CATEGORIES, PROPERTY_TYPES, Paginated, Property, fmtMoney, labelize } from "@/lib/types";
import { BuildingIcon, DownloadIcon, EyeIcon, PencilIcon, TrashIcon, UploadCloudIcon } from "@/components/icons";
import { useToast } from "@/components/toast";

export default function PropertiesPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole("PROPERTY_STAFF", "SALES_MANAGER");
  const canExport = hasRole();
  const toast = useToast();
  const [result, setResult] = useState<Paginated<Property> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingProperty, setDeletingProperty] = useState<Property | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    setLoading(true);
    api
      .get<Paginated<Property>>(`/properties${qs({ q, type, category, status, bedrooms, priceMax, page, pageSize: 12 })}`)
      .then((res) => { setResult(res); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load properties"))
      .finally(() => setLoading(false));
  }, [q, type, category, status, bedrooms, priceMax, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  async function importCsv(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post<{ created: number; failed: number }>("/properties/import", fd);
      setImportResult(`Imported ${res.created} properties (${res.failed} failed)`);
      load();
    } catch (err) {
      setImportResult(err instanceof Error ? err.message : "Import failed");
    }
  }

  async function exportCsv() {
    try {
      await downloadFile("/properties/export", `properties-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    }
  }

  async function downloadSampleCsv() {
    try {
      await downloadFile("/properties/import/sample", "properties-import-sample.csv");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function deleteProperty(property: Property) {
    try {
      await api.del(`/properties/${property.id}`);
      toast(`Deleted "${property.title}"`);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingProperty(null);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        icon={BuildingIcon}
        title="Properties Inventory"
        subtitle="Browse, list, and manage your property catalog"
        actions={(canEdit || canExport) && (
          <>
            {canEdit && (
              <>
                <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
                <Button variant="secondary" onClick={() => fileRef.current?.click()}><UploadCloudIcon className="mr-1.5 inline h-3.5 w-3.5" />Import CSV</Button>
                <Button variant="ghost" size="sm" onClick={downloadSampleCsv}><DownloadIcon className="mr-1.5 inline h-3.5 w-3.5" />Sample CSV</Button>
              </>
            )}
            {canExport && <Button variant="secondary" onClick={exportCsv}><DownloadIcon className="mr-1.5 inline h-3.5 w-3.5" />Export CSV</Button>}
            {canEdit && <Link href="/properties/new"><Button>+ Add property</Button></Link>}
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
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-6">
          <Input placeholder="Search title / location…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="col-span-2" />
          <Select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}>
            <option value="">All types</option>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{labelize(t)}</option>)}
          </Select>
          <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
            <option value="">All categories</option>
            {PROPERTY_CATEGORIES.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}
          </Select>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {AVAILABILITY.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
          </Select>
          <div className="flex gap-2">
            <Input type="number" placeholder="Beds" value={bedrooms} onChange={(e) => { setBedrooms(e.target.value); setPage(1); }} />
            <Input type="number" placeholder="Max price" value={priceMax} onChange={(e) => { setPriceMax(e.target.value); setPage(1); }} />
          </div>
        </div>
        {(q || type || category || status || bedrooms || priceMax) && (
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{result ? `${result.total} ${result.total === 1 ? "property matches" : "properties match"} your filters` : "Filtering…"}</span>
            <button
              className="font-medium text-brand-600 hover:underline"
              onClick={() => { setQ(""); setType(""); setCategory(""); setStatus(""); setBedrooms(""); setPriceMax(""); setPage(1); }}
            >
              Clear all filters
            </button>
          </div>
        )}
      </Card>

      {loading ? (
        <Spinner />
      ) : !result || result.data.length === 0 ? (
        <Card><EmptyState message="No properties match your filters." /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {result.data.map((p) => (
              <Card key={p.id} className="overflow-hidden transition hover:shadow-md">
                <Link href={`/properties/${p.id}`}>
                  {p.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={resolveMediaUrl(p.images[0].url)} alt={p.title} className="h-40 w-full object-cover" />
                  ) : (
                    <div className="flex h-40 w-full items-center justify-center bg-slate-100 text-slate-300"><BuildingIcon className="h-12 w-12" /></div>
                  )}
                  <div className="p-3">
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <h3 className="line-clamp-1 text-sm font-semibold">{p.title}</h3>
                      <Badge value={p.status} />
                    </div>
                    <p className="text-xs text-slate-500">{p.location} · {labelize(p.type)} · {labelize(p.category)}</p>
                    <p className="mt-1.5 text-sm font-bold text-brand-700">{fmtMoney(p.price, p.currency)}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {p.bedrooms != null && `${p.bedrooms} bed · `}
                      {p.bathrooms != null && `${p.bathrooms} bath · `}
                      {p.areaSqft && `${p.areaSqft.toLocaleString()} sqft`}
                    </p>
                  </div>
                </Link>
                {canEdit && (
                  <div className="flex items-center justify-end gap-1 border-t border-slate-100 px-2 py-1.5">
                    <Link href={`/properties/${p.id}`} title="View" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                      <EyeIcon className="h-4 w-4" />
                    </Link>
                    <Link href={`/properties/${p.id}?edit=true`} title="Edit" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700">
                      <PencilIcon className="h-4 w-4" />
                    </Link>
                    <button title="Delete" className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" onClick={() => setDeletingProperty(p)}>
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
          <Card>
            <Pagination page={result.page} pageSize={result.pageSize} total={result.total} onPage={setPage} />
          </Card>
        </>
      )}

      <ConfirmDialog
        open={!!deletingProperty}
        title="Delete property"
        message={`Delete "${deletingProperty?.title}" and all its photos and video? This cannot be undone.`}
        onConfirm={() => deletingProperty && deleteProperty(deletingProperty)}
        onCancel={() => setDeletingProperty(null)}
      />
    </div>
  );
}
