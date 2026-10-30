import { describe, expect, it } from 'vitest';
import { fahrMinuten, luftlinieKm, minZuZeit, zeitZuMin } from '../src/geo/distanz';
import { MAX_ZWISCHENSTOPPS, routenLink, routenLinks } from '../src/planung/googleMaps';
import { kosten, optimieren, tagFuellen, vorschlagen, zeitplan, type Kandidat, type PlanRahmen } from '../src/planung/route';
import { kalenderwoche, montagVon, plusTage, tageZwischen } from '../src/daten/datum';
import type { Punkt, Stopp } from '../src/typen';

// Echte Ortszentren (gerundet)
const ORTE: Record<string, Punkt> = {
  frauenfeld: { lat: 47.5536, lon: 8.8987 },
  winterthur: { lat: 47.4988, lon: 8.7237 },
  zuerich: { lat: 47.3769, lon: 8.5417 },
  stgallen: { lat: 47.4245, lon: 9.3767 },
  wil: { lat: 47.4614, lon: 9.0453 },
  weinfelden: { lat: 47.5667, lon: 9.1067 },
  kreuzlingen: { lat: 47.6458, lon: 9.1781 },
  schaffhausen: { lat: 47.6973, lon: 8.6349 },
  bern: { lat: 46.948, lon: 7.4474 },
};
const punktVon = (id: string) => ORTE[id];
const rahmen: PlanRahmen = { start: ORTE.frauenfeld, beginn: zeitZuMin('07:30'), ende: zeitZuMin('17:30'), standardDauer: 45 };

describe('Distanz', () => {
  it('Luftlinie Frauenfeld-Winterthur ist rund 14 km', () => {
    expect(luftlinieKm(ORTE.frauenfeld, ORTE.winterthur)).toBeGreaterThan(13);
    expect(luftlinieKm(ORTE.frauenfeld, ORTE.winterthur)).toBeLessThan(16);
  });
  it('Fahrzeit ist plausibel (Frauenfeld-Zürich 35-60 min geschätzt)', () => {
    const m = fahrMinuten(ORTE.frauenfeld, ORTE.zuerich);
    expect(m).toBeGreaterThan(35);
    expect(m).toBeLessThan(60);
  });
  it('Zeit hin und zurück', () => {
    expect(minZuZeit(zeitZuMin('08:05'))).toBe('08:05');
  });
});

describe('Zeitplan', () => {
  it('wartet auf einen Fixtermin und fährt rechtzeitig los', () => {
    const z = zeitplan([{ firmaId: 'winterthur', fix: '10:00' }], punktVon, rahmen);
    expect(z.eintraege[0].beginn).toBe(600);
    expect(z.eintraege[0].verspaetung).toBe(0);
    // Abfahrt wird nach hinten geschoben statt 2 h zu warten
    expect(z.eintraege[0].warten).toBeLessThan(1);
  });
  it('erkennt einen unerreichbaren Fixtermin', () => {
    const z = zeitplan([{ firmaId: 'bern', fix: '09:00', dauer: 120 }, { firmaId: 'stgallen', fix: '10:00' }], punktVon, rahmen);
    expect(z.verspaetung).toBeGreaterThan(60);
  });
});

describe('Optimierung', () => {
  it('ordnet freie Besuche zu einer kurzen Rundtour', () => {
    const chaos: Stopp[] = ['stgallen', 'winterthur', 'kreuzlingen', 'wil', 'weinfelden'].map((firmaId) => ({ firmaId }));
    const opt = optimieren(chaos, punktVon, rahmen);
    expect(opt).toHaveLength(5);
    expect(kosten(zeitplan(opt, punktVon, rahmen))).toBeLessThan(kosten(zeitplan(chaos, punktVon, rahmen)));
  });
  it('lässt Fixtermine in Uhrzeit-Reihenfolge und hält sie ein', () => {
    const stopps: Stopp[] = [
      { firmaId: 'stgallen', fix: '14:00' },
      { firmaId: 'winterthur' },
      { firmaId: 'wil', fix: '09:00' },
      { firmaId: 'weinfelden' },
    ];
    const opt = optimieren(stopps, punktVon, rahmen);
    const fixe = opt.filter((s) => s.fix).map((s) => s.fix);
    expect(fixe).toEqual(['09:00', '14:00']);
    expect(zeitplan(opt, punktVon, rahmen).verspaetung).toBe(0);
  });
});

describe('Vorschläge', () => {
  const kandidaten: Kandidat[] = ['winterthur', 'wil', 'weinfelden', 'bern', 'schaffhausen'].map((id) => ({ id, punkt: ORTE[id], wert: 0, gruende: [] }));

  it('schlägt Firmen auf dem Weg zu einem Fixtermin zuerst vor', () => {
    const v = vorschlagen([{ firmaId: 'stgallen', fix: '13:00' }], kandidaten, punktVon, rahmen);
    // Wil und Weinfelden liegen zwischen Frauenfeld und St. Gallen
    expect(['wil', 'weinfelden']).toContain(v[0].id);
    // Bern ist weit weg und fällt aus dem Umkreis
    expect(v.find((x) => x.id === 'bern')).toBeUndefined();
  });
  it('Wert (z. B. neue Firma) zählt gegen Umweg', () => {
    const k = kandidaten.map((x) => (x.id === 'schaffhausen' ? { ...x, wert: 60 } : x));
    const v = vorschlagen([], k, punktVon, rahmen);
    expect(v[0].id).toBe('schaffhausen');
  });
  it('gefährdet keinen Fixtermin', () => {
    const v = vorschlagen([{ firmaId: 'stgallen', fix: '08:15' }], kandidaten, punktVon, rahmen);
    for (const x of v) expect(x.index).toBeGreaterThan(0); // nur nach dem frühen Termin
  });
  it('Tag füllen hält Arbeitsende ein', () => {
    const plan = tagFuellen([{ firmaId: 'stgallen', fix: '10:00' }], kandidaten, punktVon, rahmen);
    expect(plan.length).toBeGreaterThan(1);
    const z = zeitplan(plan, punktVon, rahmen);
    expect(z.ueberzeit).toBe(0);
    expect(z.verspaetung).toBe(0);
  });
});

describe('Google Maps', () => {
  const w = (n: number) => ({ adresse: `Teststrasse ${n}, 8500 Frauenfeld`, lat: 47.5, lon: 8.9 });
  it('baut einen gültigen Directions-Link', () => {
    const url = new URL(routenLink(w(0), [w(1), w(2)], w(0)));
    expect(url.origin + url.pathname).toBe('https://www.google.com/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('waypoints')).toBe('Teststrasse 1, 8500 Frauenfeld|Teststrasse 2, 8500 Frauenfeld');
    expect(url.searchParams.get('travelmode')).toBe('driving');
  });
  it('teilt lange Touren in Etappen mit höchstens 9 Zwischenstopps', () => {
    const stopps = Array.from({ length: 23 }, (_, i) => w(i + 1));
    const links = routenLinks(w(0), stopps, w(0));
    expect(links).toHaveLength(3);
    for (const l of links) {
      const wp = new URL(l).searchParams.get('waypoints');
      expect((wp ? wp.split('|') : []).length).toBeLessThanOrEqual(MAX_ZWISCHENSTOPPS);
    }
    // Alle Stopps kommen genau einmal vor (als Zwischenstopp oder Etappenziel)
    const alle = links.flatMap((l) => {
      const u = new URL(l).searchParams;
      return [...(u.get('waypoints')?.split('|') ?? []), u.get('destination')];
    });
    for (const s of stopps) expect(alle.filter((x) => x === s.adresse)).toHaveLength(1);
  });
});

describe('Datum', () => {
  it('Montag und Kalenderwoche', () => {
    expect(montagVon('2026-10-30')).toBe('2026-10-26');
    expect(kalenderwoche('2026-10-30')).toBe(44);
    expect(kalenderwoche('2027-01-01')).toBe(53);
    expect(plusTage('2026-10-30', 3)).toBe('2026-11-02');
    expect(tageZwischen('2026-10-01', '2026-10-30')).toBe(29);
  });
});
