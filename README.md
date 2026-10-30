# Schnittpunkt

*Wo Route und neue Kunden sich treffen.*

Web-App für den Aussendienst der [SC-Technologie AG](https://www.sc-t.ch) (Frauenfeld). Sie findet im Handelsregister Firmen, die zum Sortiment passen (Steintrennmaschinen, Diamantwerkzeuge, Bohrsysteme, Baukreissägen, Staubsauger, Bodenbearbeitung …), zeigt sie auf einer Schweizer Karte und plant die Besuchswoche mit Routenvorschlag und Übergabe an Google Maps.

Aufbau, Werkzeuge und Pipeline wie die Vorlage [schnre/software_engineering](https://github.com/schnre/software_engineering): Vite + TypeScript ohne Framework, GitHub Pages, GitHub Actions, ADRs, Tests.

## Was die App kann

**Karte**
- Interaktive Karte der Schweiz (swisstopo: grau, farbig, Luftbild) mit Zoom, Ortssuche und allen potenziellen Kunden
- Farbe nach Branche oder Status, neue Firmen mit dunklem Ring
- Antippen zeigt Adresse, Rechtsform, UID, Zweck, Passung und Kontakt; direkt anrufen, Navigation starten, in Google Maps öffnen, Handelsregisterauszug, Telefonnummer auf search.ch suchen
- Filter nach Branche, Status und „Neu“, Volltextsuche (Name, Ort, PLZ, Zweck)
- Eigene Angaben je Firma: Status (Offen, Interessant, Kontaktiert, Kunde, Kein Interesse), Ansprechperson, Telefon, E-Mail, Website, Notizen, Besuche

**Wochenplanung**
- Pro Person (zwei Aussendienst-Mitarbeitende, beliebig erweiterbar) eine Woche Mo–Fr mit Auslastung pro Tag
- Fixtermine mit Uhrzeit und frei planbare Besuche; die App rechnet Ankunftszeiten, Wartezeit, Kilometer, Fahrzeit und Rückkehr
- **Vorschläge auf dem Weg:** Hat jemand z. B. um 10:00 einen Fixtermin in St. Gallen, schlägt die App Firmen in Wil und Weinfelden vor, mit Umweg in Minuten und Grund („Neu im Handelsregister“, „Kunde, 5 Monate nicht besucht“ …). Kein Vorschlag gefährdet einen Fixtermin
- **Route optimieren** und **Tag füllen** (füllt freie Zeit automatisch mit den besten Vorschlägen)
- **In Google Maps öffnen:** übergibt Start, alle Stopps in geplanter Reihenfolge und Rückkehr; lange Touren in Etappen zu 9 Zwischenstopps

**Handelsregister**
- Läuft automatisch am 1. jedes Monats und auf Knopfdruck
- Prüft alle Neueintragungen im SHAB seit der letzten Abfrage, bewertet Name und Zweck mit dem Suchprofil, holt Adresse aus Zefix und Koordinaten von geo.admin.ch
- Neue Firmen erscheinen mit Badge in der Navigation, als Filter „Neu“ und in der Übersicht
- Gelöschte Firmen (SHAB-Löschungen) verschwinden automatisch

**Sonstiges**
- Tabelle aller Firmen mit Sortierung und CSV-Export für Excel
- Schnell: ca. 80 kB JavaScript beim Start (gzip), Karte zeichnet tausende Punkte auf Canvas
- Offline-fähig und installierbar (PWA), heller und dunkler Modus, Handy und Desktop

## Erste Inbetriebnahme

1. **Repository anlegen** und diesen Ordner pushen (Branch `main`).
2. **GitHub Pages einschalten:** Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. **Bestand aufbauen:** Actions → *Handelsregister* → *Run workflow* → Modus `bestand`. Das dauert je nach Umfang 30–90 Minuten und ersetzt die Demodaten durch echte Firmen.
4. **Neueintragungen:** Danach einmal Modus `monat` starten. Ab jetzt läuft das jeden Monat von selbst.
5. In der App unter **Einstellungen** Namen und Startadressen der beiden Mitarbeitenden eintragen.
6. Optional: Damit der Knopf „Jetzt neue Firmen abfragen“ in der App funktioniert, unter Einstellungen das Repository und einen [Fine-grained Token](https://github.com/settings/personal-access-tokens/new) eintragen (nur dieses Repository, Berechtigung *Actions: Read and write*).
7. Optional: Telefonnummern automatisch ergänzen mit einem API-Schlüssel von [tel.search.ch](https://tel.search.ch/api/help) als Repository-Secret `TEL_SEARCH_KEY`.

> Bis zur ersten Abfrage zeigt die App **erfundene Demodaten** (gekennzeichnet), damit man alles ausprobieren kann.

## Suchprofil anpassen

`config/suchprofil.json` legt fest, welche Firmen als potenzielle Kunden gelten:

| Feld | Bedeutung |
|---|---|
| `branchen[].stichworte` | Wortanfänge in Name oder Zweck, z. B. `"plattenleg"` trifft „Plattenleger“, „Plattenlegerarbeiten“. Mit Leerzeichen am Ende (`"platten "`) nur das ganze Wort |
| `branchen[].gewicht` | Wie gut die Branche zum Sortiment passt (0–100) |
| `minPassung` | Untergrenze, ab der eine Firma übernommen wird |
| `ausschluss` | Wörter, die die Passung um 40 senken (z. B. „Immobilien“, „Holding“) |
| `kantone` | Leer = ganze Schweiz, sonst z. B. `["TG", "SG", "ZH"]` |
| `zefixNamensuche` | Suchbegriffe für den einmaligen Bestandsaufbau |

Nach einer Änderung `npm test` laufen lassen; die Tests prüfen typische Fälle (z. B. dass „Steiner“ nicht als Steinmetz zählt).

## Lokal starten

Voraussetzung: Node.js 20 oder neuer.

```bash
npm install
npm run dev                # Entwicklungsserver
npm test                   # Planung, Routen, Handelsregister-Auswertung
npm run build              # Daten prüfen, Typen prüfen, nach dist/ bauen
npm run register:monat     # Handelsregister-Abfrage lokal (schreibt public/data/firmen.json)
npm run register:bestand   # Bestand aufbauen
npm run demo-daten         # Demodaten neu erzeugen
```

## Projektstruktur

```
├─ index.html
├─ config/suchprofil.json      Branchen, Stichworte, Gewichte
├─ public/
│  ├─ data/firmen.json         Firmendaten (wird von der Abfrage geschrieben)
│  ├─ sw.js                    Offline-Cache inkl. Kartenkacheln
│  └─ manifest.webmanifest
├─ scripts/
│  ├─ handelsregister.mjs      monatliche Abfrage (SHAB, Zefix, geo.admin.ch)
│  ├─ lib/passung.mjs          Bewertung Name/Zweck gegen Suchprofil
│  ├─ lib/quellen.mjs          Zugriff und Auswertung der Quellen
│  ├─ validate-daten.mjs       Prüfung vor jedem Deployment
│  └─ demo-daten.mjs
├─ src/
│  ├─ daten/      Firmen laden, Zustand (localStorage), Datum
│  ├─ geo/        Distanz/Fahrzeit, Ortssuche
│  ├─ planung/    Zeitplan, Optimierung, Vorschläge, Google-Maps-Links
│  └─ ui/         Karte, Woche, Firmen, Register, Einstellungen
├─ tests/
├─ docs/adr/      Architecture Decision Records
└─ .github/workflows/  validate.yml, deploy.yml, handelsregister.yml
```

## Daten und Datenschutz

- Firmendaten stammen aus öffentlichen Registern (SHAB, Zefix). Es werden nur Firmenangaben übernommen, keine eingetragenen Personen.
- Status, Notizen, Kontakte und Pläne bleiben im Browser des jeweiligen Geräts. Unter Einstellungen lassen sie sich exportieren und auf einem anderen Gerät importieren.
- Die GitHub-Pages-Seite ist öffentlich erreichbar (enthält aber nur Registerdaten). Wer das nicht will, nutzt ein privates Repository mit GitHub Enterprise oder hostet `dist/` intern.

## Grenzen

- Fahrzeiten sind Schätzungen (±15 %); die genaue Route rechnet Google Maps.
- Das Handelsregister enthält keine Telefonnummern (siehe `TEL_SEARCH_KEY`).
- Pläne werden nicht automatisch zwischen den beiden Mitarbeitenden synchronisiert (siehe [ADR 0001](docs/adr/0001-statische-app-ohne-backend.md)).

## Architektur-Entscheidungen

Siehe [docs/adr/](docs/adr/README.md).
