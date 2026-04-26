#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "http";
import { registerAllTools } from "./tools/index.js";
import { applyCors, checkBearer, rateLimit } from "./middleware.js";

const mode = process.argv.includes("--http") ? "http" : "stdio";
const port = parseInt(process.env.PORT ?? "3000", 10);

function createMcpServer(): McpServer {
  return new McpServer(
    {
      name: "health-data",
      version: "1.0.0",
    },
    {
      instructions:
        "Health data server providing access to Oura Ring and Apple Health data. " +
        "Use list_data_types to discover available metrics. " +
        "Query specific sources with oura_* or apple_health_* tools. " +
        "Use health_summary for cross-source overviews.",
    }
  );
}

if (mode === "http") {
  // Stateless HTTP mode for remote deployment
  const httpServer = createServer(async (req, res) => {
    applyCors(req, res);
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return;
    }

    if (!rateLimit(req, res)) return;
    if (!checkBearer(req, res)) return;

    // Each request gets its own server+transport (stateless)
    const server = createMcpServer();
    await registerAllTools(server);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);

    // Clean up after response
    res.on("finish", () => {
      transport.close();
      server.close();
    });
  });

  httpServer.listen(port, () => {
    console.error(`Health MCP server (HTTP) listening on port ${port}`);
  });

  process.on("SIGINT", () => {
    httpServer.close();
    process.exit(0);
  });
} else {
  // Local stdio mode (Claude Desktop / Claude Code)
  const server = createMcpServer();
  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}
