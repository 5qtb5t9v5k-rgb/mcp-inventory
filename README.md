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
         │ HTTPS+Bearer   │ HTTPS+Bearer        │ stdio (local)
         │                │                     │
┌────────┼────────────────┼─────────────────────┼─────────────┐
│        ▼                ▼                     ▼             │
│   ┌─────────────────────────┐   ┌──────────────────────┐   │
│   │   Fly.io (remote)       │   │   Local MCP servers  │   │
│   │   + auth middleware     │   │   (no auth needed)   │   │
│   │                         │   │                      │   │
│   │  health-mcp-server      │   │  node health/dist/   │   │
│   │  todoist-mcp-server     │   │  node todoist/dist/  │   │
│   │  finance-mcp-jr         │   │  node finance/dist/  │   │
│   └─────────────────────────┘   │  whatsapp-bridge     │   │
│                                 │  (Go) + uv MCP       │   │
│                                 └──────────────────────┘   │
│                                                             │
│                      MCP Servers                            │
└─────────────────────────────────────────────────────────────┘
         │           │            │              │
         ▼           ▼            ▼              ▼
   ┌──────────┐ ┌────────┐ ┌──────────┐  ┌──────────────┐
   │ Oura API │ │ Strava │ │ Todoist  │  │ Curve CSV    │
   │          │ │ API    │ │ API      │  │ (uploaded)   │
   └──────────┘ └────────┘ └──────────┘  └──────────────┘
                       ┌──────────────────┐  ┌────────────┐
                       │ Apple Health     │  │ WhatsApp   │
                       │ (opt-in, local)  │  │ (whatsmeow,│
                       │                  │  │  local)    │
                       └──────────────────┘  └────────────┘
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

### `servers/finance` — Personal Finance MCP Server

Reads a Curve credit-card CSV export and exposes querying + aggregation tools. The categorization logic (English Curve categories → Finnish hierarchical categories with derived 2nd categories) is a TypeScript port of the rules in [`finance_notebook`](https://github.com/5qtb5t9v5k-rgb/finance_notebook).

**Deployment:** `https://finance-mcp-jr.fly.dev/`

```
┌──────────────────────────────────────────────────────────┐
│                Finance MCP Server                        │
│                                                          │
│  ┌──────────────────┐    ┌─────────────────────────────┐ │
│  │ Curve CSV parser │ →  │ Categorizer (Finnish rules) │ │
│  │  - parse rows    │    │  - EN → FI category map     │ │
│  │  - filter trash  │    │  - derive 2nd category      │ │
│  │  - card mapping  │    │  - apply prefix rules       │ │
│  └──────────────────┘    └─────────────────────────────┘ │
│                                                          │
│  PUT /<KEY>/upload   Upload a fresh Transactions.csv     │
│                      from your laptop (curl script).     │
│                      Stored on Fly volume at /data/.     │
│                                                          │
│  Tools (7):                                              │
│  • finance_csv_status      • finance_top_merchants       │
│  • finance_list_transactions  • finance_search           │
│  • finance_summary         • finance_spend_trend         │
│  • finance_categories                                    │
└──────────────────────────────────────────────────────────┘
```

#### Why This Design

- **CSV is the source of truth.** Curve has no public API, so each fresh export gets uploaded to the server via a tiny `upload.sh` script. The server stores it on a Fly volume.
- **Categorization is pure logic, no DB.** All transforms run on each request. The CSV is small (a few thousand rows in a year), so this is fast. No state to manage.
- **PUT /upload via the same auth.** The upload endpoint reuses the same Bearer / URL-path auth as the MCP transport, so the upload script is a one-liner curl.
- **Server-side opinions match `finance_notebook`.** Same Finnish category names, same exclude rules, same card mapping. Tools return Finnish strings so the LLM can answer in Finnish naturally.

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

### `servers/whatsapp` — WhatsApp MCP Server (third-party, local-only)

Wraps [`lharries/whatsapp-mcp`](https://github.com/lharries/whatsapp-mcp) — Go (`whatsmeow`) bridge + Python MCP that connects Claude to your **personal** WhatsApp account via the multidevice protocol.

**Deployment:** local stdio only (Mac mini / always-on Mac). Not on Fly.io, not reachable from iOS Claude.

```
┌─────────────────────────────────────────────────────┐
│              WhatsApp MCP (local)                   │
│                                                     │
│   ┌──────────────────┐      ┌────────────────────┐  │
│   │  Go bridge       │      │  Python MCP (uv)   │  │
│   │  (whatsmeow)     │─────▶│  reads SQLite,     │  │
│   │  launchd-managed │      │  exposes tools     │  │
│   │  ~20d QR re-auth │      │  via stdio         │  │
│   └──────────────────┘      └────────────────────┘  │
│            │                          │             │
│            ▼                          ▼             │
│   ┌──────────────────────────────────────────────┐  │
│   │  ~/code/whatsapp-mcp/whatsapp-bridge/store/  │  │
│   │  (SQLite — messages, chats, session creds)   │  │
│   └──────────────────────────────────────────────┘  │
│                                                     │
│  Tools (12): search_contacts, list_messages,        │
│  list_chats, send_message, send_file,               │
│  send_audio_message, download_media,                │
│  get_message_context, …                             │
└─────────────────────────────────────────────────────┘
```

#### Why Local-Only

- **Stateful session**: WhatsApp credentials + SQLite live on disk and must persist on a single machine — doesn't fit the stateless-HTTP Fly.io pattern.
- **QR re-pair every ~20 days**: requires terminal access to the host to scan a fresh code.
- **TOS grey area**: residential `whatsmeow` use is the lowest-risk profile.
- **Source not vendored**: upstream is its own Go + Python codebase. This repo only carries setup notes (`servers/whatsapp/README.md`) and a launchd plist.

> Path forward for iOS access: `loglux/whatsapp-mcp-stream` (TypeScript + Streamable HTTP + Baileys) on Fly.io with a persistent volume. Same auth middleware as Health/Todoist would slot in front. Not implemented yet — see `servers/whatsapp/README.md`.

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

### Finance: Uploading Your Curve CSV

The finance server reads from `/data/transactions.csv` on the Fly volume. Each time you download a fresh export from Curve:

```bash
# Save your latest export to ~/Desktop/Transactions.csv (default), then:
cd servers/finance
./upload.sh                            # uploads ~/Desktop/Transactions.csv

# Or upload from a different path:
./upload.sh ~/Downloads/Transactions.csv

# Or use env vars instead of /tmp/finance_mcp_key.txt:
FINANCE_MCP_KEY="..." FINANCE_MCP_URL="https://finance-mcp-jr.fly.dev" ./upload.sh
```

The script POSTs the file to `PUT /<MCP_API_KEY>/upload` and the server overwrites the volume file. Locally (stdio mode) the server just reads `~/Desktop/Transactions.csv` directly — no upload needed.

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

# Finance server (no external API, just reads a CSV)
cd servers/finance
npm install
npm run build
FINANCE_CSV_PATH=~/Desktop/Transactions.csv node dist/index.js          # stdio
FINANCE_CSV_PATH=/data/transactions.csv node dist/index.js --http       # HTTP

# WhatsApp server — see servers/whatsapp/README.md
# (third-party upstream cloned separately, not in this repo)
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

# Finance (first time setup)
cd servers/finance
fly apps create finance-mcp-jr                     # or your chosen name
fly volumes create finance_data --region arn --size 1 -a finance-mcp-jr
fly secrets set MCP_API_KEY="$(openssl rand -base64 32 | tr -d '=' | tr '/+' '_-')" -a finance-mcp-jr
npm run build && fly deploy
./upload.sh                                        # push your first CSV
```

> Apple Health is intentionally **not** deployed remotely — it requires a local SQLite cache and the original XML export. Use stdio mode locally if you want it.
>
> WhatsApp follows the same local-only pattern (stateful whatsmeow session + on-disk SQLite + ~20d QR re-pair). See `servers/whatsapp/README.md` for setup.

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
    },
    "finance": {
      "command": "/Users/you/.nvm/versions/node/v20.20.0/bin/node",
      "args": ["/path/to/servers/finance/dist/index.js"],
      "env": {
        "FINANCE_CSV_PATH": "/Users/you/Desktop/Transactions.csv"
      }
    },
    "whatsapp": {
      "command": "/Users/you/.local/bin/uv",
      "args": [
        "--directory",
        "/Users/you/code/whatsapp-mcp/whatsapp-mcp-server",
        "run",
        "main.py"
      ]
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

Add custom connectors in claude.ai → Settings → Connectors. The **API key goes in the URL path** (claude.ai's custom-connector dialog only has fields for OAuth, no place for a custom Authorization header — the path-based variant works around this):

| Name | URL |
|------|-----|
| MyHealthMCP | `https://health-mcp-server.fly.dev/<MCP_API_KEY>/` |
| MyTodoist | `https://todoist-mcp-server.fly.dev/<MCP_API_KEY>/` |
| MyFinance | `https://finance-mcp-jr.fly.dev/<MCP_API_KEY>/` |

Replace `<MCP_API_KEY>` with the actual key. Anyone with the URL has full access — treat it like a password and use HTTPS only.

These are automatically available on iOS after configuring once.

> Apple Health tools are not exposed over the remote URL — only Oura, Strava and the cross-source summaries.

---

## Security

Both Fly-hosted servers are protected with three layers in `src/middleware.ts`:

| Layer | Behavior |
|-------|----------|
| **Auth (two ways)** | The server accepts either:<br>1. `Authorization: Bearer <MCP_API_KEY>` header (preferred — Claude Desktop, curl)<br>2. Key as the first URL path segment, e.g. `https://...fly.dev/<KEY>/` (used for claude.ai custom connectors which can't set headers — the prefix is stripped before reaching the MCP transport)<br>Both compared with `timingSafeEqual`. Without `MCP_API_KEY` env var the server returns 503 (fail-closed). |
| **CORS allowlist** | Only `claude.ai` (incl. subdomains) and `localhost:3000` are allowed origins. The previous `*` wildcard is gone. |
| **Per-IP rate limit** | 60 requests / minute (token bucket, `Fly-Client-IP` aware). Returns 429 + `Retry-After`. Resets on machine restart — fine for personal use. |

Local **stdio** mode bypasses all of this — middleware only runs on HTTP requests.

### Look up or rotate the API key

```bash
# Look up current keys (stored in Fly secrets — values are NOT readable, only timestamps shown)
fly secrets list -a health-mcp-server
fly secrets list -a todoist-mcp-server

# Rotate (this triggers a redeploy)
fly secrets set MCP_API_KEY="$(openssl rand -base64 32)" -a health-mcp-server
fly secrets set MCP_API_KEY="$(openssl rand -base64 32)" -a todoist-mcp-server

# After rotating: update the Authorization header value in claude.ai connector settings
```

### Test it

```bash
# 401 without token
curl -i https://health-mcp-server.fly.dev/ -X POST -d '{}'

# 401 with wrong token
curl -i https://health-mcp-server.fly.dev/ -X POST \
  -H "Authorization: Bearer wrong" -d '{}'

# 200 with correct token
curl -i https://health-mcp-server.fly.dev/ -X POST \
  -H "Authorization: Bearer $MCP_API_KEY" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}'
```

### What this does **not** cover

- Tokenin rotaatiota — kun rotatat, päivitä Fly-secret + claude.ai-connector samaan aikaan; downtimea tulee parin sekunnin verran kun machine käynnistyy uudella envillä.
- DDoS — Fly:n edessä kannattaa Cloudflare / Tailscale Funnel jos haluat oikeasti rajata pääsyn omiin laitteisiin.
- Lokitusta — middleware ei lokita Authorization-headeria, mutta jos lisäät debug-logituksia, varmista ettei header tai request body päädy lokeihin.

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
