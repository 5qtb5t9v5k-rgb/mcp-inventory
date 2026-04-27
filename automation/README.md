# Automation

Claude-työnkulut, jotka käyttävät tämän repon MCP-servereitä. Jokainen on saatavilla **kahta kautta**: ajastettuna (Kairos cron tai launchd) ja manuaalisena slash-komentona Claude Codessa.

## Yleiskuva

| ID | Slash-komento | Ajastus | Sijainti | Lähteet | Output |
|----|---------------|---------|----------|---------|--------|
| A | `/aamubrief` | Ark. 6:30 | Kairos cron (claude.ai) | Oura, Strava, Todoist | Chat-viesti |
| C | `/viikkokatsaus` | Sun. 19:00 | Kairos cron (claude.ai) | Oura, Strava, Finance, Todoist | Chat-viesti |
| W | `/whatsapp-triage` | Ark. 18:00 | launchd (Mac mini) | WhatsApp, Todoist | Tehtävät Todoistiin |

## Manuaalinen kutsu — Claude Code -slash-komennot

Slash-komentojen lähdekoodi on [`.claude/commands/`](../.claude/commands/) — ne ovat käytössä automaattisesti, kun käynnistät Claude Coden tämän repon hakemistosta:

```bash
cd ~/code/mcp-inventory
claude
# kirjoita prompt-kenttään:
/aamubrief
/viikkokatsaus
/whatsapp-triage
```

Slash-komento on käytännössä sama prompti kuin ajastettu versio — Claude kutsuu työkalut ja vastaa keskusteluun. Tulet näkemään kaikki tool-callit jotka tehdään.

### Käyttö globaalisti (mistä tahansa kansiosta)

Jos haluat slash-komennot käyttöön mistä tahansa Claude Code -istunnosta, symlinkaa ne user-tasolle:

```bash
mkdir -p ~/.claude/commands
ln -s ~/code/mcp-inventory/.claude/commands/aamubrief.md ~/.claude/commands/
ln -s ~/code/mcp-inventory/.claude/commands/viikkokatsaus.md ~/.claude/commands/
ln -s ~/code/mcp-inventory/.claude/commands/whatsapp-triage.md ~/.claude/commands/
```

Jälkimmäisen jälkeen Claude Code löytää komennot mistä tahansa working directorystä — kunhan tarvittavat MCP-serverit ovat käytössä siinä projektissa (tai user-tasolla).

> **Claude.ai-web/iOS:** ei tue slash-komentoja. Siellä on kaksi reittiä: (1) liitä prompt-tiedoston sisältö viestikenttään, tai (2) käytä Schedule-toimintoa kerran (joka ajetaan saman tien).

## A & C — Ajastettu Kairos cron (claude.ai)

Promptien sisältö löytyy slash-komento-tiedostoista [`.claude/commands/aamubrief.md`](../.claude/commands/aamubrief.md) ja [`.claude/commands/viikkokatsaus.md`](../.claude/commands/viikkokatsaus.md). Kopioi promptin runko (frontmatter-blockin alapuolinen osa) claude.ai:n Schedule-toiminnon dialogiin:

1. Avaa claude.ai
2. Aloita uusi keskustelu
3. Ota käyttöön connectorit: **MyHealthMCP**, **MyTodoist**, **MyFinance** (sunnuntai-katsaus tarvitsee kaikki kolme; aamubrief tarvitsee Health + Todoist)
4. Avaa Schedule (kello-ikoni) → liitä prompti → aseta toistoaika
5. Tallenna

> Kun ajastettu task laukeaa, Claude saa promptin järjestelmäviestinä, kutsuu työkaluja ilman lisävahvistusta ja postaa tuloksen keskusteluun. Notifikaatio tulee iOS:lla / claude.ai-välilehdellä.

## W — WhatsApp-triage (paikallisesti)

Tämä ajetaan Mac minillä, koska WhatsApp-MCP on stdio-pohjainen eikä tavoita pilveä. Koko kuvaus + asennus: [`servers/whatsapp/triage/`](../servers/whatsapp/triage/).

Lyhyesti:
1. `claude` CLI asennettuna (`npm i -g @anthropic-ai/claude-code` tai vastaava)
2. WhatsApp + Todoist konfiguroitu Claude Coden MCP-asetuksiin (ks. juuren `README.md` / `servers/whatsapp/README.md`)
3. Aja `servers/whatsapp/triage/run-triage.sh` käsin testin vuoksi → tarkista että triage-tehtäviä ilmestyy Todoist-Inboxiin label `whatsapp`
4. Kun toimii, lataa launchd-plist:

```bash
cp servers/whatsapp/triage/com.user.whatsapp-triage.plist ~/Library/LaunchAgents/
launchctl load -w ~/Library/LaunchAgents/com.user.whatsapp-triage.plist
```

## Suunnitteluperiaatteet

- **Tulokset menevät paikkaan, johon näet iOS:lla.** A ja C näkyvät claude.ai-keskustelussa. W kirjoittaa Todoistiin → näkyy Todoist-iOS:llä.
- **Synteesi, ei raakadata.** Promptit pyytävät tulkintaa ja yhteenvetoja, eivät listauksia. Maksimirivimäärä rajoitettu jokaisessa.
- **Idempotenssi paikallisille taskeille.** WhatsApp-triage tarkistaa Todoistista, ettei sama "Vastaa: <kontakti>" -tehtävä ole jo olemassa. Useampi ajastus päivässä ei tuplaa.
- **Ei automaattisia ulospäin meneviä viestejä.** Triage **ei koskaan** lähetä WhatsApp-viestiä, vain luo Todoist-tehtävän vastausluonnoksella.
