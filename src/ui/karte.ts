// Interaktive Schweizer Karte (Leaflet + swisstopo-Kacheln).
// Firmen werden als Kreise auf einer Canvas-Ebene gezeichnet: tausende Punkte bleiben flüssig,
// ohne Clustering und ohne einzelne DOM-Elemente pro Firma.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { STATUS, brancheVon, statusVon } from '../daten/firmen';
import type { Firma, Punkt } from '../typen';

export type Farbmodus = 'branche' | 'status';
export type Grundkarte = 'grau' | 'farbe' | 'luftbild';

const KACHELN: Record<Grundkarte, { ebene: string; format: string; max: number }> = {
  grau: { ebene: 'ch.swisstopo.pixelkarte-grau', format: 'jpeg', max: 18 },
  farbe: { ebene: 'ch.swisstopo.pixelkarte-farbe', format: 'jpeg', max: 18 },
  luftbild: { ebene: 'ch.swisstopo.swissimage', format: 'jpeg', max: 19 },
};

/** Vorschau-Build (eine HTML-Datei ohne Kachelserver), siehe vite.vorschau.config.ts */
export const VORSCHAU = import.meta.env.MODE === 'vorschau';

const SCHWEIZ = L.latLngBounds([45.75, 5.85], [47.85, 10.55]);

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

export class Karte {
  readonly map: L.Map;
  private renderer = L.canvas({ padding: 0.3, tolerance: 6 });
  private kacheln: L.TileLayer;
  private firmenEbene = L.layerGroup();
  private markerNachId = new Map<string, L.CircleMarker>();
  private auswahl?: L.CircleMarker;
  private routenEbene = L.layerGroup();
  private grund: Grundkarte;

  constructor(el: HTMLElement, private opt: KartenOptionen = {}) {
    this.map = L.map(el, {
      zoomControl: false,
      minZoom: 7,
      maxZoom: 19,
      maxBounds: SCHWEIZ.pad(0.25),
      maxBoundsViscosity: 0.8,
      preferCanvas: true,
      attributionControl: true,
    }).fitBounds(SCHWEIZ, { padding: [10, 10] });
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Hineinzoomen', zoomOutTitle: 'Herauszoomen' }).addTo(this.map);
    this.map.attributionControl.setPrefix(false);
    this.grund = opt.grundkarte ?? 'grau';
    this.kacheln = this.kachelEbene(this.grund);
    if (VORSCHAU) void this.umrissZeichnen();
    else this.kacheln.addTo(this.map);
    this.firmenEbene.addTo(this.map);
    this.routenEbene.addTo(this.map);
    el.dataset.grund = this.grund;
  }

  private kachelEbene(g: Grundkarte) {
    const k = KACHELN[g];
    return L.tileLayer(`https://wmts.geo.admin.ch/1.0.0/${k.ebene}/default/current/3857/{z}/{x}/{y}.${k.format}`, {
      maxNativeZoom: k.max,
      maxZoom: 19,
      attribution: '© <a href="https://www.swisstopo.admin.ch/" target="_blank" rel="noopener">swisstopo</a>',
      crossOrigin: true,
      updateWhenIdle: true,
      keepBuffer: 3,
    });
  }

  /** Vorschau ohne Kachelserver: Schweiz, Kantone und Seen als Vektorumriss. */
  private async umrissZeichnen() {
    const d = (await import('../vorschau/schweiz.json')).default as unknown as Record<string, GeoJSON.GeoJsonObject>;
    const css = getComputedStyle(document.documentElement);
    const farbe = (n: string) => css.getPropertyValue(n).trim();
    // Eigene Ebene unter den Firmenpunkten (wie die Kacheln), sonst verdeckt der Umriss die Punkte
    this.map.createPane('umriss').style.zIndex = '250';
    const renderer = L.svg({ pane: 'umriss' });
    L.geoJSON(d.country, { style: { color: farbe('--rand-stark'), weight: 1.5, fillColor: farbe('--flaeche'), fillOpacity: 1 }, interactive: false, pane: 'umriss', renderer } as L.GeoJSONOptions).addTo(this.map);
    L.geoJSON(d.grenzen, { style: { color: farbe('--rand-stark'), weight: 0.8, dashArray: '3 3' }, interactive: false, pane: 'umriss', renderer } as L.GeoJSONOptions).addTo(this.map);
    L.geoJSON(d.lakes, { style: { color: '#7fb3d5', weight: 0.5, fillColor: '#a9cbe3', fillOpacity: 0.7 }, interactive: false, pane: 'umriss', renderer } as L.GeoJSONOptions).addTo(this.map);
    this.map.attributionControl.addAttribution('Umrisse © BFS/swisstopo (Vorschau)');
  }

  grundkarteSetzen(g: Grundkarte) {
    if (VORSCHAU || g === this.grund) return;
    this.map.removeLayer(this.kacheln);
    this.grund = g;
    this.kacheln = this.kachelEbene(g).addTo(this.map);
    this.kacheln.bringToBack();
    this.map.getContainer().dataset.grund = g;
  }

  get grundkarte() {
    return this.grund;
  }

  farbeVon(f: Firma, modus: Farbmodus): string {
    return modus === 'status' ? STATUS[statusVon(f)].farbe : brancheVon(f.branchen[0])?.farbe ?? '#64748b';
  }

  /** Zeichnet die Firmen neu (schnell, auch bei tausenden Punkten). */
  firmenSetzen(firmen: Firma[], modus: Farbmodus, gedimmt = false) {
    this.firmenEbene.clearLayers();
    this.markerNachId.clear();
    for (const f of firmen) {
      const farbe = this.farbeVon(f, modus);
      const status = statusVon(f);
      const m = L.circleMarker([f.lat, f.lon], {
        renderer: this.renderer,
        radius: f.neu ? 7 : status === 'kunde' ? 6.5 : 5.5,
        color: f.neu ? '#111827' : '#ffffff',
        weight: f.neu ? 2.5 : 1.5,
        fillColor: farbe,
        fillOpacity: gedimmt ? 0.35 : status === 'kein-interesse' ? 0.35 : 0.92,
        opacity: gedimmt ? 0.4 : 1,
      });
      m.bindTooltip(`<strong>${esc(f.name)}</strong><br>${esc([f.plz, f.ort].filter(Boolean).join(' '))}`, {
        direction: 'top',
        offset: [0, -6],
        className: 'karten-tooltip',
      });
      m.on('click', () => this.opt.onFirma?.(f.id));
      m.addTo(this.firmenEbene);
      this.markerNachId.set(f.id, m);
    }
  }

  auswaehlen(f: Firma | undefined, zentrieren = false) {
    this.auswahl?.remove();
    this.auswahl = undefined;
    if (!f) return;
    this.auswahl = L.circleMarker([f.lat, f.lon], {
      renderer: this.renderer,
      radius: 12,
      color: '#e30613', // Canvas kennt keine CSS-Variablen
      weight: 3,
      fillOpacity: 0,
      interactive: false,
      className: 'auswahl-ring',
    }).addTo(this.map);
    if (zentrieren) {
      const z = Math.max(this.map.getZoom(), 12);
      this.map.flyTo([f.lat, f.lon], z, { duration: 0.6 });
    }
  }

  /** Route mit nummerierten Stopps zeichnen. */
  routeZeigen(punkte: RoutenPunkt[], farbe: string, rueckkehr = true, einpassen = true) {
    this.routenEbene.clearLayers();
    if (!punkte.length) return;
    const linie = punkte.filter((p) => p.art !== 'vorschlag').map((p) => [p.lat, p.lon] as L.LatLngTuple);
    if (rueckkehr && linie.length > 1) linie.push(linie[0]);
    if (linie.length > 1) {
      L.polyline(linie, { color: farbe, weight: 7, opacity: 0.18, interactive: false }).addTo(this.routenEbene);
      L.polyline(linie, { color: farbe, weight: 3, opacity: 0.9, dashArray: '8 7', interactive: false }).addTo(this.routenEbene);
    }
    for (const p of punkte) {
      const icon = L.divIcon({
        className: `routen-marker art-${p.art}`,
        html: `<span style="--farbe:${farbe}">${esc(p.label)}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const m = L.marker([p.lat, p.lon], { icon, title: p.titel, zIndexOffset: p.art === 'vorschlag' ? 0 : 1000, keyboard: false });
      if (p.id) m.on('click', () => this.opt.onFirma?.(p.id!));
      m.addTo(this.routenEbene);
    }
    if (einpassen) {
      const b = L.latLngBounds(punkte.map((p) => [p.lat, p.lon] as L.LatLngTuple));
      this.map.fitBounds(b, { padding: [50, 50], maxZoom: 13 });
    }
  }

  routeLeeren() {
    this.routenEbene.clearLayers();
  }

  einpassen(firmen: Punkt[]) {
    if (!firmen.length) return;
    this.map.fitBounds(L.latLngBounds(firmen.map((f) => [f.lat, f.lon] as L.LatLngTuple)), { padding: [40, 40], maxZoom: 13 });
  }

  zentrum(): Punkt {
    const c = this.map.getCenter();
    return { lat: c.lat, lon: c.lng };
  }

  groesseAktualisieren() {
    this.map.invalidateSize({ pan: false });
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
