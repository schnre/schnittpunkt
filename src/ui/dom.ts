// Minimaler DOM-Helfer statt eines UI-Frameworks.

export type Kind = Node | string | number | null | undefined | false;
type Attribute = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attribute = {},
  ...kinder: (Kind | Kind[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    } else if (k === 'class') {
      el.className = String(v);
    } else if (k === 'html') {
      el.innerHTML = String(v);
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, String(v));
    }
  }
  anhaengen(el, kinder);
  return el;
}

export function anhaengen(el: Element, kinder: (Kind | Kind[])[]): void {
  for (const kind of kinder.flat()) {
    if (kind === null || kind === undefined || kind === false) continue;
    el.append(kind instanceof Node ? kind : document.createTextNode(String(kind)));
  }
}

export function leeren(el: Element): void {
  while (el.firstChild) el.firstChild.remove();
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Fisher-Yates mit optionalem Zufallsgenerator. */
export function mischen<T>(arr: readonly T[], zufall: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Mischt so, dass das Ergebnis (wenn möglich) nicht der Ausgangsreihenfolge entspricht. */
export function mischenUngleich<T>(arr: readonly T[]): T[] {
  if (arr.length < 2) return [...arr];
  for (let versuch = 0; versuch < 10; versuch++) {
    const a = mischen(arr);
    if (a.some((x, i) => x !== arr[i])) return a;
  }
  return [...arr].reverse();
}
