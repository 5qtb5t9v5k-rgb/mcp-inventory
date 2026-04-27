# Automation

Ajastetut Claude-työnkulut, jotka käyttävät tämän repon MCP-servereitä.

## Yleiskuva

| ID | Nimi | Aikataulu | Sijainti | Lähteet | Output |
|----|------|-----------|----------|---------|--------|
| A | Aamubrief | Ark. 6:30 | Kairos cron (claude.ai) | Oura, Strava, Todoist | Chat-viesti |
| C | Sunnuntai-katsaus | Sun. 19:00 | Kairos cron (claude.ai) | Oura, Strava, Finance, Todoist | Chat-viesti |
| W | WhatsApp-triage | Ark. 18:00 | launchd (Mac mini) | WhatsApp, Todoist | Tehtävät Todoistiin |

## A & C — Kairos cron (claude.ai)

Sekä `morning-brief.md` että `sunday-review.md` ovat valmiita prompteja, jotka kopioidaan claude.ai:n Schedule-toiminnon dialogiin:

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
