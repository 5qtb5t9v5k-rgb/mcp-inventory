import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOuraTools } from "./oura-tools.js";
import { registerStravaTools } from "./strava-tools.js";
import { registerSummaryTools } from "./summary-tools.js";
import { config } from "../config.js";

export async function registerAllTools(server: McpServer): Promise<void> {
  registerOuraTools(server);
  registerStravaTools(server);
  registerSummaryTools(server);

  // Apple Health is opt-in — only loaded when APPLE_HEALTH_ENABLED=true
  // (dynamic import so better-sqlite3 / sax never load in remote/iOS deployments)
  if (config.appleHealthEnabled) {
    const { registerAppleHealthTools } = await import("./apple-health-tools.js");
    registerAppleHealthTools(server);
  }
}
