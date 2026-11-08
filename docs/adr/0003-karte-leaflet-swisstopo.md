# 0003 – Karte mit MapLibre GL und swisstopo-Vektorkarten, Google Maps nur für die Navigation

- Status: Angenommen (überarbeitet 2026-11-07: Leaflet + Rasterkacheln → MapLibre GL + Vektorkacheln)
- Datum: 2026-10-30

## Kontext

Die Karte zeigt potenziell tausende Firmen und wird täglich unterwegs auf dem Handy benutzt. Die Navigation soll in Google Maps laufen.

## Entscheidung

- **Darstellung:** [MapLibre GL JS](https://maplibre.org/) (WebGL) mit den Vektor-Basiskarten von swisstopo (`ch.swisstopo.lightbasemap.vt`, `basemap.vt`, `imagerybasemap.vt` von `vectortiles.geo.admin.ch`).
  - Vektorkacheln sind kleiner als Rasterbilder, bleiben bei jeder Pixeldichte scharf und erlauben stufenloses Zoomen.
  - Die Firmen liegen als eine GeoJSON-Quelle auf der GPU (Kreis-Ebene). Filtern tauscht nur die Daten aus.
  - Auf Handys werden Punkte bis Zoom 9 zu Gruppen zusammengefasst (Clustering im Web Worker).
  - Die Zeichenauflösung richtet sich nach dem erkannten Gerät (`src/ui/geraet.ts`), z. B. höchstens 2,25× auf 3×-Displays, 1,5× auf schwachen Geräten.
  - Dunkles Thema: Die Farben der grauen Basiskarte werden beim Laden des Stils umgerechnet (kein CSS-Filter, der auch die Firmenpunkte verfälschen würde).
- **Navigation:** Übergabe an Google Maps über [Maps URLs](https://developers.google.com/maps/documentation/urls/get-started). Google erlaubt 9 Zwischenstopps pro Link, längere Touren werden in Etappen aufgeteilt.

## Konsequenzen

- Kein API-Schlüssel, keine Kosten, kein Kontingent.
- MapLibre ist grösser als Leaflet (~280 kB statt 43 kB gzip). Der Chunk wird parallel zu den Firmendaten geladen und vom Service Worker dauerhaft gecacht; danach ist die Karte deutlich schneller und flüssiger.
- Braucht WebGL (in allen aktuellen Browsern vorhanden).
- **Verworfen:** Google Maps JavaScript API (Schlüssel und Abrechnung nötig); Leaflet mit Rasterkacheln (unscharf auf hochauflösenden Displays, langsameres Nachladen, Punkte auf Canvas ohne Clustering).
