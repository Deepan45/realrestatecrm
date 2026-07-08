import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import { HttpError } from "./errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Raw request body bytes, captured by the global JSON parser's `verify` hook — needed for HMAC signature checks (e.g. Meta webhooks) that must run over the exact bytes sent, not the re-serialized parsed object. */
      rawBody?: Buffer;
    }
  }
}

/**
 * Guard an inbound webhook route with a shared-secret header. Returns 503 (not 401) when
 * no secret is configured at all, since that means the integration was never set up rather
 * than a caller failing auth.
 */
export function requireWebhookSecret(getExpected: () => string, headerName = "x-webhook-secret") {
  return (req: Request, _res: Response, next: NextFunction) => {
    const expected = getExpected();
    if (!expected) return next(new HttpError(503, "This webhook is not configured"));
    const provided = req.header(headerName);
    if (!provided || provided !== expected) return next(new HttpError(401, "Invalid or missing webhook secret"));
    next();
  };
}

/** Verify a Meta (Facebook/Instagram) `X-Hub-Signature-256: sha256=<hex>` header against the raw body. */
export function verifyMetaSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!rawBody || !signatureHeader || !appSecret) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
