#!/usr/bin/env node
// Prüft public/data/firmen.json, bevor gebaut und veröffentlicht wird.
// Ein Fehler hier lässt die CI fehlschlagen, damit nie kaputte Daten live gehen.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const daten = JSON.parse(await readFile(join(WURZEL, 'public/data/firmen.json'), 'utf8'));
const profil = JSON.parse(await readFile(join(WURZEL, 'config/suchprofil.json'), 'utf8'));
const branchen = new Set(profil.branchen.map((b) => b.id));

const fehler = [];
if (daten.version !== 1) fehler.push('version muss 1 sein');
if (!Array.isArray(daten.firmen)) fehler.push('firmen fehlt');
if (!Array.isArray(daten.laeufe)) fehler.push('laeufe fehlt');

const ids = new Set();
for (const [i, f] of (daten.firmen ?? []).entries()) {
  const wo = `firmen[${i}] (${f.name ?? '?'})`;
  if (!f.id || typeof f.id !== 'string') fehler.push(`${wo}: id fehlt`);
  if (ids.has(f.id)) fehler.push(`${wo}: id doppelt ${f.id}`);
  ids.add(f.id);
  if (!f.name) fehler.push(`${wo}: name fehlt`);
  // grosszügige Box um die Schweiz
  if (!(f.lat > 45.7 && f.lat < 47.9 && f.lon > 5.8 && f.lon < 10.6)) fehler.push(`${wo}: Koordinaten ausserhalb der Schweiz`);
  if (!(f.passung >= 0 && f.passung <= 100)) fehler.push(`${wo}: passung ausserhalb 0-100`);
  if (!Array.isArray(f.branchen) || f.branchen.some((b) => !branchen.has(b))) fehler.push(`${wo}: unbekannte Branche`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.erfasst ?? '')) fehler.push(`${wo}: erfasst muss JJJJ-MM-TT sein`);
  if (f.auszug && !/^https:\/\//.test(f.auszug)) fehler.push(`${wo}: auszug muss https sein`);
}

if (fehler.length) {
  console.error(`firmen.json ungültig (${fehler.length} Fehler):\n- ` + fehler.slice(0, 30).join('\n- '));
  process.exit(1);
}
console.log(`firmen.json ok: ${ids.size} Firmen, ${daten.laeufe.length} Abfragen${daten.demo ? ' (Demodaten)' : ''}.`);
