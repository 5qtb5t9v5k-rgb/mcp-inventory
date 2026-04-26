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
         │                │                │
         ▼                ▼                ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ Oura API │    │ Strava   │    │ Todoist  │
   │          │    │ API      │    │ API      │
   └──────────┘    └──────────┘    └──────────┘
                          ┌──────────────────┐
                          │ Apple Health     │
                          │ (opt-in, local)  │
                          └──────────────────┘
```

## Servers

### `servers/health` — Health Data MCP Server

Connects Claude to **Oura Ring** (sleep, activity, readiness), **Strava** (training data) and optionally **Apple Health** (XML export → SQLite cache, local-only).

**Deployment:** `https://health-mcp-server.fly.dev/`

```
┌──────────────────────────────────────────────────────────┐
│                  Health MCP Server                       │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │
│  │ Oura Module │  │ Strava      │  │ Apple Health    │   │
│  │             │  │ Module      │  │ (opt-in)        │   │
│  │ REST API    │  │             │  │                 │   │
│  │ + pagination│  │ OAuth2      │  │ XML → SAX       │   │
│  │             │  │ + auto-     │  │     → SQLite    │   │
│  │             │  │   refresh   │  │     → Query API │   │
│  └─────────────┘  └─────────────┘  └─────────────────┘   │
│                                                          │
│  Tools (19 default + 3 if Apple Health enabled):         │
│                                                          │
│  Oura (9):                                               │
│  • oura_daily_sleep      • oura_spo2                     │
│  • oura_sleep_periods    • oura_body_temperature         │
│  • oura_daily_activity   • oura_daily_stress             │
│  • oura_daily_readiness  • oura_personal_info            │
│  • oura_heart_rate                                       │
│                                                          │
│  Strava (7):                                             │
│  • strava_get_activities                                 │
│  • strava_get_activity_detail                            │
│  • strava_get_activity_streams (HR, power, speed, ...)   │
│  • strava_get_athlete_stats (recent / YTD / all-time)    │
│  • strava_get_zones                                      │
│  • strava_get_gear                                       │
│  • strava_get_athlete                                    │
│                                                          │
│  Cross-source (3):                                       │
│  • list_data_types  • health_summary  • health_trends    │
│                                                          │
│  Apple Health (3, opt-in via APPLE_HEALTH_ENABLED=true): │
│  • apple_health_import                                   │
│  • apple_health_query                                    │
│  • apple_health_workouts                                 │
└──────────────────────────────────────────────────────────┘
```

#### Key Design Decisions

- **Oura + Strava as primary sources** — both API-based, work remotely on iOS without local dependencies
- **Strava OAuth2 refresh** — access tokens expire after 6h; client auto-refreshes using refresh token
- **Apple Health is opt-in** — disabled by default, only loaded when `APPLE_HEALTH_ENABLED=true`. Apple Health requires a 2 GB+ XML export file and SQLite cache, only useful locally
- **Lazy module loading** — `better-sqlite3` and `sax` (Apple Health deps) are only imported when the flag is set, keeping the remote Fly.io image lean
- **Stateless HTTP** mode for Fly.io — no session timeouts, each request is independent
- **Dual transport** — stdio for local (Claude Desktop/Code), HTTP for remote (claude.ai/iOS)
- **Compact responses** — Strava raw payloads are huge (polylines, segments, photos); the MCP layer trims to LLM-friendly fields and converts m→km / s→min

---

### `servers/todoist` — Todoist MCP Server

Simple, focused Todoist integration — tasks, projects, sections, labels, and comments.

**Deployment:** `https://todoist-mcp-server.fly.dev/`

```
┌───────────────────────────────────────────────┐
│             Todoist MCP Server                │
│                                               │
│  ┌──────────────────────────────────────────┐ │
│  │           Todoist REST API v1            │ │
│  │                                          │ │
│  │  Tasks:    get, create, update,          │ │
│  │            complete, delete              │ │
│  │  Projects: get, create                   │ │
│  │  Sections: get (by project)              │ │
│  │  Labels:   get                           │ │
│  │  Comments: get, add                      │ │
│  └──────────────────────────────────────────┘ │
│                                               │
│  Tools (11):                                  │
│  • todoist_get_tasks      • todoist_get_labels│
│  • todoist_create_task    • todoist_get_comments│
│  • todoist_update_task    • todoist_add_comment │
│  • todoist_complete_task  • todoist_get_sections│
│  • todoist_delete_task                          │
│  • todoist_get_projects                         │
│  • todoist_create_project                       │
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

- Node.js 20+ (nvm recommended)
- Fly.io CLI (`brew install flyctl`)
- API tokens — at minimum one of:
  - **Oura** personal access token — [cloud.ouraring.com/personal-access-tokens](https://cloud.ouraring.com/personal-access-tokens)
  - **Strava** API app — [www.strava.com/settings/api](https://www.strava.com/settings/api) (need client_id, client_secret, and a refresh_token from OAuth flow)
  - **Todoist** API token — Todoist → Settings → Integrations → Developer

### Strava: Generating a Refresh Token

Strava only gives a refresh token via OAuth. One-time setup:

1. Visit:
   ```
   https://www.strava.com/oauth/authorize?client_id=YOUR_ID&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=read,activity:read_all,profile:read_all
   ```
2. Authorize. Browser redirects to `http://localhost/?code=XXXX&...` (page errors out, that's fine).
3. Copy the `code` parameter from the URL.
4. Exchange it for a refresh token:
   ```bash
   curl -X POST https://www.strava.com/oauth/token \
     -d client_id=YOUR_ID \
     -d client_secret=YOUR_SECRET \
     -d code=THE_CODE \
     -d grant_type=authorization_code
   ```
5. Save the `refresh_token` — it's long-lived. The MCP server uses it to mint short-lived access tokens automatically.

### Local Development

```bash
# Health server
cd servers/health
npm install
npm run build
OURA_ACCESS_TOKEN=xxx \
STRAVA_CLIENT_ID=xxx \
STRAVA_CLIENT_SECRET=xxx \
STRAVA_REFRESH_TOKEN=xxx \
node dist/index.js               # stdio mode

# To enable Apple Health (local only):
APPLE_HEALTH_ENABLED=true \
APPLE_HEALTH_EXPORT_PATH=/path/to/vienti.xml \
node dist/index.js

# HTTP mode (e.g. for the MCP Inspector)
node dist/index.js --http        # listens on :3000

# Todoist server
cd servers/todoist
npm install
npm run build
TODOIST_API_TOKEN=xxx node dist/index.js           # stdio
TODOIST_API_TOKEN=xxx node dist/index.js --http    # HTTP
```

### Deploy to Fly.io

```bash
# Health
cd servers/health
fly secrets set \
  OURA_ACCESS_TOKEN=xxx \
  STRAVA_CLIENT_ID=xxx \
  STRAVA_CLIENT_SECRET=xxx \
  STRAVA_REFRESH_TOKEN=xxx
npm run build && fly deploy

# Todoist
cd servers/todoist
fly secrets set TODOIST_API_TOKEN=xxx
npm run build && fly deploy
```

> Apple Health is intentionally **not** deployed remotely — it requires a local SQLite cache and the original XML export. Use stdio mode locally if you want it.

### Claude Desktop / Claude Code Configuration

Add to `~/.claude/settings.json` (Claude Code) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (Claude Desktop):

```json
{
  "mcpServers": {
    "health-data": {
      "command": "/Users/you/.nvm/versions/node/v20.20.0/bin/node",
      "args": ["/path/to/servers/health/dist/index.js"],
      "env": {
        "OURA_ACCESS_TOKEN": "your-token",
        "STRAVA_CLIENT_ID": "your-id",
        "STRAVA_CLIENT_SECRET": "your-secret",
        "STRAVA_REFRESH_TOKEN": "your-refresh-token"
      }
    },
    "todoist": {
      "command": "/Users/you/.nvm/versions/node/v20.20.0/bin/node",
      "args": ["/path/to/servers/todoist/dist/index.js"],
      "env": {
        "TODOIST_API_TOKEN": "your-token"
      }
    }
  }
}
```

> **Note:** Use the **absolute path** to `node` (e.g. from nvm). Claude Code's shell does not load nvm automatically, so a bare `"command": "node"` will fail.

To enable Apple Health locally, add to the `env` block:
```json
"APPLE_HEALTH_ENABLED": "true",
"APPLE_HEALTH_EXPORT_PATH": "/path/to/vienti.xml"
```

### Claude.ai / iOS (Remote)

Add custom connectors in claude.ai → Settings → Connectors:

| Name | URL |
|------|-----|
| MyHealthMCP | `https://health-mcp-server.fly.dev/` |
| MyTodoist | `https://todoist-mcp-server.fly.dev/` |

These are automatically available on iOS after configuring once.

> Apple Health tools are not exposed over the remote URL — only Oura, Strava and the cross-source summaries.

---

## Adding a New Server

1. Create `servers/<name>/` with the same structure as the others
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
| Hosting | Fly.io (Stockholm region, auto-stop on idle) |
| Strava OAuth | client-side refresh-token flow, in-memory access-token cache |
| Apple Health cache (opt-in) | better-sqlite3 + SAX parser, lazy-loaded |
