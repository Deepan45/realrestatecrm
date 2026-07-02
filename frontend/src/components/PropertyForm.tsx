"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button, ErrorBanner, Field, Input, Select, Textarea } from "@/components/ui";
import { AVAILABILITY, FURNISHING, PROPERTY_CATEGORIES, PROPERTY_TYPES, Property, labelize } from "@/lib/types";
import { UploadIcon, XIcon } from "@/components/icons";

export default function PropertyForm({ initial, onSaved }: { initial?: Property; onSaved?: (p: Property) => void }) {
  const isEdit = !!initial;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState(initial?.images ?? []);
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    type: initial?.type ?? "APARTMENT",
    category: initial?.category ?? "SALE",
    location: initial?.location ?? "",
    address: initial?.address ?? "",
    areaSqft: initial?.areaSqft?.toString() ?? "",
    bedrooms: initial?.bedrooms?.toString() ?? "",
    bathrooms: initial?.bathrooms?.toString() ?? "",
    furnishing: initial?.furnishing ?? "",
    amenities: (initial?.amenities ?? []).join(", "),
    price: initial?.price?.toString() ?? "",
    currency: initial?.currency ?? "AED",
    description: initial?.description ?? "",
    status: initial?.status ?? "AVAILABLE",
    ownerName: initial?.ownerName ?? "",
    contactName: initial?.contactName ?? "",
    contactPhone: initial?.contactPhone ?? "",
  });

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload = {
      ...form,
      areaSqft: form.areaSqft ? Number(form.areaSqft) : null,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
      furnishing: form.furnishing || null,
      amenities: form.amenities.split(",").map((a) => a.trim()).filter(Boolean),
      price: Number(form.price),
      address: form.address || null,
      description: form.description || null,
      ownerName: form.ownerName || null,
      contactName: form.contactName || null,
      contactPhone: form.contactPhone || null,
    };
    try {
      const res = isEdit
        ? await api.put<{ data: Property }>(`/properties/${initial!.id}`, payload)
        : await api.post<{ data: Property }>("/properties", payload);
      if (onSaved) onSaved(res.data);
      else router.push(`/properties/${res.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setBusy(false);
    }
  }

  async function uploadImages(files: FileList) {
    if (!initial) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("images", f);
    try {
      const res = await api.post<{ data: { id: string; url: string; isPrimary: boolean }[] }>(`/properties/${initial.id}/images`, fd);
      setImages((imgs) => [...imgs, ...res.data]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  async function removeImage(imageId: string) {
    if (!initial) return;
    await api.del(`/properties/${initial.id}/images/${imageId}`).catch(() => {});
    setImages((imgs) => imgs.filter((i) => i.id !== imageId));
  }

  async function uploadVideo(file: File) {
    if (!initial) return;
    setVideoBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("video", file);
    try {
      const res = await api.post<{ data: { videoUrl: string } }>(`/properties/${initial.id}/video`, fd);
      setVideoUrl(res.data.videoUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Video upload failed");
    } finally {
      setVideoBusy(false);
    }
  }

  async function removeVideo() {
    if (!initial) return;
    await api.del(`/properties/${initial.id}/video`).catch(() => {});
    setVideoUrl(null);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBanner message={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Title *">
          <Input required value={form.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Type *">
          <Select value={form.type} onChange={(e) => set("type", e.target.value)}>
            {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{labelize(t)}</option>)}
          </Select>
        </Field>
        <Field label="Category *">
          <Select value={form.category} onChange={(e) => set("category", e.target.value)}>
            {PROPERTY_CATEGORIES.map((c) => <option key={c} value={c}>{labelize(c)}</option>)}
          </Select>
        </Field>
        <Field label="Location *">
          <Input required value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Dubai Marina" />
        </Field>
        <Field label="Address">
          <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="Area (sqft)">
          <Input type="number" min={0} value={form.areaSqft} onChange={(e) => set("areaSqft", e.target.value)} />
        </Field>
        <Field label="Bedrooms">
          <Input type="number" min={0} value={form.bedrooms} onChange={(e) => set("bedrooms", e.target.value)} />
        </Field>
        <Field label="Bathrooms">
          <Input type="number" min={0} value={form.bathrooms} onChange={(e) => set("bathrooms", e.target.value)} />
        </Field>
        <Field label="Furnishing">
          <Select value={form.furnishing ?? ""} onChange={(e) => set("furnishing", e.target.value)}>
            <option value="">Not specified</option>
            {FURNISHING.map((f) => <option key={f} value={f}>{labelize(f)}</option>)}
          </Select>
        </Field>
        <Field label="Price *">
          <Input type="number" min={0} required value={form.price} onChange={(e) => set("price", e.target.value)} />
        </Field>
        <Field label="Currency">
          <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            {["AED", "USD", "EUR", "INR", "SAR"].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Availability">
          <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
            {AVAILABILITY.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
          </Select>
        </Field>
        <Field label="Owner / company">
          <Input value={form.ownerName ?? ""} onChange={(e) => set("ownerName", e.target.value)} />
        </Field>
        <Field label="Contact name">
          <Input value={form.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <Field label="Contact phone">
          <Input value={form.contactPhone ?? ""} onChange={(e) => set("contactPhone", e.target.value)} />
        </Field>
      </div>
      <Field label="Amenities (comma separated)">
        <Input value={form.amenities} onChange={(e) => set("amenities", e.target.value)} placeholder="Pool, Gym, Parking" />
      </Field>
      <Field label="Description">
        <Textarea rows={4} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
      </Field>

      {isEdit && (
        <div>
          <span className="mb-2 block text-xs font-medium text-slate-600">Images</span>
          <div className="flex flex-wrap gap-3">
            {images.map((img) => (
              <div key={img.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt="" className="h-24 w-32 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(img.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                >
                  <XIcon className="h-3 w-3" />
                </button>
              </div>
            ))}
            <label className="flex h-24 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-400">
              <UploadIcon className="h-4 w-4" /> Upload
              <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => e.target.files && uploadImages(e.target.files)} />
            </label>
          </div>

          <span className="mb-2 mt-4 block text-xs font-medium text-slate-600">Video tour</span>
          {videoUrl ? (
            <div className="relative inline-block">
              <video src={videoUrl} controls className="h-40 rounded-lg bg-slate-900" />
              <button
                type="button"
                onClick={removeVideo}
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
              >
                <XIcon className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <label className="flex h-24 w-48 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-400">
              <UploadIcon className="h-4 w-4" /> {videoBusy ? "Uploading…" : "Upload video"}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime,.mp4,.mov,.webm,.m4v"
                className="hidden"
                disabled={videoBusy}
                onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])}
              />
            </label>
          )}
        </div>
      )}
      {!isEdit && <p className="text-xs text-slate-500">Save the property first, then upload images and a video tour on the edit page.</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : isEdit ? "Save changes" : "Create property"}</Button>
      </div>
    </form>
  );
}
