import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

const ALLOWED_ORIGINS = new Set<string>([
  "https://claude.ai",
  "https://www.claude.ai",
  "http://localhost:3000",
]);
const CLAUDE_SUBDOMAIN = /^https:\/\/[a-z0-9-]+\.claude\.ai$/;

export function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (origin && (ALLOWED_ORIGINS.has(origin) || CLAUDE_SUBDOMAIN.test(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Mcp-Session-Id",
  );
  res.setHeader("Access-Control-Max-Age", "86400");
}

function constantTimeStringEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * Validate auth from either:
 *   1. Authorization: Bearer <key> header (preferred — Claude Desktop, curl, etc.)
 *   2. URL path prefix /<key>/... (fallback — claude.ai custom connectors,
 *      which only let you set the URL and don't support custom headers)
 *
 * On success, when path-auth was used, this rewrites req.url so the prefix
 * is stripped before the request reaches the MCP transport.
 */
export function checkAuth(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const expectedKey = process.env.MCP_API_KEY;
  if (!expectedKey) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ error: "Server misconfigured: MCP_API_KEY not set" }),
    );
    return false;
  }

  // 1) Header auth
  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (match) {
    if (constantTimeStringEqual(match[1], expectedKey)) return true;
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid token" }));
    return false;
  }

  // 2) URL path auth — first path segment must match the key
  const url = req.url ?? "/";
  // Allow trailing slash variants. Examples:
  //   /KEY            → match, rewrite to /
  //   /KEY/           → match, rewrite to /
  //   /KEY/whatever   → match, rewrite to /whatever
  const pathMatch = /^\/([^/?#]+)(\/.*)?(\?.*)?$/.exec(url);
  if (pathMatch) {
    const provided = decodeURIComponent(pathMatch[1]);
    if (constantTimeStringEqual(provided, expectedKey)) {
      const rest = pathMatch[2] ?? "/";
      const query = pathMatch[3] ?? "";
      req.url = rest + query;
      return true;
    }
  }

  res.statusCode = 401;
  res.setHeader("WWW-Authenticate", 'Bearer realm="mcp"');
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ error: "Missing or invalid token (provide Bearer header or include key in URL path)" }));
  return false;
}

/** @deprecated Use checkAuth instead — kept for backward compatibility. */
export const checkBearer = checkAuth;

type Bucket = { tokens: number; updated: number };
const buckets = new Map<string, Bucket>();
const CAPACITY = 60;
const REFILL_PER_SEC = 1;

function clientIp(req: IncomingMessage): string {
  const flyIp = req.headers["fly-client-ip"];
  if (typeof flyIp === "string" && flyIp.length > 0) return flyIp;
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  return req.socket.remoteAddress ?? "unknown";
}

export function rateLimit(
  req: IncomingMessage,
  res: ServerResponse,
): boolean {
  const ip = clientIp(req);
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { tokens: CAPACITY, updated: now };
  const elapsedSec = (now - bucket.updated) / 1000;
  bucket.tokens = Math.min(
    CAPACITY,
    bucket.tokens + elapsedSec * REFILL_PER_SEC,
  );
  bucket.updated = now;

  if (bucket.tokens < 1) {
    buckets.set(ip, bucket);
    res.statusCode = 429;
    res.setHeader("Retry-After", "1");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Rate limit exceeded" }));
    return false;
  }

  bucket.tokens -= 1;
  buckets.set(ip, bucket);
  return true;
}
