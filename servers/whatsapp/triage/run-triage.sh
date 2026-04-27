#!/bin/zsh
# WhatsApp-triage runner — käynnistää headless Claude Coden joka käy
# WhatsApp + Todoist MCP:t läpi ja luo Todoist-tehtäviä vastausta
# vaativista viesteistä. Ei lähetä WhatsApp-viestejä.
#
# Asennus: ks. README.md tässä kansiossa.
# Käyttö manuaalisesti: ./run-triage.sh
# Käyttö launchd:n kautta: com.user.whatsapp-triage.plist

set -euo pipefail

# --- Konfiguraatio (säädä tarvittaessa) ---
# claude-binarin polku. Etsi 'which claude' ja laita absoluuttinen polku.
CLAUDE_BIN="${CLAUDE_BIN:-/Users/you/.local/bin/claude}"

# Kansio, josta claude käynnistyy. Pitää olla projekti, jonka
# Claude Code -konfigissa whatsapp + todoist MCP-serverit on määritelty.
# Yleensä joko mcp-inventory-repo tai oma projekti.
PROJECT_DIR="${PROJECT_DIR:-/Users/you/code/mcp-inventory}"

# Promptin polku. Oletuksena samassa kansiossa kuin tämä skripti.
SCRIPT_DIR="${0:A:h}"
PROMPT_FILE="${PROMPT_FILE:-${SCRIPT_DIR}/triage-prompt.md}"

# Lokikansio
LOG_DIR="${LOG_DIR:-${HOME}/Library/Logs}"
LOG_FILE="${LOG_DIR}/whatsapp-triage.log"

# --- Tarkistukset ---
mkdir -p "${LOG_DIR}"

if [[ ! -x "${CLAUDE_BIN}" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: claude binary not found at ${CLAUDE_BIN}" >> "${LOG_FILE}"
    exit 1
fi

if [[ ! -f "${PROMPT_FILE}" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: prompt file not found at ${PROMPT_FILE}" >> "${LOG_FILE}"
    exit 1
fi

if [[ ! -d "${PROJECT_DIR}" ]]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') ERROR: project dir not found at ${PROJECT_DIR}" >> "${LOG_FILE}"
    exit 1
fi

# --- Aja triage ---
echo "" >> "${LOG_FILE}"
echo "==============================================" >> "${LOG_FILE}"
echo "WhatsApp-triage käynnistetty $(date '+%Y-%m-%d %H:%M:%S')" >> "${LOG_FILE}"
echo "==============================================" >> "${LOG_FILE}"

cd "${PROJECT_DIR}"

# --dangerously-skip-permissions: headless-ajossa ei voi hyväksyä
# tool-callia interaktiivisesti. Prompt on rajattu eikä lähetä mitään.
"${CLAUDE_BIN}" \
    -p "$(cat "${PROMPT_FILE}")" \
    --dangerously-skip-permissions \
    >> "${LOG_FILE}" 2>&1

EXIT_CODE=$?
echo "" >> "${LOG_FILE}"
echo "Triage päättyi $(date '+%Y-%m-%d %H:%M:%S') exit=${EXIT_CODE}" >> "${LOG_FILE}"

exit "${EXIT_CODE}"
