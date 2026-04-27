# WhatsApp MCP Server (third-party, local-only)

Wraps [`lharries/whatsapp-mcp`](https://github.com/lharries/whatsapp-mcp) — a Go (whatsmeow) bridge + Python MCP that connects Claude to your **personal** WhatsApp account via the multidevice protocol.

This directory contains **ops only** (setup notes + launchd plist). The actual source lives upstream and is cloned separately.

## Why local-only

- **Stateful session**: WhatsApp credentials + SQLite live on disk and must persist on a single machine.
- **QR pairing every ~20 days**: re-auth via the Go bridge's terminal output.
- **TOS grey area**: residential use of `whatsmeow` is the safest profile; deploying to a datacenter is *probably* fine for personal volume but adds one more variable if Meta ever starts flagging accounts.

For an iOS-reachable / always-on remote variant, see the open question in the root README — the path forward is `loglux/whatsapp-mcp-stream` on Fly.io with a volume.

## Prerequisites

```bash
brew install go uv ffmpeg
```

- **Go** — for the whatsmeow bridge
- **uv** — Python package/runner used by the upstream MCP
- **ffmpeg** — optional, only needed for `send_audio_message` (voice notes)

## Install upstream

```bash
git clone https://github.com/lharries/whatsapp-mcp ~/code/whatsapp-mcp
cd ~/code/whatsapp-mcp/whatsapp-bridge
go build -o whatsapp-bridge .
```

`go build` produces a binary so launchd doesn't need the Go toolchain at runtime.

## First-time pairing

Run the bridge once in a terminal so you can see the QR:

```bash
cd ~/code/whatsapp-mcp/whatsapp-bridge
./whatsapp-bridge
```

Open WhatsApp on your phone → Settings → Linked Devices → Link a Device → scan the QR. The bridge starts syncing chats into `whatsapp-bridge/store/`. Stop with `Ctrl-C` once you've confirmed it's pulling messages.

After this initial pairing, launchd takes over (see below). Re-pairing every ~20 days requires running the bridge in a foreground terminal again to display the QR.

## Run as launchd service

Copy the plist into place and load it:

```bash
cp servers/whatsapp/com.user.whatsapp-bridge.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.user.whatsapp-bridge.plist
```

Edit the plist first — the `WorkingDirectory` and `ProgramArguments` paths must match where you cloned the upstream repo.

Logs land in `~/Library/Logs/whatsapp-bridge.{out,err}.log`.

To unload:
```bash
launchctl unload ~/Library/LaunchAgents/com.user.whatsapp-bridge.plist
```

## Claude Desktop / Claude Code config

Add to `~/.claude/settings.json` (Claude Code) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (Claude Desktop):

```json
{
  "mcpServers": {
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

> Use the **absolute path** to `uv` (`which uv`). Same caveat as the other servers — Claude's launcher does not load your shell's PATH.

## Tools exposed

12 tools from upstream — `search_contacts`, `list_messages`, `list_chats`, `send_message`, `send_file`, `send_audio_message`, `download_media`, `get_message_context`, plus a few more. See the upstream README for the full list and arg schemas.

## Operational notes

- **Bridge must stay running** for messages to arrive in real time. If the Mac sleeps, the bridge reconnects on wake and whatsmeow backfills.
- **~20-day re-pair**: when the bridge logs "qr code expired" / disconnects, run it foreground once to scan a fresh QR.
- **Backup**: `~/code/whatsapp-mcp/whatsapp-bridge/store/` contains the session and message history. Lose it = re-pair + history gone.
- **No Fly.io**: this server is not deployed remotely. iOS Claude cannot reach it.
- **Not in this repo's source tree**: upstream is its own codebase. Pin a commit if you want reproducibility (`cd ~/code/whatsapp-mcp && git rev-parse HEAD`).
