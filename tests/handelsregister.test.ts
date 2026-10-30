import profil from '../config/suchprofil.json';
import { describe, expect, it } from 'vitest';
import { normalisieren, passungBerechnen } from '../scripts/lib/passung.mjs';
import { geoTreffer, hrPublikationLesen, shabListeUrl, uidNormalisieren, zefixZuFirma } from '../scripts/lib/quellen.mjs';


describe('Passung', () => {
  it('erkennt Plattenleger über den Zweck', () => {
    const r = passungBerechnen({ name: 'Muster GmbH', zweck: 'Ausführung von Plattenlegerarbeiten und Handel mit Keramik.' }, profil);
    expect(r.passung).toBeGreaterThanOrEqual(90);
    expect(r.branchen[0]).toBe('platten');
  });
  it('Betonbohren ist am wertvollsten', () => {
    const r = passungBerechnen({ name: 'Bohr AG', zweck: 'Betonbohren, Betonschneiden und Kernbohrungen' }, profil);
    expect(r.branchen[0]).toBe('beton');
    expect(r.passung).toBe(100);
  });
  it('Personennamen lösen keine Treffer aus (Wortanfang)', () => {
    // "Steiner" darf nicht "stein..." treffen, "Bauer" nicht "bau..."-Stichworte wie "bauunternehm"
    const r = passungBerechnen({ name: 'Steiner Bauer Consulting GmbH', zweck: 'Beratung im Bereich Personalwesen.' }, profil);
    expect(r.passung).toBe(0);
  });
  it('Ausschlusswörter senken die Passung', () => {
    const mit = passungBerechnen({ name: 'X AG', zweck: 'Hochbau und Immobilien-Verwaltung' }, profil);
    const ohne = passungBerechnen({ name: 'X AG', zweck: 'Hochbau und Umbau' }, profil);
    expect(mit.passung).toBeLessThan(ohne.passung);
    expect(mit.passung).toBeLessThan(profil.minPassung);
  });
  it('französische Einträge werden erkannt', () => {
    const r = passungBerechnen({ name: 'Dupont Sàrl', zweck: 'Travaux de carrelage et pose de pierre naturelle' }, profil);
    expect(r.branchen).toEqual(expect.arrayContaining(['platten', 'naturstein']));
  });
  it('normalisiert Satzzeichen', () => {
    expect(normalisieren('Bohr- und Schneid-Arbeiten!')).toBe(' bohr und schneid arbeiten ');
  });
});

describe('Amtsblattportal', () => {
  it('baut nur erlaubte Parameter (Schutz vor still ignorierten Filtern)', () => {
    const url = shabListeUrl({ rubrics: 'HR', subRubrics: 'HR01', 'pageRequest.size': 100 });
    expect(url).toContain('subRubrics=HR01');
    expect(() => shabListeUrl({ canton: 'ZH' })).toThrow(/Unbekannter/);
  });

  it('liest Firma, UID und Zweck aus einer HR01-Publikation', () => {
    // Struktur angelehnt an den SHAB-Export (Namensraum je Rubrik, Inhalt unter content)
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HR01:publication xmlns:HR01="https://shab.ch/shab/HR01-export">
  <meta><id>abc</id><title><de>Neueintragung Alpstein Platten GmbH, Frauenfeld</de></title></meta>
  <content>
    <commonsNew>
      <company>
        <name>Alpstein Platten GmbH</name>
        <uid>CHE-123.456.789</uid>
        <seat>Frauenfeld</seat>
        <address><street>Industriestrasse</street><houseNumber>5</houseNumber><swissZipCode>8500</swissZipCode><town>Frauenfeld</town></address>
      </company>
      <purpose>Ausführung von Plattenleger- &amp; Natursteinarbeiten.</purpose>
    </commonsNew>
    <publicationText>&lt;p&gt;Eingetragene Personen: Muster, Hans&lt;/p&gt;</publicationText>
  </content>
</HR01:publication>`;
    const p = hrPublikationLesen(xml);
    expect(p.name).toBe('Alpstein Platten GmbH');
    expect(p.uid).toBe('CHE-123.456.789');
    expect(p.zweck).toBe('Ausführung von Plattenleger- & Natursteinarbeiten.');
    expect(p.adresse).toEqual({ strasse: 'Industriestrasse 5', plz: '8500', ort: 'Frauenfeld' });
  });

  it('findet den Zweck auch im Fliesstext', () => {
    const xml = `<publication><content><publicationText>&lt;p&gt;Muster Gartenbau GmbH, in Wil SG, CHE-111.222.333, Gesellschaft mit beschränkter Haftung (Neueintragung). Zweck: Gartenbau und Gartenunterhalt sowie Pflästerungen. Eingetragene Personen: Muster, Anna&lt;/p&gt;</publicationText></content></publication>`;
    const p = hrPublikationLesen(xml);
    expect(p.uid).toBe('CHE-111.222.333');
    expect(p.zweck).toBe('Gartenbau und Gartenunterhalt sowie Pflästerungen.');
  });

  it('UID-Formate', () => {
    expect(uidNormalisieren('CHE238945329')).toBe('CHE-238.945.329');
    expect(uidNormalisieren('UID CHE-238.945.329 MWST')).toBe('CHE-238.945.329');
  });
});

describe('Zefix und geo.admin.ch', () => {
  it('wandelt ein Zefix-Firmendetail um', () => {
    // Felder wie in der echten Antwort von GET firm/{ehraid}.json
    const f = zefixZuFirma({
      name: 'Beispiel Naturstein AG', ehraid: 1, uid: 'CHE238945329', uidFormatted: 'CHE-238.945.329',
      legalSeat: 'Schlieren', legalFormId: 3, status: 'EXISTIEREND', shabDate: '2026-10-14',
      cantonalExcerptWeb: 'https://zh.chregister.ch/cr-portal/auszug/auszug.xhtml?uid=CHE-238.945.329',
      purpose: 'Bearbeitung von Naturstein.',
      address: { organisation: 'x', careOf: '', street: 'Wiesenstrasse', houseNumber: '15', addon: '', poBox: '', town: 'Schlieren', swissZipCode: '8952', country: 'CH' },
      shabPub: [{ registryOfficeCanton: 'ZH' }],
    }, { 3: 'AG' });
    expect(f).toMatchObject({ id: 'CHE-238.945.329', rechtsform: 'AG', strasse: 'Wiesenstrasse 15', plz: '8952', ort: 'Schlieren', kanton: 'ZH', eintrag: '2026-10-14' });
  });

  it('liest Koordinaten und Kanton aus dem SearchServer', () => {
    const g = geoTreffer({ results: [{ attrs: { origin: 'address', lat: 47.551081234, lon: 8.878791234, detail: 'zuercherstrasse 378 8500 frauenfeld 4566 frauenfeld ch tg' } }] });
    expect(g).toEqual({ lat: 47.55108, lon: 8.87879, genau: true, kanton: 'TG' });
    expect(geoTreffer({ results: [] })).toBeUndefined();
  });
});
