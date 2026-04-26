import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import { homedir } from "os";

dotenvConfig();

function resolvePath(p: string): string {
  if (p.startsWith("~")) {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

// Apple Health is disabled by default — it only works locally (needs a 2 GB
// XML export file) and bloats the server. Set APPLE_HEALTH_ENABLED=true to
// re-enable it. Oura + Strava work remotely and are the primary sources.
const appleHealthEnabled = (process.env.APPLE_HEALTH_ENABLED ?? "").toLowerCase() === "true";

export const config = {
  ouraToken: process.env.OURA_ACCESS_TOKEN ?? "",
  ouraBaseUrl: process.env.OURA_API_BASE_URL ?? "https://api.ouraring.com",
  appleHealthEnabled,
  appleHealthExportPath: process.env.APPLE_HEALTH_EXPORT_PATH ?? "",
  cacheDir: resolvePath(process.env.CACHE_DIR ?? "~/.health-mcp/cache"),
  stravaClientId: process.env.STRAVA_CLIENT_ID ?? "",
  stravaClientSecret: process.env.STRAVA_CLIENT_SECRET ?? "",
  stravaRefreshToken: process.env.STRAVA_REFRESH_TOKEN ?? "",
};
