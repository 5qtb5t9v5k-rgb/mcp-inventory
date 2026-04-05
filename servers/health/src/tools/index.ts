import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerOuraTools } from "./oura-tools.js";
import { registerAppleHealthTools } from "./apple-health-tools.js";
import { registerSummaryTools } from "./summary-tools.js";

export function registerAllTools(server: McpServer): void {
  registerOuraTools(server);
  registerAppleHealthTools(server);
  registerSummaryTools(server);
}
