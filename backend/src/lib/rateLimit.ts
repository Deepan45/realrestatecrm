import { HttpError } from "./errors";

/**
 * Simple in-memory fixed-window rate limiter keyed by IP. Good enough for a single-
 * instance deployment; would need a shared store (e.g. Redis) to hold across replicas.
 */
export function rateLimitByIp(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req: { ip?: string }, _res: unknown, next: (err?: unknown) => void) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const entry = hits.get(key);
    if (!entry || entry.resetAt < now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    entry.count++;
    if (entry.count > max) return next(new HttpError(429, "Too many requests, please try again later"));
    next();
  };
}
