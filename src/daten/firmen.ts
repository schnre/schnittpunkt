// Lädt die Firmendaten und verbindet sie mit den eigenen Angaben (Status, Kontakt, Notizen).
import profil from '../../config/suchprofil.json';
import type { Firma, FirmenDatei, KundenStatus } from '../typen';
import { crmVon, zustand } from './zustand';

export interface Branche {
  id: string;
  name: string;
  farbe: string;
  gewicht: number;
}

export const BRANCHEN: Branche[] = profil.branchen.map(({ id, name, farbe, gewicht }) => ({ id, name, farbe, gewicht }));
const BRANCHE_NACH_ID = new Map(BRANCHEN.map((b) => [b.id, b]));
export const brancheVon = (id: string | undefined) => (id ? BRANCHE_NACH_ID.get(id) : undefined);

export const STATUS: Record<KundenStatus, { name: string; farbe: string; prio: number }> = {
  offen: { name: 'Offen', farbe: '#94a3b8', prio: 8 },
  interessant: { name: 'Interessant', farbe: '#f59e0b', prio: 14 },
  kontaktiert: { name: 'Kontaktiert', farbe: '#8b5cf6', prio: 6 },
  kunde: { name: 'Kunde', farbe: '#10b981', prio: 10 },
  'kein-interesse': { name: 'Kein Interesse', farbe: '#64748b', prio: -100 },
};
export const STATUS_LISTE = Object.keys(STATUS) as KundenStatus[];

let datei: FirmenDatei | null = null;
let ladeVersprechen: Promise<FirmenDatei> | null = null;

export function firmenLaden(): Promise<FirmenDatei> {
  const quelle: Promise<FirmenDatei> = import.meta.env.MODE === 'vorschau'
    ? import('../../public/data/firmen.json').then((m) => m.default as unknown as FirmenDatei)
    : fetch('./data/firmen.json', { cache: 'no-cache' }).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<FirmenDatei>;
    });
  ladeVersprechen ??= quelle
    .then((d) => {
      datei = d;
      indexNeuBauen();
      return d;
    });
  return ladeVersprechen;
}

export const dateiInfo = () => datei;

let alle: Firma[] = [];
let nachId = new Map<string, Firma>();

/** Nach Änderungen an eigenen Firmen aufrufen. */
export function indexNeuBauen(): void {
  alle = [...(datei?.firmen ?? []).filter((f) => !f.geloescht), ...zustand().eigeneFirmen];
  nachId = new Map(alle.map((f) => [f.id, f]));
}

export const alleFirmen = () => alle;
export const firmaVon = (id: string) => nachId.get(id);

export function statusVon(f: Firma): KundenStatus {
  return crmVon(f.id).status ?? 'offen';
}

/** Kontaktangaben: eigene Eingaben haben Vorrang vor den Registerdaten. */
export function kontaktVon(f: Firma) {
  const c = crmVon(f.id);
  return { tel: c.tel || f.tel, mail: c.mail || f.mail, web: c.web || f.web, person: c.kontakt };
}

export function adresseVon(f: Firma, mitOrt = true): string {
  return [f.strasse, mitOrt ? [f.plz, f.ort].filter(Boolean).join(' ') : ''].filter(Boolean).join(', ');
}

export function letzterBesuch(id: string): string | undefined {
  const b = crmVon(id).besuche;
  return b?.length ? [...b].sort().at(-1) : undefined;
}

/** Ist die Firma in den letzten 30 Tagen der aktuellen Abfrage dazugekommen? */
export function istNeu(f: Firma): boolean {
  return !!f.neu;
}

export function suchtext(f: Firma): string {
  return `${f.name} ${f.ort ?? ''} ${f.plz ?? ''} ${f.kanton ?? ''} ${f.zweck ?? ''}`.toLowerCase();
}
