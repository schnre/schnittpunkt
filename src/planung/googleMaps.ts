// Übergabe an Google Maps über "Maps URLs" (kein API-Schlüssel nötig).
// https://developers.google.com/maps/documentation/urls/get-started#directions-action
// Google erlaubt höchstens 9 Zwischenstopps pro Link. Längere Touren werden in mehrere
// Etappen aufgeteilt, wobei jede Etappe dort beginnt, wo die vorige aufgehört hat.

export interface Wegpunkt {
  /** Adresse als Text ("Strasse 1, 8500 Frauenfeld") oder leer */
  adresse?: string;
  lat: number;
  lon: number;
}

export const MAX_ZWISCHENSTOPPS = 9;

function ziel(w: Wegpunkt): string {
  // Adresse ist für Google zuverlässiger (richtiger Eingang, Firmenname); sonst Koordinaten.
  return w.adresse?.trim() ? w.adresse.trim() : `${w.lat.toFixed(5)},${w.lon.toFixed(5)}`;
}

/** Ein Link für Start -> Stopps -> Ziel. */
export function routenLink(start: Wegpunkt, stopps: Wegpunkt[], ende: Wegpunkt): string {
  const q = new URLSearchParams({ api: '1', origin: ziel(start), destination: ziel(ende), travelmode: 'driving' });
  if (stopps.length) q.set('waypoints', stopps.map(ziel).join('|'));
  return `https://www.google.com/maps/dir/?${q}`;
}

/** Teilt eine lange Tour in Etappen mit je höchstens 9 Zwischenstopps. */
export function routenLinks(start: Wegpunkt, stopps: Wegpunkt[], ende: Wegpunkt): string[] {
  if (stopps.length <= MAX_ZWISCHENSTOPPS) return [routenLink(start, stopps, ende)];
  const links: string[] = [];
  let von = start;
  let rest = [...stopps];
  while (rest.length > MAX_ZWISCHENSTOPPS) {
    // Etappe: 9 Zwischenstopps, Ziel ist der 10. Stopp
    const etappe = rest.slice(0, MAX_ZWISCHENSTOPPS);
    const etappenZiel = rest[MAX_ZWISCHENSTOPPS];
    links.push(routenLink(von, etappe, etappenZiel));
    von = etappenZiel;
    rest = rest.slice(MAX_ZWISCHENSTOPPS + 1);
  }
  links.push(routenLink(von, rest, ende));
  return links;
}

/** Link auf einen einzelnen Ort (Firmenadresse in Google Maps zeigen). */
export function ortLink(w: Wegpunkt, name?: string): string {
  const q = new URLSearchParams({ api: '1', query: name ? `${name}, ${ziel(w)}` : ziel(w) });
  return `https://www.google.com/maps/search/?${q}`;
}

/** Navigation direkt zu einem Ort starten (vom aktuellen Standort aus). */
export function navigationLink(w: Wegpunkt): string {
  const q = new URLSearchParams({ api: '1', destination: ziel(w), travelmode: 'driving', dir_action: 'navigate' });
  return `https://www.google.com/maps/dir/?${q}`;
}
