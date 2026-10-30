// Tabellenansicht aller Firmen mit Sortierung und CSV-Export (z. B. für Excel).
import { STATUS, brancheVon, kontaktVon, letzterBesuch, statusVon } from '../daten/firmen';
import { kurz } from '../daten/datum';
import { beobachten, crmVon } from '../daten/zustand';
import type { Firma } from '../typen';
import { filter, gefiltert } from './ansichtKarte';
import { h, leeren } from './dom';
import { icon } from './icons';
import type { Ansicht } from './router';

type Spalte = 'name' | 'ort' | 'branche' | 'passung' | 'status' | 'besuch' | 'erfasst';

export function firmenAnsicht(): Ansicht {
  let sortierung: Spalte = 'passung';
  let absteigend = true;
  let sichtbar = 200;

  const suche = h('input', { class: 'suchfeld', type: 'search', placeholder: 'Suchen …', 'aria-label': 'Firmen durchsuchen' });
  suche.addEventListener('input', () => { filter.text = suche.value; sichtbar = 200; zeichnen(); });
  const info = h('span', { class: 'leise' });
  const tbody = h('tbody');
  const kopfZeile = h('tr');
  const mehr = h('button', { class: 'knopf geist', hidden: true, onClick: () => { sichtbar += 300; zeichnen(); } });

  const SPALTEN: [Spalte, string][] = [['name', 'Firma'], ['ort', 'Ort'], ['branche', 'Branche'], ['passung', 'Passung'], ['status', 'Status'], ['besuch', 'Letzter Besuch'], ['erfasst', 'Erfasst']];

  function wert(f: Firma, s: Spalte): string | number {
    switch (s) {
      case 'name': return f.name.toLowerCase();
      case 'ort': return `${f.kanton ?? ''} ${f.ort ?? ''}`.toLowerCase();
      case 'branche': return brancheVon(f.branchen[0])?.name ?? '';
      case 'passung': return f.passung;
      case 'status': return STATUS[statusVon(f)].name;
      case 'besuch': return letzterBesuch(f.id) ?? '';
      case 'erfasst': return f.erfasst;
    }
  }

  function zeichnen() {
    const liste = gefiltert().sort((a, b) => {
      const x = wert(a, sortierung);
      const y = wert(b, sortierung);
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'de');
      return absteigend ? -c : c;
    });
    info.textContent = `${liste.length.toLocaleString('de-CH')} Firmen${filter.branchen.size || filter.status.size || filter.nurNeu ? ' (Filter aus der Karte aktiv)' : ''}`;

    leeren(kopfZeile);
    for (const [s, t] of SPALTEN) {
      kopfZeile.append(h('th', { scope: 'col', 'aria-sort': s === sortierung ? (absteigend ? 'descending' : 'ascending') : 'none' },
        h('button', { class: 'th-knopf', onClick: () => { absteigend = s === sortierung ? !absteigend : s === 'passung' || s === 'erfasst'; sortierung = s; zeichnen(); } },
          t, s === sortierung ? icon(absteigend ? 'runter' : 'hoch') : null)));
    }

    leeren(tbody);
    for (const f of liste.slice(0, sichtbar)) {
      const st = statusVon(f);
      const br = brancheVon(f.branchen[0]);
      const k = kontaktVon(f);
      const b = letzterBesuch(f.id);
      tbody.append(h('tr', {},
        h('td', {}, h('a', { class: 'tabellen-link', href: `#/karte?firma=${encodeURIComponent(f.id)}` }, f.name),
          f.neu ? h('span', { class: 'mini-badge' }, 'NEU') : null,
          h('div', { class: 'leise klein' }, [k.tel, f.rechtsform].filter(Boolean).join(' · '))),
        h('td', {}, [f.plz, f.ort].filter(Boolean).join(' '), h('div', { class: 'leise klein' }, f.kanton ?? '')),
        h('td', {}, br ? h('span', { class: 'chip', style: `--chip:${br.farbe}` }, br.name) : '–'),
        h('td', {}, h('div', { class: 'passung' }, h('div', { class: 'passung-balken' }, h('span', { style: `width:${f.passung}%` })), h('span', {}, String(f.passung)))),
        h('td', {}, h('span', { class: 'status-pille', style: `--farbe:${STATUS[st].farbe}` }, STATUS[st].name)),
        h('td', {}, b ? kurz(b) : '–'),
        h('td', {}, kurz(f.erfasst))));
    }
    const rest = liste.length - sichtbar;
    mehr.hidden = rest <= 0;
    mehr.textContent = `Weitere ${Math.min(rest, 300)} anzeigen`;
  }

  function csv() {
    const zeilen = [['Firma', 'UID', 'Rechtsform', 'Strasse', 'PLZ', 'Ort', 'Kanton', 'Branche', 'Passung', 'Status', 'Ansprechperson', 'Telefon', 'E-Mail', 'Website', 'Letzter Besuch', 'Notiz', 'Zweck', 'Erfasst']];
    for (const f of gefiltert()) {
      const k = kontaktVon(f);
      zeilen.push([f.name, f.id, f.rechtsform ?? '', f.strasse ?? '', f.plz ?? '', f.ort ?? '', f.kanton ?? '',
        f.branchen.map((b) => brancheVon(b)?.name).join(', '), String(f.passung), STATUS[statusVon(f)].name,
        k.person ?? '', k.tel ?? '', k.mail ?? '', k.web ?? '', letzterBesuch(f.id) ?? '', crmVon(f.id).notiz ?? '', f.zweck ?? '', f.erfasst]);
    }
    // Semikolon und BOM, damit Excel (de-CH) Umlaute und Spalten richtig erkennt
    const text = '﻿' + zeilen.map((z) => z.map((x) => `"${x.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`).join(';')).join('\r\n');
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })), download: `sct-firmen-${new Date().toISOString().slice(0, 10)}.csv` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const root = h('div', { class: 'seite' },
    h('header', { class: 'seiten-kopf' },
      h('div', {}, h('h1', {}, 'Firmen'), info),
      h('div', { class: 'kopf-aktionen' },
        h('div', { class: 'suche-wrap' }, icon('suche'), suche),
        h('button', { class: 'knopf', onClick: csv }, icon('herunterladen'), 'CSV für Excel'))),
    h('div', { class: 'tabelle-wrap' }, h('table', { class: 'tabelle' }, h('thead', {}, kopfZeile), tbody)),
    mehr);

  beobachten(() => { if (root.isConnected) zeichnen(); });

  return {
    el: root,
    titel: 'Firmen',
    anzeigen() {
      suche.value = filter.text;
      zeichnen();
    },
  };
}

