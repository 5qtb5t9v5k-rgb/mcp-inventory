#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer, IncomingMessage, ServerResponse } from "http";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { registerFinanceTools } from "./tools/finance-tools.js";
import { applyCors, checkAuth, rateLimit } from "./middleware.js";
import { config } from "./config.js";

const mode = process.argv.includes("--http") ? "http" : "stdio";
const port = parseInt(process.env.PORT ?? "3000", 10);

function createMcpServer(): McpServer {
  return new McpServer(
    { name: "finance", version: "1.0.0" },
    {
      instructions:
        "Personal finance MCP server. Reads a Curve CSV export, applies Finnish categorization, " +
        "and exposes querying + aggregation tools. Always run finance_csv_status first to verify the file is loaded.",
    }
  );
}

/**
 * Read full request body up to a hard cap (5 MB).
 * Used by the /upload endpoint to receive a CSV file.
 */
async function readBodyBuffer(req: IncomingMessage, maxBytes = 5 * 1024 * 1024): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`Request body too large (>${maxBytes} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * PUT /upload — receive a CSV file and persist it to FINANCE_CSV_PATH.
 * The auth middleware has already stripped the API-key prefix from req.url
 * if URL-path auth was used, so we just match /upload here.
 */
async function handleUpload(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const body = await readBodyBuffer(req);
    if (body.length === 0) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Empty body" }));
      return;
    }
    await mkdir(dirname(config.csvPath), { recursive: true });
    await writeFile(config.csvPath, body);
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        ok: true,
        path: config.csvPath,
        bytes: body.length,
      })
    );
  } catch (err) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: String(err) }));
  }
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
    if (!checkAuth(req, res)) return;

    // After auth, req.url may have been rewritten (key prefix stripped).
    // /upload + PUT → upload handler. Anything else → MCP transport.
    const url = req.url ?? "/";
    const path = url.split("?")[0];
    if (path === "/upload" && (req.method === "PUT" || req.method === "POST")) {
      await handleUpload(req, res);
      return;
    }

    const server = createMcpServer();
    registerFinanceTools(server);

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
    console.error(`Finance MCP server (HTTP) listening on port ${port}, csv=${config.csvPath}`);
  });

  process.on("SIGINT", () => {
    httpServer.close();
    process.exit(0);
  });
} else {
  const server = createMcpServer();
  registerFinanceTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on("SIGINT", async () => {
    await server.close();
    process.exit(0);
  });
}
