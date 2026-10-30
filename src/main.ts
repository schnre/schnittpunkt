// Einstiegspunkt: App-Schale, Navigation, Hash-Router, Thema, Service Worker.
import '@fontsource-variable/inter/wght.css';
import './styles.css';
import { dateiInfo, firmenLaden } from './daten/firmen';
import { beobachten, zustand } from './daten/zustand';
import { h, leeren } from './ui/dom';
import { icon, type IconName } from './ui/icons';
import { routeLesen, type Ansicht } from './ui/router';

const app = document.getElementById('app')!;

const NAV: { route: string; name: string; icon: IconName }[] = [
  { route: 'karte', name: 'Karte', icon: 'karte' },
  { route: 'woche', name: 'Woche', icon: 'kalender' },
  { route: 'firmen', name: 'Firmen', icon: 'liste' },
  { route: 'register', name: 'Register', icon: 'register' },
  { route: 'einstellungen', name: 'Einstellungen', icon: 'einstellungen' },
];

const neuBadge = h('span', { class: 'nav-badge', hidden: true });
const navLinks = NAV.map((n) =>
  h('a', { class: 'nav-link', href: `#/${n.route}`, 'data-route': n.route },
    icon(n.icon), h('span', {}, n.name), n.route === 'register' ? neuBadge : null));

const marke = h('a', { class: 'marke', href: '#/karte', 'aria-label': 'SC-T Aussendienst' },
  h('span', { class: 'marke-logo', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24"><rect x="9.5" y="4" width="5" height="16" rx="1" fill="#fff"/><rect x="4" y="9.5" width="16" height="5" rx="1" fill="#fff"/></svg>' }),
  h('span', { class: 'marke-text' }, 'SC-T'));

const nav = h('nav', { class: 'app-nav', 'aria-label': 'Hauptnavigation' }, marke, h('div', { class: 'nav-links' }, navLinks));
const inhalt = h('main', { id: 'inhalt', class: 'app-inhalt', tabindex: -1 });
leeren(app);
app.append(h('div', { class: 'schale' }, nav, inhalt));

function themaAnwenden() {
  const t = zustand().einstellungen.thema;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t === 'dunkel' ? 'dark' : 'light';
}
themaAnwenden();
beobachten(themaAnwenden);

// Ansichten werden erst beim ersten Aufruf geladen (eigene Chunks; Leaflet nur bei Bedarf).
const LADER: Record<string, () => Promise<Ansicht>> = {
  karte: () => import('./ui/ansichtKarte').then((m) => m.karteAnsicht()),
  woche: () => import('./ui/ansichtWoche').then((m) => m.wocheAnsicht()),
  firmen: () => import('./ui/ansichtFirmen').then((m) => m.firmenAnsicht()),
  register: () => import('./ui/ansichtRegister').then((m) => m.registerAnsicht()),
  einstellungen: () => import('./ui/ansichtEinstellungen').then((m) => m.einstellungenAnsicht()),
};
const ansichten = new Map<string, Promise<Ansicht>>();
let aktuell: Ansicht | undefined;
let routenZaehler = 0;

async function route() {
  const nr = ++routenZaehler;
  let { name, params } = routeLesen();
  if (!LADER[name]) name = 'karte';
  for (const a of navLinks) a.classList.toggle('aktiv', a.dataset.route === name);
  for (const a of navLinks) a.toggleAttribute('aria-current', a.dataset.route === name);
  if (!ansichten.has(name)) ansichten.set(name, LADER[name]());
  const ansicht = await ansichten.get(name)!;
  if (nr !== routenZaehler) return; // inzwischen weiter navigiert
  if (aktuell !== ansicht) {
    leeren(inhalt);
    inhalt.append(ansicht.el);
    inhalt.dataset.ansicht = name;
    aktuell = ansicht;
  }
  document.title = `${ansicht.titel} · SC-T Aussendienst`;
  ansicht.anzeigen(params);
}

inhalt.append(h('div', { class: 'laden' }, h('div', { class: 'laden-punkt' }), 'Firmen werden geladen …'));

firmenLaden()
  .then((d) => {
    const neu = d.firmen.filter((f) => f.neu && !f.geloescht).length;
    neuBadge.hidden = neu === 0;
    neuBadge.textContent = String(neu);
    neuBadge.setAttribute('aria-label', `${neu} neue Firmen`);
    window.addEventListener('hashchange', route);
    return route();
  })
  .catch((e) => {
    leeren(inhalt);
    inhalt.append(h('div', { class: 'fehler-box' }, h('h2', {}, 'Firmendaten konnten nicht geladen werden'),
      h('p', {}, `${(e as Error).message}. Bitte Internetverbindung prüfen und neu laden.`),
      h('button', { class: 'knopf primaer', onClick: () => location.reload() }, 'Neu laden')));
  });

// Offline-Fähigkeit (nur im gebauten Zustand, nicht im Entwicklungsserver)
if ('serviceWorker' in navigator && import.meta.env.MODE === 'production') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Für Tests und Fehlersuche
(window as unknown as { __sct: unknown }).__sct = { dateiInfo };
