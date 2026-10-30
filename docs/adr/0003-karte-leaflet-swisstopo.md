# 0003 – Karte mit Leaflet und swisstopo, Google Maps nur für die Navigation

- Status: Angenommen
- Datum: 2026-10-30

## Kontext

Die Karte zeigt potenziell tausende Firmen und wird täglich unterwegs benutzt. Die Navigation soll in Google Maps laufen.

## Entscheidung

- **Darstellung:** Leaflet (43 kB gzip) mit den Landeskarten von swisstopo (grau, farbig, Luftbild). Firmen werden als Kreise auf einer Canvas-Ebene gezeichnet; das bleibt auch bei vielen tausend Punkten flüssig.
- **Navigation:** Übergabe an Google Maps über [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started). Die geplante Reihenfolge wird als Start, Zwischenstopps und Ziel übergeben. Google erlaubt 9 Zwischenstopps pro Link, längere Touren werden in Etappen aufgeteilt.

## Konsequenzen

- Kein API-Schlüssel, keine Kosten, kein Kontingent. Die swisstopo-Karte ist für die Schweiz detaillierter als Google.
- **Verworfen:** Google Maps JavaScript API für die Karte. Braucht Schlüssel und Abrechnung, ist schwerer und für die Aufgabe nicht nötig.
