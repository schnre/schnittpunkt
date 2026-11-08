// Interaktive Schweizer Karte: MapLibre GL (WebGL) mit den Vektor-Basiskarten von swisstopo.
//
// Warum so schnell:
// - Vektorkacheln sind deutlich kleiner als Rasterbilder und bleiben bei jeder Zoomstufe und
//   Pixeldichte scharf; Zoomen ist stufenlos, ohne Nachladen ganzer Bildkacheln.
// - Die Firmen liegen als eine GeoJSON-Quelle auf der GPU und werden als Kreis-Ebene gezeichnet.
//   Filtern tauscht nur die Daten aus; keine DOM-Elemente pro Firma.
// - Auf Handys werden Punkte bei kleinem Zoom gruppiert (Clustering im Web Worker) und die
//   Zeichenauflösung an das Gerät angepasst (siehe geraet.ts).
import maplibregl, { type ExpressionSpecification, type GeoJSONSource, type LayerSpecification, type MapGeoJSONFeature, type StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type * as GeoJSON from 'geojson';
import { STATUS, brancheVon, statusVon } from '../daten/firmen';
import type { Firma, Punkt } from '../typen';
import { profil } from './geraet';

export type Farbmodus = 'branche' | 'status';
export type Grundkarte = 'grau' | 'farbe' | 'luftbild';

const STILE: Record<Grundkarte, string> = {
  grau: 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json',
  farbe: 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.basemap.vt/style.json',
  luftbild: 'https://vectortiles.geo.admin.ch/styles/ch.swisstopo.imagerybasemap.vt/style.json',
};
const SCHRIFT = ['Frutiger Neue Condensed Bold'];

/** Vorschau-Build (eine HTML-Datei ohne Kachelserver), siehe vite.vorschau.config.ts */
export const VORSCHAU = import.meta.env.MODE === 'vorschau';

const SCHWEIZ: [[number, number], [number, number]] = [[5.85, 45.75], [10.55, 47.85]];
// Grosszügig: hohe, schmale Handy-Bildschirme brauchen vertikal viel Spielraum, sonst erzwingt maxBounds einen höheren Zoom
const GRENZEN: [[number, number], [number, number]] = [[3.2, 42.8], [13.2, 50.6]];
const AKZENT = '#e30613';

export interface KartenOptionen {
  onFirma?: (id: string) => void;
  grundkarte?: Grundkarte;
}

export interface RoutenPunkt extends Punkt {
  label: string;
  titel: string;
  art: 'start' | 'stopp' | 'fix' | 'vorschlag';
  id?: string;
}

type Sammlung = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;
const leer = (): Sammlung => ({ type: 'FeatureCollection', features: [] });

function dunkel(): boolean {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
}

export class Karte {
  readonly map: maplibregl.Map;
  private grund: Grundkarte;
  private firmen: Sammlung = leer();
  private auswahl: Sammlung = leer();
  private route: Sammlung = leer();
  private routenFarbe = AKZENT;
  private routenMarker: maplibregl.Marker[] = [];
  private tooltip?: maplibregl.Popup;
  private cluster = !VORSCHAU && profil().cluster;
  private stilDunkel = dunkel();

  constructor(private el: HTMLElement, private opt: KartenOptionen = {}) {
    this.grund = opt.grundkarte ?? 'grau';
    const p = profil();
    this.map = new maplibregl.Map({
      container: el,
      bounds: SCHWEIZ,
      // Handy: oben Suchfeld, unten das eingeklappte Listenblatt freihalten
      fitBoundsOptions: { padding: el.clientWidth <= 900 ? { top: 64, bottom: Math.min(130, el.clientHeight * 0.3), left: 6, right: 6 } : 10 },
      maxBounds: GRENZEN,
      minZoom: 5.3,
      maxZoom: 19,
      pixelRatio: p.karteDpr,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      fadeDuration: 120,
      maxTileCacheSize: 400,
      refreshExpiredTiles: false,
      cancelPendingTileRequestsWhileZooming: true,
      locale: { 'NavigationControl.ZoomIn': 'Hineinzoomen', 'NavigationControl.ZoomOut': 'Herauszoomen', 'GeolocateControl.FindMyLocation': 'Mein Standort', 'GeolocateControl.LocationNotAvailable': 'Standort nicht verfügbar' },
    });
    this.stilLaden();
    if (VORSCHAU) addEventListener('sct-vorschau', () => this.stilLaden(), { once: true });
    this.map.touchZoomRotate.disableRotation();
    this.map.keyboard.disableRotation();
    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    if (!VORSCHAU && 'geolocation' in navigator) {
      this.map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, fitBoundsOptions: { maxZoom: 13 }, showAccuracyCircle: true }), 'bottom-right');
    }
    this.map.on('style.load', () => this.eigeneEbenen());
    this.map.on('click', (e) => this.tippen(e.point));
    if (matchMedia('(hover: hover)').matches) this.hoverEinrichten();
    el.dataset.grund = this.grund;

    // Thema (hell/dunkel) folgt der App: graue Grundkarte wird passend eingefärbt
    const themaPruefen = () => {
      if (dunkel() !== this.stilDunkel) {
        this.stilDunkel = dunkel();
        if (this.grund === 'grau' || VORSCHAU) this.stilLaden();
      }
    };
    new MutationObserver(themaPruefen).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', themaPruefen);
  }

  // ---------- Stil
  private stilLaden() {
    this.map.setStyle(VORSCHAU ? vorschauStil() : STILE[this.grund], { diff: false, transformStyle: (_a, n) => this.stilAnpassen(n) });
  }

  private stilAnpassen(s: StyleSpecification): StyleSpecification {
    if (VORSCHAU || this.grund !== 'grau' || !this.stilDunkel) return s;
    return { ...s, layers: s.layers.map(nachtLayer) };
  }

  /** Eigene Quellen und Ebenen über der Grundkarte (nach jedem Stilwechsel neu). */
  private eigeneEbenen() {
    const m = this.map;
    const p = profil();
    const r = (basis: ExpressionSpecification | number): ExpressionSpecification =>
      ['interpolate', ['linear'], ['zoom'], 6, ['*', basis, 0.62 * p.punkt], 10, ['*', basis, 0.9 * p.punkt], 14, ['*', basis, 1.15 * p.punkt]];

    m.addSource('sct-firmen', {
      type: 'geojson', data: this.firmen, promoteId: 'id',
      cluster: this.cluster, clusterMaxZoom: 9, clusterRadius: 46, clusterMinPoints: 4,
      clusterProperties: { neu: ['+', ['get', 'neu']] },
      buffer: 32, tolerance: 0.5,
    });
    m.addSource('sct-auswahl', { type: 'geojson', data: this.auswahl });
    m.addSource('sct-route', { type: 'geojson', data: this.route });

    const ebenen: LayerSpecification[] = [
      { id: 'sct-route-schein', type: 'line', source: 'sct-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': this.routenFarbe, 'line-width': 8, 'line-opacity': 0.18 } },
      { id: 'sct-route-linie', type: 'line', source: 'sct-route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': this.routenFarbe, 'line-width': 3, 'line-opacity': 0.9, 'line-dasharray': [2.4, 2] } },
      {
        id: 'sct-firmen', type: 'circle', source: 'sct-firmen', filter: ['!', ['has', 'point_count']],
        layout: { 'circle-sort-key': ['get', 'z'] },
        paint: {
          'circle-radius': r(['get', 'r']),
          'circle-color': ['get', 'farbe'],
          'circle-opacity': ['get', 'op'],
          'circle-stroke-color': ['get', 'rand'],
          'circle-stroke-width': ['get', 'rw'],
          'circle-stroke-opacity': ['get', 'rop'],
          'circle-pitch-alignment': 'map',
        },
      },
      {
        id: 'sct-auswahl', type: 'circle', source: 'sct-auswahl',
        paint: { 'circle-radius': r(15), 'circle-color': AKZENT, 'circle-opacity': 0.12, 'circle-stroke-color': AKZENT, 'circle-stroke-width': 3 },
      },
    ];
    if (this.cluster) {
      ebenen.splice(2, 0,
        {
          id: 'sct-cluster', type: 'circle', source: 'sct-firmen', filter: ['has', 'point_count'],
          paint: {
            'circle-color': this.stilDunkel ? '#e9edf5' : '#1f2937',
            'circle-opacity': 0.88,
            'circle-radius': ['step', ['get', 'point_count'], 14, 20, 17, 80, 21, 250, 26],
            'circle-stroke-color': ['case', ['>', ['get', 'neu'], 0], AKZENT, '#ffffff'],
            'circle-stroke-width': ['case', ['>', ['get', 'neu'], 0], 3, 2],
          },
        },
        {
          id: 'sct-cluster-zahl', type: 'symbol', source: 'sct-firmen', filter: ['has', 'point_count'],
          layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-font': SCHRIFT, 'text-size': 13, 'text-allow-overlap': true, 'text-ignore-placement': true },
          paint: { 'text-color': this.stilDunkel ? '#0f1729' : '#ffffff' },
        });
    }
    for (const e of ebenen) m.addLayer(e);
  }

  private quelle(id: string) {
    return this.map.getSource(id) as GeoJSONSource | undefined;
  }

  grundkarteSetzen(g: Grundkarte) {
    if (VORSCHAU || g === this.grund) return;
    this.grund = g;
    this.el.dataset.grund = g;
    this.stilLaden();
  }

  get grundkarte() {
    return this.grund;
  }

  // ---------- Interaktion
  private tippen(pt: maplibregl.Point) {
    const t = profil().tippToleranz;
    const ebenen = ['sct-firmen', ...(this.cluster ? ['sct-cluster'] : [])].filter((l) => this.map.getLayer(l));
    const treffer = this.map.queryRenderedFeatures([[pt.x - t, pt.y - t], [pt.x + t, pt.y + t]], { layers: ebenen });
    if (!treffer.length) return;
    // Nächstgelegener Punkt gewinnt (wichtig bei dicht beieinander liegenden Firmen)
    const naechster = treffer.reduce((best, f) => (abstand(this.map, f, pt) < abstand(this.map, best, pt) ? f : best));
    const props = naechster.properties ?? {};
    if (props.cluster) {
      const ziel = (naechster.geometry as GeoJSON.Point).coordinates as [number, number];
      void this.quelle('sct-firmen')?.getClusterExpansionZoom(props.cluster_id as number).then((z) => {
        this.map.easeTo({ center: ziel, zoom: Math.min(z + 0.3, 14), duration: 450 });
      });
      return;
    }
    if (typeof props.id === 'string') this.opt.onFirma?.(props.id);
  }

  private hoverEinrichten() {
    this.tooltip = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10, className: 'karten-tooltip', maxWidth: '280px' });
    let aktiv: string | undefined;
    this.map.on('mousemove', 'sct-firmen', (e) => {
      const f = e.features?.[0];
      if (!f) return;
      this.map.getCanvas().style.cursor = 'pointer';
      const id = f.properties.id as string;
      if (id === aktiv) return;
      aktiv = id;
      this.tooltip!.setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number])
        .setHTML(`<strong>${esc(String(f.properties.name))}</strong><br>${esc(String(f.properties.ort ?? ''))}`)
        .addTo(this.map);
    });
    this.map.on('mouseleave', 'sct-firmen', () => {
      aktiv = undefined;
      this.map.getCanvas().style.cursor = '';
      this.tooltip?.remove();
    });
    this.map.on('mouseenter', 'sct-cluster', () => { this.map.getCanvas().style.cursor = 'zoom-in'; });
    this.map.on('mouseleave', 'sct-cluster', () => { this.map.getCanvas().style.cursor = ''; });
  }

  // ---------- Firmen
  farbeVon(f: Firma, modus: Farbmodus): string {
    return modus === 'status' ? STATUS[statusVon(f)].farbe : brancheVon(f.branchen[0])?.farbe ?? '#64748b';
  }

  /** Ersetzt die Firmenpunkte (ein einziger Datenaustausch, auch bei tausenden Firmen). */
  firmenSetzen(firmen: Firma[], modus: Farbmodus, gedimmt = false) {
    const features: GeoJSON.Feature<GeoJSON.Point, Record<string, unknown>>[] = new Array(firmen.length);
    for (let i = 0; i < firmen.length; i++) {
      const f = firmen[i];
      const status = statusVon(f);
      const blass = gedimmt || status === 'kein-interesse';
      features[i] = {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [f.lon, f.lat] },
        properties: {
          id: f.id,
          name: f.name,
          ort: [f.plz, f.ort].filter(Boolean).join(' '),
          farbe: this.farbeVon(f, modus),
          r: f.neu ? 7 : status === 'kunde' ? 6.5 : 5.5,
          rand: f.neu ? '#111827' : '#ffffff',
          rw: f.neu ? 2.5 : 1.5,
          op: blass ? 0.35 : 0.92,
          rop: gedimmt ? 0.4 : 1,
          neu: f.neu ? 1 : 0,
          // Zeichenreihenfolge: neue und Kunden oben
          z: (f.neu ? 2 : 0) + (status === 'kunde' ? 1 : 0),
        },
      };
    }
    this.firmen = { type: 'FeatureCollection', features };
    this.quelle('sct-firmen')?.setData(this.firmen);
  }

  auswaehlen(f: Firma | undefined, zentrieren = false) {
    this.auswahl = f ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [f.lon, f.lat] }, properties: {} }] } : leer();
    this.quelle('sct-auswahl')?.setData(this.auswahl);
    if (f && zentrieren) this.fliegen(f, Math.max(this.map.getZoom(), 11.5), this.sichtVersatz());
  }

  /** Auf Handys verdeckt das Detail-Blatt die untere Hälfte: Ziel in die obere Hälfte rücken. */
  private sichtVersatz(): [number, number] {
    return this.el.clientWidth <= 900 ? [0, -this.el.clientHeight * 0.22] : [0, 0];
  }

  // ---------- Route
  routeZeigen(punkte: RoutenPunkt[], farbe: string, rueckkehr = true, einpassen = true) {
    this.routeLeeren();
    if (!punkte.length) return;
    const linie = punkte.filter((p) => p.art !== 'vorschlag').map((p) => [p.lon, p.lat]);
    if (rueckkehr && linie.length > 1) linie.push(linie[0]);
    this.routenFarbe = farbe;
    this.route = linie.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: linie }, properties: {} }] } : leer();
    this.quelle('sct-route')?.setData(this.route);
    for (const l of ['sct-route-schein', 'sct-route-linie']) if (this.map.getLayer(l)) this.map.setPaintProperty(l, 'line-color', farbe);

    for (const p of punkte) {
      const el = document.createElement('div');
      el.className = `routen-marker art-${p.art}`;
      el.title = p.titel;
      const span = document.createElement('span');
      span.style.setProperty('--farbe', farbe);
      span.textContent = p.label;
      el.append(span);
      if (p.id) el.addEventListener('click', (e) => { e.stopPropagation(); this.opt.onFirma?.(p.id!); });
      const m = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(this.map);
      if (p.art !== 'vorschlag') m.getElement().style.zIndex = '2';
      this.routenMarker.push(m);
    }
    if (einpassen) this.einpassen(punkte, 12);
  }

  routeLeeren() {
    for (const m of this.routenMarker) m.remove();
    this.routenMarker = [];
    this.route = leer();
    this.quelle('sct-route')?.setData(this.route);
  }

  // ---------- Ansicht
  einpassen(punkte: Punkt[], maxZoom = 12) {
    if (!punkte.length) return;
    let w = 180, s = 90, o = -180, n = -90;
    for (const p of punkte) {
      if (p.lon < w) w = p.lon;
      if (p.lon > o) o = p.lon;
      if (p.lat < s) s = p.lat;
      if (p.lat > n) n = p.lat;
    }
    const rand = Math.min(50, this.el.clientWidth / 8);
    const unten = this.el.clientWidth <= 900 ? Math.min(this.el.clientHeight * 0.3, 260) : rand;
    this.map.fitBounds([[w, s], [o, n]], { padding: { top: rand + 50, left: rand, right: rand, bottom: unten }, maxZoom, duration: 600 });
  }

  fliegen(p: Punkt, zoom = 12, versatz: [number, number] = [0, 0]) {
    this.map.flyTo({ center: [p.lon, p.lat], zoom, offset: versatz, duration: 700, essential: true });
  }

  schwenken(p: Punkt) {
    this.map.easeTo({ center: [p.lon, p.lat], offset: this.sichtVersatz(), duration: 450 });
  }

  zoom(): number {
    return this.map.getZoom();
  }

  zentrum(): Punkt {
    const c = this.map.getCenter();
    return { lat: c.lat, lon: c.lng };
  }

  groesseAktualisieren() {
    this.map.resize();
  }
}

function abstand(map: maplibregl.Map, f: MapGeoJSONFeature, pt: maplibregl.Point) {
  const c = (f.geometry as GeoJSON.Point).coordinates as [number, number];
  return map.project(c).dist(pt);
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

// ---------- Nachtmodus für die graue Basiskarte: Helligkeit aller Farben umkehren
const FARB_EIGENSCHAFTEN = ['background-color', 'fill-color', 'fill-outline-color', 'line-color', 'text-color', 'text-halo-color', 'fill-extrusion-color', 'circle-color', 'icon-color'];

function nachtLayer(l: LayerSpecification): LayerSpecification {
  if (!('paint' in l) || !l.paint) return l;
  const paint: Record<string, unknown> = { ...l.paint };
  for (const k of FARB_EIGENSCHAFTEN) if (k in paint) paint[k] = farbenUmkehren(paint[k]);
  if (l.type === 'hillshade') {
    paint['hillshade-shadow-color'] = '#000000';
    paint['hillshade-highlight-color'] = '#2a3344';
  }
  return { ...l, paint } as LayerSpecification;
}

function farbenUmkehren(v: unknown): unknown {
  if (typeof v === 'string') return nachtFarbe(v) ?? v;
  if (Array.isArray(v)) return v.map(farbenUmkehren);
  if (v && typeof v === 'object' && 'stops' in v) {
    const o = v as { stops: [unknown, unknown][] };
    return { ...o, stops: o.stops.map(([z, f]) => [z, farbenUmkehren(f)]) };
  }
  return v;
}

/** Wandelt eine CSS-Farbe in ihre "Nacht"-Variante (Helligkeit gespiegelt, etwas entsättigt). */
export function nachtFarbe(s: string): string | undefined {
  const rgba = farbeLesen(s);
  if (!rgba) return undefined;
  const [r, g, b, a] = rgba;
  const max = Math.max(r, g, b) / 255, min = Math.min(r, g, b) / 255;
  let hue = 0;
  const l = (max + min) / 2;
  const d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    const rr = r / 255, gg = g / 255, bb = b / 255;
    hue = max === rr ? ((gg - bb) / d) % 6 : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
    hue = (hue * 60 + 360) % 360;
  }
  const l2 = 0.07 + (1 - l) * 0.78;
  return `hsla(${hue.toFixed(0)}, ${(sat * 70).toFixed(0)}%, ${(l2 * 100).toFixed(0)}%, ${a})`;
}

function farbeLesen(s: string): [number, number, number, number] | undefined {
  const t = s.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(t);
  if (m) {
    const x = m[1];
    if (x.length === 3 || x.length === 4) return [parseInt(x[0] + x[0], 16), parseInt(x[1] + x[1], 16), parseInt(x[2] + x[2], 16), x.length === 4 ? parseInt(x[3] + x[3], 16) / 255 : 1];
    if (x.length === 6 || x.length === 8) return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16), x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1];
    return undefined;
  }
  m = /^rgba?\(([^)]+)\)$/.exec(t);
  if (m) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length >= 3 && p.every((n) => !Number.isNaN(n))) return [p[0], p[1], p[2], p[3] ?? 1];
    return undefined;
  }
  m = /^hsla?\(([^)]+)\)$/.exec(t);
  if (m) {
    const p = m[1].replace(/%/g, '').split(/[\s,/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some((n) => Number.isNaN(n))) return undefined;
    const [h, sa, li] = [p[0], p[1] / 100, p[2] / 100];
    const k = (n: number) => (n + h / 30) % 12;
    const a = sa * Math.min(li, 1 - li);
    const f = (n: number) => Math.round(255 * (li - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))));
    return [f(0), f(8), f(4), p[3] ?? 1];
  }
  if (t === 'white') return [255, 255, 255, 1];
  if (t === 'black') return [0, 0, 0, 1];
  return undefined;
}

// ---------- Vorschau ohne Kachelserver: Schweiz, Kantone und Seen als Vektorumriss
let vorschauDaten: Record<string, GeoJSON.GeoJsonObject> | undefined;
function vorschauStil(): StyleSpecification {
  const css = getComputedStyle(document.documentElement);
  const farbe = (n: string) => css.getPropertyValue(n).trim() || '#ccc';
  const leerQuelle = { type: 'geojson' as const, data: leer() };
  if (!vorschauDaten) {
    void import('../vorschau/schweiz.json').then((m) => {
      vorschauDaten = m.default as unknown as Record<string, GeoJSON.GeoJsonObject>;
      dispatchEvent(new Event('sct-vorschau'));
    });
  }
  const d = vorschauDaten;
  return {
    version: 8,
    sources: {
      land: d ? { type: 'geojson', data: d.country as GeoJSON.GeoJSON } : leerQuelle,
      grenzen: d ? { type: 'geojson', data: d.grenzen as GeoJSON.GeoJSON } : leerQuelle,
      seen: d ? { type: 'geojson', data: d.lakes as GeoJSON.GeoJSON } : leerQuelle,
    },
    layers: [
      { id: 'hg', type: 'background', paint: { 'background-color': farbe('--flaeche-2') } },
      { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': farbe('--flaeche') } },
      { id: 'land-rand', type: 'line', source: 'land', paint: { 'line-color': farbe('--rand-stark'), 'line-width': 1.5 } },
      { id: 'grenzen', type: 'line', source: 'grenzen', paint: { 'line-color': farbe('--rand-stark'), 'line-width': 0.8, 'line-dasharray': [3, 3] } },
      { id: 'seen', type: 'fill', source: 'seen', paint: { 'fill-color': '#a9cbe3', 'fill-opacity': 0.7, 'fill-outline-color': '#7fb3d5' } },
    ],
  };
}
