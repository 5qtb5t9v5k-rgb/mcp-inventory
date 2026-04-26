#!/bin/bash
# Upload your latest Curve CSV export to the Fly-hosted finance MCP server.
#
# Usage:  ./upload.sh                         # uses default ~/Desktop/Transactions.csv
#         ./upload.sh ~/Downloads/foo.csv     # custom path
#
# Reads the API key from /tmp/finance_mcp_key.txt or env FINANCE_MCP_KEY.
# Override the URL with FINANCE_MCP_URL.

set -euo pipefail

CSV="${1:-$HOME/Desktop/Transactions.csv}"
URL="${FINANCE_MCP_URL:-https://finance-mcp-jr.fly.dev}"
KEY="${FINANCE_MCP_KEY:-}"

if [ -z "$KEY" ] && [ -f /tmp/finance_mcp_key.txt ]; then
  KEY=$(cat /tmp/finance_mcp_key.txt)
fi

if [ -z "$KEY" ]; then
  echo "Error: set FINANCE_MCP_KEY env var or put the key in /tmp/finance_mcp_key.txt" >&2
  exit 1
fi

if [ ! -f "$CSV" ]; then
  echo "Error: CSV file not found: $CSV" >&2
  exit 1
fi

SIZE=$(wc -c < "$CSV" | tr -d ' ')
echo "Uploading $CSV ($SIZE bytes) to $URL ..."

HTTP=$(curl -sS -o /tmp/finance_upload_resp.json -w '%{http_code}' \
  -X PUT "$URL/$KEY/upload" \
  -H "Content-Type: text/csv" \
  --data-binary "@$CSV")

echo "HTTP $HTTP"
cat /tmp/finance_upload_resp.json
echo
[ "$HTTP" = "200" ]
