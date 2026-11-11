/*
 * i18n.js — which language Starswing speaks, and every word it says.
 *
 * The hub's contract (CLAUDE.md §2, "Two languages, Norwegian first"):
 * bokmål and English, Norwegian by default whatever the browser prefers, one
 * choice for the whole arcade stored as `arcade.lang.v1`, switched live from
 * the menu panel. The same shape as geometry_pong/js/i18n.js.
 *
 *   t(key, ...args)     the current language, else English, else the key
 *                       itself (warning once per missing key)
 *   getLang()           "nb" | "en"
 *   setLang(lang)       validate, store, set <html lang>, repaint, then
 *                       dispatch `arcade:lang` on document
 *   paintStatic(root)   [data-i18n] -> textContent,
 *                       [data-i18n-label] -> aria-label and title,
 *                       [data-i18n-aria] -> aria-label only
 *
 * Canvas text (the HUD, the hints) calls t() every frame, so it follows a
 * switch on the next frame. js/update.js and js/screen.js import nothing and
 * keep their own few words; so does the crash bar in index.html.
 */

const KEY = 'arcade.lang.v1';

function initial() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'nb' || saved === 'en') return saved;
  } catch {
    // No storage: the default stands.
  }
  return 'nb';
}

let lang = initial();
document.documentElement.lang = lang;

export const getLang = () => lang;

const STRINGS = {
  nb: {
    'sky.label': 'Stjernehimmelen',
    'start.how': 'Hold for å gripe en stjerne og svinge rundt den. Slipp for å fly videre. Hvor høyt kommer du?',
    'play': 'Spill',
    'menu': 'Meny',
    'settings': 'Innstillinger',
    'paused': 'Pause',
    'pause.tag': 'Kometen venter på stjernen sin.',
    'resume': 'Fortsett',
    'restart': 'Start på nytt',
    'mainMenu': 'Hovedmeny',
    'playAgain': 'Spill igjen',
    'back': 'Tilbake',
    'music': 'Musikk',
    'sfx': 'Effekter',
    'sound.hint': 'Hver nye stjerne du griper, spiller en tone høyere.',
    'mute': 'Lyd av',
    'unmute': 'Lyd på',
    'language': 'Språk',
    'exit.arcade': 'Tilbake til arkaden',
    'exit.close': 'Lukk',
    'exit.refused': 'Lukk vinduet selv',
    'hud.line': (m, best) => (best ? `${m} m · Rekord ${best}` : `${m} m`),
    'hint.hold': 'Hold inne, og slipp for å fly',
    'hint.release': 'Slipp for å fly',
    'hint.grab': 'Hold for å gripe en stjerne',
    'over.points': (n) => `${n} poeng`,
    'over.record': 'Ny rekord!',
    'over.detail': (m, dust, best) => `${m} m · ${dust} stjernestøv · Rekord ${best}`,
  },
  en: {
    'sky.label': 'The night sky',
    'start.how': 'Hold to catch a star and swing round it. Let go to fly on. How high can you get?',
    'play': 'Play',
    'menu': 'Menu',
    'settings': 'Settings',
    'paused': 'Paused',
    'pause.tag': 'The comet is waiting on its star.',
    'resume': 'Resume',
    'restart': 'Restart',
    'mainMenu': 'Main menu',
    'playAgain': 'Play again',
    'back': 'Back',
    'music': 'Music',
    'sfx': 'Effects',
    'sound.hint': 'Every new star you catch plays one note higher.',
    'mute': 'Mute',
    'unmute': 'Sound on',
    'language': 'Language',
    'exit.arcade': 'Back to arcade',
    'exit.close': 'Close',
    'exit.refused': 'Close the window yourself',
    'hud.line': (m, best) => (best ? `${m} m · Best ${best}` : `${m} m`),
    'hint.hold': 'Hold down, then let go to fly',
    'hint.release': 'Let go to fly',
    'hint.grab': 'Hold to catch a star',
    'over.points': (n) => `${n} points`,
    'over.record': 'New best!',
    'over.detail': (m, dust, best) => `${m} m · ${dust} stardust · Best ${best}`,
  },
};

const warned = new Set();

export function t(key, ...args) {
  let v = STRINGS[lang][key];
  if (v === undefined) v = STRINGS.en[key];
  if (v === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`Starswing: no words for "${key}"`);
    }
    return key;
  }
  return typeof v === 'function' ? v(...args) : v;
}

export function paintStatic(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of root.querySelectorAll('[data-i18n-label]')) {
    const s = t(el.dataset.i18nLabel);
    el.setAttribute('aria-label', s);
    el.title = s;
  }
  // aria-label alone, for the canvas: a tooltip over the whole sky would
  // follow every finger around it.
  for (const el of root.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  for (const b of root.querySelectorAll('[data-lang]')) b.setAttribute('aria-pressed', String(b.dataset.lang === lang));
}

export function setLang(next) {
  if (next !== 'nb' && next !== 'en') return;
  lang = next;
  document.documentElement.lang = lang;
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    // Not remembered; this visit still switches.
  }
  paintStatic();
  document.dispatchEvent(new CustomEvent('arcade:lang', { detail: lang }));
}
