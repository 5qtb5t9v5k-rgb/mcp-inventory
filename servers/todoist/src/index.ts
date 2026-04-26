#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "http";
import { registerTodoistTools } from "./tools/todoist-tools.js";
import { applyCors, checkBearer, rateLimit } from "./middleware.js";

const mode = process.argv.includes("--http") ? "http" : "stdio";
const port = parseInt(process.env.PORT ?? "3000", 10);
const TODOIST_TOKEN = process.env.TODOIST_API_TOKEN ?? "";

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "todoist", version: "1.0.0" },
    {
      instructions:
        "Todoist task management server. Use todoist_get_tasks with filter='today' to see today's tasks. " +
        "Use todoist_get_projects to see all projects. Create, update, complete, and delete tasks.",
    }
  );

  if (!TODOIST_TOKEN) {
    server.tool("todoist_status", "Check Todoist connection status", {}, async () => ({
      content: [{ type: "text", text: JSON.stringify({ error: "TODOIST_API_TOKEN not configured" }) }],
      isError: true,
    }));
  } else {
    registerTodoistTools(server, TODOIST_TOKEN);
  }

  return server;
}

if (mode === "http") {
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

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);

    res.on("finish", () => {
      transport.close();
      server.close();
    });
  });

  httpServer.listen(port, () => {
    console.error(`Todoist MCP server (HTTP) listening on port ${port}`);
  });

  process.on("SIGINT", () => {
    httpServer.close();
    process.exit(0);
  });
} else {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}
