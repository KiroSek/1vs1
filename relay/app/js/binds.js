// Rebindable controls. Codes are KeyboardEvent.code or 'Mouse0/1/2'. Two slots per action.
import { t } from './i18n.js';

export const ACTIONS = ['forward', 'back', 'left', 'right', 'light', 'heavy', 'guard', 'dodge', 'jump', 'sprint', 'walk', 'crouch', 'finisher', 'lock', 'shuriken', 'interact', 'lure'];
const DEFAULTS = {
  forward: ['KeyW', ''], back: ['KeyS', ''], left: ['KeyA', ''], right: ['KeyD', ''],
  light: ['Mouse0', ''], heavy: ['KeyE', ''], guard: ['Mouse2', 'KeyC'], dodge: ['Space', ''], jump: ['KeyV', 'Mouse1'],
  sprint: ['ShiftLeft', ''], walk: ['ControlLeft', 'AltLeft'], finisher: ['KeyF', ''], lock: ['KeyQ', ''], shuriken: ['KeyT', ''], crouch: ['KeyX', ''], interact: ['KeyR', ''], lure: ['KeyG', ''],
};
const KEY = 'kd-binds';
export let BINDS = JSON.parse(JSON.stringify(DEFAULTS));
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) for (const a of ACTIONS) if (Array.isArray(s[a])) BINDS[a] = [s[a][0] || '', s[a][1] || '']; } catch (e) { }
// actions added later get their defaults unless the stored map already uses those keys
for (const a of [...ACTIONS].reverse()) for (let k = 0; k < 2; k++) { const c = BINDS[a][k]; if (c && ACTIONS.some(o => o !== a && BINDS[o].includes(c))) BINDS[a][k] = ''; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(BINDS)); } catch (e) { } };

export const mouseCode = b => 'Mouse' + b;
export function actionsOf(code) { return ACTIONS.filter(a => BINDS[a].includes(code)); }
export function isDown(action, down) { return BINDS[action].some(c => c && down[c]); }
export function label(code) {
  if (!code) return '—';
  const M = { Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Space: 'Space', ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt' };
  return M[code] || code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '');
}
export const keyOf = a => label(BINDS[a][0]) + (BINDS[a][1] ? ' / ' + label(BINDS[a][1]) : '');

// Settings UI: click a slot -> press a key/mouse button; Esc cancels; a code already used elsewhere is swapped.
let waiting = null;
export function renderBinds(box) {
  box.innerHTML = '';
  for (const a of ACTIONS) {
    const row = document.createElement('div'); row.className = 'bind';
    row.innerHTML = `<span>${t('act.' + a)}</span>`;
    for (let s = 0; s < 2; s++) {
      const b = document.createElement('button'); b.className = 'slot' + (waiting && waiting.a === a && waiting.s === s ? ' wait' : '');
      b.textContent = waiting && waiting.a === a && waiting.s === s ? t('bind.press') : label(BINDS[a][s]);
      b.onclick = e => { e.stopPropagation(); waiting = { a, s, box }; renderBinds(box); };
      row.appendChild(b);
    }
    box.appendChild(row);
  }
  const r = document.createElement('button'); r.className = 'back'; r.textContent = t('bind.reset');
  r.onclick = () => { BINDS = JSON.parse(JSON.stringify(DEFAULTS)); save(); waiting = null; renderBinds(box); };
  box.appendChild(r);
}
// returns true when the event was consumed by the rebinding UI
export function captureBind(code) {
  if (!waiting) return false;
  const { a, s, box } = waiting; waiting = null;
  if (code !== 'Escape') {
    const old = BINDS[a][s];
    for (const o of ACTIONS) for (let k = 0; k < 2; k++) if (BINDS[o][k] === code && !(o === a && k === s)) BINDS[o][k] = old;   // conflict -> swap
    BINDS[a][s] = code; save();
  }
  renderBinds(box); return true;
}
export const isWaiting = () => !!waiting;
