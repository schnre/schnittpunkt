// Startansicht: Karte der Schweiz mit allen potenziellen Kunden, Filter, Liste und Details.
import { BRANCHEN, STATUS, STATUS_LISTE, alleFirmen, brancheVon, dateiInfo, firmaVon, statusVon, suchtext } from '../daten/firmen';
import { beobachten } from '../daten/zustand';
import { strasseKm } from '../geo/distanz';
import { ortSuchen } from '../geo/suche';
import type { Firma, KundenStatus } from '../typen';
import { h, leeren } from './dom';
import { firmaDetail } from './firmaDetail';
import { icon } from './icons';
import { Karte, VORSCHAU, type Farbmodus, type Grundkarte } from './karte';
import type { Ansicht } from './router';

interface Filter {
  text: string;
  branchen: Set<string>;
  status: Set<KundenStatus>;
  nurNeu: boolean;
}

export const filter: Filter = { text: '', branchen: new Set(), status: new Set(), nurNeu: false };

export function gefiltert(f: Filter = filter): Firma[] {
  const t = f.text.trim().toLowerCase();
  return alleFirmen().filter((x) =>
    (!t || suchtext(x).includes(t)) &&
    (!f.nurNeu || x.neu) &&
    (!f.branchen.size || x.branchen.some((b) => f.branchen.has(b))) &&
    (!f.status.size || f.status.has(statusVon(x))));
}

export function sortiert(liste: Firma[]): Firma[] {
  return [...liste].sort((a, b) => Number(!!b.neu) - Number(!!a.neu) || b.passung - a.passung || a.name.localeCompare(b.name, 'de'));
}

export function karteAnsicht(): Ansicht {
  let farbmodus: Farbmodus = 'branche';
  let ausgewaehlt: string | undefined;
  let sichtbar = 120;
  let karte: Karte;

  // ---------- Seitenpanel
  const suche = h('input', { class: 'suchfeld', type: 'search', placeholder: 'Firma, Ort, PLZ, Zweck …', 'aria-label': 'Firmen durchsuchen' });
  let sucheTimer: ReturnType<typeof setTimeout>;
  suche.addEventListener('input', () => {
    clearTimeout(sucheTimer);
    sucheTimer = setTimeout(() => {
      filter.text = suche.value;
      sichtbar = 120;
      aktualisieren(true);
    }, 140);
  });

  const statistik = h('div', { class: 'statistik' });
  const chipsBranche = h('div', { class: 'chips' });
  const chipsStatus = h('div', { class: 'chips' });
  const liste = h('ul', { class: 'firmenliste', role: 'list' });
  const mehr = h('button', { class: 'knopf geist breit', hidden: true, onClick: () => { sichtbar += 200; listeZeichnen(); } });
  const treffer = h('span', { class: 'treffer' });
  const filterZuruecksetzen = h('button', {
    class: 'link-knopf', hidden: true,
    onClick: () => {
      filter.text = ''; suche.value = ''; filter.branchen.clear(); filter.status.clear(); filter.nurNeu = false;
      aktualisieren(true);
    },
  }, 'Filter zurücksetzen');

  const demoBanner = h('div', { class: 'demo-banner', hidden: true },
    icon('info'), h('span', {}, 'Demodaten (erfundene Firmen). Die erste Handelsregister-Abfrage ersetzt sie.'),
    h('a', { href: '#/register' }, 'Abfrage'));

  const panel = h('aside', { class: 'seitenpanel', 'aria-label': 'Firmen filtern' },
    h('div', { class: 'panel-kopf' },
      h('div', { class: 'suche-wrap' }, icon('suche'), suche),
      demoBanner,
      statistik,
      h('details', { class: 'filter-details', open: window.innerWidth > 900 && window.innerHeight > 1000 },
        h('summary', {}, icon('filter'), 'Filter', filterZuruecksetzen),
        h('div', { class: 'filter-gruppe' }, h('span', { class: 'filter-label' }, 'Branche'), chipsBranche),
        h('div', { class: 'filter-gruppe' }, h('span', { class: 'filter-label' }, 'Status'), chipsStatus))),
    h('div', { class: 'liste-kopf' }, treffer),
    h('div', { class: 'liste-scroll' }, liste, mehr),
  );

  // ---------- Detail
  const detail = h('aside', { class: 'detail-panel', hidden: true, 'aria-label': 'Firmendetails' });

  // ---------- Karte und Bedienelemente darauf
  const kartenEl = h('div', { class: 'karte', role: 'application', 'aria-label': 'Karte der Schweiz mit Firmen' });
  const grundWahl = h('div', { class: 'karten-schalter segment klein', hidden: VORSCHAU },
    (['grau', 'farbe', 'luftbild'] as Grundkarte[]).map((g) =>
      h('button', { class: `segment-knopf${g === 'grau' ? ' aktiv' : ''}`, 'data-g': g, onClick: () => grundSetzen(g) },
        { grau: 'Grau', farbe: 'Karte', luftbild: 'Luftbild' }[g])));
  const farbWahl = h('div', { class: 'karten-schalter segment klein' },
    (['branche', 'status'] as Farbmodus[]).map((m) =>
      h('button', { class: `segment-knopf${m === farbmodus ? ' aktiv' : ''}`, 'data-m': m, onClick: () => { farbmodus = m; farbWahl.querySelectorAll('button').forEach((b) => b.classList.toggle('aktiv', b.dataset.m === m)); aktualisieren(false); } },
        m === 'branche' ? 'Farbe: Branche' : 'Farbe: Status')));
  const legende = h('div', { class: 'legende' });

  // Ortssuche (springt auf der Karte zu einem Ort)
  const ortInput = h('input', { class: 'ort-input', type: 'search', placeholder: 'Ort oder Adresse …', 'aria-label': 'Ort auf der Karte suchen' });
  const ortListe = h('ul', { class: 'ort-treffer', hidden: true });
  let ortAbbruch: AbortController | undefined;
  let ortTimer: ReturnType<typeof setTimeout>;
  ortInput.addEventListener('input', () => {
    clearTimeout(ortTimer);
    ortTimer = setTimeout(async () => {
      ortAbbruch?.abort();
      ortAbbruch = new AbortController();
      try {
        const t = await ortSuchen(ortInput.value, ortAbbruch.signal);
        leeren(ortListe);
        ortListe.hidden = !t.length;
        for (const o of t) {
          ortListe.append(h('li', {}, h('button', {
            onClick: () => { karte.map.flyTo([o.lat, o.lon], 13, { duration: 0.7 }); ortListe.hidden = true; ortInput.value = o.label; },
          }, o.label)));
        }
      } catch { /* abgebrochen oder offline */ }
    }, 220);
  });
  const ortSuche = h('div', { class: 'ort-suche' }, icon('pin'), ortInput, ortListe);

  const panelUmschalter = h('button', {
    class: 'knopf schwebend panel-umschalter',
    onClick: () => root.classList.toggle('liste-offen'),
  }, icon('liste'), h('span', {}, 'Liste'));

  const kartenWrap = h('div', { class: 'karte-wrap' }, kartenEl,
    h('div', { class: 'karte-oben' }, ortSuche, h('div', { class: 'karte-schalter-gruppe' }, grundWahl, farbWahl)),
    legende, panelUmschalter);

  const root = h('div', { class: 'karte-ansicht' }, panel, kartenWrap, detail);

  function grundSetzen(g: Grundkarte) {
    karte.grundkarteSetzen(g);
    grundWahl.querySelectorAll('button').forEach((b) => b.classList.toggle('aktiv', b.dataset.g === g));
  }

  function chipsZeichnen() {
    const alle = alleFirmen();
    leeren(chipsBranche);
    const neuAnzahl = alle.filter((f) => f.neu).length;
    chipsBranche.append(h('button', {
      class: `filter-chip neu${filter.nurNeu ? ' aktiv' : ''}`, 'aria-pressed': String(filter.nurNeu),
      onClick: () => { filter.nurNeu = !filter.nurNeu; aktualisieren(true); },
    }, icon('funken'), `Neu (${neuAnzahl})`));
    for (const b of BRANCHEN) {
      const n = alle.filter((f) => f.branchen.includes(b.id)).length;
      if (!n) continue;
      const aktiv = filter.branchen.has(b.id);
      chipsBranche.append(h('button', {
        class: `filter-chip${aktiv ? ' aktiv' : ''}`, style: `--chip:${b.farbe}`, 'aria-pressed': String(aktiv),
        onClick: () => { aktiv ? filter.branchen.delete(b.id) : filter.branchen.add(b.id); aktualisieren(true); },
      }, h('span', { class: 'punkt' }), `${b.name}`, h('small', {}, String(n))));
    }
    leeren(chipsStatus);
    for (const s of STATUS_LISTE) {
      const n = alle.filter((f) => statusVon(f) === s).length;
      const aktiv = filter.status.has(s);
      chipsStatus.append(h('button', {
        class: `filter-chip${aktiv ? ' aktiv' : ''}`, style: `--chip:${STATUS[s].farbe}`, 'aria-pressed': String(aktiv),
        onClick: () => { aktiv ? filter.status.delete(s) : filter.status.add(s); aktualisieren(true); },
      }, h('span', { class: 'punkt' }), STATUS[s].name, h('small', {}, String(n))));
    }
    filterZuruecksetzen.hidden = !(filter.text || filter.branchen.size || filter.status.size || filter.nurNeu);
  }

  function statistikZeichnen() {
    const alle = alleFirmen();
    const zaehl = (fn: (f: Firma) => boolean) => alle.filter(fn).length;
    leeren(statistik);
    const kachel = (zahl: number, text: string, klasse = '') => h('div', { class: `stat ${klasse}` }, h('strong', {}, zahl.toLocaleString('de-CH')), h('span', {}, text));
    statistik.append(
      kachel(alle.length, 'Firmen'),
      kachel(zaehl((f) => !!f.neu), 'Neu', 'stat-neu'),
      kachel(zaehl((f) => statusVon(f) === 'interessant'), 'Interessant', 'stat-int'),
      kachel(zaehl((f) => statusVon(f) === 'kunde'), 'Kunden', 'stat-kunde'),
    );
  }

  let aktuelleListe: Firma[] = [];
  function listeZeichnen() {
    leeren(liste);
    const zentrum = karte?.zentrum();
    for (const f of aktuelleListe.slice(0, sichtbar)) {
      const br = brancheVon(f.branchen[0]);
      const st = statusVon(f);
      liste.append(h('li', {},
        h('button', {
          class: `listen-firma${f.id === ausgewaehlt ? ' aktiv' : ''}`,
          onClick: () => auswaehlen(f.id, true),
        },
        h('span', { class: 'listen-punkt', style: `--farbe:${karte?.farbeVon(f, farbmodus) ?? br?.farbe}` }),
        h('span', { class: 'listen-text' },
          h('span', { class: 'listen-name' }, f.name, f.neu ? h('span', { class: 'mini-badge' }, 'NEU') : null),
          h('span', { class: 'listen-meta' }, [f.plz, f.ort].filter(Boolean).join(' '), ' · ', br?.name ?? '')),
        h('span', { class: 'listen-rechts' },
          st !== 'offen' ? h('span', { class: 'status-pille', style: `--farbe:${STATUS[st].farbe}` }, STATUS[st].name) : null,
          zentrum && karte.map.getZoom() >= 10 ? h('span', { class: 'leise klein' }, `${Math.round(strasseKm(zentrum, f))} km`) : null))));
    }
    const rest = aktuelleListe.length - sichtbar;
    mehr.hidden = rest <= 0;
    mehr.textContent = `Weitere ${Math.min(rest, 200)} von ${rest} anzeigen`;
    treffer.textContent = aktuelleListe.length === alleFirmen().length
      ? `${aktuelleListe.length.toLocaleString('de-CH')} Firmen`
      : `${aktuelleListe.length.toLocaleString('de-CH')} von ${alleFirmen().length.toLocaleString('de-CH')} Firmen`;
  }

  function legendeZeichnen() {
    leeren(legende);
    const eintraege = farbmodus === 'branche'
      ? BRANCHEN.filter((b) => alleFirmen().some((f) => f.branchen[0] === b.id)).map((b) => [b.name, b.farbe])
      : STATUS_LISTE.map((s) => [STATUS[s].name, STATUS[s].farbe]);
    legende.append(...eintraege.map(([n, c]) => h('span', { class: 'legende-eintrag' }, h('span', { class: 'punkt', style: `background:${c}` }), n)),
      h('span', { class: 'legende-eintrag' }, h('span', { class: 'punkt neu-ring' }), 'Neu'));
  }

  function aktualisieren(einpassen: boolean) {
    aktuelleListe = sortiert(gefiltert());
    karte.firmenSetzen(aktuelleListe, farbmodus);
    if (einpassen && aktuelleListe.length && aktuelleListe.length < alleFirmen().length) karte.einpassen(aktuelleListe);
    chipsZeichnen();
    statistikZeichnen();
    listeZeichnen();
    legendeZeichnen();
    detailZeichnen();
  }

  function detailZeichnen() {
    const f = ausgewaehlt ? firmaVon(ausgewaehlt) : undefined;
    leeren(detail);
    detail.hidden = !f;
    root.classList.toggle('detail-offen', !!f);
    if (!f) return;
    detail.append(firmaDetail(f, {
      onSchliessen: () => auswaehlen(undefined),
      onGeplant: (m, d) => { location.hash = `#/woche?m=${m}&d=${d}`; },
    }));
  }

  function auswaehlen(id: string | undefined, zentrieren = false) {
    ausgewaehlt = id;
    const f = id ? firmaVon(id) : undefined;
    karte.auswaehlen(f, zentrieren);
    detailZeichnen();
    liste.querySelectorAll('.listen-firma').forEach((el, i) => el.classList.toggle('aktiv', aktuelleListe[i]?.id === id));
    if (f) root.classList.remove('liste-offen');
    const ziel = id ? `#/karte?firma=${encodeURIComponent(id)}` : '#/karte';
    if (location.hash !== ziel) history.replaceState(null, '', ziel);
    requestAnimationFrame(() => karte.groesseAktualisieren());
  }

  let initialisiert = false;
  beobachten(() => {
    if (!initialisiert || !root.isConnected) return;
    // Status/Notizen geändert: Punkte, Liste und Detail auffrischen, Detail-Eingaben aber nicht zerstören
    karte.firmenSetzen(aktuelleListe, farbmodus);
    chipsZeichnen();
    statistikZeichnen();
    listeZeichnen();
    const aktiv = document.activeElement;
    if (!(aktiv && detail.contains(aktiv) && (aktiv.tagName === 'INPUT' || aktiv.tagName === 'TEXTAREA'))) detailZeichnen();
  });

  return {
    el: root,
    titel: 'Karte',
    anzeigen(params) {
      if (!initialisiert) {
        karte = new Karte(kartenEl, { onFirma: (id) => auswaehlen(id) });
        demoBanner.hidden = !dateiInfo()?.demo;
        initialisiert = true;
        aktuelleListe = sortiert(gefiltert());
        aktualisieren(false);
      }
      requestAnimationFrame(() => karte.groesseAktualisieren());
      const id = params.get('firma');
      if (id && id !== ausgewaehlt) auswaehlen(id, true);
      else if (params.get('neu') === '1' && !filter.nurNeu) {
        filter.nurNeu = true;
        aktualisieren(true);
      }
    },
  };
}
