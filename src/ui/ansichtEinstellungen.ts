// Einstellungen: Mitarbeiter mit Startadresse, Arbeitszeiten, GitHub, Datensicherung.
import { aendern, beobachten, ersetzen, leererZustand, normalisieren, zustand } from '../daten/zustand';
import { indexNeuBauen } from '../daten/firmen';
import { ortSuchen } from '../geo/suche';
import type { Mitarbeiter } from '../typen';
import { h, leeren } from './dom';
import { icon } from './icons';
import type { Ansicht } from './router';
import { toast } from './toast';

function adressFeld(m: Mitarbeiter): HTMLElement {
  const input = h('input', { class: 'feld-input', type: 'search', value: m.startAdresse, placeholder: 'Strasse Nr, PLZ Ort', 'aria-label': `Startadresse ${m.name}` });
  const liste = h('ul', { class: 'ort-treffer', hidden: true });
  let timer: ReturnType<typeof setTimeout>;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const t = await ortSuchen(input.value);
        leeren(liste);
        liste.hidden = !t.length;
        for (const o of t) {
          liste.append(h('li', {}, h('button', {
            onClick: () => {
              aendern((z) => {
                const x = z.einstellungen.mitarbeiter.find((y) => y.id === m.id)!;
                Object.assign(x, { startAdresse: o.label, lat: o.lat, lon: o.lon });
              });
              liste.hidden = true;
              toast(`Startort gesetzt: ${o.label}`);
            },
          }, o.label)));
        }
      } catch { /* offline */ }
    }, 250);
  });
  return h('div', { class: 'ort-suche statisch' }, icon('pin'), input, liste);
}

export function einstellungenAnsicht(): Ansicht {
  const root = h('div', { class: 'seite schmal' });

  function zeichnen() {
    leeren(root);
    const e = zustand().einstellungen;
    const setze = (fn: (x: typeof e) => void) => aendern((z) => fn(z.einstellungen));

    const mitarbeiter = e.mitarbeiter.map((m) => {
      const name = h('input', { class: 'feld-input', value: m.name, 'aria-label': 'Name' });
      name.addEventListener('change', () => setze((x) => { x.mitarbeiter.find((y) => y.id === m.id)!.name = name.value.trim() || m.name; }));
      const farbe = h('input', { type: 'color', class: 'farbwahl', value: m.farbe, 'aria-label': 'Farbe' });
      farbe.addEventListener('change', () => setze((x) => { x.mitarbeiter.find((y) => y.id === m.id)!.farbe = farbe.value; }));
      return h('div', { class: 'mitarbeiter-karte' },
        h('div', { class: 'mitarbeiter-zeile' }, farbe, name,
          e.mitarbeiter.length > 1 ? h('button', {
            class: 'icon-knopf', 'aria-label': `${m.name} entfernen`,
            onClick: () => { if (confirm(`${m.name} entfernen? Die Pläne bleiben gespeichert.`)) setze((x) => { x.mitarbeiter = x.mitarbeiter.filter((y) => y.id !== m.id); if (x.aktiverMitarbeiter === m.id) x.aktiverMitarbeiter = x.mitarbeiter[0].id; }); },
          }, icon('muell')) : null),
        h('label', { class: 'feld-label' }, 'Start- und Endpunkt der Touren (Wohnort oder Firma)'),
        adressFeld(m));
    });

    const zeit = (label: string, wert: string, fn: (v: string) => void) => {
      const i = h('input', { type: 'time', class: 'feld-input', value: wert });
      i.addEventListener('change', () => i.value && fn(i.value));
      return h('label', { class: 'feld-block' }, h('span', { class: 'feld-label' }, label), i);
    };
    const dauer = h('input', { type: 'number', class: 'feld-input', min: 10, max: 240, step: 5, value: e.besuchsdauer });
    dauer.addEventListener('change', () => setze((x) => { x.besuchsdauer = Math.max(10, Number(dauer.value) || 45); }));

    const repo = h('input', { class: 'feld-input', value: e.github.repo, placeholder: 'benutzer/sct-aussendienst' });
    const token = h('input', { class: 'feld-input', type: 'password', value: e.github.token, placeholder: 'github_pat_…', autocomplete: 'off' });
    const ghSpeichern = () => setze((x) => { x.github = { repo: repo.value.trim().replace(/^https:\/\/github.com\//, ''), token: token.value.trim() }; });
    repo.addEventListener('change', ghSpeichern);
    token.addEventListener('change', ghSpeichern);

    const datei = h('input', { type: 'file', accept: 'application/json', hidden: true });
    datei.addEventListener('change', async () => {
      const f = datei.files?.[0];
      if (!f) return;
      try {
        ersetzen(normalisieren(JSON.parse(await f.text())));
        indexNeuBauen();
        toast('Daten importiert');
      } catch {
        toast('Datei konnte nicht gelesen werden');
      }
    });

    root.append(
      h('header', { class: 'seiten-kopf' }, h('div', {}, h('h1', {}, 'Einstellungen'))),

      h('section', { class: 'karte-block' },
        h('h2', {}, 'Aussendienst'),
        ...mitarbeiter,
        h('button', {
          class: 'knopf geist',
          onClick: () => setze((x) => {
            const vorlage = x.mitarbeiter[0];
            x.mitarbeiter.push({ ...vorlage, id: `m${Date.now()}`, name: `Aussendienst ${x.mitarbeiter.length + 1}`, farbe: '#16a34a' });
          }),
        }, icon('plus'), 'Person hinzufügen')),

      h('section', { class: 'karte-block' },
        h('h2', {}, 'Arbeitstag'),
        h('div', { class: 'raster-3' },
          zeit('Arbeitsbeginn', e.arbeitsbeginn, (v) => setze((x) => { x.arbeitsbeginn = v; })),
          zeit('Arbeitsende', e.arbeitsende, (v) => setze((x) => { x.arbeitsende = v; })),
          h('label', { class: 'feld-block' }, h('span', { class: 'feld-label' }, 'Besuchsdauer (min)'), dauer))),

      h('section', { class: 'karte-block' },
        h('h2', {}, 'Darstellung'),
        h('div', { class: 'segment' }, (['auto', 'hell', 'dunkel'] as const).map((t) =>
          h('button', { class: `segment-knopf${e.thema === t ? ' aktiv' : ''}`, onClick: () => setze((x) => { x.thema = t; }) },
            { auto: 'Wie System', hell: 'Hell', dunkel: 'Dunkel' }[t])))),

      h('section', { class: 'karte-block' },
        h('h2', {}, 'Handelsregister-Abfrage per Knopf'),
        h('p', { class: 'leise klein' }, 'Optional. Die Abfrage läuft ohnehin jeden Monat automatisch. Damit „Jetzt abfragen“ funktioniert, braucht es das GitHub-Repository und einen Fine-grained Token mit der Berechtigung „Actions: Read and write“ nur für dieses Repository. Der Token bleibt in diesem Browser.'),
        h('label', { class: 'feld-block' }, h('span', { class: 'feld-label' }, 'Repository'), repo),
        h('label', { class: 'feld-block' }, h('span', { class: 'feld-label' }, 'Token'), token)),

      h('section', { class: 'karte-block' },
        h('h2', {}, 'Datensicherung'),
        h('p', { class: 'leise klein' }, 'Status, Notizen, Kontakte und Wochenpläne werden in diesem Browser gespeichert. Mit Export/Import übertragen Sie sie auf ein anderes Gerät.'),
        h('div', { class: 'knopf-reihe' },
          h('button', {
            class: 'knopf',
            onClick: () => {
              const z = { ...zustand(), einstellungen: { ...zustand().einstellungen, github: { repo: zustand().einstellungen.github.repo, token: '' } } };
              const a = h('a', { href: URL.createObjectURL(new Blob([JSON.stringify(z, null, 1)], { type: 'application/json' })), download: `sct-aussendienst-${new Date().toISOString().slice(0, 10)}.json` });
              a.click();
            },
          }, icon('herunterladen'), 'Exportieren'),
          h('button', { class: 'knopf', onClick: () => datei.click() }, icon('hochladen'), 'Importieren'), datei,
          h('button', {
            class: 'knopf gefahr',
            onClick: () => { if (confirm('Alle eigenen Daten (Status, Notizen, Pläne) in diesem Browser löschen?')) { ersetzen(leererZustand()); indexNeuBauen(); } },
          }, icon('muell'), 'Alles zurücksetzen'))),
    );
  }

  beobachten(() => {
    const a = document.activeElement as HTMLInputElement | null;
    const tippt = a && root.contains(a) && a.tagName === 'INPUT' && !['color', 'file'].includes(a.type);
    if (root.isConnected && !tippt) zeichnen();
  });

  return { el: root, titel: 'Einstellungen', anzeigen: zeichnen };
}
