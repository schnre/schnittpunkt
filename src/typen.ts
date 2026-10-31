// Zentrale Datentypen der App.

/** Ein Datensatz aus public/data/firmen.json (aus dem Handelsregister). */
export interface Firma {
  id: string; // UID, z. B. CHE-123.456.789
  name: string;
  rechtsform?: string;
  strasse?: string;
  zusatz?: string;
  plz?: string;
  ort?: string;
  kanton?: string;
  lat: number;
  lon: number;
  /** false = nur PLZ/Ort gefunden, Punkt liegt im Ortszentrum */
  genau?: boolean;
  zweck?: string;
  branchen: string[];
  passung: number; // 0-100
  erfasst: string; // JJJJ-MM-TT, erstmals gefunden
  eintrag?: string; // Datum der SHAB-Publikation
  auszug?: string; // Link zum kantonalen Handelsregisterauszug
  tel?: string;
  mail?: string;
  web?: string;
  quelle: 'shab' | 'zefix' | 'demo' | 'manuell';
  neu?: boolean; // in der letzten Monatsabfrage gefunden
  geloescht?: string;
}

export interface Lauf {
  datum: string;
  modus: 'monat' | 'bestand';
  von?: string;
  bis: string;
  geprueft: number;
  neu: number;
  geloescht: number;
  gesamt: number;
}

export interface FirmenDatei {
  version: 1;
  demo?: boolean;
  stand: string;
  laeufe: Lauf[];
  firmen: Firma[];
}

export type KundenStatus = 'offen' | 'interessant' | 'kontaktiert' | 'kunde' | 'kein-interesse';

/** Eigene Angaben zur Firma (bleiben im Browser, überschreiben die Registerdaten nicht). */
export interface Crm {
  status?: KundenStatus;
  notiz?: string;
  kontakt?: string; // Ansprechperson
  tel?: string;
  mail?: string;
  web?: string;
  besuche?: string[]; // JJJJ-MM-TT
  /** Wer war an welchem Tag dort: JJJJ-MM-TT -> Mitarbeiter-ID (fehlt bei älteren Einträgen) */
  besuchtVon?: Record<string, string>;
  aktualisiert?: string;
}

export interface Mitarbeiter {
  id: string;
  name: string;
  farbe: string;
  startAdresse: string;
  lat: number;
  lon: number;
}

export interface Stopp {
  firmaId: string;
  /** Fixtermin "HH:MM"; ohne Wert ist der Besuch frei planbar */
  fix?: string;
  dauer?: number; // Minuten
  erledigt?: boolean;
}

export interface Tag {
  stopps: Stopp[];
}

export interface Einstellungen {
  mitarbeiter: Mitarbeiter[];
  aktiverMitarbeiter: string;
  arbeitsbeginn: string; // "HH:MM"
  arbeitsende: string;
  besuchsdauer: number;
  thema: 'auto' | 'hell' | 'dunkel';
  github: { repo: string; token: string };
}

export interface AppZustand {
  version: 1;
  crm: Record<string, Crm>;
  /** plaene[mitarbeiterId][JJJJ-MM-TT] */
  plaene: Record<string, Record<string, Tag>>;
  eigeneFirmen: Firma[];
  einstellungen: Einstellungen;
}

export interface Punkt {
  lat: number;
  lon: number;
}
