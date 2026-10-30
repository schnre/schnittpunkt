// Handelsregister: Stand der letzten Abfrage, neue Firmen, Verlauf, Suchprofil, Abfrage auslösen.
import profil from '../../config/suchprofil.json';
import { BRANCHEN, alleFirmen, brancheVon, dateiInfo } from '../daten/firmen';
import { lang, monatName } from '../daten/datum';
import { zustand } from '../daten/zustand';
import type { Lauf } from '../typen';
import { h, leeren } from './dom';
import { icon } from './icons';
import type { Ansicht } from './router';
import { toast } from './toast';

/** Löst den Workflow "Handelsregister" über die GitHub-API aus (workflow_dispatch). */
async function abfrageStarten(modus: 'monat' | 'bestand') {
  const { repo, token } = zustand().einstellungen.github;
  const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/handelsregister.yml/dispatches`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    body: JSON.stringify({ ref: 'main', inputs: { modus } }),
  });
  if (r.status !== 204) throw new Error(`GitHub antwortet mit ${r.status}`);
}

function naechsteAbfrage(): string {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return lang(`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-01`);
}

export function registerAnsicht(): Ansicht {
  const root = h('div', { class: 'seite' });

  function zeichnen() {
    leeren(root);
    const d = dateiInfo();
    const laeufe = [...(d?.laeufe ?? [])].reverse();
    const letzter: Lauf | undefined = laeufe[0];
    const neue = alleFirmen().filter((f) => f.neu).sort((a, b) => b.passung - a.passung);
    const { repo, token } = zustand().einstellungen.github;

    const startKnopf = (modus: 'monat' | 'bestand', text: string, primaer = false) => h('button', {
      class: `knopf${primaer ? ' primaer' : ''}`,
      onClick: async (e: Event) => {
        const k = e.currentTarget as HTMLButtonElement;
        if (!repo || !token) {
          location.hash = '#/einstellungen';
          toast('Zuerst GitHub-Repository und Token eintragen');
          return;
        }
        k.disabled = true;
        try {
          await abfrageStarten(modus);
          toast('Abfrage gestartet. Die Daten sind in etwa 10–30 Minuten aktualisiert.');
        } catch (err) {
          toast(`Start fehlgeschlagen: ${(err as Error).message}`);
        } finally {
          k.disabled = false;
        }
      },
    }, icon('aktualisieren'), text);

    root.append(
      h('header', { class: 'seiten-kopf' },
        h('div', {}, h('h1', {}, 'Handelsregister'),
          h('span', { class: 'leise' }, 'Neue potenzielle Kunden aus dem Schweizerischen Handelsamtsblatt (SHAB) und Zefix')),
        h('div', { class: 'kopf-aktionen' },
          startKnopf('monat', 'Jetzt neue Firmen abfragen', true),
          repo ? h('a', { class: 'knopf geist', href: `https://github.com/${repo}/actions/workflows/handelsregister.yml`, target: '_blank', rel: 'noopener' }, icon('extern'), 'Verlauf auf GitHub') : null)),

      d?.demo ? h('div', { class: 'hinweis-box' }, icon('info'),
        h('div', {}, h('strong', {}, 'Es sind noch Demodaten geladen. '),
          'Beim ersten Start der Abfrage werden sie durch echte Firmen ersetzt. Für den ersten Bestand einmal „Bestand aufbauen“ ausführen (dauert länger), danach läuft die Monatsabfrage automatisch.',
          h('div', { class: 'knopf-reihe' }, startKnopf('bestand', 'Bestand aufbauen')))) : '',

      h('div', { class: 'kacheln' },
        h('div', { class: 'kachel' }, h('span', { class: 'kachel-label' }, 'Letzte Abfrage'),
          h('strong', { class: 'kachel-zahl' }, letzter ? lang(letzter.datum) : '–'),
          h('span', { class: 'leise klein' }, letzter?.von ? `Publikationen ${lang(letzter.von)} bis ${lang(letzter.bis)}` : '')),
        h('div', { class: 'kachel akzent' }, h('span', { class: 'kachel-label' }, 'Neu gefunden'),
          h('strong', { class: 'kachel-zahl' }, String(neue.length)),
          h('a', { class: 'klein', href: '#/karte?neu=1' }, 'Auf der Karte zeigen →')),
        h('div', { class: 'kachel' }, h('span', { class: 'kachel-label' }, 'Firmen total'),
          h('strong', { class: 'kachel-zahl' }, alleFirmen().length.toLocaleString('de-CH')),
          h('span', { class: 'leise klein' }, `${BRANCHEN.length} Branchen im Suchprofil`)),
        h('div', { class: 'kachel' }, h('span', { class: 'kachel-label' }, 'Nächste automatische Abfrage'),
          h('strong', { class: 'kachel-zahl' }, naechsteAbfrage()),
          h('span', { class: 'leise klein' }, 'jeweils am 1. des Monats, 05:00'))),

      h('section', { class: 'karte-block' },
        h('h2', {}, `Neu im Handelsregister${letzter?.von ? ` (${monatName(letzter.von)})` : ''}`),
        neue.length
          ? h('ul', { class: 'neu-liste' }, neue.map((f) => {
            const br = brancheVon(f.branchen[0]);
            return h('li', {}, h('a', { href: `#/karte?firma=${encodeURIComponent(f.id)}` },
              h('span', { class: 'listen-punkt', style: `--farbe:${br?.farbe}` }),
              h('span', { class: 'listen-text' }, h('span', { class: 'listen-name' }, f.name),
                h('span', { class: 'listen-meta' }, [f.plz, f.ort].filter(Boolean).join(' '), ' · ', br?.name ?? '', f.eintrag ? ` · publiziert ${lang(f.eintrag)}` : '')),
              h('span', { class: 'passung-zahl' }, `${f.passung}`)));
          }))
          : h('p', { class: 'leise' }, 'In der letzten Abfrage wurden keine neuen passenden Firmen gefunden.')),

      h('div', { class: 'zwei-spalten' },
        h('section', { class: 'karte-block' },
          h('h2', {}, 'Verlauf'),
          h('table', { class: 'tabelle kompakt' },
            h('thead', {}, h('tr', {}, ['Datum', 'Art', 'Zeitraum', 'Geprüft', 'Neu', 'Total'].map((t) => h('th', { scope: 'col' }, t)))),
            h('tbody', {}, laeufe.map((l) => h('tr', {},
              h('td', {}, lang(l.datum)), h('td', {}, l.modus === 'monat' ? 'Monat' : 'Bestand'),
              h('td', { class: 'klein' }, l.von ? `${l.von} – ${l.bis}` : '–'),
              h('td', {}, l.geprueft.toLocaleString('de-CH')), h('td', {}, h('strong', {}, String(l.neu))), h('td', {}, l.gesamt.toLocaleString('de-CH'))))))),
        h('section', { class: 'karte-block' },
          h('h2', {}, 'Suchprofil'),
          h('p', { class: 'leise klein' }, `Firmen ab Passung ${profil.minPassung} werden übernommen. Stichworte werden in Firmenname und Zweck gesucht. Anpassen in config/suchprofil.json.`),
          h('ul', { class: 'profil-liste' }, profil.branchen.map((b) => h('li', {},
            h('span', { class: 'punkt', style: `background:${b.farbe}` }),
            h('span', { class: 'profil-name' }, b.name, h('small', { class: 'leise' }, b.stichworte.slice(0, 5).join(', ') + (b.stichworte.length > 5 ? ' …' : ''))),
            h('span', { class: 'passung' }, h('div', { class: 'passung-balken' }, h('span', { style: `width:${b.gewicht}%` })), h('span', {}, String(b.gewicht)))))))),

      h('p', { class: 'leise klein quellen' },
        'Quellen: ', h('a', { href: 'https://www.amtsblattportal.ch', target: '_blank', rel: 'noopener' }, 'amtsblattportal.ch (SHAB)'), ', ',
        h('a', { href: 'https://www.zefix.admin.ch', target: '_blank', rel: 'noopener' }, 'Zefix'), ', ',
        h('a', { href: 'https://www.geo.admin.ch', target: '_blank', rel: 'noopener' }, 'geo.admin.ch'),
        `. Datenstand ${d?.stand ? lang(d.stand.slice(0, 10)) : '–'}.`),
    );
  }

  return { el: root, titel: 'Handelsregister', anzeigen: zeichnen };
}
