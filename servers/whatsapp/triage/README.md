# WhatsApp-triage (paikallinen ajastus)

Päivittäinen ajastettu työnkulku joka:

1. Lukee viime 24 h WhatsApp-viestit paikallisen `whatsapp-mcp`:n kautta
2. Luokittelee chatit (vaatii vastauksen / FYI / spam)
3. Luo Todoistiin tehtävän jokaisesta vastausta vaativasta chatista
   — vastausluonnos kuvauksessa
4. **Ei koskaan lähetä WhatsApp-viestiä automaattisesti**

Triage ajetaan headless-Claude Codella (`claude -p`) launchd:n
ajastamana. Tarvitsee Mac mini -tyyppisen koneen joka on auki
ajastusaikana (sama kone, jossa whatsapp-bridge pyörii).

## Tiedostot

- `triage-prompt.md` — prompti jonka headless-Claude saa
- `run-triage.sh` — kääre joka käynnistää `claude -p`:n promptilla
- `com.user.whatsapp-triage.plist` — launchd-ajastin (ark. 18:00)

## Esivaatimukset

Saman koneen täytyy olla pystyssä, jossa:

- `whatsapp-bridge` pyörii launchd:n alla (ks. juuren `servers/whatsapp/README.md`)
- `claude` CLI on asennettu (`npm i -g @anthropic-ai/claude-code` tai vastaava)
- Claude Code -konfigissa (`~/.claude.json` projektikohtaisesti tai
  `~/.claude/settings.json` globaalisti) on määritelty:
  - `whatsapp` MCP-serveri (uv-pohjainen, ks. juuren README)
  - `todoist` MCP-serveri (joko stdio-paikallinen tai
    Bearer-pohjainen HTTP — molemmat käyvät)

## Asennus

1. Säädä polut

   `run-triage.sh` ja `com.user.whatsapp-triage.plist` käyttävät
   placeholderia `/Users/you/...`. Vaihda omiin polkuihisi:

   ```bash
   cd servers/whatsapp/triage
   sed -i '' "s|/Users/you|${HOME}|g" run-triage.sh com.user.whatsapp-triage.plist
   ```

   Tarkista myös `CLAUDE_BIN` `run-triage.sh`:ssä — `which claude`
   kertoo oikean polun.

2. Testaa käsin

   ```bash
   ./run-triage.sh
   tail -f ~/Library/Logs/whatsapp-triage.log
   ```

   Avaa Todoist iOS:lla → Inbox → label `whatsapp`. Pitäisi näkyä
   uusia "Vastaa: <kontakti>" -tehtäviä jos viime 24 h sisällä
   on tullut vastausta vaativia viestejä.

   Jos ei vielä toimi, ks. **Vianetsintä** alla.

3. Lataa launchd-ajastin

   ```bash
   cp com.user.whatsapp-triage.plist ~/Library/LaunchAgents/
   launchctl load -w ~/Library/LaunchAgents/com.user.whatsapp-triage.plist
   ```

   Tarkista että ajastin on käytössä:

   ```bash
   launchctl list | grep whatsapp-triage
   ```

4. (Valinnainen) Pakota ensimmäinen ajo heti

   ```bash
   launchctl start com.user.whatsapp-triage
   ```

## Vianetsintä

**`claude` ei löydy headless-ajossa.**
Tarkista `which claude`, korvaa absoluuttisella polulla
`run-triage.sh`-skriptissä.

**WhatsApp- tai Todoist-toolit eivät vastaa.**
Tarkista että MCP-konfiguraatio on luettavissa siitä
`PROJECT_DIR`:stä, jota `run-triage.sh` käyttää (`cd` siihen ja aja
`claude` käsin samasta hakemistosta).

**Triage näkee vanhoja viestejä eikä uusia.**
Tarkista että `whatsapp-bridge` pyörii ja synkkaa: `tail -f
~/Library/Logs/whatsapp-bridge.out.log`. Jos QR on vanhentunut
(~20 päivän välein), aja bridge foreground-tilassa kerran
uudelleen.

**Tuplautuvat Todoist-tehtävät.**
Promptin VAIHE 4 hakee aina ensin olemassa olevat `@whatsapp`
-tehtävät ja päivittää sen sijaan että loisi uusia. Jos näet silti
duplikaatteja: tarkista että label nimi on täsmälleen `whatsapp`
(pienillä, ei välilyöntiä).

**Lokit kasvavat liikaa.**
Lisää logrotate-säännöt tai tyhjennä silloin tällöin:
`> ~/Library/Logs/whatsapp-triage.log`.

## Poistaminen

```bash
launchctl unload ~/Library/LaunchAgents/com.user.whatsapp-triage.plist
rm ~/Library/LaunchAgents/com.user.whatsapp-triage.plist
```

Olemassa olevat Todoist-tehtävät säilyvät — ne saa siivottua
Todoistissa filtterillä `@whatsapp`.
