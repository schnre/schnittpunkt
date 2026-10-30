// Adress- und Ortssuche über geo.admin.ch (swisstopo). Kostenlos, kein Schlüssel, CORS erlaubt.

export interface OrtTreffer {
  label: string;
  lat: number;
  lon: number;
}

export async function ortSuchen(text: string, signal?: AbortSignal): Promise<OrtTreffer[]> {
  if (text.trim().length < 2) return [];
  const q = new URLSearchParams({ searchText: text, type: 'locations', origins: 'address,zipcode,gg25', limit: '6', sr: '4326' });
  const r = await fetch(`https://api3.geo.admin.ch/rest/services/api/SearchServer?${q}`, { signal });
  if (!r.ok) return [];
  const d = (await r.json()) as { results?: { attrs: { label: string; lat: number; lon: number } }[] };
  return (d.results ?? []).map((x) => ({
    label: x.attrs.label.replace(/<[^>]+>/g, '').trim(),
    lat: x.attrs.lat,
    lon: x.attrs.lon,
  }));
}
