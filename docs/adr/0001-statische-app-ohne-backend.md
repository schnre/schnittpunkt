# 0001 – Statische App ohne Backend

- Status: Angenommen
- Datum: 2026-10-30

## Kontext

Zwei Aussendienst-Mitarbeitende brauchen eine schnelle App, die auch unterwegs mit schwachem Netz funktioniert. Betrieb und Kosten sollen minimal sein. Aufbau wie die Vorlage [schnre/software_engineering](https://github.com/schnre/software_engineering).

## Entscheidung

Vite + TypeScript ohne UI-Framework, gehostet auf GitHub Pages. Die Firmendaten liegen als statische Datei `public/data/firmen.json` neben der App. Eigene Angaben (Status, Notizen, Kontakte, Wochenpläne) bleiben im `localStorage` des Geräts. Ein Service Worker macht App, Daten und besuchte Kartenausschnitte offline verfügbar.

## Konsequenzen

- **Einfacher:** kein Server, keine Datenbank, keine Kosten. Erster Aufruf ca. 80 kB JavaScript (gzip), Ansichten werden erst bei Bedarf geladen.
- **Schwieriger:** Die beiden Mitarbeitenden sehen die Notizen und Pläne der anderen Person nicht automatisch. Übergangslösung: Export/Import als JSON.
- **Später möglich:** Für gemeinsame Daten einen kleinen Speicher anbinden (z. B. Supabase oder eine SharePoint-Liste). Die Datenzugriffe sind in `src/daten/zustand.ts` gebündelt, damit sich das ohne Umbau der Ansichten ergänzen lässt.
