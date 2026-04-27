---
description: WhatsApp-triage — luokittelee viim. 24 h chatit ja luo Todoist-tehtäviä vastausta vaativille (ei lähetä viestejä)
---

Tehtävä: WhatsApp-vastaustriagee. ÄLÄ LÄHETÄ MITÄÄN VIESTEJÄ.
Kaikki tulokset kirjoitetaan Todoistiin tehtävinä.

Käytä työkaluja suoraan ilman lupaa.

VAIHE 1 — Kerää chatit
- list_chats: limit=30, sortby=last_active_time, include_last_message=true
  (jos parametri ei ole tuettu, käytä mitä on saatavilla).
- Suodata: vain chatit joihin on tullut viestejä viim. 24 h sisällä.
- Hylkää isot ryhmäkeskustelut (>5 osallistujaa) ellei sinua ole
  erikseen mainittu (`@`).

VAIHE 2 — Lue viestit
- Per chat: list_messages limit=10, järjestyksessä uusin ensin.
- Tunnista keskustelukumppanin nimi (kontakti, ei chat_jid).

VAIHE 3 — Luokittele
Jokainen chat kuuluu täsmälleen yhteen luokkaan:
  A) VAATII VASTAUKSEN: viimeisin viesti tuli toiselta osapuolelta
     ja sisältää kysymyksen, pyynnön, ehdotuksen tai sosiaalisen
     velan (>24 h vanha kysymys johon ei ole vastattu).
  B) FYI: info, tervehdys, meme, ei vaadi vastausta.
  C) SPAM/RYHMÄ: skipataan.

VAIHE 4 — Tarkista olemassa olevat Todoist-tehtävät
- todoist_get_tasks filter="@whatsapp" (haetaan kaikki labelilla
  `whatsapp` merkityt avoimet tehtävät).
- Jos kontaktilla on jo avoin "Vastaa: <nimi>" -tehtävä, ÄLÄ
  luo uutta. Päivitä sen sijaan tehtävän kuvausta uusilla
  viesteillä jos tarpeen (todoist_update_task).

VAIHE 5 — Luo/päivitä Todoist-tehtävät (vain luokka A)
Jokaisesta uudesta A-tapauksesta:
- todoist_create_task:
  - content: "Vastaa: <kontakti> — <max 8 sanaa aiheesta>"
  - description (3 osaa, eroteltuna kahdella rivinvaihdolla):
      Viim. viesti: "<lainaus, max 200 merkkiä>"
      ----
      Ehdotettu vastaus:
      <luonnos 1-2 lausetta. Ole suomenkielinen, ystävällinen,
      luonnollinen. Älä yritä matkia minun tyyliäni jos et
      tiedä sitä — pidä neutraalina pohjana.>
      ----
      Avaa chat: <chat_jid tai linkki, jos saatavilla>
  - labels: ["whatsapp"]
  - priority: 3 (= keskikorkea)
  - due_string: "today"

VAIHE 6 — Tulosta yhteenveto
Tulosta täsmälleen tämä rakenne (ei muuta):

WhatsApp-triage <YYYY-MM-DD HH:MM>
- Tarkasteltu: <N> chattia
- Vaatii vastauksen: <N> (luotu Todoistiin: <M>, päivitetty: <K>)
- FYI: <N>
- Skipattu (ryhmä/spam): <N>

Jos jokin chat oli rajatapaus, lisää max 3 riviä:
  ? <kontakti>: <syy miksi epäselvä>

EHDOTTOMAT SÄÄNNÖT
- Älä koskaan kutsu send_message, send_file tai send_audio_message.
- Älä lisää chat-historiaa Todoist-tehtävän kuvaukseen muuten kuin
  yhden lainauksen verran (privacy).
- Jos kontaktin nimi puuttuu (vain numero), käytä numeroa.
