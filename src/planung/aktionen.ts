// Verbindet die reine Planungslogik mit Firmendaten und gespeicherten Plänen.
import { firmaVon } from '../daten/firmen';
import { plusTage } from '../daten/datum';
import { crmSetzen, crmVon, tagSetzen, tagVon, zustand } from '../daten/zustand';
import { zeitZuMin } from '../geo/distanz';
import type { Mitarbeiter, Stopp } from '../typen';
import { optimieren, type PlanRahmen, type PunktVon } from './route';

export const punktVon: PunktVon = (id) => {
  const f = firmaVon(id);
  return f ? { lat: f.lat, lon: f.lon } : undefined;
};

export function rahmenFuer(m: Mitarbeiter): PlanRahmen {
  const e = zustand().einstellungen;
  return {
    start: { lat: m.lat, lon: m.lon },
    beginn: zeitZuMin(e.arbeitsbeginn),
    ende: zeitZuMin(e.arbeitsende),
    standardDauer: e.besuchsdauer,
  };
}

export function mitarbeiterVon(id: string): Mitarbeiter {
  const e = zustand().einstellungen;
  return e.mitarbeiter.find((m) => m.id === id) ?? e.mitarbeiter[0];
}

/** Alle Firmen, die in dieser Woche (Mo-So) schon bei irgendwem geplant sind. */
export function geplantInWoche(montag: string): Map<string, { mitarbeiter: string; datum: string }> {
  const erg = new Map<string, { mitarbeiter: string; datum: string }>();
  const plaene = zustand().plaene;
  for (const [mId, tage] of Object.entries(plaene)) {
    for (let i = 0; i < 7; i++) {
      const d = plusTage(montag, i);
      for (const s of tage[d]?.stopps ?? []) erg.set(s.firmaId, { mitarbeiter: mId, datum: d });
    }
  }
  return erg;
}

/** Alle geplanten Termine einer Firma über alle Mitarbeiter und Tage. */
export function termineVon(firmaId: string): { mitarbeiter: string; datum: string; fix?: string }[] {
  const erg: { mitarbeiter: string; datum: string; fix?: string }[] = [];
  for (const [mId, tage] of Object.entries(zustand().plaene)) {
    for (const [d, tag] of Object.entries(tage)) {
      const s = tag.stopps.find((x) => x.firmaId === firmaId);
      if (s) erg.push({ mitarbeiter: mId, datum: d, fix: s.fix });
    }
  }
  return erg;
}

/** Besuch erfassen oder entfernen, mit dem Mitarbeiter, der dort war. */
export function besuchSetzen(firmaId: string, datum: string, mitarbeiterId: string | undefined, besucht: boolean): void {
  const crm = crmVon(firmaId);
  const b = new Set(crm.besuche ?? []);
  const von = { ...crm.besuchtVon };
  if (besucht) {
    b.add(datum);
    if (mitarbeiterId) von[datum] = mitarbeiterId;
  } else {
    b.delete(datum);
    delete von[datum];
  }
  const status = crm.status ?? 'offen';
  crmSetzen(firmaId, { besuche: [...b], besuchtVon: von, status: besucht && status === 'offen' ? 'kontaktiert' : status });
}

export function stoppHinzufuegen(mitarbeiterId: string, datum: string, stopp: Stopp, ordnen = true): void {
  const tag = tagVon(mitarbeiterId, datum);
  const ohne = tag.stopps.filter((s) => s.firmaId !== stopp.firmaId);
  const neu = [...ohne, stopp];
  const stopps = ordnen ? optimieren(neu, punktVon, rahmenFuer(mitarbeiterVon(mitarbeiterId))) : neu;
  tagSetzen(mitarbeiterId, datum, { stopps });
}

export function stoppEntfernen(mitarbeiterId: string, datum: string, firmaId: string): void {
  const tag = tagVon(mitarbeiterId, datum);
  tagSetzen(mitarbeiterId, datum, { stopps: tag.stopps.filter((s) => s.firmaId !== firmaId) });
}

export function tagOptimieren(mitarbeiterId: string, datum: string): void {
  const tag = tagVon(mitarbeiterId, datum);
  tagSetzen(mitarbeiterId, datum, { stopps: optimieren(tag.stopps, punktVon, rahmenFuer(mitarbeiterVon(mitarbeiterId))) });
}
