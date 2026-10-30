#!/usr/bin/env node
// Handelsregister-Abfrage: findet potenzielle Kunden und schreibt public/data/firmen.json.
//
//   node scripts/handelsregister.mjs --modus=monat            Neueintragungen seit der letzten Abfrage
//                                                             (beim ersten Mal: Vormonat)
//   node scripts/handelsregister.mjs --modus=monat --von=2026-09-01 --bis=2026-09-30
//   node scripts/handelsregister.mjs --modus=bestand [--max=2000]
//                                                             bestehende Firmen über die Zefix-Namensuche
//
// Läuft monatlich als GitHub Action (.github/workflows/handelsregister.yml).
// Braucht Node 20+ (globales fetch). Keine Zugangsdaten nötig.
// Optional: TEL_SEARCH_KEY (API-Schlüssel von tel.search.ch) ergänzt Telefonnummern.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { passungBerechnen } from './lib/passung.mjs';
import {
  ZEFIX, geoTreffer, geoUrl, hrPublikationLesen, shabListeUrl, uidNormalisieren, zefixZuFirma, SHAB,
} from './lib/quellen.mjs';

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATEI = join(WURZEL, 'public/data/firmen.json');
const PROFIL = JSON.parse(await readFile(join(WURZEL, 'config/suchprofil.json'), 'utf8'));

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const MODUS = args.modus ?? 'monat';
const MAX = Number(args.max ?? 2500);
const PARALLEL = 4;
const HEUTE = new Date().toISOString().slice(0, 10);
const UA = 'Schnittpunkt/1.0 (Handelsregister-Abgleich, monatlich)';

// ---------------------------------------------------------------------------
// HTTP mit Wiederholung und Drosselung
// ---------------------------------------------------------------------------

const warte = (ms) => new Promise((r) => setTimeout(r, ms));

async function hole(url, { json = true, methode = 'GET', body, versuche = 4 } = {}) {
  for (let i = 0; i < versuche; i++) {
    try {
      const res = await fetch(url, {
        method: methode,
        headers: {
          'User-Agent': UA,
          Accept: json ? 'application/json' : 'application/xml',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      // Zefix meldet "keine Treffer" als 404 mit Fehler-Umschlag
      if (res.status === 404) return json ? { list: [], keinTreffer: true } : '';
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
      return json ? await res.json() : await res.text();
    } catch (e) {
      if (i === versuche - 1) throw e;
      await warte(1000 * 2 ** i);
    }
  }
}

/** Führt fn für alle Elemente mit begrenzter Parallelität aus. */
async function parallel(liste, fn, n = PARALLEL) {
  const ergebnis = new Array(liste.length);
  let naechster = 0;
  let fertig = 0;
  async function arbeiter() {
    while (naechster < liste.length) {
      const i = naechster++;
      try {
        ergebnis[i] = await fn(liste[i], i);
      } catch (e) {
        console.warn(`  ! ${e.message}`);
      }
      if (++fertig % 250 === 0) console.log(`  … ${fertig}/${liste.length}`);
      await warte(120); // höflich bleiben
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, liste.length) }, arbeiter));
  return ergebnis;
}

// ---------------------------------------------------------------------------
// Bestehende Daten
// ---------------------------------------------------------------------------

async function datenLaden() {
  try {
    const d = JSON.parse(await readFile(DATEI, 'utf8'));
    // Demodaten werden bei der ersten echten Abfrage verworfen
    if (d.demo) return { version: 1, laeufe: [], firmen: [] };
    return d;
  } catch {
    return { version: 1, laeufe: [], firmen: [] };
  }
}

let rechtsformen = {};
async function rechtsformenLaden() {
  try {
    const liste = await hole(`${ZEFIX}/legalForm`);
    rechtsformen = Object.fromEntries(liste.map((r) => [r.id, r.kurzform?.de ?? r.name?.de]));
  } catch {
    rechtsformen = { 1: 'EIU', 2: 'KlG', 3: 'AG', 4: 'GmbH', 5: 'Gen', 9: 'Zweigniederl.' };
  }
}

async function zefixDetailPerUid(uid) {
  const treffer = await hole(`${ZEFIX}/firm/search.json`, {
    methode: 'POST',
    body: { name: uid, languageKey: 'de', maxEntries: 5, offset: 0, activeOnly: false },
  });
  const f = treffer.list?.find((x) => x.uidFormatted === uid) ?? treffer.list?.[0];
  return f ? hole(`${ZEFIX}/firm/${f.ehraid}.json`) : undefined;
}

// ---------------------------------------------------------------------------
// Geocoding und Kontaktdaten
// ---------------------------------------------------------------------------

async function geocodieren(f) {
  if (f.strasse && f.plz) {
    const g = geoTreffer(await hole(geoUrl(`${f.strasse} ${f.plz} ${f.ort ?? ''}`)));
    if (g) return g;
  }
  if (f.plz || f.ort) {
    const g = geoTreffer(await hole(geoUrl(`${f.plz ?? ''} ${f.ort ?? ''}`.trim(), 'zipcode,gg25')));
    if (g) return { ...g, genau: false };
  }
  return undefined;
}

async function telefonErgaenzen(f) {
  const key = process.env.TEL_SEARCH_KEY;
  if (!key || f.tel) return;
  const q = new URLSearchParams({ was: f.name, wo: f.plz ?? f.ort ?? '', key, maxnum: '1', privat: '0' });
  const xml = await hole(`https://tel.search.ch/api/?${q}`, { json: false });
  const tel = /<tel:phone>([^<]+)</.exec(xml)?.[1];
  const mail = /<tel:extra type="email">([^<]+)</.exec(xml)?.[1];
  const web = /<tel:extra type="website">([^<]+)</.exec(xml)?.[1];
  if (tel) f.tel = tel.trim();
  if (mail) f.mail = mail.trim();
  if (web) f.web = web.trim();
}

/** Aus Zefix-Detail eine bewertete, geocodierte Firma machen (oder undefined). */
async function firmaAufbereiten(detail, quelle) {
  if (!detail || detail.status === 'GELOESCHT') return undefined;
  const f = zefixZuFirma(detail, rechtsformen);
  const { passung, branchen } = passungBerechnen(f, PROFIL);
  if (passung < PROFIL.minPassung) return undefined;
  const geo = await geocodieren(f);
  if (!geo) {
    console.warn(`  ! keine Koordinaten: ${f.name}, ${f.plz} ${f.ort}`);
    return undefined;
  }
  if (PROFIL.kantone.length && !PROFIL.kantone.includes(f.kanton ?? geo.kanton)) return undefined;
  try {
    await telefonErgaenzen(f);
  } catch { /* optional */ }
  return {
    ...f,
    kanton: f.kanton ?? geo.kanton,
    lat: geo.lat,
    lon: geo.lon,
    genau: geo.genau,
    zweck: f.zweck?.slice(0, 420),
    passung,
    branchen,
    erfasst: HEUTE,
    quelle,
    status: undefined,
    ehraid: undefined,
  };
}

// ---------------------------------------------------------------------------
// Modus "monat": SHAB-Neueintragungen (HR01) und Löschungen (HR03)
// ---------------------------------------------------------------------------

async function shabListe(subRubrik, von, bis) {
  const alle = [];
  for (let seite = 0; ; seite++) {
    const url = shabListeUrl({
      publicationStates: 'PUBLISHED', rubrics: 'HR', subRubrics: subRubrik,
      'publicationDate.start': von, 'publicationDate.end': bis,
      'pageRequest.size': 100, 'pageRequest.page': seite,
    });
    const d = await hole(url);
    // Schutz gegen still ignorierte Filter: ein Monat hat nie 50 000 Einträge in einer Subrubrik
    if (typeof d.total === 'number' && d.total > 50_000) throw new Error(`Filter wirkungslos? total=${d.total}`);
    alle.push(...(d.content ?? []).map((c) => c.meta));
    if (!d.content?.length || alle.length >= (d.total ?? 0)) break;
  }
  return alle;
}

function zeitraum(daten) {
  if (args.von && args.bis) return { von: args.von, bis: args.bis };
  const gestern = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const letzter = daten.laeufe.filter((l) => l.modus === 'monat').at(-1);
  if (letzter) {
    const von = new Date(Date.parse(letzter.bis) + 864e5).toISOString().slice(0, 10);
    return { von, bis: gestern };
  }
  const d = new Date();
  const von = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  return { von, bis: gestern };
}

async function monat(daten) {
  const { von, bis } = zeitraum(daten);
  if (von > bis) {
    console.log(`Nichts zu tun: letzte Abfrage reicht bis ${bis}.`);
    return null;
  }
  console.log(`SHAB-Neueintragungen ${von} bis ${bis} …`);
  let metas = await shabListe('HR01', von, bis);
  if (PROFIL.kantone.length) metas = metas.filter((m) => m.cantons?.some((k) => PROFIL.kantone.includes(k)));
  console.log(`  ${metas.length} Neueintragungen, lese Zweck …`);

  const bekannt = new Set(daten.firmen.map((f) => f.id));
  // 1. Publikation lesen, Passung grob vorbewerten (nur Name + Zweck, keine Personen)
  const kandidaten = (
    await parallel(metas, async (m) => {
      const xml = await hole(`${SHAB}/publications/${m.id}/xml`, { json: false });
      const p = hrPublikationLesen(xml);
      if (!p.uid || bekannt.has(p.uid)) return undefined;
      const { passung } = passungBerechnen(p, PROFIL);
      return passung >= PROFIL.minPassung ? p : undefined;
    })
  ).filter(Boolean);
  console.log(`  ${kandidaten.length} passen zum Suchprofil, hole Details …`);

  // 2. Zefix-Details (saubere Adresse) und Koordinaten
  const neu = (await parallel(kandidaten, async (p) => firmaAufbereiten(await zefixDetailPerUid(p.uid), 'shab'))).filter(Boolean);
  for (const f of neu) f.neu = true;

  // 3. Löschungen: nur Publikationen prüfen, deren Titel nach einer unserer Firmen aussieht
  const namen = new Map(daten.firmen.filter((f) => !f.geloescht).map((f) => [f.name.toLowerCase(), f]));
  let geloescht = 0;
  try {
    const loeschungen = await shabListe('HR03', von, bis);
    for (const m of loeschungen) {
      const titel = (m.title?.de ?? '').replace(/^Löschung\s+/i, '').replace(/,\s*[^,]+$/, '').replace(/\s+in Liquidation$/i, '').toLowerCase();
      const f = namen.get(titel);
      if (!f) continue;
      const xml = await hole(`${SHAB}/publications/${m.id}/xml`, { json: false });
      if (uidNormalisieren(xml) === f.id) {
        f.geloescht = m.publicationDate?.slice(0, 10) ?? HEUTE;
        geloescht++;
      }
    }
  } catch (e) {
    console.warn(`  ! Löschungen nicht geprüft: ${e.message}`);
  }

  // Markierung "neu" gilt nur für die jeweils letzte Abfrage
  for (const f of daten.firmen) delete f.neu;
  daten.firmen.push(...neu);
  return { modus: 'monat', von, bis, geprueft: metas.length, neu: neu.length, geloescht };
}

// ---------------------------------------------------------------------------
// Modus "bestand": bestehende Firmen über die Zefix-Namensuche
// ---------------------------------------------------------------------------

async function bestand(daten) {
  const bekannt = new Set(daten.firmen.map((f) => f.id));
  const treffer = new Map();
  for (const begriff of PROFIL.zefixNamensuche) {
    for (let offset = 0; offset < 5000; offset += 500) {
      const body = { name: begriff, searchType: 'CONTAINS', languageKey: 'de', maxEntries: 500, offset, activeOnly: true };
      const d = await hole(`${ZEFIX}/firm/search.json`, { methode: 'POST', body });
      for (const f of d.list ?? []) {
        if (!bekannt.has(f.uidFormatted) && f.status === 'EXISTIEREND') treffer.set(f.ehraid, f);
      }
      if (!d.hasMoreResults) break;
      await warte(300);
    }
    console.log(`  "${begriff}": ${treffer.size} Kandidaten gesamt`);
  }
  // Vorfilter über den Namen, damit nur aussichtsreiche Details geholt werden
  const liste = [...treffer.values()]
    .map((f) => ({ f, p: passungBerechnen({ name: f.name }, PROFIL).passung }))
    .filter((x) => x.p >= PROFIL.minPassung - 10)
    .sort((a, b) => b.p - a.p)
    .slice(0, MAX);
  console.log(`Hole ${liste.length} Details …`);
  const neu = (await parallel(liste, async ({ f }) => firmaAufbereiten(await hole(`${ZEFIX}/firm/${f.ehraid}.json`), 'zefix'))).filter(Boolean);
  daten.firmen.push(...neu);
  return { modus: 'bestand', von: undefined, bis: HEUTE, geprueft: liste.length, neu: neu.length, geloescht: 0 };
}

// ---------------------------------------------------------------------------

async function main() {
  const daten = await datenLaden();
  await rechtsformenLaden();
  const lauf = MODUS === 'bestand' ? await bestand(daten) : await monat(daten);
  if (!lauf) return;

  // Aufräumen: Duplikate, sortieren, entfernte Felder
  const nachId = new Map();
  for (const f of daten.firmen) {
    for (const k of Object.keys(f)) if (f[k] === undefined) delete f[k];
    nachId.set(f.id, { ...nachId.get(f.id), ...f });
  }
  daten.firmen = [...nachId.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  daten.stand = new Date().toISOString();
  daten.demo = false;
  daten.laeufe.push({ datum: HEUTE, ...lauf, gesamt: daten.firmen.filter((f) => !f.geloescht).length });
  daten.laeufe = daten.laeufe.slice(-36);

  await writeFile(DATEI, JSON.stringify(daten) + '\n');
  const zusammenfassung = `### Handelsregister-Abfrage ${HEUTE}\n\n| | |\n|---|---|\n| Modus | ${lauf.modus} |\n| Zeitraum | ${lauf.von ?? '–'} bis ${lauf.bis} |\n| Geprüft | ${lauf.geprueft} |\n| **Neue potenzielle Kunden** | **${lauf.neu}** |\n| Gelöscht markiert | ${lauf.geloescht} |\n| Firmen total | ${daten.laeufe.at(-1).gesamt} |\n`;
  console.log(zusammenfassung);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, zusammenfassung, { flag: 'a' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
