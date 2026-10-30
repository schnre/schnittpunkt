// Wochenplanung pro Aussendienst-Mitarbeiter: Tage, Zeitplan, Route, Vorschläge, Google Maps.
import { STATUS, adresseVon, brancheVon, firmaVon, statusVon } from '../daten/firmen';
import { heute, kalenderwoche, kurz, lang, montagVon, plusTage, wochentag } from '../daten/datum';
import { aendern, beobachten, crmSetzen, crmVon, tagSetzen, tagVon, zustand } from '../daten/zustand';
import { formatDauer, formatKm, minZuZeit } from '../geo/distanz';
import { geplantInWoche, mitarbeiterVon, punktVon, rahmenFuer, stoppEntfernen, stoppHinzufuegen, tagOptimieren } from '../planung/aktionen';
import { routenLinks } from '../planung/googleMaps';
import { kandidatenBauen } from '../planung/kandidaten';
import { tagFuellen, vorschlagen, zeitplan, type Vorschlag, type Zeitplan } from '../planung/route';
import type { Stopp } from '../typen';
import { h, leeren } from './dom';
import { firmaDetail } from './firmaDetail';
import { icon } from './icons';
import { Karte, type RoutenPunkt } from './karte';
import type { Ansicht } from './router';
import { toast } from './toast';

export function wocheAnsicht(): Ansicht {
  let montag = montagVon(heute());
  let datum = heute();
  let mitarbeiterId = zustand().einstellungen.aktiverMitarbeiter;
  let nurNeu = false;
  let detailId: string | undefined;
  let karte: Karte | undefined;
  let letzterRoutenSchluessel = '';

  const kopfTitel = h('div', { class: 'woche-titel' });
  const mitarbeiterWahl = h('div', { class: 'segment', role: 'radiogroup', 'aria-label': 'Mitarbeiter' });
  const tageLeiste = h('div', { class: 'tage-leiste', role: 'tablist', 'aria-label': 'Wochentage' });
  const tagKopf = h('div', { class: 'tag-kopf' });
  const tagAktionen = h('div', { class: 'tag-aktionen' });
  const zeitachse = h('ol', { class: 'zeitachse' });
  const vorschlagListe = h('ul', { class: 'vorschlaege' });
  const nurNeuSchalter = h('label', { class: 'schalter' },
    h('input', { type: 'checkbox', onChange: (e: Event) => { nurNeu = (e.target as HTMLInputElement).checked; vorschlaegeZeichnen(); } }),
    h('span', {}, 'Nur neue Firmen'));

  const kartenEl = h('div', { class: 'karte' });
  const kartenDetail = h('div', { class: 'karten-detail', hidden: true });

  const root = h('div', { class: 'woche-ansicht' },
    h('header', { class: 'woche-kopf' },
      h('div', { class: 'woche-nav' },
        h('button', { class: 'icon-knopf', 'aria-label': 'Vorherige Woche', onClick: () => wocheWechseln(-7) }, icon('links')),
        kopfTitel,
        h('button', { class: 'icon-knopf', 'aria-label': 'Nächste Woche', onClick: () => wocheWechseln(7) }, icon('rechts')),
        h('button', { class: 'knopf geist klein', onClick: () => { montag = montagVon(heute()); datum = heute() < plusTage(montag, 5) ? heute() : montag; alles(); } }, 'Heute')),
      mitarbeiterWahl),
    tageLeiste,
    h('div', { class: 'woche-split' },
      h('section', { class: 'tag-panel' },
        tagKopf, tagAktionen, zeitachse,
        h('div', { class: 'vorschlag-bereich' },
          h('div', { class: 'block-kopf' },
            h('h3', { class: 'block-titel' }, icon('zauber'), ' Vorschläge auf dem Weg'),
            nurNeuSchalter),
          h('p', { class: 'hinweis-klein' }, 'Firmen nahe der Route, die keinen Fixtermin gefährden. Sortiert nach Umweg und Wichtigkeit.'),
          vorschlagListe)),
      h('div', { class: 'karte-wrap woche-karte' }, kartenEl, kartenDetail)),
  );

  function wocheWechseln(tage: number) {
    montag = plusTage(montag, tage);
    datum = plusTage(datum, tage);
    alles();
  }

  const mitarbeiter = () => mitarbeiterVon(mitarbeiterId);
  const stopps = () => tagVon(mitarbeiterId, datum).stopps;
  const plan = (): Zeitplan => zeitplan(stopps(), punktVon, rahmenFuer(mitarbeiter()));
  const speichern = (neu: Stopp[]) => tagSetzen(mitarbeiterId, datum, { stopps: neu });

  // ---------------------------------------------------------------------------

  function kopfZeichnen() {
    leeren(kopfTitel);
    kopfTitel.append(h('strong', {}, `KW ${kalenderwoche(montag)}`), h('span', {}, `${kurz(montag)} – ${kurz(plusTage(montag, 4))} ${montag.slice(0, 4)}`));
    leeren(mitarbeiterWahl);
    for (const m of zustand().einstellungen.mitarbeiter) {
      mitarbeiterWahl.append(h('button', {
        class: `segment-knopf${m.id === mitarbeiterId ? ' aktiv' : ''}`, role: 'radio', 'aria-checked': String(m.id === mitarbeiterId),
        style: `--punkt:${m.farbe}`,
        onClick: () => { mitarbeiterId = m.id; aendern((z) => { z.einstellungen.aktiverMitarbeiter = m.id; }); },
      }, h('span', { class: 'punkt' }), m.name));
    }
  }

  function tageZeichnen() {
    leeren(tageLeiste);
    const r = rahmenFuer(mitarbeiter());
    for (let i = 0; i < 5; i++) {
      const d = plusTage(montag, i);
      const st = tagVon(mitarbeiterId, d).stopps;
      const z = zeitplan(st, punktVon, r);
      const belegt = st.length ? Math.min(1, (z.rueckkehr - r.beginn) / (r.ende - r.beginn)) : 0;
      const fixe = st.filter((s) => s.fix).length;
      tageLeiste.append(h('button', {
        class: `tag-kachel${d === datum ? ' aktiv' : ''}${d === heute() ? ' heute' : ''}${d < heute() ? ' vergangen' : ''}`,
        role: 'tab', 'aria-selected': String(d === datum),
        onClick: () => { datum = d; detailId = undefined; alles(); },
      },
      h('span', { class: 'tag-name' }, wochentag(d), h('small', {}, kurz(d))),
      h('span', { class: 'tag-zahl' }, st.length ? `${st.length} ${st.length === 1 ? 'Besuch' : 'Besuche'}` : 'frei'),
      h('span', { class: 'tag-meta' }, st.length ? `${formatKm(z.km)} · bis ${minZuZeit(z.rueckkehr)}` : ' '),
      fixe ? h('span', { class: 'tag-fix', title: `${fixe} Fixtermin(e)` }, icon('uhr'), String(fixe)) : null,
      h('span', { class: 'tag-balken' }, h('span', { style: `width:${Math.round(belegt * 100)}%;background:${mitarbeiter().farbe}` }))));
    }
  }

  function tagZeichnen() {
    const m = mitarbeiter();
    const z = plan();
    const st = stopps();
    const r = rahmenFuer(m);
    const startZeit = z.eintraege.length ? z.eintraege[0].ankunft - z.eintraege[0].fahrMin : r.beginn;

    leeren(tagKopf);
    tagKopf.append(
      h('h2', {}, `${wochentag(datum, true)}, ${lang(datum)}`),
      h('div', { class: 'tag-kennzahlen' },
        h('span', {}, icon('pin'), `${st.length} ${st.length === 1 ? 'Besuch' : 'Besuche'}`),
        h('span', {}, icon('auto'), `${formatKm(z.km)} · ${formatDauer(z.fahrMin)}`),
        h('span', {}, icon('uhr'), st.length ? `${minZuZeit(startZeit)}–${minZuZeit(z.rueckkehr)}` : `${minZuZeit(r.beginn)}–${minZuZeit(r.ende)}`)),
      z.verspaetung > 0.5 ? h('p', { class: 'warnung' }, icon('info'), ` Ein Fixtermin ist mit dieser Reihenfolge nicht erreichbar (${Math.round(z.verspaetung)} min zu spät). „Route optimieren“ versuchen oder einen Besuch entfernen.`) : '',
      z.ueberzeit > 5 ? h('p', { class: 'warnung' }, icon('info'), ` Rückkehr ${formatDauer(z.ueberzeit)} nach Arbeitsende.`) : '',
    );

    leeren(tagAktionen);
    const links = st.length ? routenLinks(
      { adresse: m.startAdresse, lat: m.lat, lon: m.lon },
      z.eintraege.map((e) => {
        const f = firmaVon(e.stopp.firmaId)!;
        const a = adresseVon(f);
        return { adresse: a ? `${f.name}, ${a}` : undefined, lat: f.lat, lon: f.lon };
      }),
      { adresse: m.startAdresse, lat: m.lat, lon: m.lon }) : [];
    tagAktionen.append(
      h('button', { class: 'knopf', disabled: st.length < 2, onClick: () => { tagOptimieren(mitarbeiterId, datum); toast('Route optimiert'); } }, icon('route'), 'Route optimieren'),
      h('button', {
        class: 'knopf', title: 'Freie Zeit mit den besten Vorschlägen auffüllen',
        onClick: () => {
          const vorher = st.length;
          const neu = tagFuellen(st, kandidaten(), punktVon, r);
          speichern(neu);
          toast(neu.length > vorher ? `${neu.length - vorher} Besuche ergänzt` : 'Kein weiterer Besuch passt in den Tag');
        },
      }, icon('zauber'), 'Tag füllen'),
      ...links.map((url, i) => h('a', { class: 'knopf primaer', href: url, target: '_blank', rel: 'noopener' },
        icon('navi'), links.length > 1 ? `Google Maps ${i + 1}/${links.length}` : 'In Google Maps öffnen')),
      st.length ? h('button', {
        class: 'icon-knopf', title: 'Tag leeren', 'aria-label': 'Tag leeren',
        onClick: () => { const alt = st; speichern([]); toast('Tag geleert', { text: 'Rückgängig', fn: () => speichern(alt) }); },
      }, icon('muell')) : '',
    );

    leeren(zeitachse);
    zeitachse.append(h('li', { class: 'zeit-start' },
      h('span', { class: 'zeit' }, minZuZeit(startZeit)),
      h('span', { class: 'start-punkt', style: `--farbe:${m.farbe}` }, icon('auto')),
      h('div', {}, h('strong', {}, 'Abfahrt'), h('div', { class: 'leise klein' }, m.startAdresse))));

    if (!st.length) {
      zeitachse.append(h('li', { class: 'leer-hinweis' },
        h('p', {}, 'Noch keine Besuche geplant.'),
        h('p', { class: 'leise klein' }, 'Auf der Karte eine Firma öffnen und „Zum Tag“ wählen, unten einen Vorschlag übernehmen oder „Tag füllen“ drücken.')));
    }

    z.eintraege.forEach((e, i) => {
      const f = firmaVon(e.stopp.firmaId);
      if (!f) return;
      const status = statusVon(f);
      const besucht = crmVon(f.id).besuche?.includes(datum);
      const fixInput = h('input', { type: 'time', class: 'fix-input', value: e.stopp.fix ?? '', 'aria-label': `Fixtermin ${f.name}`, title: 'Fixtermin (leer = frei)' });
      fixInput.addEventListener('change', () => {
        const neu = st.map((s) => (s.firmaId === f.id ? { ...s, fix: fixInput.value || undefined } : s));
        speichern(neu);
        tagOptimieren(mitarbeiterId, datum);
      });
      const dauerInput = h('input', { type: 'number', class: 'dauer-input', min: 10, max: 480, step: 5, value: e.stopp.dauer ?? r.standardDauer, 'aria-label': 'Besuchsdauer in Minuten' });
      dauerInput.addEventListener('change', () => speichern(st.map((s) => (s.firmaId === f.id ? { ...s, dauer: Number(dauerInput.value) || undefined } : s))));

      const verschieben = (richtung: -1 | 1) => {
        const j = i + richtung;
        if (j < 0 || j >= st.length) return;
        const neu = [...st];
        [neu[i], neu[j]] = [neu[j], neu[i]];
        speichern(neu);
      };

      zeitachse.append(
        h('li', { class: 'fahrt' }, h('span', { class: 'fahrt-linie' }),
          h('span', { class: 'fahrt-text' }, icon('auto'), `${formatDauer(e.fahrMin)} · ${formatKm(e.km)}`,
            e.warten > 5 ? h('span', { class: 'warten' }, ` · ${formatDauer(e.warten)} Wartezeit`) : null)),
        h('li', { class: `stopp${e.stopp.fix ? ' fix' : ''}${e.verspaetung > 0.5 ? ' spaet' : ''}${besucht ? ' erledigt' : ''}${detailId === f.id ? ' aktiv' : ''}` },
          h('span', { class: 'zeit' }, minZuZeit(e.beginn), h('small', {}, minZuZeit(e.ende))),
          h('span', { class: 'nummer', style: `--farbe:${m.farbe}` }, String(i + 1)),
          h('div', { class: 'stopp-inhalt' },
            h('button', { class: 'stopp-name', onClick: () => detailZeigen(f.id) }, f.name),
            h('div', { class: 'leise klein' }, [f.plz, f.ort].filter(Boolean).join(' '), ' · ', brancheVon(f.branchen[0])?.name ?? '',
              status !== 'offen' ? h('span', { class: 'status-pille', style: `--farbe:${STATUS[status].farbe}` }, STATUS[status].name) : null),
            e.verspaetung > 0.5 ? h('div', { class: 'warnung klein' }, `${Math.round(e.verspaetung)} min zu spät für den Fixtermin`) : null,
            h('div', { class: 'stopp-werkzeuge' },
              h('label', { class: 'mini-feld', title: 'Fixtermin' }, icon('uhr'), fixInput),
              h('label', { class: 'mini-feld', title: 'Dauer in Minuten' }, dauerInput, h('span', {}, 'min')),
              h('button', { class: 'icon-knopf klein', 'aria-label': 'Nach oben', disabled: i === 0, onClick: () => verschieben(-1) }, icon('hoch')),
              h('button', { class: 'icon-knopf klein', 'aria-label': 'Nach unten', disabled: i === st.length - 1, onClick: () => verschieben(1) }, icon('runter')),
              h('button', {
                class: `icon-knopf klein${besucht ? ' ok' : ''}`, 'aria-label': 'Als besucht markieren', title: 'Besucht',
                onClick: () => {
                  const b = new Set(crmVon(f.id).besuche ?? []);
                  besucht ? b.delete(datum) : b.add(datum);
                  crmSetzen(f.id, { besuche: [...b], status: status === 'offen' ? 'kontaktiert' : status });
                },
              }, icon('haken')),
              h('button', { class: 'icon-knopf klein', 'aria-label': 'Entfernen', title: 'Aus Tag entfernen', onClick: () => stoppEntfernen(mitarbeiterId, datum, f.id) }, icon('kreuz'))))));
    });

    if (st.length) {
      zeitachse.append(
        h('li', { class: 'fahrt' }, h('span', { class: 'fahrt-linie' }), h('span', { class: 'fahrt-text' }, icon('auto'), `${formatDauer(z.rueckfahrMin)} zurück`)),
        h('li', { class: 'zeit-start' },
          h('span', { class: 'zeit' }, minZuZeit(z.rueckkehr)),
          h('span', { class: 'start-punkt', style: `--farbe:${m.farbe}` }, icon('pin')),
          h('div', {}, h('strong', {}, 'Rückkehr'), h('div', { class: 'leise klein' }, m.startAdresse))));
    }
  }

  function kandidaten() {
    return kandidatenBauen({ heute: heute(), ausschliessen: new Set(geplantInWoche(montag).keys()), nurNeu });
  }

  let aktuelleVorschlaege: Vorschlag[] = [];
  function vorschlaegeZeichnen() {
    const r = rahmenFuer(mitarbeiter());
    aktuelleVorschlaege = vorschlagen(stopps(), kandidaten(), punktVon, r, { anzahl: 10 });
    leeren(vorschlagListe);
    if (!aktuelleVorschlaege.length) {
      vorschlagListe.append(h('li', { class: 'leise klein' }, 'Keine passenden Firmen in der Nähe der Route gefunden.'));
    }
    for (const v of aktuelleVorschlaege) {
      const f = firmaVon(v.id)!;
      const br = brancheVon(f.branchen[0]);
      vorschlagListe.append(h('li', { class: `vorschlag${v.passtInTag ? '' : ' knapp'}` },
        h('span', { class: 'listen-punkt', style: `--farbe:${br?.farbe ?? '#64748b'}` }),
        h('div', { class: 'vorschlag-text' },
          h('button', { class: 'stopp-name', onClick: () => detailZeigen(f.id) }, f.name, f.neu ? h('span', { class: 'mini-badge' }, 'NEU') : null),
          h('div', { class: 'leise klein' }, [f.plz, f.ort].filter(Boolean).join(' '), ' · ', br?.name ?? ''),
          v.gruende.length ? h('div', { class: 'gruende' }, v.gruende.slice(0, 2).map((g) => h('span', {}, g))) : null),
        h('div', { class: 'vorschlag-rechts' },
          h('span', { class: `umweg${v.umwegMin < 10 ? ' gut' : ''}` }, `+${Math.max(0, Math.round(v.umwegMin))} min`),
          !v.passtInTag ? h('span', { class: 'leise klein' }, 'Überzeit') : null,
          h('button', {
            class: 'knopf klein primaer', 'aria-label': `${f.name} einplanen`,
            onClick: () => { stoppHinzufuegen(mitarbeiterId, datum, { firmaId: f.id }); toast(`${f.name} eingeplant`); },
          }, icon('plus')))));
    }
  }

  function karteZeichnen() {
    if (!karte) return;
    const m = mitarbeiter();
    const z = plan();
    const punkte: RoutenPunkt[] = [{ lat: m.lat, lon: m.lon, label: '⌂', titel: `Start: ${m.startAdresse}`, art: 'start' }];
    z.eintraege.forEach((e, i) => {
      const f = firmaVon(e.stopp.firmaId);
      if (f) punkte.push({ lat: f.lat, lon: f.lon, label: String(i + 1), titel: `${i + 1}. ${f.name} (${minZuZeit(e.beginn)})`, art: e.stopp.fix ? 'fix' : 'stopp', id: f.id });
    });
    for (const v of aktuelleVorschlaege) {
      const f = firmaVon(v.id)!;
      punkte.push({ lat: f.lat, lon: f.lon, label: '+', titel: `Vorschlag: ${f.name} (+${Math.round(v.umwegMin)} min)`, art: 'vorschlag', id: f.id });
    }
    // Nur neu einpassen, wenn sich Tag/Mitarbeiter geändert hat (nicht bei jeder Statusänderung)
    const schluessel = `${mitarbeiterId}|${datum}|${z.eintraege.length}`;
    karte.routeZeigen(punkte, m.farbe, true, schluessel !== letzterRoutenSchluessel);
    letzterRoutenSchluessel = schluessel;
  }

  function detailZeigen(id: string | undefined) {
    detailId = id;
    leeren(kartenDetail);
    kartenDetail.hidden = !id;
    const f = id ? firmaVon(id) : undefined;
    if (f) {
      kartenDetail.append(firmaDetail(f, { onSchliessen: () => detailZeigen(undefined), onGeplant: (m, d) => { mitarbeiterId = m; datum = d; montag = montagVon(d); alles(); } }));
      karte?.map.panTo([f.lat, f.lon]);
    }
    zeitachse.querySelectorAll('.stopp').forEach((el) => el.classList.remove('aktiv'));
  }

  function alles() {
    kopfZeichnen();
    tageZeichnen();
    tagZeichnen();
    vorschlaegeZeichnen();
    karteZeichnen();
  }

  beobachten(() => {
    if (!root.isConnected) return;
    mitarbeiterId = zustand().einstellungen.mitarbeiter.some((m) => m.id === mitarbeiterId) ? mitarbeiterId : zustand().einstellungen.mitarbeiter[0].id;
    const aktiv = document.activeElement;
    const tippt = aktiv && root.contains(aktiv) && (aktiv.tagName === 'TEXTAREA' || (aktiv.tagName === 'INPUT' && (aktiv as HTMLInputElement).type !== 'checkbox'));
    if (tippt && kartenDetail.contains(aktiv)) return; // Eingabe im Detail nicht unterbrechen
    alles();
    if (detailId && !kartenDetail.hidden && !tippt) detailZeigen(detailId);
  });

  return {
    el: root,
    titel: 'Wochenplanung',
    anzeigen(params) {
      const m = params.get('m');
      const d = params.get('d');
      if (m) mitarbeiterId = m;
      else mitarbeiterId = zustand().einstellungen.aktiverMitarbeiter;
      if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
        datum = d;
        montag = montagVon(d);
      } else if (!params.toString()) {
        // Wochenende: direkt die nächste Woche zeigen
        const wt = new Date().getDay();
        if (wt === 0 || wt === 6) { montag = plusTage(montagVon(heute()), 7); datum = montag; }
      }
      if (!karte) karte = new Karte(kartenEl, { onFirma: (id) => detailZeigen(id), grundkarte: 'grau' });
      alles();
      requestAnimationFrame(() => karte?.groesseAktualisieren());
    },
  };
}
