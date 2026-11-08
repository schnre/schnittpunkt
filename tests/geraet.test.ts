import { describe, expect, it } from 'vitest';
import { androidName, iphoneName, klassifizieren, profilVon, type Geraet } from '../src/ui/geraet';

describe('Geräteerkennung', () => {
  it('erkennt iPhones an Bildschirmgrösse und Pixeldichte (auch im Querformat)', () => {
    expect(iphoneName(393, 852, 3)).toBe('iPhone 14 Pro / 15 / 16');
    expect(iphoneName(852, 393, 3)).toBe('iPhone 14 Pro / 15 / 16');
    expect(iphoneName(375, 667, 2)).toBe('iPhone SE / 6–8');
    expect(iphoneName(440, 956, 3)).toBe('iPhone 16 Pro Max / 17 Pro Max');
    expect(iphoneName(414, 896, 2)).toBe('iPhone XR / 11');
    expect(iphoneName(414, 896, 3)).toBe('iPhone XS Max / 11 Pro Max');
    expect(iphoneName(400, 800, 3)).toBeUndefined();
  });

  it('übersetzt Android-Modellnummern', () => {
    expect(androidName('SM-S921B')).toBe('Samsung Galaxy S24');
    expect(androidName('SM-S911B')).toBe('Samsung Galaxy S23');
    expect(androidName('SM-A546B')).toBe('Samsung Galaxy A54');
    expect(androidName('SM-F946B')).toBe('Samsung Galaxy Z Fold');
    expect(androidName('Pixel 8 Pro')).toBe('Google Pixel 8 Pro');
    expect(androidName('ONEPLUS A6013')).toBe('ONEPLUS A6013');
  });

  it('klassifiziert Telefon, Tablet und Computer', () => {
    expect(klassifizieren({ breite: 393, hoehe: 852, mobilOS: true })).toMatchObject({ typ: 'telefon', klasse: 'normal' });
    expect(klassifizieren({ breite: 360, hoehe: 780, mobilOS: true })).toMatchObject({ typ: 'telefon', klasse: 'kompakt' });
    expect(klassifizieren({ breite: 430, hoehe: 932, mobilOS: true })).toMatchObject({ typ: 'telefon', klasse: 'gross' });
    expect(klassifizieren({ breite: 820, hoehe: 1180, mobilOS: true }).typ).toBe('tablet');
    // Touch-Laptop mit Windows bleibt ein Computer
    expect(klassifizieren({ breite: 720, hoehe: 1280, mobilOS: false }).typ).toBe('desktop');
    expect(klassifizieren({ breite: 360, hoehe: 780, mobilOS: true, speicher: 2 }).leistung).toBe('niedrig');
  });

  it('leitet ein passendes Darstellungsprofil ab', () => {
    const telefon: Geraet = { name: 'iPhone', typ: 'telefon', klasse: 'normal', breite: 393, hoehe: 852, dpr: 3, touch: true, leistung: 'normal' };
    const p = profilVon(telefon);
    expect(p.cluster).toBe(true);
    expect(p.ziel).toBeGreaterThanOrEqual(44);
    expect(p.karteDpr).toBeLessThan(3); // 3×-Displays zeichnen die Karte etwas gröber: spart Akku, kaum sichtbar
    expect(profilVon(telefon, 'gross').skala).toBeGreaterThan(p.skala);
    expect(profilVon({ ...telefon, typ: 'desktop', touch: false, dpr: 1 }).cluster).toBe(false);
    expect(profilVon({ ...telefon, leistung: 'niedrig' }).karteDpr).toBe(1.5);
  });
});
