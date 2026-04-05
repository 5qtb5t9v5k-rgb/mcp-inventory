# MCP Inventory

Personal MCP (Model Context Protocol) server collection — custom AI tool servers that connect Claude to external services and data.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Claude Clients                       │
│                                                             │
│   ┌──────────┐   ┌──────────────┐   ┌───────────────────┐  │
│   │ iOS App  │   │ Claude.ai    │   │ Claude Desktop /  │  │
│   │          │   │ (web)        │   │ Claude Code       │  │
│   └────┬─────┘   └──────┬───────┘   └────────┬──────────┘  │
│        │                │                     │             │
└────────┼────────────────┼─────────────────────┼─────────────┘
         │                │                     │
         │ HTTPS          │ HTTPS               │ stdio (local)
         │                │                     │
┌────────┼────────────────┼─────────────────────┼─────────────┐
│        ▼                ▼                     ▼             │
│   ┌─────────────────────────┐   ┌──────────────────────┐   │
│   │      Fly.io (remote)    │   │   Local MCP servers  │   │
│   │                         │   │                      │   │
│   │  health-mcp-server      │   │  node health/dist/   │   │
│   │  todoist-mcp-server     │   │  node todoist/dist/  │   │
│   └─────────────────────────┘   └──────────────────────┘   │
│                                                             │
│                      MCP Servers                            │
└─────────────────────────────────────────────────────────────┘
         │                │
         ▼                ▼
   ┌──────────┐    ┌──────────┐
   │ Oura API │    │ Todoist  │
   │          │    │ API      │
   └──────────┘    └──────────┘
   ┌──────────┐
   │ Apple    │
   │ Health   │
   │ (SQLite) │
   └──────────┘
```

## Servers

### `servers/health` — Health Data MCP Server

Connects Claude to Oura Ring data (via API) and Apple Health data (via XML export → SQLite cache).

**Deployment:** `https://health-mcp-server.fly.dev/mcp`

```
┌───────────────────────────────────────────────┐
│              Health MCP Server                │
│                                               │
│  ┌─────────────┐     ┌─────────────────────┐  │
│  │ Oura Module │     │ Apple Health Module  │  │
│  │             │     │                     │  │
│  │ REST API ───┼──►  │ XML ──► SAX Parser  │  │
│  │ + pagination│     │      ──► SQLite DB  │  │
│  │ + auto-auth │     │      ──► Query API  │  │
│  └─────────────┘     └─────────────────────┘  │
│                                               │
│  Tools (15):                                  │
│  • oura_daily_sleep    • apple_health_query   │
│  • oura_sleep_periods  • apple_health_workouts│
│  • oura_daily_activity • apple_health_import  │
│  • oura_daily_readiness                       │
│  • oura_heart_rate     • list_data_types      │
│  • oura_spo2           • health_summary       │
│  • oura_body_temperature • health_trends      │
│  • oura_daily_stress                          │
│  • oura_personal_info                         │
└───────────────────────────────────────────────┘
```

#### Key Design Decisions

- **SAX streaming parser** for Apple Health XML — exports can exceed 2GB, never loaded into memory
- **SQLite cache** — parsed data stored in `~/.health-mcp/cache/apple_health.db`, invalidated by file size + mtime
- **Batch inserts** (5000 records/transaction) for import performance
- **Stateless HTTP** mode for Fly.io — no session timeouts, each request is independent
- **Dual transport** — stdio for local (Claude Desktop/Code), HTTP for remote (claude.ai/iOS)

---

### `servers/todoist` — Todoist MCP Server

Simple, focused Todoist integration — tasks, projects, sections, labels, and comments.

**Deployment:** `https://todoist-mcp-server.fly.dev/mcp`

```
┌───────────────────────────────────────────────┐
│             Todoist MCP Server                │
│                                               │
│  ┌──────────────────────────────────────────┐  │
│  │           Todoist REST API v1            │  │
│  │                                          │  │
│  │  Tasks: get, create, update,             │  │
│  │         complete, delete                 │  │
│  │  Projects: get, create                   │  │
│  │  Sections: get (by project)              │  │
│  │  Labels: get                             │  │
│  │  Comments: get, add                      │  │
│  └──────────────────────────────────────────┘  │
│                                               │
│  Tools (11):                                  │
│  • todoist_get_tasks      • todoist_get_labels │
│  • todoist_create_task    • todoist_get_comments│
│  • todoist_update_task    • todoist_add_comment │
│  • todoist_complete_task  • todoist_get_sections│
│  • todoist_delete_task                         │
│  • todoist_get_projects                        │
│  • todoist_create_project                      │
└───────────────────────────────────────────────┘
```

#### Why Not Use the Official Todoist MCP?

The official Todoist MCP server (Doist/todoist-ai) has chronic timeout issues:
- HTTP sessions expire after 1–5 min of inactivity
- No keepalive mechanism
- No auto-reconnection

Our implementation uses **stateless HTTP** — no sessions, no timeouts.

---

## Setup

### Prerequisites

- Node.js 20+
- Fly.io CLI (`brew install flyctl`)
- Oura personal access token ([cloud.ouraring.com/personal-access-tokens](https://cloud.ouraring.com/personal-access-tokens))
- Todoist API token (Todoist → Settings → Integrations → Developer)

### Local Development

```bash
# Health server
cd servers/health
npm install
npm run build
OURA_ACCESS_TOKEN=xxx node dist/index.js          # stdio mode
OURA_ACCESS_TOKEN=xxx node dist/index.js --http    # HTTP mode on :3000

# Todoist server
cd servers/todoist
npm install
npm run build
TODOIST_API_TOKEN=xxx node dist/index.js           # stdio mode
TODOIST_API_TOKEN=xxx node dist/index.js --http    # HTTP mode on :3000
```

### Deploy to Fly.io

```bash
# Health
cd servers/health
fly launch --no-deploy
fly secrets set OURA_ACCESS_TOKEN=xxx
npm run build && fly deploy

# Todoist
cd servers/todoist
fly launch --no-deploy
fly secrets set TODOIST_API_TOKEN=xxx
npm run build && fly deploy
```

### Claude Desktop / Claude Code Configuration

Add to `~/.claude/settings.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "health-data": {
      "command": "node",
      "args": ["<path>/servers/health/dist/index.js"],
      "env": {
        "OURA_ACCESS_TOKEN": "your-token",
        "APPLE_HEALTH_EXPORT_PATH": "/path/to/vienti.xml"
      }
    },
    "todoist": {
      "command": "node",
      "args": ["<path>/servers/todoist/dist/index.js"],
      "env": {
        "TODOIST_API_TOKEN": "your-token"
      }
    }
  }
}
```

### Claude.ai / iOS (Remote)

Add custom connectors in claude.ai → Settings → Integrations:

| Name | URL |
|------|-----|
| MyHealthMCP | `https://health-mcp-server.fly.dev/mcp` |
| MyTodoist | `https://todoist-mcp-server.fly.dev/mcp` |

These are automatically available on iOS.

---

## Adding a New Server

1. Create `servers/<name>/` with the same structure
2. Implement tools in `src/tools/`
3. Add stdio + HTTP dual transport in `src/index.ts` (copy from existing)
4. Add Dockerfile + fly.toml
5. Deploy to Fly.io
6. Add connector in claude.ai

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 22 (Docker) / 20+ (local) |
| Language | TypeScript (strict, ESM) |
| MCP SDK | `@modelcontextprotocol/sdk` |
| Validation | Zod |
| Transport | stdio (local) + Streamable HTTP (remote) |
| Hosting | Fly.io (Stockholm, auto-sleep) |
| Apple Health cache | better-sqlite3 + SAX parser |
