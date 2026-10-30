// Distanz- und Fahrzeitschätzung ohne externen Routing-Dienst.
// Die genaue Route rechnet danach Google Maps. Für Planung und Vorschläge reicht eine
// Schätzung: Luftlinie × Umwegfaktor, Tempo abhängig von der Distanz (kurz = Ortsverkehr).
import type { Punkt } from '../typen';

const R = 6371;
/** Strasse ist in der Schweiz im Mittel rund 30 % länger als die Luftlinie. */
export const UMWEGFAKTOR = 1.3;
/** Parkieren, Anmelden, Gehweg */
export const NEBENZEIT_MIN = 4;

export function luftlinieKm(a: Punkt, b: Punkt): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export function strasseKm(a: Punkt, b: Punkt): number {
  return luftlinieKm(a, b) * UMWEGFAKTOR;
}

/** Durchschnittstempo: ~35 km/h im Ort bis ~70 km/h bei langen Strecken (Autobahnanteil). */
export function tempoKmh(km: number): number {
  return 34 + Math.min(km, 90) * 0.4;
}

export function fahrMinuten(a: Punkt, b: Punkt): number {
  const km = strasseKm(a, b);
  if (km < 0.05) return 0;
  return (km / tempoKmh(km)) * 60 + NEBENZEIT_MIN;
}

export function formatKm(km: number): string {
  return km < 10 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

export function formatDauer(min: number): string {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}

export function zeitZuMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minZuZeit(min: number): string {
  const m = Math.round(min);
  return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
