#!/usr/bin/env node
// Erzeugt erfundene Demodaten, damit die App vor der ersten echten Handelsregister-Abfrage
// etwas zeigt. Firmennamen, Strassen und Kontaktdaten sind frei erfunden; die Datei ist mit
// "demo": true markiert, die App zeigt ein Banner, und die erste echte Abfrage ersetzt sie.

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { passungBerechnen } from './lib/passung.mjs';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFIL = JSON.parse(await readFile(join(WURZEL, 'config/suchprofil.json'), 'utf8'));

// Ortschaften mit ungefähren Zentrumskoordinaten [PLZ, Ort, Kanton, lat, lon, Gewicht]
const ORTE = [
  ['8500', 'Frauenfeld', 'TG', 47.5536, 8.8987, 6], ['8570', 'Weinfelden', 'TG', 47.5667, 9.1067, 4],
  ['8280', 'Kreuzlingen', 'TG', 47.6458, 9.1781, 4], ['9320', 'Arbon', 'TG', 47.5167, 9.4333, 3],
  ['8580', 'Amriswil', 'TG', 47.5469, 9.2972, 3], ['9500', 'Wil SG', 'SG', 47.4614, 9.0453, 4],
  ['9000', 'St. Gallen', 'SG', 47.4245, 9.3767, 6], ['9430', 'St. Margrethen', 'SG', 47.4527, 9.6375, 2],
  ['8640', 'Rapperswil', 'SG', 47.2266, 8.8184, 3], ['9100', 'Herisau', 'AR', 47.3861, 9.2792, 2],
  ['8400', 'Winterthur', 'ZH', 47.4988, 8.7237, 7], ['8004', 'Zürich', 'ZH', 47.3769, 8.5417, 8],
  ['8302', 'Kloten', 'ZH', 47.4515, 8.5849, 3], ['8600', 'Dübendorf', 'ZH', 47.3972, 8.6186, 3],
  ['8610', 'Uster', 'ZH', 47.3471, 8.7209, 4], ['8620', 'Wetzikon', 'ZH', 47.3264, 8.7978, 3],
  ['8180', 'Bülach', 'ZH', 47.5221, 8.5404, 3], ['8953', 'Dietikon', 'ZH', 47.4017, 8.4001, 3],
  ['8805', 'Richterswil', 'ZH', 47.2061, 8.7064, 2], ['8200', 'Schaffhausen', 'SH', 47.6973, 8.6349, 4],
  ['8212', 'Neuhausen', 'SH', 47.6833, 8.6167, 2], ['5400', 'Baden', 'AG', 47.4734, 8.3064, 4],
  ['5000', 'Aarau', 'AG', 47.3925, 8.0444, 4], ['5600', 'Lenzburg', 'AG', 47.3886, 8.1803, 2],
  ['5200', 'Brugg', 'AG', 47.4809, 8.2083, 2], ['4600', 'Olten', 'SO', 47.3500, 7.9033, 3],
  ['4500', 'Solothurn', 'SO', 47.2088, 7.5323, 3], ['4051', 'Basel', 'BS', 47.5596, 7.5886, 5],
  ['4410', 'Liestal', 'BL', 47.4840, 7.7348, 2], ['6003', 'Luzern', 'LU', 47.0502, 8.3093, 5],
  ['6210', 'Sursee', 'LU', 47.1711, 8.1112, 2], ['6300', 'Zug', 'ZG', 47.1662, 8.5155, 4],
  ['6340', 'Baar', 'ZG', 47.1963, 8.5295, 2], ['6430', 'Schwyz', 'SZ', 47.0207, 8.6530, 2],
  ['8853', 'Lachen', 'SZ', 47.1922, 8.8540, 2], ['8750', 'Glarus', 'GL', 47.0404, 9.0679, 1],
  ['7000', 'Chur', 'GR', 46.8508, 9.5320, 3], ['7302', 'Landquart', 'GR', 46.9672, 9.5547, 1],
  ['3011', 'Bern', 'BE', 46.9480, 7.4474, 5], ['3600', 'Thun', 'BE', 46.7580, 7.6280, 3],
  ['2502', 'Biel', 'BE', 47.1368, 7.2468, 3], ['3400', 'Burgdorf', 'BE', 47.0592, 7.6271, 2],
  ['1700', 'Fribourg', 'FR', 46.8065, 7.1620, 2], ['1003', 'Lausanne', 'VD', 46.5197, 6.6323, 3],
  ['1201', 'Genève', 'GE', 46.2044, 6.1432, 2], ['1950', 'Sion', 'VS', 46.2331, 7.3606, 2],
  ['6900', 'Lugano', 'TI', 46.0037, 8.9511, 2], ['6500', 'Bellinzona', 'TI', 46.1946, 9.0244, 1],
];

const VORLAGEN = [
  ['Plattenbeläge', 'GmbH', 'Ausführung von Plattenleger- und Keramikarbeiten im Innen- und Aussenbereich sowie Handel mit Plattenmaterial.'],
  ['Platten & Keramik', 'AG', 'Verlegen von Platten, Mosaik und Naturstein; Beratung und Verkauf von Keramikprodukten.'],
  ['Naturstein', 'AG', 'Bearbeitung und Verlegung von Naturstein, Herstellung von Treppen, Abdeckungen und Küchenabdeckungen aus Granit und Marmor.'],
  ['Steinmetz-Atelier', 'GmbH', 'Steinmetz- und Bildhauerarbeiten, Grabmale, Restaurierung von Natursteinbauten.'],
  ['Gartenbau', 'AG', 'Gartenbau, Gartengestaltung und Gartenunterhalt, Pflästerungen und Natursteinmauern.'],
  ['Garten & Landschaft', 'GmbH', 'Landschaftsbau, Umgebungsarbeiten, Pflästerungen und Bepflanzungen für Private und Gemeinden.'],
  ['Betonbohr', 'AG', 'Betonbohren und Betonschneiden, Kernbohrungen, Seilsägen sowie Rückbau und Abbruch.'],
  ['Bohr- und Fräsdienst', 'GmbH', 'Kernbohrungen, Wandsägen, Fugenschneiden und Betonfräsen für Bauunternehmen.'],
  ['Rückbau', 'AG', 'Rückbau, Abbruch und Demontage von Gebäuden, Betontrennarbeiten und Entsorgung.'],
  ['Bauunternehmung', 'AG', 'Hochbau, Tiefbau, Umbau und Renovation; Ausführung sämtlicher Baumeisterarbeiten.'],
  ['Bau', 'GmbH', 'Maurer- und Umbauarbeiten, Sanierung von Altbauten und Fassaden.'],
  ['Unterlagsböden', 'AG', 'Einbau von Unterlagsböden, Estrich, Industrieböden und Bodenschleifarbeiten.'],
  ['Bodenbeläge', 'GmbH', 'Verlegen von Bodenbelägen, Parkett und Terrazzo; Bodenschleifen.'],
  ['Ofenbau', 'GmbH', 'Ofenbau und Cheminéebau, Hafnerarbeiten, Planung und Montage von Speicheröfen.'],
  ['Haustechnik', 'AG', 'Sanitär- und Heizungsinstallationen, Haustechnik, Kernbohrungen für Leitungen.'],
  ['Baumaschinen', 'AG', 'Handel, Vermietung und Reparatur von Baumaschinen und Baugeräten, Mietpark.'],
];

const NAMEN = ['Alpstein', 'Seeblick', 'Hochwacht', 'Thurtal', 'Rhyner', 'Bergli', 'Feldegg', 'Sonnhalde',
  'Kronen', 'Lindenhof', 'Rosenberg', 'Talacker', 'Burghalde', 'Mühlebach', 'Eichbühl', 'Steinach',
  'Grünau', 'Brunnmatt', 'Hofacker', 'Sandgrueb', 'Weierhof', 'Rebhalde', 'Moosbach', 'Schlossberg'];
const STRASSEN = ['Industriestrasse', 'Gewerbestrasse', 'Bahnhofstrasse', 'Werkstrasse', 'Hauptstrasse', 'Dorfstrasse', 'Bodenackerstrasse'];
const STATUS_DATEN = ['2026-10-14', '2026-10-21', '2026-10-07'];

// Reproduzierbarer Zufall
let saat = 42;
const zufall = () => ((saat = (saat * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const waehle = (a) => a[Math.floor(zufall() * a.length)];

const gewichtet = ORTE.flatMap((o) => Array(o[5]).fill(o));
const firmen = [];
const namen = new Set();
for (let i = 0; firmen.length < 180 && i < 2000; i++) {
  const [plz, ort, kanton, lat, lon] = waehle(gewichtet);
  const [branche, rf, zweck] = waehle(VORLAGEN);
  const name = `${waehle(NAMEN)} ${branche} ${rf}`;
  if (namen.has(name)) continue;
  namen.add(name);
  const { passung, branchen } = passungBerechnen({ name, zweck }, PROFIL);
  const nr = String(100000 + i).padStart(6, '0');
  const neu = zufall() < 0.09;
  firmen.push({
    id: `DEMO-${nr.slice(0, 3)}.${nr.slice(3)}`,
    name,
    rechtsform: rf,
    strasse: `${waehle(STRASSEN)} ${1 + Math.floor(zufall() * 80)}`,
    plz, ort, kanton,
    lat: Math.round((lat + (zufall() - 0.5) * 0.03) * 1e5) / 1e5,
    lon: Math.round((lon + (zufall() - 0.5) * 0.045) * 1e5) / 1e5,
    genau: true,
    zweck,
    passung, branchen,
    erfasst: neu ? waehle(STATUS_DATEN) : '2026-09-01',
    eintrag: neu ? waehle(STATUS_DATEN) : undefined,
    quelle: 'demo',
    ...(neu ? { neu: true } : {}),
  });
}
firmen.sort((a, b) => a.name.localeCompare(b.name, 'de'));

const daten = {
  version: 1,
  demo: true,
  stand: '2026-10-30T06:00:00.000Z',
  laeufe: [
    { datum: '2026-09-01', modus: 'bestand', bis: '2026-09-01', geprueft: 0, neu: firmen.length - firmen.filter((f) => f.neu).length, geloescht: 0, gesamt: firmen.length - firmen.filter((f) => f.neu).length },
    { datum: '2026-10-30', modus: 'monat', von: '2026-10-01', bis: '2026-10-29', geprueft: 0, neu: firmen.filter((f) => f.neu).length, geloescht: 0, gesamt: firmen.length },
  ],
  firmen,
};
await writeFile(join(WURZEL, 'public/data/firmen.json'), JSON.stringify(daten) + '\n');
console.log(`${firmen.length} Demofirmen geschrieben (${firmen.filter((f) => f.neu).length} neu).`);
