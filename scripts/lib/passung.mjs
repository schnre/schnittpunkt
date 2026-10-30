// Bewertet, wie gut eine Firma zum Sortiment der SC-T passt (0-100).
// Wird von der Handelsregister-Abfrage und von den Tests benutzt.

/** Kleinbuchstaben, Satzzeichen zu Leerzeichen, mit Leerzeichen am Anfang und Ende. */
export function normalisieren(text) {
  return (
    ' ' +
    String(text ?? '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim() +
    ' '
  );
}

/** Ein Stichwort trifft, wenn es am Wortanfang steht ("platten" trifft "Plattenleger", nicht "Steinplatten"). */
function trifft(normText, stichwort) {
  const kw = normalisieren(stichwort).trimEnd();
  // Endete das Stichwort im Profil mit Leerzeichen ("platten "), muss das Wort dort enden.
  const ganzesWort = /\s$/.test(stichwort);
  return normText.includes(ganzesWort ? kw + ' ' : kw);
}

/**
 * @param {{name: string, zweck?: string}} firma
 * @param {{branchen: {id: string, gewicht: number, stichworte: string[]}[], ausschluss?: string[]}} profil
 * @returns {{passung: number, branchen: string[]}}
 */
export function passungBerechnen(firma, profil) {
  const name = normalisieren(firma.name);
  const zweck = normalisieren(firma.zweck);
  const treffer = [];
  let bester = 0;
  let imNamen = false;

  for (const b of profil.branchen) {
    const n = b.stichworte.some((kw) => trifft(name, kw));
    const z = b.stichworte.some((kw) => trifft(zweck, kw));
    if (!n && !z) continue;
    treffer.push(b.id);
    if (b.gewicht > bester) bester = b.gewicht;
    if (n) imNamen = true;
  }
  if (treffer.length === 0) return { passung: 0, branchen: [] };

  let passung = bester + 4 * (treffer.length - 1) + (imNamen ? 5 : 0);
  const ausschluss = (profil.ausschluss ?? []).some((kw) => trifft(name, kw) || trifft(zweck, kw));
  // Ein Ausschlusswort im Zweck (z. B. "Immobilien") heisst oft: Bau nur als Nebenzweck.
  if (ausschluss) passung -= 40;

  // Nach Gewicht sortiert, damit die erste Branche die "Hauptbranche" ist.
  const gewicht = Object.fromEntries(profil.branchen.map((b) => [b.id, b.gewicht]));
  treffer.sort((a, b) => gewicht[b] - gewicht[a]);
  return { passung: Math.max(0, Math.min(100, passung)), branchen: treffer };
}
