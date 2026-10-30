// Zugriff auf die öffentlichen Quellen. Alles hier ist ohne Zugangsdaten nutzbar:
//
// - SHAB / Amtsblattportal (amtsblattportal.ch/api/v1): Handelsregister-Publikationen.
//   HR01 = Neueintragungen, HR03 = Löschungen. Liefert neue Firmen eines Zeitraums.
// - Zefix (zefix.admin.ch/ZefixREST/api/v1): Firmendetails mit Adresse und Zweck.
// - geo.admin.ch (api3.geo.admin.ch): Adresse -> Koordinaten (swisstopo, kostenlos).
//
// Achtung Amtsblattportal: Unbekannte Parameternamen werden NICHT abgelehnt, sondern
// still ignoriert, und dann kommt der ganze Bestand (Millionen Einträge). Darum werden
// Parameter nur aus einer festen Liste gebaut und die Trefferzahl geprüft.

export const SHAB = 'https://amtsblattportal.ch/api/v1';
export const ZEFIX = 'https://www.zefix.admin.ch/ZefixREST/api/v1';
export const GEO = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';

const SHAB_PARAMETER = new Set([
  'publicationStates', 'rubrics', 'subRubrics', 'cantons', 'tenant',
  'publicationDate.start', 'publicationDate.end', 'pageRequest.size', 'pageRequest.page',
]);

/** Baut die Listen-URL fürs Amtsblattportal. Unbekannte Parameter sind ein Programmierfehler. */
export function shabListeUrl(params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (!SHAB_PARAMETER.has(k)) throw new Error(`Unbekannter SHAB-Parameter: ${k}`);
    if (v === undefined || v === null || v === '') continue;
    q.set(k, String(v));
  }
  return `${SHAB}/publications?${q}`;
}

// ---------- XML einer HR-Publikation lesen (ohne XML-Bibliothek) ----------

function entities(s) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

/** Text des ersten Elements mit diesem lokalen Namen (Namensraum-Präfix egal). */
export function xmlText(xml, lokalName, start = 0) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${lokalName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${lokalName}>`, 'g');
  re.lastIndex = start;
  const m = re.exec(xml);
  return m ? entities(m[1]).trim() : undefined;
}

/** Inhalt eines Elements als Teilstring (für verschachtelte Blöcke). */
function xmlBlock(xml, lokalName) {
  const re = new RegExp(`<(?:[\\w.-]+:)?${lokalName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${lokalName}>`);
  const m = re.exec(xml);
  return m ? m[1] : undefined;
}

function ohneHtml(s) {
  return entities(String(s ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const UID_RE = /CHE[-‑ ]?(\d{3})[.\s]?(\d{3})[.\s]?(\d{3})/;

export function uidNormalisieren(s) {
  const m = UID_RE.exec(String(s ?? ''));
  return m ? `CHE-${m[1]}.${m[2]}.${m[3]}` : undefined;
}

/**
 * Liest aus einer HR-Publikation (XML von /publications/{id}/xml) Firma, UID und Zweck.
 * Das Schema unterscheidet sich je Rubrik. Darum wird nach lokalen Elementnamen gesucht
 * und für den Zweck zusätzlich der Fliesstext ("Zweck: ...") ausgewertet.
 */
export function hrPublikationLesen(xml) {
  const firmaBlock = xmlBlock(xml, 'company') ?? '';
  const text = ohneHtml(xmlText(xml, 'publicationText') ?? xmlText(xml, 'publication') ?? '');
  const titel = xmlText(xmlBlock(xml, 'title') ?? '', 'de') ?? xmlText(xml, 'title') ?? '';

  let zweck = xmlText(xml, 'purpose');
  if (zweck) zweck = ohneHtml(zweck);
  if (!zweck && text) {
    const m = /(?:Zweck|But|Scopo)\s*:\s*(.+?)(?=\s(?:Eingetragene Personen|Personnes inscrites|Persone iscritte|Bemerkungen|Mitteilungen|Qualifizierte Tatbestände|Publikationsorgan|Kapital|Capital|Domizil)\b|$)/i.exec(text);
    if (m) zweck = m[1].trim();
  }

  const strasse = xmlText(firmaBlock, 'street');
  const nr = xmlText(firmaBlock, 'houseNumber');
  return {
    name: xmlText(firmaBlock, 'name') ?? titel.replace(/^(Neueintragung|Nouvelle inscription|Nuova iscrizione)\s+/i, '').replace(/,\s*[^,]+$/, ''),
    uid: uidNormalisieren(xmlText(firmaBlock, 'uid') ?? text ?? titel),
    sitz: xmlText(firmaBlock, 'seat'),
    adresse: strasse ? { strasse: [strasse, nr].filter(Boolean).join(' '), plz: xmlText(firmaBlock, 'swissZipCode'), ort: xmlText(firmaBlock, 'town') } : undefined,
    zweck,
  };
}

// ---------- Zefix ----------

/** Wandelt ein Zefix-Firmendetail (GET firm/{ehraid}.json) in einen Firmen-Datensatz. */
export function zefixZuFirma(d, rechtsformen = {}) {
  const a = d.address ?? {};
  const strasse = [a.street, a.houseNumber].filter(Boolean).join(' ').trim();
  return {
    id: d.uidFormatted ?? uidNormalisieren(d.uid) ?? `EHRA-${d.ehraid}`,
    name: d.name,
    rechtsform: rechtsformen[d.legalFormId],
    strasse: strasse || undefined,
    zusatz: a.addon || a.careOf || undefined,
    plz: a.swissZipCode || undefined,
    ort: a.town || d.legalSeat || undefined,
    kanton: d.shabPub?.[0]?.registryOfficeCanton || undefined,
    zweck: d.purpose ? ohneHtml(d.purpose) : undefined,
    // Manche Kantone (z. B. GE) liefern http-Links, leiten aber selbst auf https um
    auszug: d.cantonalExcerptWeb?.replace(/^http:\/\//i, 'https://') || undefined,
    eintrag: d.shabDate || undefined,
    status: d.status,
    ehraid: d.ehraid,
  };
}

// ---------- geo.admin.ch ----------

/** Liest Koordinaten aus einer SearchServer-Antwort (type=locations). */
export function geoTreffer(antwort) {
  const r = antwort?.results?.[0]?.attrs;
  if (!r || typeof r.lat !== 'number' || typeof r.lon !== 'number') return undefined;
  // "detail" endet bei Adressen mit dem Kantonskürzel, z. B. "... 4566 frauenfeld ch tg"
  const kt = /\s([a-z]{2})$/.exec(String(r.detail ?? '').trim())?.[1];
  return {
    lat: Math.round(r.lat * 1e5) / 1e5,
    lon: Math.round(r.lon * 1e5) / 1e5,
    genau: r.origin === 'address',
    kanton: kt && kt !== 'ch' ? kt.toUpperCase() : undefined,
  };
}

export function geoUrl(suchtext, origins = 'address') {
  const q = new URLSearchParams({ searchText: suchtext, type: 'locations', origins, limit: '1', sr: '4326' });
  return `${GEO}?${q}`;
}
