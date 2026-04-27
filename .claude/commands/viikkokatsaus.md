---
description: Viikkokatsaus — Strava, Oura, finance ja Todoist 7 päivän jaksolta
---

Tehtävä: Viikkokatsaus kuluvalle viikolle (ma–su). Hae data,
tuota synteesi suomeksi. Käytä työkaluja itse, älä kysy lupaa.

Aikajakso: viimeiset 7 päivää (tänään mukaan lukien).
Vertailujakso: 7 päivää sitä ennen.

1. Treeni: strava_get_activities (per_page=20, after = 7 vrk sitten).
2. Palautuminen: oura_daily_sleep + oura_daily_readiness samalle
   7 päivän jaksolle ja vertailujaksolle. Laske keskiarvot.
3. Talous: finance_summary (kuluva viikko), finance_top_merchants
   (kuluva viikko, top 5), finance_spend_trend (kuluva vs.
   edellinen viikko, kategorioittain).
4. Tehtävät: todoist_get_tasks → laske completed tällä viikolla
   vs. created, ja viivästyneet (overdue).

Rakenne:

📊 Viikko <vk-nro>

🏃 Treeni
  • <määrä> aktiviteettia, <kokonaisaika>, <kokonaismatka km>
  • Erottuu: <1 huomio, esim. paras vauhti / pisin treeni>
  • vs. edellinen vk: <↑/↓ kuorma yhdellä lauseella>

🌙 Palautuminen
  • Uni ka. <pisteet> (<↑/↓> ed. vk vs. <luku>)
  • Readiness ka. <pisteet>
  • <1 lause trendistä>

💶 Talous
  • Yhteensä: <€> (<↑/↓> ed. vk %)
  • Top-3 kategoriaa: <…>
  • Poikkeama: <jos jokin kategoria >20% ed. vk:sta, mainitse;
    muutoin "ei merkittäviä poikkeamia">

✅ Tehtävät
  • Valmiit / luodut: <x/y>
  • Viivästyneet: <määrä>
  • Mihin kannattaisi keskittyä ensi viikolla: <1 lause>

🎯 3 prioriteettia ensi viikolle:
  1. <…>
  2. <…>
  3. <…>

Älä käytä yli 25 riviä. Synteesi, ei taulukoita. Jos jokin lähde
ei vastaa, jätä sen osio pois ja jatka muiden kanssa.
