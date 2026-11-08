// Geräteerkennung: Modell (soweit der Browser es verrät), Grössenklasse, Touch und Leistung.
// Daraus entsteht ein Darstellungsprofil: CSS-Variablen/Attribute auf <html> für Skalierung und
// Touch-Ziele sowie Kartenparameter (Pixeldichte, Punktgrösse, Clustering).
//
// Woher das Modell kommt:
// - Android (Chrome, Edge, Samsung Internet): User-Agent Client Hints liefern die Modellnummer
//   (z. B. "SM-S921B" oder "Pixel 8"). Bekannte Samsung-Nummern werden in Namen übersetzt.
// - iPhone/iPad: Safari verrät kein Modell. Bildschirmgrösse in Punkten und Pixeldichte
//   ergeben aber eine eindeutige Gerätefamilie (z. B. 393×852 @3x = iPhone 14 Pro/15/16).

export type GeraeteTyp = 'telefon' | 'tablet' | 'desktop';
export type Groessenklasse = 'kompakt' | 'normal' | 'gross';
export type UiGroesse = 'auto' | 'klein' | 'normal' | 'gross';

export interface Geraet {
  /** Lesbarer Name, z. B. "iPhone 15 Pro" oder "Samsung Galaxy S24" */
  name: string;
  /** Rohe Modellkennung, falls bekannt (z. B. "SM-S921B") */
  modell?: string;
  typ: GeraeteTyp;
  klasse: Groessenklasse;
  /** Bildschirm in CSS-Pixeln (Hochformat: kurze Seite zuerst) */
  breite: number;
  hoehe: number;
  dpr: number;
  touch: boolean;
  leistung: 'niedrig' | 'normal' | 'hoch';
}

export interface Profil {
  /** Faktor für Schrift und Bedienelemente auf Touch-Geräten */
  skala: number;
  /** Mindesthöhe für antippbare Elemente in px */
  ziel: number;
  /** Höchste Pixeldichte, mit der die Karte zeichnet (spart GPU und Akku bei 3×-Displays) */
  karteDpr: number;
  /** Faktor für Firmenpunkte auf der Karte */
  punkt: number;
  /** Punkte bei kleinem Zoom zu Gruppen zusammenfassen */
  cluster: boolean;
  /** Toleranz beim Antippen eines Punkts in px */
  tippToleranz: number;
}

// ---------- iPhone/iPad nach Bildschirm (Punkte, Hochformat) und Pixeldichte
const IPHONES: [w: number, h: number, dpr: number, name: string][] = [
  [320, 568, 2, 'iPhone SE (1. Gen.) / 5s'],
  [375, 667, 2, 'iPhone SE / 6–8'],
  [414, 736, 3, 'iPhone 6–8 Plus'],
  [375, 812, 3, 'iPhone X/XS/11 Pro/12 mini/13 mini'],
  [414, 896, 2, 'iPhone XR / 11'],
  [414, 896, 3, 'iPhone XS Max / 11 Pro Max'],
  [390, 844, 3, 'iPhone 12–14 / 16e'],
  [428, 926, 3, 'iPhone 12/13 Pro Max / 14 Plus'],
  [393, 852, 3, 'iPhone 14 Pro / 15 / 16'],
  [430, 932, 3, 'iPhone 14 Pro Max / 15 Plus / 16 Plus'],
  [402, 874, 3, 'iPhone 16 Pro / 17'],
  [420, 912, 3, 'iPhone Air'],
  [440, 956, 3, 'iPhone 16 Pro Max / 17 Pro Max'],
];

export function iphoneName(breite: number, hoehe: number, dpr: number): string | undefined {
  const w = Math.min(breite, hoehe);
  const h = Math.max(breite, hoehe);
  return IPHONES.find((x) => x[0] === w && x[1] === h && x[2] === Math.round(dpr))?.[3];
}

// ---------- Android-Modellnummern
const SAMSUNG: [RegExp, string][] = [
  [/^SM-S93/, 'Galaxy S25'], [/^SM-S92/, 'Galaxy S24'], [/^SM-S91/, 'Galaxy S23'], [/^SM-S90/, 'Galaxy S22'],
  [/^SM-G99/, 'Galaxy S21'], [/^SM-G98/, 'Galaxy S20'], [/^SM-S7[12]/, 'Galaxy S23/S24 FE'],
  [/^SM-F9/, 'Galaxy Z Fold'], [/^SM-F7/, 'Galaxy Z Flip'],
  [/^SM-A(\d)(\d)/, 'Galaxy A$1$2'], [/^SM-M(\d)(\d)/, 'Galaxy M$1$2'], [/^SM-X/, 'Galaxy Tab S'], [/^SM-T/, 'Galaxy Tab'],
  [/^SM-G/, 'Galaxy'], [/^SM-N/, 'Galaxy Note'],
];

export function androidName(modell: string): string {
  const m = modell.trim();
  for (const [re, name] of SAMSUNG) {
    const t = re.exec(m);
    if (t) return `Samsung ${name.replace(/\$(\d)/g, (_, i: string) => t[Number(i)] ?? '')}`;
  }
  if (/^Pixel/i.test(m)) return `Google ${m}`;
  return m;
}

// ---------- Klassifizierung (rein, testbar)
/** mobilOS: iOS, iPadOS oder Android (Touch-Laptops mit Windows bleiben "desktop"). */
export function klassifizieren(e: { breite: number; hoehe: number; mobilOS: boolean; speicher?: number; kerne?: number }): Pick<Geraet, 'typ' | 'klasse' | 'leistung'> {
  const kurz = Math.min(e.breite, e.hoehe);
  const typ: GeraeteTyp = !e.mobilOS ? 'desktop' : kurz >= 600 ? 'tablet' : 'telefon';
  const klasse: Groessenklasse = kurz <= 360 ? 'kompakt' : kurz >= 412 ? 'gross' : 'normal';
  // Safari meldet weder Speicher noch echte Kernzahl: ohne Angabe von "normal" ausgehen
  const speicher = e.speicher ?? 4;
  const kerne = e.kerne ?? 4;
  const leistung = speicher <= 2 || kerne <= 2 ? 'niedrig' : speicher >= 8 && kerne >= 8 ? 'hoch' : 'normal';
  return { typ, klasse, leistung };
}

export function profilVon(g: Geraet, wahl: UiGroesse = 'auto'): Profil {
  const basis = g.typ === 'desktop' ? 1 : g.typ === 'tablet' ? 1.04 : { kompakt: 0.94, normal: 1, gross: 1.04 }[g.klasse];
  const faktor = { auto: 1, klein: 0.92, normal: 1, gross: 1.1 }[wahl];
  const skala = Math.round(basis * faktor * 100) / 100;
  const maxDpr = g.leistung === 'niedrig' ? 1.5 : g.typ === 'desktop' ? 2 : 2.25;
  return {
    skala,
    ziel: g.touch ? Math.round(44 * Math.max(1, Math.min(skala, 1.08))) : 34,
    karteDpr: Math.min(g.dpr || 1, maxDpr),
    punkt: g.typ === 'telefon' ? (g.klasse === 'kompakt' ? 0.9 : 1) * faktor : g.touch ? 1.1 : 1,
    cluster: g.typ === 'telefon',
    tippToleranz: g.touch ? 16 : 6,
  };
}

// ---------- Erkennung im Browser
interface UaDaten {
  mobile?: boolean;
  platform?: string;
  getHighEntropyValues?(h: string[]): Promise<{ model?: string; platform?: string }>;
}

function grundwerte() {
  const nav = navigator as Navigator & { userAgentData?: UaDaten; deviceMemory?: number };
  const ua = navigator.userAgent;
  // any-pointer: auch Touch-Laptops bekommen grössere Ziele; reine Maus-Geräte nicht
  const touch = matchMedia('(any-pointer: coarse)').matches;
  const breite = Math.min(screen.width, screen.height);
  const hoehe = Math.max(screen.width, screen.height);
  const dpr = window.devicePixelRatio || 1;
  const ios = /iPhone|iPod/.test(ua);
  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua) || nav.userAgentData?.platform === 'Android';
  return { nav, ua, touch, breite, hoehe, dpr, ios, ipad, android };
}

export function geraetErkennen(): Geraet {
  const w = grundwerte();
  const k = klassifizieren({ breite: w.breite, hoehe: w.hoehe, mobilOS: w.ios || w.ipad || w.android, speicher: w.nav.deviceMemory, kerne: navigator.hardwareConcurrency });
  let name = k.typ === 'desktop' ? 'Computer' : k.typ === 'tablet' ? 'Tablet' : 'Smartphone';
  let modell: string | undefined;
  if (w.ios) name = iphoneName(w.breite, w.hoehe, w.dpr) ?? 'iPhone';
  else if (w.ipad) name = 'iPad';
  else if (w.android) {
    // Ohne Client Hints (z. B. Firefox) steht das Modell manchmal noch im User-Agent
    const m = /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(w.ua)?.[1];
    if (m && m !== 'K') { modell = m; name = androidName(m); } else name = k.typ === 'tablet' ? 'Android-Tablet' : 'Android-Smartphone';
  }
  return { name, modell, ...k, breite: w.breite, hoehe: w.hoehe, dpr: w.dpr, touch: w.touch };
}

/** Fragt das genaue Modell über Client Hints nach (nur Chromium auf Android). */
export async function modellNachladen(g: Geraet): Promise<Geraet> {
  const ua = (navigator as Navigator & { userAgentData?: UaDaten }).userAgentData;
  if (!ua?.getHighEntropyValues) return g;
  try {
    const { model } = await ua.getHighEntropyValues(['model']);
    if (model) return { ...g, modell: model, name: androidName(model) };
  } catch { /* nicht erlaubt */ }
  return g;
}

// ---------- Anwenden
let aktuell: Geraet | undefined;
let aktuellesProfil: Profil | undefined;
let wahl: UiGroesse = 'auto';
const beobachter = new Set<(g: Geraet, p: Profil) => void>();

export function geraet(): Geraet {
  return (aktuell ??= geraetErkennen());
}

export function profil(): Profil {
  return (aktuellesProfil ??= profilVon(geraet(), wahl));
}

function anwenden() {
  const g = geraet();
  const p = (aktuellesProfil = profilVon(g, wahl));
  const r = document.documentElement;
  r.dataset.geraet = g.typ;
  r.dataset.klasse = g.klasse;
  r.toggleAttribute('data-touch', g.touch);
  r.style.setProperty('--skala', String(p.skala));
  r.style.setProperty('--ziel', `${p.ziel}px`);
  for (const b of beobachter) b(g, p);
}

/** Einmal beim Start aufrufen. Aktualisiert bei Drehen/Grössenänderung und nach den Client Hints. */
export function geraetStarten(uiGroesse: UiGroesse = 'auto') {
  wahl = uiGroesse;
  aktuell = geraetErkennen();
  anwenden();
  void modellNachladen(aktuell).then((g) => { if (g !== aktuell) { aktuell = g; anwenden(); } });
  let t: ReturnType<typeof setTimeout>;
  const neu = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      const vorher = aktuell;
      const g = geraetErkennen();
      aktuell = { ...g, name: vorher?.modell ? vorher.name : g.name, modell: vorher?.modell ?? g.modell };
      anwenden();
    }, 200);
  };
  window.addEventListener('orientationchange', neu);
  matchMedia('(pointer: coarse)').addEventListener?.('change', neu);
}

export function uiGroesseSetzen(g: UiGroesse) {
  if (g === wahl) return;
  wahl = g;
  anwenden();
}

export function geraetBeobachten(fn: (g: Geraet, p: Profil) => void): () => void {
  beobachter.add(fn);
  return () => beobachter.delete(fn);
}
