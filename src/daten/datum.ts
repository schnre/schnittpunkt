// Datumshilfen. Gerechnet wird mit lokalen Kalendertagen im Format JJJJ-MM-TT.

export function isoDatum(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function heute(): string {
  return isoDatum(new Date());
}

export function parse(iso: string): Date {
  const [j, m, t] = iso.split('-').map(Number);
  return new Date(j, m - 1, t);
}

export function plusTage(iso: string, n: number): string {
  const d = parse(iso);
  d.setDate(d.getDate() + n);
  return isoDatum(d);
}

export function tageZwischen(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);
}

/** Montag der Woche, in der das Datum liegt. */
export function montagVon(iso: string): string {
  const d = parse(iso);
  const wt = (d.getDay() + 6) % 7; // Mo=0
  return plusTage(iso, -wt);
}

/** ISO-Kalenderwoche */
export function kalenderwoche(iso: string): number {
  const d = parse(iso);
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const wt = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wt);
  const jahresbeginn = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - jahresbeginn.getTime()) / 864e5 + 1) / 7);
}

const WT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WT_LANG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sep.', 'Okt.', 'Nov.', 'Dez.'];
const MON_LANG = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export const wochentag = (iso: string, lang = false) => (lang ? WT_LANG : WT)[parse(iso).getDay()];
export const monatName = (iso: string) => MON_LANG[parse(iso).getMonth()];

export function kurz(iso: string): string {
  const d = parse(iso);
  return `${d.getDate()}. ${MON[d.getMonth()]}`;
}

export function lang(iso: string): string {
  const d = parse(iso);
  return `${d.getDate()}. ${MON_LANG[d.getMonth()]} ${d.getFullYear()}`;
}
