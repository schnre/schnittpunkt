// Ziehbares Bottom-Sheet für schmale Bildschirme (Liste und Details über der Karte).
// Das Blatt rastet in Stufen ein (z. B. eingeklappt / halb / ganz). Auf breiten Bildschirmen
// ist es ein normales Seitenpanel; dann werden alle Inline-Stile entfernt.

export const MOBIL = '(max-width: 900px)';

export interface BlattOptionen {
  /** Sichtbare Höhe je Stufe in px, abhängig von der Höhe des Containers. Aufsteigend. */
  stufen: (hoehe: number) => number[];
  start?: number;
  /** Nach unten unter die erste Stufe gezogen (z. B. Detail schliessen) */
  onZu?: () => void;
  onStufe?: (i: number) => void;
}

export interface Blatt {
  setzen(i: number, animiert?: boolean): void;
  stufe(): number;
  aktiv(): boolean;
}

export function blattMachen(el: HTMLElement, griffe: HTMLElement[], opt: BlattOptionen): Blatt {
  const mq = matchMedia(MOBIL);
  let stufe = opt.start ?? 0;
  let ziehen: { y0: number; h0: number; t0: number; letzteY: number; letzteT: number; v: number } | undefined;

  const container = () => el.parentElement?.clientHeight || window.innerHeight;
  const hoehen = () => opt.stufen(container());

  function anwenden(hoehe: number, animiert: boolean) {
    el.style.transition = animiert ? '' : 'none';
    el.style.setProperty('--blatt-h', `${Math.round(hoehe)}px`);
    // Unsichtbarer Teil unten: so weit muss die Liste zusätzlich scrollen können
    el.style.setProperty('--blatt-rest', `${Math.max(0, Math.round(hoehen().at(-1)! - hoehe))}px`);
  }

  function setzen(i: number, animiert = true) {
    const h = hoehen();
    stufe = Math.max(0, Math.min(h.length - 1, i));
    if (!mq.matches) return;
    anwenden(h[stufe], animiert);
    el.dataset.stufe = String(stufe);
    el.classList.toggle('blatt-voll', stufe === h.length - 1);
    opt.onStufe?.(stufe);
  }

  function modus() {
    el.classList.toggle('blatt', mq.matches);
    if (mq.matches) setzen(stufe, false);
    else {
      el.style.removeProperty('--blatt-h');
      el.style.removeProperty('--blatt-rest');
      el.style.transition = '';
      delete el.dataset.stufe;
      el.classList.remove('blatt-voll');
    }
  }

  const start = (e: PointerEvent) => {
    if (!mq.matches || e.button > 0) return;
    // Innerhalb scrollbarer Liste nur ziehen, wenn sie ganz oben ist und das Blatt nicht voll
    const ziel = e.target as HTMLElement;
    if (ziel.closest('input, textarea, select, a, .blatt-kein-zug')) return;
    const h = hoehen()[stufe];
    ziehen = { y0: e.clientY, h0: h, t0: e.timeStamp, letzteY: e.clientY, letzteT: e.timeStamp, v: 0 };
  };
  const bewegen = (e: PointerEvent) => {
    if (!ziehen) return;
    const dy = e.clientY - ziehen.y0;
    if (Math.abs(dy) < 6 && !el.classList.contains('zieht')) return;
    if (!el.classList.contains('zieht')) {
      el.classList.add('zieht');
      (e.target as Element).setPointerCapture?.(e.pointerId);
    }
    const dt = Math.max(1, e.timeStamp - ziehen.letzteT);
    ziehen.v = (e.clientY - ziehen.letzteY) / dt; // px/ms, positiv = nach unten
    ziehen.letzteY = e.clientY;
    ziehen.letzteT = e.timeStamp;
    const max = hoehen().at(-1)!;
    anwenden(Math.max(40, Math.min(max + 20, ziehen.h0 - dy)), false);
    e.preventDefault();
  };
  const ende = (e: PointerEvent) => {
    if (!ziehen) return;
    const war = el.classList.contains('zieht');
    el.classList.remove('zieht');
    const z = ziehen;
    ziehen = undefined;
    if (!war) return;
    const h = hoehen();
    const aktuell = z.h0 - (e.clientY - z.y0);
    // Schneller Wisch: eine Stufe weiter in Wischrichtung
    if (Math.abs(z.v) > 0.5) {
      const naechste = z.v > 0 ? stufe - 1 : stufe + 1;
      if (naechste < 0 && opt.onZu) return opt.onZu();
      return setzen(naechste);
    }
    if (opt.onZu && aktuell < h[0] * 0.6) return opt.onZu();
    let beste = 0;
    h.forEach((x, i) => { if (Math.abs(x - aktuell) < Math.abs(h[beste] - aktuell)) beste = i; });
    setzen(beste);
  };

  for (const g of griffe) {
    g.addEventListener('pointerdown', start);
    g.addEventListener('pointermove', bewegen);
    g.addEventListener('pointerup', ende);
    g.addEventListener('pointercancel', ende);
    g.style.touchAction = 'none';
  }
  mq.addEventListener('change', modus);
  new ResizeObserver(() => { if (mq.matches && !ziehen) setzen(stufe, false); }).observe(document.documentElement);
  modus();

  return { setzen, stufe: () => stufe, aktiv: () => mq.matches };
}
