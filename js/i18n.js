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
 *   said(key, ...args)  an Error carrying its key, for the net code's failures
 *   paintStatic(root)   [data-i18n] -> textContent,
 *                       [data-i18n-label] -> aria-label and title,
 *                       [data-i18n-aria] -> aria-label only
 *
 * Canvas text (the HUD, the hints) calls t() every frame, so it follows a
 * switch on the next frame. js/update.js and js/screen.js import nothing and
 * keep their own few words; so does the crash bar in index.html.
 */

import { codeIcons } from './net/codes.js';

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
    'players': 'Spillere',
    'hint.strip': 'Hold her',
    'hint.out': 'Du kommer tilbake på stjernen til en venn',
    'over.team': (m, dust) => `${m} m · ${dust} stjernestøv`,
    'live': 'Meny',
    'live.tag': 'Himmelen går videre – knappen din virker fortsatt.',
    'colour.0': 'Blå',
    'colour.1': 'Rosa',
    'colour.2': 'Gul',
    'colour.3': 'Grønn',
    'online': 'På nett',
    'online.tag': 'Én spiller per skjerm, alle i samme himmel.',
    'online.host': 'Lag rom',
    'online.join': 'Bli med',
    'online.code': 'Kode',
    'online.clear': 'Visk ut',
    'online.roomTag': 'Si de tre bildene høyt. Den som kommer sent, hopper rett inn.',
    'online.joinTag': 'Trykk på de tre bildene fra den andre skjermen.',
    'online.guestWait': 'Venter på at verten starter.',
    'seat.you': 'deg',
    'seat.host': 'vert',
    'seat.guest': 'gjest',
    'seat.open': 'ledig',
    'status.left': (seat) => `${colourName(seat)} gikk.`,
    'sym.fox': 'rev',
    'sym.duck': 'and',
    'sym.bee': 'bie',
    'sym.car': 'bil',
    'sym.rocket': 'rakett',
    'sym.pizza': 'pizza',
    'sym.tree': 'tre',
    'sym.star': 'stjerne',
    'sym.moon': 'måne',
    'sym.key': 'nøkkel',
    'sym.hat': 'hatt',
    'sym.ball': 'ball',
    'status.opening': 'Lager et rom …',
    'status.broker': 'Rommet er åpent. Ikke la skjermen sovne.',
    'status.tabs': 'Fant ikke megleren på nett, så bare andre faner i denne nettleseren kan bli med.',
    'status.relay': 'Rommet går gjennom ditt eget relé.',
    'status.openFail': 'Fikk ikke laget et rom.',
    'status.looking': 'Leter etter rommet …',
    'status.in': 'Du er med.',
    'status.joined': (seat) => `${colourName(seat)} ble med.`,
    'why.version': 'Den andre skjermen har en annen versjon av spillet. Last inn begge på nytt.',
    'why.full': 'Rommet er fullt.',
    'why.refused': 'Verten slapp ikke inn denne skjermen.',
    'why.hostLeft': 'Verten gikk, så rommet er stengt.',
    'err.notCode': 'Det er ikke en kode. Den er tre bilder.',
    'err.offline': 'Du er frakoblet, så den andre skjermen kan ikke finnes.',
    'err.brokerLoad': 'Klarte ikke å laste koden som finner andre spillere.',
    'err.brokerBroken': 'Koden som finner andre spillere virker ikke.',
    'err.timeout': 'Det tok for lang tid å finne hverandre.',
    'err.codeInUse': 'Den koden er allerede i bruk. Lag et nytt rom.',
    'err.matchFailed': (type) => `Fant ikke hverandre (${type}).`,
    'err.reopening': 'Åpner rommet igjen – koden virker kanskje ikke akkurat nå.',
    'err.codeTaken': 'Noe annet tok koden. Lag et nytt rom.',
    'err.trouble': (type) => `Trøbbel med å finne hverandre (${type}).`,
    'err.noGame': (code) => `Fant ikke noe rom med koden ${codeIcons(code).join('')}. Sjekk koden, og at skjermen til verten er våken.`,
    'err.noReach': (type) => `Fikk ikke kontakt med rommet (${type}).`,
    'err.noAnswer': 'Verten svarte ikke.',
    'err.rtcNoAnswer': 'Verten svarte aldri. Noen nettverk når rett og slett ikke hverandre.',
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
    'players': 'Players',
    'hint.strip': 'Hold here',
    'hint.out': 'You will be back on a friend’s star',
    'over.team': (m, dust) => `${m} m · ${dust} stardust`,
    'live': 'Menu',
    'live.tag': 'The sky carries on – your button still works.',
    'colour.0': 'Blue',
    'colour.1': 'Pink',
    'colour.2': 'Yellow',
    'colour.3': 'Green',
    'online': 'Online',
    'online.tag': 'One player per screen, all in the same sky.',
    'online.host': 'Create room',
    'online.join': 'Join',
    'online.code': 'Code',
    'online.clear': 'Clear',
    'online.roomTag': 'Say the three pictures out loud. Anyone who comes late drops straight in.',
    'online.joinTag': 'Tap the three pictures from the other screen.',
    'online.guestWait': 'Waiting for the host to start.',
    'seat.you': 'you',
    'seat.host': 'host',
    'seat.guest': 'guest',
    'seat.open': 'open',
    'status.left': (seat) => `${colourName(seat)} left.`,
    'sym.fox': 'fox',
    'sym.duck': 'duck',
    'sym.bee': 'bee',
    'sym.car': 'car',
    'sym.rocket': 'rocket',
    'sym.pizza': 'pizza',
    'sym.tree': 'tree',
    'sym.star': 'star',
    'sym.moon': 'moon',
    'sym.key': 'key',
    'sym.hat': 'hat',
    'sym.ball': 'ball',
    'status.opening': 'Making a room…',
    'status.broker': 'The room is open. Keep this screen awake.',
    'status.tabs': 'Could not reach the matchmaker, so only other tabs in this browser can join.',
    'status.relay': 'The room goes through your own relay.',
    'status.openFail': 'Could not make a room.',
    'status.looking': 'Looking for the room…',
    'status.in': 'You are in.',
    'status.joined': (seat) => `${colourName(seat)} joined.`,
    'why.version': 'The other screen has a different version of the game. Reload both.',
    'why.full': 'The room is full.',
    'why.refused': 'The host did not let this screen in.',
    'why.hostLeft': 'The host left, so the room is closed.',
    'err.notCode': 'That is not a code. It is three pictures.',
    'err.offline': 'You are offline, so the other screen cannot be found.',
    'err.brokerLoad': 'Could not load the code that finds other players.',
    'err.brokerBroken': 'The code that finds other players does not work.',
    'err.timeout': 'Finding each other took too long.',
    'err.codeInUse': 'That code is already in use. Make a new room.',
    'err.matchFailed': (type) => `Could not find each other (${type}).`,
    'err.reopening': 'Reopening the room – the code may not work just now.',
    'err.codeTaken': 'Something else took the code. Make a new room.',
    'err.trouble': (type) => `Trouble finding each other (${type}).`,
    'err.noGame': (code) => `No room found with the code ${codeIcons(code).join('')}. Check the code, and that the host's screen is awake.`,
    'err.noReach': (type) => `Could not reach the room (${type}).`,
    'err.noAnswer': 'The host did not answer.',
    'err.rtcNoAnswer': 'The host never answered. Some networks simply cannot reach each other.',
  },
};

// A player's colour by seat, in the current language: online status lines.
const colourName = (seat) => t(`colour.${seat}`);

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

/*
 * An Error that remembers what it meant (NeonFox's said), so a failure raised
 * deep in the net code can be said again in the other language if the player
 * switches while it is still on screen. js/lobby.js reads .key and .args.
 */
export function said(key, ...args) {
  const error = new Error(t(key, ...args));
  error.key = key;
  error.args = args;
  return error;
}
