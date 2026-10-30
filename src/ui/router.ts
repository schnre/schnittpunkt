// Hash-Router: #/karte, #/woche?m=m1&d=2026-11-02, #/firmen, #/register, #/einstellungen
// Jede Ansicht wird beim ersten Besuch gebaut und danach wiederverwendet. So bleibt z. B. die
// Karte mit Zoomstufe und geladenen Kacheln erhalten, wenn man zwischen Ansichten wechselt.

export interface Ansicht {
  el: HTMLElement;
  titel: string;
  anzeigen(params: URLSearchParams): void;
}

export function routeLesen(): { name: string; params: URLSearchParams } {
  const roh = location.hash.replace(/^#\/?/, '');
  const [name, query] = roh.split('?');
  return { name: name || 'karte', params: new URLSearchParams(query ?? '') };
}
