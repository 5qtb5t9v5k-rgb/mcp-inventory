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

export function checkBearer(
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

  const header = req.headers.authorization ?? "";
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (!match) {
    res.statusCode = 401;
    res.setHeader("WWW-Authenticate", 'Bearer realm="mcp"');
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing bearer token" }));
    return false;
  }

  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(expectedKey);
  if (
    provided.length !== expected.length ||
    !timingSafeEqual(provided, expected)
  ) {
    res.statusCode = 401;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Invalid token" }));
    return false;
  }

  return true;
}

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
