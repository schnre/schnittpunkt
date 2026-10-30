# 0004 – Routenplanung mit Schätzung im Browser

- Status: Angenommen
- Datum: 2026-10-30

## Kontext

Beim Planen sollen Vorschläge sofort erscheinen: Welche Firmen liegen auf dem Weg zum Fixtermin? Dafür sind pro Klick hunderte Varianten zu bewerten.

## Entscheidung

`src/planung/route.ts` schätzt Fahrzeiten aus Luftlinie × 1.3 und einem distanzabhängigen Tempo (Ortsverkehr bis Autobahn) plus 4 Minuten für Parkieren. Darauf aufbauend:

- **Zeitplan:** Fixtermine haben feste Uhrzeiten (Warten bei Frühankunft, Verspätung wird bestraft), freie Besuche werden eingereiht.
- **Optimieren:** günstigste Einfügung, danach Verschieben einzelner Besuche, solange es kürzer wird.
- **Vorschläge:** pro Kandidat der Umweg an der besten Stelle; Firmen, die einen Fixtermin gefährden, fallen weg. Status, Passung und „neu im Handelsregister“ zählen als Bonus gegen den Umweg.

Die exakte Strassenroute rechnet danach Google Maps.

## Konsequenzen

- Sofortige Antworten, offline nutzbar, keine Kosten. Die Schätzung liegt auf typischen Strecken im Bereich ±15 % der echten Fahrzeit; die Reihenfolge stimmt in der Praxis fast immer.
- **Verworfen:** ein Routing-Dienst für jede Variante. Zu langsam und kostenpflichtig bzw. mit Nutzungsgrenzen.
