# 0002 – Handelsregister-Abfrage als monatliche GitHub Action

- Status: Angenommen
- Datum: 2026-10-30

## Kontext

Neue Firmen sollen jeden Monat automatisch auftauchen. Die Bundesquellen erlauben keine Abfragen direkt aus dem Browser (CORS) und sollen nicht von jedem Gerät einzeln belastet werden.

## Entscheidung

`scripts/handelsregister.mjs` läuft als GitHub Action (`.github/workflows/handelsregister.yml`) am 1. jedes Monats und auf Knopfdruck:

1. **SHAB / Amtsblattportal** (`amtsblattportal.ch/api/v1`): alle Neueintragungen (Rubrik HR01) seit der letzten Abfrage. Aus jeder Publikation werden UID und Zweck gelesen.
2. **Suchprofil** (`config/suchprofil.json`): Stichworte je Branche im Firmennamen und Zweck ergeben eine Passung von 0 bis 100. Nur Firmen über `minPassung` werden weiterverfolgt.
3. **Zefix** (`zefix.admin.ch/ZefixREST`): saubere Geschäftsadresse, Rechtsform, Link zum kantonalen Auszug.
4. **geo.admin.ch**: Adresse → Koordinaten (swisstopo).
5. Löschungen (HR03) markieren bestehende Firmen als gelöscht.

Für den ersten Bestand gibt es den Modus `bestand`, der bestehende Firmen über die Zefix-Namensuche findet. Das Ergebnis wird committet; Validate und Deploy veröffentlichen es.

## Konsequenzen

- Alle Quellen sind öffentlich und ohne Zugangsdaten nutzbar. Telefonnummern liefert das Handelsregister nicht; optional ergänzt die Abfrage sie über die tel.search.ch-API (Secret `TEL_SEARCH_KEY`).
- Das Amtsblattportal ignoriert unbekannte Parameter still und liefert dann den ganzen Bestand. Die Abfrage baut Parameter darum nur aus einer festen Liste und bricht bei unplausiblen Trefferzahlen ab.
- Die Zefix-Namensuche findet nur Firmen, deren Name ein Stichwort enthält. Monatliche Neueintragungen werden dagegen vollständig über den Zweck geprüft.
