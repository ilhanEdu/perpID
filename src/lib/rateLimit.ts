import { NextResponse } from "next/server";

/**
 * Best-effort in-memory rate limiting. Buckets live on globalThis so every
 * route bundle shares them within a single server instance. On multi-instance
 * / serverless deployments this is per-instance only — swap in a shared store
 * (e.g. Upstash Redis) for hard global limits — but it still blunts the obvious
 * abuse: hammering our DEX-proxy endpoints or spamming writes from one client.
 */

type Bucket = { count: number; reset: number };

const g = globalThis as unknown as { __popRL?: Map<string, Bucket> };
const buckets = (g.__popRL ??= new Map<string, Bucket>());

/** Returns true if the call is allowed, false once the window limit is hit. */
export function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.reset) {
    // Opportunistically prune expired buckets so the map can't grow unbounded.
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (now > v.reset) buckets.delete(k);
    }
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (b.count >= limit) return false;
  b.count += 1;
  return true;
}

/** Client IP from the standard proxy headers (Vercel sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/**
 * Rate-limit guard for a route. Returns a 429 response when the caller is over
 * the limit, or null to proceed. `name` scopes the bucket per endpoint.
 */
export function rateLimit(
  req: Request,
  name: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  if (allow(`${name}:${clientIp(req)}`, limit, windowMs)) return null;
  return NextResponse.json(
    { error: "Too many requests — slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } },
  );
}
