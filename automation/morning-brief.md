# A — Aamubrief

**Ajastus:** Kairos cron, ark. 6:30
**Connectorit:** MyHealthMCP, MyTodoist
**Sijainti:** claude.ai (cloud)

## Prompti (kopioi Kairos cron -dialogiin sellaisenaan)

```
Tehtävä: Tuota napakka aamubrief tälle päivälle. Käytä työkaluja
suoraan, älä kysy minulta lupaa.

1. Oura: hae viime yön oura_daily_sleep + oura_daily_readiness
   (start_date = eilen, end_date = tänään).
2. Strava: strava_get_activities (per_page=3) → yhteenveto eilisestä
   liikkeestä (jos oli).
3. Todoist: todoist_get_tasks (filter="today | overdue") → poimi
   max 3 tärkeintä prioriteetin ja päivämäärän mukaan.

Tuota täsmälleen tämä rakenne, suomeksi:

🌙 Uni: <pisteet>/100 — <yksi lause tulkintaa>
⚡ Readiness: <pisteet>/100 — <yksi lause>
🏃 Eilen: <Strava-aktiviteetti yhdellä rivillä tai "ei treeniä">
✅ Tärkeintä tänään:
  1. <task>
  2. <task>
  3. <task>
💡 Suositus: <yksi lause: kevyt päivä / normaali / mahdollisuus
   tehdä tehotreeni — perustele readiness + edellinen kuorma>

Maksimi 12 riviä. Älä toista raakadataa, vain synteesi.
Jos jokin lähde ei vastaa, jätä rivi pois ja jatka muiden kanssa.
```

## Testaus käsin

Liitä yllä oleva prompti tavalliseen claude.ai-keskusteluun (ei ajastettuna), jossa MyHealthMCP + MyTodoist ovat käytössä. Pitäisi tuottaa briefin yhden tool-call-roundtripin jälkeen.

## Tunnetut rajoitteet

- Jos Oura-data ei ole vielä synkkautunut ennen klo 6:30 (riippuu siitä koska riisut sormuksen aamulla / koska puhelin synkkaa), readiness voi heijastaa eilistä iltaa eikä tämän yön päättymistä. Siirrä aikaa myöhemmäksi jos näin.
- `filter="today | overdue"` käyttää Todoistin oman query-syntaksin — toimii kuten Todoist-sovelluksessa.
