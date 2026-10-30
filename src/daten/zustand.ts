// App-Zustand im localStorage: eigene Notizen/Status, Wochenpläne, Einstellungen.
// Jeder Zugriff ist abgesichert; ohne Speicher läuft die App im Arbeitsspeicher weiter.
import type { AppZustand, Crm, Einstellungen, Tag } from '../typen';

const SCHLUESSEL = 'schnittpunkt:v1';

/** Firmensitz SC-Technologie AG, Zürcherstrasse 378, 8500 Frauenfeld */
export const SCT_SITZ = { adresse: 'Zürcherstrasse 378, 8500 Frauenfeld', lat: 47.55108, lon: 8.87879 };

export function standardEinstellungen(): Einstellungen {
  return {
    mitarbeiter: [
      { id: 'm1', name: 'Aussendienst 1', farbe: '#e11d48', startAdresse: SCT_SITZ.adresse, lat: SCT_SITZ.lat, lon: SCT_SITZ.lon },
      { id: 'm2', name: 'Aussendienst 2', farbe: '#2563eb', startAdresse: SCT_SITZ.adresse, lat: SCT_SITZ.lat, lon: SCT_SITZ.lon },
    ],
    aktiverMitarbeiter: 'm1',
    arbeitsbeginn: '07:30',
    arbeitsende: '17:30',
    besuchsdauer: 45,
    thema: 'auto',
    github: { repo: '', token: '' },
  };
}

export function leererZustand(): AppZustand {
  return { version: 1, crm: {}, plaene: {}, eigeneFirmen: [], einstellungen: standardEinstellungen() };
}

/** Macht aus beliebigem (importiertem/altem) JSON einen gültigen Zustand. */
export function normalisieren(roh: unknown): AppZustand {
  const z = leererZustand();
  if (!roh || typeof roh !== 'object') return z;
  const r = roh as Partial<AppZustand>;
  if (r.crm && typeof r.crm === 'object') z.crm = r.crm as Record<string, Crm>;
  if (r.plaene && typeof r.plaene === 'object') z.plaene = r.plaene as Record<string, Record<string, Tag>>;
  if (Array.isArray(r.eigeneFirmen)) z.eigeneFirmen = r.eigeneFirmen;
  if (r.einstellungen && typeof r.einstellungen === 'object') {
    z.einstellungen = { ...z.einstellungen, ...r.einstellungen, github: { ...z.einstellungen.github, ...(r.einstellungen.github ?? {}) } };
    if (!Array.isArray(z.einstellungen.mitarbeiter) || z.einstellungen.mitarbeiter.length === 0) {
      z.einstellungen.mitarbeiter = standardEinstellungen().mitarbeiter;
    }
  }
  return z;
}

let zustandCache: AppZustand | null = null;
const beobachter = new Set<() => void>();

export function zustand(): AppZustand {
  if (!zustandCache) {
    try {
      const roh = localStorage.getItem(SCHLUESSEL);
      zustandCache = roh ? normalisieren(JSON.parse(roh)) : leererZustand();
    } catch {
      zustandCache = leererZustand();
    }
  }
  return zustandCache;
}

let speicherTimer: ReturnType<typeof setTimeout> | undefined;

/** Ändert den Zustand, speichert gebündelt und benachrichtigt die Ansichten. */
export function aendern(fn: (z: AppZustand) => void): void {
  fn(zustand());
  clearTimeout(speicherTimer);
  speicherTimer = setTimeout(() => {
    try {
      localStorage.setItem(SCHLUESSEL, JSON.stringify(zustand()));
    } catch {
      /* Speicher voll oder gesperrt: im Arbeitsspeicher weiterarbeiten */
    }
  }, 150);
  for (const b of beobachter) b();
}

export function beobachten(fn: () => void): () => void {
  beobachter.add(fn);
  return () => beobachter.delete(fn);
}

export function ersetzen(neu: AppZustand): void {
  zustandCache = neu;
  aendern(() => {});
}

export function crmVon(id: string): Crm {
  return zustand().crm[id] ?? {};
}

export function crmSetzen(id: string, teil: Partial<Crm>): void {
  aendern((z) => {
    z.crm[id] = { ...z.crm[id], ...teil, aktualisiert: new Date().toISOString() };
  });
}

export function tagVon(mitarbeiterId: string, datum: string): Tag {
  return zustand().plaene[mitarbeiterId]?.[datum] ?? { stopps: [] };
}

export function tagSetzen(mitarbeiterId: string, datum: string, tag: Tag): void {
  aendern((z) => {
    z.plaene[mitarbeiterId] ??= {};
    if (tag.stopps.length) z.plaene[mitarbeiterId][datum] = tag;
    else delete z.plaene[mitarbeiterId][datum];
  });
}

export function aktiverMitarbeiter() {
  const e = zustand().einstellungen;
  return e.mitarbeiter.find((m) => m.id === e.aktiverMitarbeiter) ?? e.mitarbeiter[0];
}
