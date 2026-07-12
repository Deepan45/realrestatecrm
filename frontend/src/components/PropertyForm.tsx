"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, api, resolveMediaUrl } from "@/lib/api";
import { Button, ErrorBanner, Field, Input, Select, Textarea } from "@/components/ui";
import { AVAILABILITY, FURNISHING, PROPERTY_CATEGORIES, PROPERTY_TYPES, Property, labelize } from "@/lib/types";
import { CameraIcon, MapPinIcon, UploadIcon, XIcon } from "@/components/icons";
import { extractYouTubeId } from "@/lib/youtube";
import CameraCapture from "@/components/CameraCapture";

// Digits plus the punctuation a phone number is actually written with.
const PHONE_CHARS = /[^\d+\s().-]/g;
function sanitizePhone(v: string) {
  return v.replace(PHONE_CHARS, "");
}

export default function PropertyForm({ initial, onSaved }: { initial?: Property; onSaved?: (p: Property) => void }) {
  const isEdit = !!initial;
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [images, setImages] = useState(initial?.images ?? []);
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? null);
  const [videoBusy, setVideoBusy] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  // Before the property exists there's no id to upload against yet, so photos/video
  // taken on the create form are staged locally and uploaded right after creation.
  const [pendingImages, setPendingImages] = useState<{ file: File; previewUrl: string }[]>([]);
  const [pendingVideo, setPendingVideo] = useState<{ file: File; previewUrl: string } | null>(null);
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
    currency: initial?.currency ?? "INR",
    description: initial?.description ?? "",
    status: initial?.status ?? "AVAILABLE",
    ownerName: initial?.ownerName ?? "",
    contactName: initial?.contactName ?? "",
    contactPhone: initial?.contactPhone ?? "",
    youtubeUrl: initial?.youtubeUrl ?? "",
    latitude: initial?.latitude?.toString() ?? "",
    longitude: initial?.longitude?.toString() ?? "",
  });
  const [locating, setLocating] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (form.contactPhone && !/^[\d+\s().-]{5,}$/.test(form.contactPhone)) errs.contactPhone = "Enter a valid phone number";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
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
      youtubeUrl: form.youtubeUrl || null,
      latitude: form.latitude ? Number(form.latitude) : null,
      longitude: form.longitude ? Number(form.longitude) : null,
    };
    if (form.youtubeUrl && !extractYouTubeId(form.youtubeUrl)) {
      setError("Enter a valid YouTube video URL or embed link");
      setBusy(false);
      return;
    }
    try {
      const res = isEdit
        ? await api.put<{ data: Property }>(`/properties/${initial!.id}`, payload)
        : await api.post<{ data: Property }>("/properties", payload);
      let saved = res.data;
      let uploadError: string | null = null;
      if (!isEdit && (pendingImages.length > 0 || pendingVideo)) {
        if (pendingImages.length > 0) {
          const fd = new FormData();
          for (const { file } of pendingImages) fd.append("images", file);
          try {
            const imgRes = await api.post<{ data: Property["images"] }>(`/properties/${saved.id}/images`, fd);
            saved = { ...saved, images: imgRes.data };
          } catch (err) {
            uploadError = `Property created, but photo upload failed: ${err instanceof Error ? err.message : "unknown error"}`;
          }
        }
        if (pendingVideo) {
          const fd = new FormData();
          fd.append("video", pendingVideo.file);
          try {
            const vidRes = await api.post<{ data: { videoUrl: string } }>(`/properties/${saved.id}/video`, fd);
            saved = { ...saved, videoUrl: vidRes.data.videoUrl };
          } catch (err) {
            const msg = `Property created, but video upload failed: ${err instanceof Error ? err.message : "unknown error"}`;
            uploadError = uploadError ? `${uploadError}. ${msg}` : msg;
          }
        }
      }
      if (onSaved) onSaved(saved);
      // Carry the failure to the detail page via query param — this component is about
      // to unmount, so an error banner set here would never be seen.
      else router.push(`/properties/${saved.id}${uploadError ? `?uploadError=${encodeURIComponent(uploadError)}` : ""}`);
    } catch (err) {
      // Backend zod rejections come back with per-field paths — point at the actual
      // fields instead of showing an unhelpful flat "Validation failed" banner.
      if (err instanceof ApiError && err.errors?.length) {
        setFieldErrors(Object.fromEntries(err.errors.map((e) => [e.path, e.message])));
        setError("Please fix the highlighted fields below");
      } else {
        setError(err instanceof Error ? err.message : "Save failed");
      }
      setBusy(false);
    }
  }

  async function uploadImages(files: FileList | File[]) {
    const list = Array.from(files);
    if (!initial) {
      setPendingImages((imgs) => [...imgs, ...list.map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))]);
      return;
    }
    const fd = new FormData();
    for (const f of list) fd.append("images", f);
    try {
      const res = await api.post<{ data: { id: string; url: string; isPrimary: boolean }[] }>(`/properties/${initial.id}/images`, fd);
      setImages((imgs) => [...imgs, ...res.data]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    }
  }

  function removePendingImage(index: number) {
    setPendingImages((imgs) => {
      URL.revokeObjectURL(imgs[index].previewUrl);
      return imgs.filter((_, i) => i !== index);
    });
  }

  async function removeImage(imageId: string) {
    if (!initial) return;
    await api.del(`/properties/${initial.id}/images/${imageId}`).catch(() => {});
    setImages((imgs) => imgs.filter((i) => i.id !== imageId));
  }

  async function uploadVideo(file: File) {
    if (!initial) {
      if (pendingVideo) URL.revokeObjectURL(pendingVideo.previewUrl);
      setPendingVideo({ file, previewUrl: URL.createObjectURL(file) });
      return;
    }
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

  function removePendingVideo() {
    if (pendingVideo) URL.revokeObjectURL(pendingVideo.previewUrl);
    setPendingVideo(null);
  }

  async function removeVideo() {
    if (!initial) return;
    await api.del(`/properties/${initial.id}/video`).catch(() => {});
    setVideoUrl(null);
  }

  function useMyLocation() {
    if (!navigator.geolocation) return setError("Geolocation is not available in this browser");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        set("latitude", pos.coords.latitude.toFixed(6));
        set("longitude", pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      (err) => {
        setError(err.message || "Could not get your location");
        setLocating(false);
      }
    );
  }

  const mapsUrl = form.latitude && form.longitude ? `https://www.google.com/maps?q=${form.latitude},${form.longitude}` : null;

  return (
    <form onSubmit={submit} className="space-y-4">
      <ErrorBanner message={error} />
      <h4 className="border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Basics</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Title *" error={fieldErrors.title}>
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
        <Field label="Location *" error={fieldErrors.location}>
          <Input required value={form.location} onChange={(e) => set("location", e.target.value)} placeholder="e.g. Anna Nagar, Chennai" />
        </Field>
        <Field label="Address">
          <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="Area (sqft)" error={fieldErrors.areaSqft}>
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
      </div>

      <h4 className="border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Pricing &amp; availability</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Price *" error={fieldErrors.price}>
          <Input type="number" min={0} required value={form.price} onChange={(e) => set("price", e.target.value)} />
        </Field>
        <Field label="Currency">
          <Select value={form.currency} onChange={(e) => set("currency", e.target.value)}>
            {["INR", "USD", "AED", "EUR"].map((c) => <option key={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Availability">
          <Select value={form.status} onChange={(e) => set("status", e.target.value)}>
            {AVAILABILITY.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
          </Select>
        </Field>
      </div>

      <h4 className="border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Owner &amp; contact</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Owner / company">
          <Input value={form.ownerName ?? ""} onChange={(e) => set("ownerName", e.target.value)} />
        </Field>
        <Field label="Contact name">
          <Input value={form.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <Field label="Contact phone" error={fieldErrors.contactPhone}>
          <Input type="tel" value={form.contactPhone ?? ""} onChange={(e) => set("contactPhone", sanitizePhone(e.target.value))} />
        </Field>
      </div>

      <h4 className="border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Details</h4>
      <Field label="Amenities (comma separated)">
        <Input value={form.amenities} onChange={(e) => set("amenities", e.target.value)} placeholder="Pool, Gym, Parking" />
      </Field>
      <Field label="Description">
        <Textarea rows={4} value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} />
      </Field>

      <h4 className="border-b border-slate-100 pb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Media &amp; location</h4>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="YouTube video link" error={fieldErrors.youtubeUrl}>
          <Input
            value={form.youtubeUrl}
            onChange={(e) => set("youtubeUrl", e.target.value)}
            placeholder="https://youtube.com/watch?v=…"
          />
        </Field>
        <Field label="Latitude">
          <Input type="number" step="any" value={form.latitude} onChange={(e) => set("latitude", e.target.value)} placeholder="13.083700" />
        </Field>
        <Field label="Longitude">
          <Input type="number" step="any" value={form.longitude} onChange={(e) => set("longitude", e.target.value)} placeholder="80.270700" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="secondary" size="sm" onClick={useMyLocation} disabled={locating}>
          <MapPinIcon className="h-3.5 w-3.5" /> {locating ? "Locating…" : "Use my current location"}
        </Button>
        {mapsUrl && (
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline">
            Open pinned location in Google Maps →
          </a>
        )}
      </div>

      <div>
        <span className="mb-2 block text-xs font-medium text-slate-600">Images</span>
        <div className="flex flex-wrap gap-3">
          {(isEdit ? images : pendingImages).map((img, idx) => (
            <div key={isEdit ? (img as { id: string }).id : idx} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={isEdit ? resolveMediaUrl((img as { url: string }).url) : (img as { previewUrl: string }).previewUrl}
                alt=""
                className="h-24 w-32 rounded-lg object-cover"
              />
              <button
                type="button"
                onClick={() => (isEdit ? removeImage((img as { id: string }).id) : removePendingImage(idx))}
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
          <button
            type="button"
            onClick={() => setShowCamera(true)}
            className="flex h-24 w-32 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-400"
          >
            <CameraIcon className="h-4 w-4" /> Take photo
          </button>
        </div>

        <span className="mb-2 mt-4 block text-xs font-medium text-slate-600">Video tour</span>
        {(isEdit ? videoUrl : pendingVideo?.previewUrl) ? (
          <div className="relative inline-block">
            <video src={isEdit ? resolveMediaUrl(videoUrl!) : pendingVideo!.previewUrl} controls className="h-40 rounded-lg bg-slate-900" />
            <button
              type="button"
              onClick={isEdit ? removeVideo : removePendingVideo}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
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
            <label className="flex h-24 w-48 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 text-xs text-slate-500 hover:border-brand-400">
              <CameraIcon className="h-4 w-4" /> {videoBusy ? "Uploading…" : "Record video"}
              <input
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                disabled={videoBusy}
                onChange={(e) => e.target.files?.[0] && uploadVideo(e.target.files[0])}
              />
            </label>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => {
          pendingImages.forEach((img) => URL.revokeObjectURL(img.previewUrl));
          if (pendingVideo) URL.revokeObjectURL(pendingVideo.previewUrl);
          router.back();
        }}>Cancel</Button>
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : isEdit ? "Save changes" : "Create property"}</Button>
      </div>

      <CameraCapture
        open={showCamera}
        onClose={() => setShowCamera(false)}
        onCapture={(file) => uploadImages([file])}
      />
    </form>
  );
}
