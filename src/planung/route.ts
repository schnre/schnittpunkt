// Tagesplanung: Zeitplan berechnen, Reihenfolge optimieren, Besuche vorschlagen.
//
// Modell: Start am Startort zum Arbeitsbeginn, dann die Stopps in Reihenfolge, zurück zum
// Startort. Fixtermine haben eine feste Uhrzeit: wer zu früh ist, wartet; wer zu spät ist,
// bekommt eine Verspätung angerechnet. Freie Besuche werden so eingeplant, dass möglichst
// wenig gefahren wird und kein Fixtermin gefährdet ist.
//
// Die Funktionen sind rein (keine DOM-, keine Speicherzugriffe) und darum gut testbar.
import { fahrMinuten, strasseKm, zeitZuMin } from '../geo/distanz';
import type { Punkt, Stopp } from '../typen';

export interface PlanRahmen {
  start: Punkt;
  beginn: number; // Minuten ab Mitternacht
  ende: number;
  standardDauer: number;
}

export interface ZeitEintrag {
  stopp: Stopp;
  fahrMin: number;
  km: number;
  ankunft: number;
  beginn: number; // nach allfälliger Wartezeit
  ende: number;
  warten: number;
  verspaetung: number;
}

export interface Zeitplan {
  eintraege: ZeitEintrag[];
  rueckfahrMin: number;
  rueckkehr: number;
  km: number;
  fahrMin: number;
  verspaetung: number; // Summe über alle Fixtermine
  ueberzeit: number; // Minuten nach Arbeitsende
}

export type PunktVon = (firmaId: string) => Punkt | undefined;

export function zeitplan(stopps: Stopp[], punktVon: PunktVon, r: PlanRahmen): Zeitplan {
  let t = r.beginn;
  let ort = r.start;
  let km = 0;
  let fahr = 0;
  let verspaetung = 0;
  const eintraege: ZeitEintrag[] = [];

  // Beginnt der Tag mit einem Fixtermin, fährt man rechtzeitig los statt zu warten.
  const ersterFix = stopps[0]?.fix ? zeitZuMin(stopps[0].fix) : undefined;
  const p0 = stopps[0] && punktVon(stopps[0].firmaId);
  if (ersterFix !== undefined && p0) t = Math.max(r.beginn, ersterFix - fahrMinuten(ort, p0));

  for (const s of stopps) {
    const p = punktVon(s.firmaId);
    if (!p) continue;
    const f = fahrMinuten(ort, p);
    const d = strasseKm(ort, p);
    const ankunft = t + f;
    const fix = s.fix ? zeitZuMin(s.fix) : undefined;
    const beginn = fix !== undefined ? Math.max(ankunft, fix) : ankunft;
    const spaet = fix !== undefined ? Math.max(0, ankunft - fix) : 0;
    const ende = beginn + (s.dauer ?? r.standardDauer);
    eintraege.push({ stopp: s, fahrMin: f, km: d, ankunft, beginn, ende, warten: beginn - ankunft, verspaetung: spaet });
    km += d;
    fahr += f;
    verspaetung += spaet;
    t = ende;
    ort = p;
  }
  const rueck = fahrMinuten(ort, r.start);
  km += strasseKm(ort, r.start);
  fahr += rueck;
  const rueckkehr = t + rueck;
  return { eintraege, rueckfahrMin: rueck, rueckkehr, km, fahrMin: fahr, verspaetung, ueberzeit: Math.max(0, rueckkehr - r.ende) };
}

/** Kosten eines Plans: Fahrzeit, Verspätungen und Überzeit (beides stark gewichtet). */
export function kosten(z: Zeitplan): number {
  return z.fahrMin + 20 * z.verspaetung + 3 * z.ueberzeit;
}

function fixVergleich(a: Stopp, b: Stopp) {
  return zeitZuMin(a.fix!) - zeitZuMin(b.fix!);
}

/** Bester Einfügeplatz für einen Stopp (Index und Kostenzuwachs). */
export function besterPlatz(stopps: Stopp[], neu: Stopp, punktVon: PunktVon, r: PlanRahmen) {
  const basis = kosten(zeitplan(stopps, punktVon, r));
  let bestIndex = 0;
  let bestKosten = Infinity;
  let bestPlan: Zeitplan | undefined;
  for (let i = 0; i <= stopps.length; i++) {
    const versuch = [...stopps.slice(0, i), neu, ...stopps.slice(i)];
    // Fixtermine müssen in Uhrzeit-Reihenfolge bleiben
    const fixe = versuch.filter((s) => s.fix);
    if (fixe.some((s, k) => k > 0 && fixVergleich(fixe[k - 1], s) > 0)) continue;
    const z = zeitplan(versuch, punktVon, r);
    const k = kosten(z);
    if (k < bestKosten) {
      bestKosten = k;
      bestIndex = i;
      bestPlan = z;
    }
  }
  return { index: bestIndex, zuwachs: bestKosten - basis, plan: bestPlan! };
}

/**
 * Optimiert die Reihenfolge: Fixtermine nach Uhrzeit, freie Besuche per günstigster
 * Einfügung, danach Verschieben einzelner Besuche, solange es kürzer wird.
 */
export function optimieren(stopps: Stopp[], punktVon: PunktVon, r: PlanRahmen): Stopp[] {
  const fixe = stopps.filter((s) => s.fix).sort(fixVergleich);
  // Freie Besuche: die am weitesten entfernten zuerst einfügen (stabilere Ergebnisse)
  const freie = stopps
    .filter((s) => !s.fix)
    .map((s) => ({ s, d: punktVon(s.firmaId) ? strasseKm(r.start, punktVon(s.firmaId)!) : 0 }))
    .sort((a, b) => b.d - a.d)
    .map((x) => x.s);

  let plan = [...fixe];
  for (const s of freie) {
    const { index } = besterPlatz(plan, s, punktVon, r);
    plan.splice(index, 0, s);
  }

  // Verbessern: jeden freien Besuch herausnehmen und an der besten Stelle neu einsetzen
  for (let runde = 0; runde < 8; runde++) {
    let besser = false;
    for (const s of freie) {
      const ohne = plan.filter((x) => x !== s);
      const alt = kosten(zeitplan(plan, punktVon, r));
      const { index, plan: z } = besterPlatz(ohne, s, punktVon, r);
      if (kosten(z) < alt - 0.01) {
        ohne.splice(index, 0, s);
        plan = ohne;
        besser = true;
      }
    }
    if (!besser) break;
  }
  return plan;
}

// ---------------------------------------------------------------------------
// Vorschläge
// ---------------------------------------------------------------------------

export interface Kandidat {
  id: string;
  punkt: Punkt;
  /** Bonus in Minuten: so viel Umweg ist dieser Besuch "wert" (Status, Passung, neu) */
  wert: number;
  gruende: string[];
}

export interface Vorschlag {
  id: string;
  umwegMin: number; // zusätzliche Fahrzeit
  zusatzMin: number; // Fahrzeit + Besuchsdauer
  index: number;
  rang: number; // kleiner = besser
  gruende: string[];
  passtInTag: boolean;
}

/**
 * Schlägt Firmen vor, die gut in den Tag passen: wenig Umweg zur bestehenden Route,
 * kein Fixtermin wird verspätet, und Firmen mit hohem "Wert" werden bevorzugt.
 */
export function vorschlagen(
  stopps: Stopp[],
  kandidaten: Kandidat[],
  punktVon: PunktVon,
  r: PlanRahmen,
  { anzahl = 12, radiusKm = 35 } = {},
): Vorschlag[] {
  const basis = zeitplan(stopps, punktVon, r);
  const routenPunkte = [r.start, ...stopps.map((s) => punktVon(s.firmaId)).filter((p): p is Punkt => !!p)];
  const neuDauer = r.standardDauer;

  // Vorfilter: nur Kandidaten in der Nähe der Route (spart Rechenzeit bei tausenden Firmen)
  const nah = kandidaten
    .map((k) => ({ k, d: Math.min(...routenPunkte.map((p) => strasseKm(p, k.punkt))) }))
    .filter((x) => x.d <= radiusKm)
    .sort((a, b) => a.d - b.d)
    .slice(0, 150);

  const erg: Vorschlag[] = [];
  for (const { k } of nah) {
    const neu: Stopp = { firmaId: k.id };
    const pv: PunktVon = (id) => (id === k.id ? k.punkt : punktVon(id));
    const { index, plan } = besterPlatz(stopps, neu, pv, r);
    const umweg = plan.fahrMin - basis.fahrMin;
    const mehrVerspaetung = plan.verspaetung - basis.verspaetung;
    if (mehrVerspaetung > 0.5) continue; // gefährdet einen Fixtermin
    const passt = plan.ueberzeit <= basis.ueberzeit + 0.5;
    erg.push({
      id: k.id,
      umwegMin: umweg,
      zusatzMin: umweg + neuDauer,
      index,
      rang: umweg - k.wert + (passt ? 0 : 60),
      gruende: k.gruende,
      passtInTag: passt,
    });
  }
  return erg.sort((a, b) => a.rang - b.rang).slice(0, anzahl);
}

/** Füllt einen Tag mit den besten Vorschlägen, bis kein Besuch mehr Platz hat. */
export function tagFuellen(stopps: Stopp[], kandidaten: Kandidat[], punktVon: PunktVon, r: PlanRahmen, max = 8): Stopp[] {
  let plan = [...stopps];
  const genutzt = new Set(plan.map((s) => s.firmaId));
  const kp = new Map(kandidaten.map((k) => [k.id, k.punkt]));
  const pv: PunktVon = (id) => kp.get(id) ?? punktVon(id);
  for (let i = 0; i < max; i++) {
    const [v] = vorschlagen(plan, kandidaten.filter((k) => !genutzt.has(k.id)), pv, r, { anzahl: 1 });
    if (!v || !v.passtInTag) break;
    plan.splice(v.index, 0, { firmaId: v.id });
    plan = optimieren(plan, pv, r);
    genutzt.add(v.id);
  }
  return plan;
}
