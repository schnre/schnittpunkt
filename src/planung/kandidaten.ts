// Welche Firmen sind für einen Besuch interessant, und wie viel Umweg sind sie wert?
import { STATUS, alleFirmen, letzterBesuch, statusVon } from '../daten/firmen';
import { tageZwischen } from '../daten/datum';
import type { Firma } from '../typen';
import type { Kandidat } from './route';

export interface KandidatOptionen {
  heute: string;
  ausschliessen: Set<string>; // schon in dieser Woche geplant
  branchen?: Set<string>; // leer/undefined = alle
  nurNeu?: boolean;
}

export function wertVon(f: Firma, heute: string): { wert: number; gruende: string[] } {
  const status = statusVon(f);
  const gruende: string[] = [];
  let wert = f.passung * 0.2 + STATUS[status].prio;

  if (f.neu) {
    wert += 15;
    gruende.push('Neu im Handelsregister');
  }
  if (status === 'interessant') gruende.push('Als interessant markiert');
  const besuch = letzterBesuch(f.id);
  if (status === 'kunde') {
    const tage = besuch ? tageZwischen(besuch, heute) : 999;
    if (tage > 90) {
      wert += 12;
      gruende.push(besuch ? `Kunde, ${Math.round(tage / 30)} Monate nicht besucht` : 'Kunde, noch kein Besuch erfasst');
    }
  } else if (!besuch && status === 'offen') {
    gruende.push('Noch nie besucht');
  }
  if (f.passung >= 90) gruende.push('Passt sehr gut zum Sortiment');
  return { wert, gruende };
}

export function kandidatenBauen(o: KandidatOptionen): Kandidat[] {
  const erg: Kandidat[] = [];
  for (const f of alleFirmen()) {
    if (o.ausschliessen.has(f.id)) continue;
    if (statusVon(f) === 'kein-interesse') continue;
    if (o.nurNeu && !f.neu) continue;
    if (o.branchen?.size && !f.branchen.some((b) => o.branchen!.has(b))) continue;
    const besuch = letzterBesuch(f.id);
    if (besuch && tageZwischen(besuch, o.heute) < 21) continue; // kürzlich besucht
    const { wert, gruende } = wertVon(f, o.heute);
    erg.push({ id: f.id, punkt: { lat: f.lat, lon: f.lon }, wert, gruende });
  }
  return erg;
}
