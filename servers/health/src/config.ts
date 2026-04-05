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

export const config = {
  ouraToken: process.env.OURA_ACCESS_TOKEN ?? "",
  ouraBaseUrl: process.env.OURA_API_BASE_URL ?? "https://api.ouraring.com",
  appleHealthExportPath: process.env.APPLE_HEALTH_EXPORT_PATH ?? "",
  cacheDir: resolvePath(process.env.CACHE_DIR ?? "~/.health-mcp/cache"),
};
