// Detailkarte einer Firma: Adresse, Kontakt, Status, Notizen, Einplanen.
import { STATUS, STATUS_LISTE, adresseVon, brancheVon, kontaktVon, letzterBesuch, statusVon } from '../daten/firmen';
import { heute, kurz, lang, montagVon, parse, plusTage, wochentag } from '../daten/datum';
import { crmSetzen, crmVon, zustand } from '../daten/zustand';
import { geplantInWoche, mitarbeiterVon, stoppHinzufuegen } from '../planung/aktionen';
import { navigationLink, ortLink } from '../planung/googleMaps';
import type { Firma } from '../typen';
import { h } from './dom';
import { icon, type IconName } from './icons';
import { toast } from './toast';

export interface DetailOptionen {
  onSchliessen?: () => void;
  onGeplant?: (mitarbeiterId: string, datum: string) => void;
}

function aktionLink(href: string, ic: IconName, text: string, extern = true) {
  return h('a', { class: 'aktion', href, ...(extern ? { target: '_blank', rel: 'noopener' } : {}) }, icon(ic), h('span', {}, text));
}

function feld(label: string, ic: IconName, wert: string | undefined, platzhalter: string, typ: string, speichern: (v: string) => void, link?: (v: string) => string) {
  const input = h('input', { class: 'feld-input', type: typ, value: wert ?? '', placeholder: platzhalter, 'aria-label': label });
  input.addEventListener('change', () => speichern(input.value.trim()));
  const linkEl = wert && link ? h('a', { class: 'feld-link', href: link(wert), target: '_blank', rel: 'noopener', title: `${label} öffnen` }, icon('extern')) : null;
  return h('label', { class: 'feld' }, icon(ic), input, linkEl);
}

export function firmaDetail(f: Firma, opt: DetailOptionen = {}): HTMLElement {
  const crm = crmVon(f.id);
  const kontakt = kontaktVon(f);
  const status = statusVon(f);
  const adresse = adresseVon(f);
  const wegpunkt = { adresse: adresse ? `${f.name}, ${adresse}` : undefined, lat: f.lat, lon: f.lon };
  const geplant = geplantInWoche(montagVon(heute())).get(f.id);

  // --- Kopf
  const kopf = h('header', { class: 'detail-kopf' },
    h('div', { class: 'detail-chips' },
      f.neu ? h('span', { class: 'chip chip-neu' }, icon('funken'), 'Neu im HR') : null,
      ...f.branchen.slice(0, 3).map((b) => {
        const br = brancheVon(b);
        return br ? h('span', { class: 'chip', style: `--chip:${br.farbe}` }, br.name) : null;
      })),
    h('h2', { class: 'detail-titel' }, f.name),
    h('p', { class: 'detail-sub' }, [f.rechtsform, f.id.startsWith('CHE') ? f.id : null, f.kanton].filter(Boolean).join(' · ')),
    opt.onSchliessen ? h('button', { class: 'icon-knopf detail-zu', 'aria-label': 'Schliessen', onClick: opt.onSchliessen }, icon('kreuz')) : null,
  );

  // --- Adresse + Schnellaktionen
  const adressBlock = h('section', { class: 'detail-block' },
    h('div', { class: 'adresse' }, icon('pin'),
      h('div', {},
        h('div', {}, f.strasse ?? '–'),
        f.zusatz ? h('div', { class: 'leise' }, f.zusatz) : null,
        h('div', {}, [f.plz, f.ort].filter(Boolean).join(' ')),
        f.genau === false ? h('div', { class: 'hinweis-klein' }, 'Position nur auf Ortszentrum genau') : null),
      h('button', {
        class: 'icon-knopf', title: 'Adresse kopieren', 'aria-label': 'Adresse kopieren',
        onClick: () => navigator.clipboard?.writeText(`${f.name}\n${f.strasse ?? ''}\n${f.plz ?? ''} ${f.ort ?? ''}`).then(() => toast('Adresse kopiert')),
      }, icon('kopieren'))),
    h('div', { class: 'aktionen' },
      kontakt.tel ? aktionLink(`tel:${kontakt.tel.replace(/\s/g, '')}`, 'telefon', 'Anrufen', false) : null,
      aktionLink(navigationLink(wegpunkt), 'navi', 'Navigation'),
      aktionLink(ortLink(wegpunkt), 'karte', 'Google Maps'),
      f.auszug ? aktionLink(f.auszug, 'register', 'HR-Auszug') : null,
      aktionLink(`https://search.ch/tel/?was=${encodeURIComponent(f.name)}&wo=${encodeURIComponent(f.ort ?? '')}`, 'suche', 'Tel. suchen'),
    ),
  );

  // --- Status
  const statusBlock = h('section', { class: 'detail-block' },
    h('h3', { class: 'block-titel' }, 'Status'),
    h('div', { class: 'segment status-segment', role: 'radiogroup', 'aria-label': 'Status' },
      STATUS_LISTE.map((s) => h('button', {
        class: `segment-knopf${s === status ? ' aktiv' : ''}`,
        role: 'radio', 'aria-checked': String(s === status),
        style: `--punkt:${STATUS[s].farbe}`,
        onClick: () => crmSetzen(f.id, { status: s }),
      }, h('span', { class: 'punkt' }), STATUS[s].name))),
  );

  // --- Kontakt (eigene Angaben)
  const kontaktBlock = h('section', { class: 'detail-block' },
    h('h3', { class: 'block-titel' }, 'Kontakt'),
    feld('Ansprechperson', 'person', crm.kontakt, 'Ansprechperson', 'text', (v) => crmSetzen(f.id, { kontakt: v })),
    feld('Telefon', 'telefon', kontakt.tel, 'Telefon', 'tel', (v) => crmSetzen(f.id, { tel: v }), (v) => `tel:${v.replace(/\s/g, '')}`),
    feld('E-Mail', 'mail', kontakt.mail, 'E-Mail', 'email', (v) => crmSetzen(f.id, { mail: v }), (v) => `mailto:${v}`),
    feld('Website', 'web', kontakt.web, 'Website', 'url', (v) => crmSetzen(f.id, { web: v }), (v) => (/^https?:/.test(v) ? v : `https://${v}`)),
  );

  // --- Einplanen
  const e = zustand().einstellungen;
  const mSelect = h('select', { class: 'auswahl', 'aria-label': 'Mitarbeiter' },
    e.mitarbeiter.map((m) => h('option', { value: m.id, selected: m.id === e.aktiverMitarbeiter }, m.name)));
  const montag = montagVon(heute());
  const tage: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = plusTage(montag, i);
    if (d >= heute() && ![0, 6].includes(parse(d).getDay())) tage.push(d);
  }
  const dSelect = h('select', { class: 'auswahl', 'aria-label': 'Tag' },
    tage.map((d, i) => h('option', { value: d, selected: i === 0 }, `${wochentag(d)} ${kurz(d)}`)));
  const fixInput = h('input', { class: 'auswahl zeit', type: 'time', 'aria-label': 'Fixtermin (optional)', title: 'Fixtermin (leer = frei planbar)' });
  const planBlock = h('section', { class: 'detail-block' },
    h('h3', { class: 'block-titel' }, 'Einplanen'),
    geplant ? h('p', { class: 'hinweis-klein ok' }, icon('kalender'), ` Diese Woche geplant: ${mitarbeiterVon(geplant.mitarbeiter).name}, ${wochentag(geplant.datum, true)}`) : null,
    h('div', { class: 'plan-zeile' }, mSelect, dSelect),
    h('div', { class: 'plan-zeile' },
      h('label', { class: 'zeit-label' }, icon('uhr'), fixInput),
      h('button', {
        class: 'knopf primaer',
        onClick: () => {
          stoppHinzufuegen(mSelect.value, dSelect.value, { firmaId: f.id, fix: fixInput.value || undefined });
          toast(`Eingeplant: ${wochentag(dSelect.value, true)}, ${mitarbeiterVon(mSelect.value).name}`,
            opt.onGeplant ? { text: 'Zum Tag', fn: () => opt.onGeplant!(mSelect.value, dSelect.value) } : undefined);
        },
      }, icon('plus'), 'Zum Tag')),
    h('p', { class: 'hinweis-klein' }, 'Uhrzeit nur bei Fixtermin. Freie Besuche werden automatisch passend eingereiht.'),
  );

  // --- Besuche + Notiz
  const besuche = [...(crm.besuche ?? [])].sort().reverse();
  const notiz = h('textarea', { class: 'notiz', rows: 3, placeholder: 'Notizen zum Gespräch, Bedarf, Maschinenpark …' }, crm.notiz ?? '');
  notiz.addEventListener('change', () => crmSetzen(f.id, { notiz: notiz.value }));
  const besuchBlock = h('section', { class: 'detail-block' },
    h('div', { class: 'block-kopf' },
      h('h3', { class: 'block-titel' }, 'Besuche & Notizen'),
      h('button', {
        class: 'knopf klein',
        onClick: () => {
          const b = new Set(crm.besuche ?? []);
          b.add(heute());
          crmSetzen(f.id, { besuche: [...b], status: status === 'offen' ? 'kontaktiert' : status });
          toast('Besuch von heute erfasst');
        },
      }, icon('haken'), 'Heute besucht')),
    besuche.length ? h('p', { class: 'leise klein' }, `Letzter Besuch: ${lang(letzterBesuch(f.id)!)}${besuche.length > 1 ? ` · ${besuche.length} Besuche` : ''}`) : h('p', { class: 'leise klein' }, 'Noch kein Besuch erfasst'),
    notiz,
  );

  // --- Register
  const passung = h('div', { class: 'passung', title: `Passung ${f.passung} von 100` },
    h('div', { class: 'passung-balken' }, h('span', { style: `width:${f.passung}%` })), h('span', {}, `${f.passung}`));
  const regBlock = h('section', { class: 'detail-block' },
    h('div', { class: 'block-kopf' }, h('h3', { class: 'block-titel' }, 'Handelsregister'), passung),
    f.zweck ? h('p', { class: 'zweck' }, f.zweck) : h('p', { class: 'leise' }, 'Kein Zweck hinterlegt.'),
    h('p', { class: 'leise klein' },
      [f.eintrag ? `Publiziert ${lang(f.eintrag)}` : null, `In App seit ${lang(f.erfasst)}`, f.quelle === 'demo' ? 'Demodatensatz' : null].filter(Boolean).join(' · ')),
  );

  return h('article', { class: 'detail' }, kopf, h('div', { class: 'detail-inhalt' }, adressBlock, statusBlock, planBlock, kontaktBlock, besuchBlock, regBlock));
}
