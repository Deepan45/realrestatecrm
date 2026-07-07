const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
// Backend origin without the /api suffix — needed to resolve relative /uploads/... paths,
// since the frontend and backend are served from different domains in production.
const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

/** Resolve an image/video path returned by the API into an absolute URL. Leaves already-absolute URLs untouched. */
export function resolveMediaUrl(url?: string | null): string {
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `${API_ORIGIN}${url}`;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public errors?: { path: string; message: string }[]) {
    super(message);
  }
}

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("realrest_token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("realrest_token", token);
  else localStorage.removeItem("realrest_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { ...(options.headers as Record<string, string>) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (res.status === 401 && typeof window !== "undefined" && !path.startsWith("/auth/")) {
    setToken(null);
    window.location.href = "/login";
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message || "Request failed", data.errors);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** Build a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}
