// Kurze Rückmeldungen am unteren Bildschirmrand.
import { h } from './dom';

let behaelter: HTMLElement | undefined;

export function toast(text: string, aktion?: { text: string; fn: () => void }) {
  behaelter ??= document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const el = h('div', { class: 'toast' }, h('span', {}, text),
    aktion ? h('button', { class: 'toast-aktion', onClick: () => { aktion.fn(); el.remove(); } }, aktion.text) : null);
  behaelter.append(el);
  setTimeout(() => el.classList.add('weg'), 3600);
  setTimeout(() => el.remove(), 4000);
}
