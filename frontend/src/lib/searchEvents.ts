/** Dispatched on `window` so header / shell can open the command palette (synthetic ⌘K is unreliable). */
export const OPEN_SEARCH_EVENT = 'dba-dash-open-search';

export function openSearchPalette() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}
