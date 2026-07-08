"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, resolveMediaUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import PropertyForm from "@/components/PropertyForm";
import { Badge, Button, Card, Spinner } from "@/components/ui";
import { Property, fmtDate, fmtMoney, labelize } from "@/lib/types";
import { BuildingIcon, MapPinIcon, VideoIcon } from "@/components/icons";
import { youtubeEmbedUrl } from "@/lib/youtube";

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { hasRole } = useAuth();
  const canEdit = hasRole("PROPERTY_STAFF", "SALES_MANAGER");
  const [property, setProperty] = useState<Property | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    api.get<{ data: Property }>(`/properties/${id}`).then((r) => setProperty(r.data)).catch((e) => setError(e.message));
  }, [id, editing]);

  async function remove() {
    if (!confirm("Delete this property? This cannot be undone.")) return;
    await api.del(`/properties/${id}`);
    router.push("/properties");
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!property) return <Spinner />;

  if (editing) {
    return (
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Edit property</h1>
        <Card className="p-5">
          <PropertyForm
            initial={property}
            onSaved={(updated) => { setProperty(updated); setEditing(false); }}
          />
        </Card>
        <Button variant="secondary" onClick={() => setEditing(false)}>← Back to detail</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{property.title}</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
            <Badge value={property.status} />
            {property.location} · {labelize(property.type)} · {labelize(property.category)}
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            <Button variant="danger" onClick={remove}>Delete</Button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="overflow-hidden lg:col-span-2">
          {property.images.length > 0 ? (
            <div className="grid grid-cols-2 gap-1">
              {property.images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={resolveMediaUrl(img.url)} alt="" className={`w-full object-cover ${i === 0 ? "col-span-2 h-80" : "h-40"}`} />
              ))}
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center bg-slate-100 text-slate-300"><BuildingIcon className="h-16 w-16" /></div>
          )}
          {property.youtubeUrl && youtubeEmbedUrl(property.youtubeUrl) && (
            <div className="aspect-video w-full">
              <iframe
                src={youtubeEmbedUrl(property.youtubeUrl)!}
                title="Property video"
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
          {property.description && <p className="p-4 text-sm text-slate-600">{property.description}</p>}
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <div className="text-2xl font-bold text-brand-700">{fmtMoney(property.price, property.currency)}</div>
            <dl className="mt-3 space-y-2 text-sm">
              {([
                ["Bedrooms", property.bedrooms?.toString() ?? "—"],
                ["Bathrooms", property.bathrooms?.toString() ?? "—"],
                ["Area", property.areaSqft ? `${property.areaSqft.toLocaleString()} sqft` : "—"],
                ["Furnishing", labelize(property.furnishing)],
                ["Address", property.address || "—"],
                ["Owner", property.ownerName || "—"],
                ["Contact", property.contactName ? `${property.contactName} (${property.contactPhone ?? "—"})` : "—"],
                ["Managed by", property.assignedTo?.name ?? "—"],
                ["Added", fmtDate(property.createdAt)],
              ] as [string, string][]).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <dt className="text-slate-500">{k}</dt>
                  <dd className="font-medium text-slate-700">{v}</dd>
                </div>
              ))}
            </dl>
            {property.latitude != null && property.longitude != null && (
              <a
                href={`https://www.google.com/maps?q=${property.latitude},${property.longitude}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
              >
                <MapPinIcon className="h-4 w-4" /> View on Google Maps
              </a>
            )}
            {property.videoUrl && (
              property.videoUrl.startsWith("/uploads/") ? (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                    <VideoIcon className="h-3.5 w-3.5" /> Video tour
                  </div>
                  <video src={resolveMediaUrl(property.videoUrl)} controls className="w-full rounded-lg bg-slate-900" />
                </div>
              ) : (
                <a href={property.videoUrl ?? undefined} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-1.5 text-sm text-brand-600 hover:underline">
                  <VideoIcon className="h-4 w-4" /> Watch video tour
                </a>
              )
            )}
          </Card>
          {property.amenities.length > 0 && (
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold">Amenities</h3>
              <div className="flex flex-wrap gap-1.5">
                {property.amenities.map((a) => (
                  <span key={a} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">{a}</span>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
