import { env } from "../config/env";

/** Resolve a stored media path ("/uploads/xxx.jpg") into an absolute URL for outbound messages. Leaves already-absolute URLs untouched. */
export function resolveMediaUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : `${env.publicUrl}${url}`;
}
