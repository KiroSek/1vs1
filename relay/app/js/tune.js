// Live tuning panel (F9). Edits the real game data in place — MOVES timings and the constant groups exported by
// fighter.js (TUNE) and camera.js (CAM) — so changes apply on the next swing / frame. Values persist in localStorage
// ('kd-tune') and can be copied out as JSON to paste back into the code.
// Online: timings are local. Both players must use the same values or hits / parries will feel out of sync.
import { MOVES, moveDur } from './moves.js';
import { TUNE } from './fighter.js';
import { CAM } from './camera.js';

const KEY = 'kd-tune';
const GROUPS = { ...TUNE, CAM };
const MOVE_FIELDS = ['hit', 'cancel', 'track', 'lunge', 'dmg', 'post', 'hitPost', 'deflPost', 'range'];
const DEFAULTS = JSON.parse(JSON.stringify({ moves: Object.fromEntries(Object.entries(MOVES).map(([k, m]) => [k, snapMove(m)])), groups: GROUPS }));
let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { saved = {}; }

function snapMove(m) { const o = { segs: m.segs.map(s => s[3]) }; for (const f of MOVE_FIELDS) if (m[f] !== undefined) o[f] = m[f]; return o; }
function applyMove(name, o) { const m = MOVES[name]; if (!m || !o) return; if (o.segs) o.segs.forEach((d, i) => { if (m.segs[i]) m.segs[i][3] = d; }); for (const f of MOVE_FIELDS) if (o[f] !== undefined) m[f] = Array.isArray(o[f]) ? [...o[f]] : o[f]; m.dur = moveDur(m); }
function applyGroup(name, o) { const g = GROUPS[name]; if (!g || !o) return; for (const k in o) if (k in g) g[k] = Array.isArray(o[k]) ? [...o[k]] : o[k]; }
function apply(all) { for (const k in all.moves || {}) applyMove(k, all.moves[k]); for (const k in all.groups || {}) applyGroup(k, all.groups[k]); }
function save() { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { } }
function diff() {   // only what differs from the shipped values
  const out = { moves: {}, groups: {} };
  for (const k in MOVES) { const now = snapMove(MOVES[k]); if (JSON.stringify(now) !== JSON.stringify(DEFAULTS.moves[k])) out.moves[k] = now; }
  for (const k in GROUPS) { const d = {}; for (const f in GROUPS[k]) if (JSON.stringify(GROUPS[k][f]) !== JSON.stringify(DEFAULTS.groups[k][f])) d[f] = GROUPS[k][f]; if (Object.keys(d).length) out.groups[k] = d; }
  return out;
}
apply(saved);

// ---------------------------------------------------------------- UI
let panel = null;
const css = 'position:fixed;top:0;right:0;width:340px;height:100%;overflow:auto;background:#0d0c0ccc;color:#e8dcc4;font:12px system-ui;z-index:50;padding:10px 12px;box-sizing:border-box;backdrop-filter:blur(4px)';
function num(label, val, onInput, step) {
  const row = document.createElement('label'); row.style.cssText = 'display:grid;grid-template-columns:110px 1fr 58px;gap:6px;align-items:center;margin:3px 0';
  const max = Math.max(1, Math.abs(val) * 3), st = step || (Math.abs(val) < 0.05 ? 0.001 : Math.abs(val) < 1 ? 0.01 : 0.1);
  row.innerHTML = `<span title="${label}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${label}</span><input type="range" min="${val < 0 ? -max : 0}" max="${max}" step="${st}" value="${val}"><input type="number" step="${st}" value="${val}" style="width:56px;background:#222;color:#eee;border:1px solid #444">`;
  const [r, n] = row.querySelectorAll('input');
  const set = v => { v = +v; if (!isFinite(v)) return; r.value = v; n.value = v; onInput(v); };
  r.oninput = () => set(r.value); n.onchange = () => set(n.value);
  return row;
}
function section(title) { const d = document.createElement('details'); d.style.margin = '6px 0'; d.innerHTML = `<summary style="cursor:pointer;color:#ffd890;font-weight:600">${title}</summary>`; return d; }
function buildMoveFields(box, name) {
  box.innerHTML = ''; const m = MOVES[name]; const rec = () => { saved.moves = saved.moves || {}; saved.moves[name] = snapMove(m); save(); info(); };
  const info = () => { box.querySelector('.inf').textContent = `dur ${m.dur.toFixed(2)} s · hit ${m.hit[0].toFixed(2)}–${m.hit[1].toFixed(2)} · cancel ${m.cancel}`; };
  const i = document.createElement('div'); i.className = 'inf'; i.style.cssText = 'color:#aaa;margin:4px 0'; box.appendChild(i);
  m.segs.forEach((s, k) => box.appendChild(num(`seg${k} ${s[0]}`, s[3], v => { s[3] = v; m.dur = moveDur(m); rec(); })));
  box.appendChild(num('hit start', m.hit[0], v => { m.hit[0] = v; rec(); })); box.appendChild(num('hit end', m.hit[1], v => { m.hit[1] = v; rec(); }));
  for (const f of ['cancel', 'track', 'dmg', 'post', 'hitPost', 'deflPost', 'range']) if (typeof m[f] === 'number') box.appendChild(num(f, m[f], v => { m[f] = v; rec(); }));
  if (m.lunge) { box.appendChild(num('lunge from', m.lunge[0], v => { m.lunge[0] = v; rec(); })); box.appendChild(num('lunge to', m.lunge[1], v => { m.lunge[1] = v; rec(); })); box.appendChild(num('lunge m', m.lunge[2], v => { m.lunge[2] = v; rec(); })); }
  info();
}
function build() {
  panel = document.createElement('div'); panel.id = 'tunePanel'; panel.style.cssText = css;
  panel.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:14px">Tuning · F9</b><span><button id="tuCopy">JSON</button> <button id="tuReset">Reset</button></span></div>
    <div style="color:#c99;margin:6px 0">Онлайн: у обоих игроков значения должны совпадать.</div><textarea id="tuOut" style="display:none;width:100%;height:120px;background:#111;color:#cfc;font:11px monospace"></textarea>`;
  const ms = section('Приёмы (MOVES)'); ms.open = true; const sel = document.createElement('select'); sel.style.cssText = 'width:100%;margin:4px 0;background:#222;color:#eee';
  sel.innerHTML = Object.keys(MOVES).map(k => `<option>${k}</option>`).join(''); const box = document.createElement('div'); ms.append(sel, box); sel.onchange = () => buildMoveFields(box, sel.value); buildMoveFields(box, sel.value); panel.appendChild(ms);
  for (const [gname, g] of Object.entries(GROUPS)) {
    const sec = section(gname);
    for (const [k, v] of Object.entries(g)) {
      const rec = () => { saved.groups = saved.groups || {}; saved.groups[gname] = { ...(saved.groups[gname] || {}), [k]: Array.isArray(g[k]) ? [...g[k]] : g[k] }; save(); };
      if (typeof v === 'number') sec.appendChild(num(k, v, x => { g[k] = x; rec(); }));
      else if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'number' && sec.appendChild(num(`${k}[${i}]`, x, y => { g[k][i] = y; rec(); })));
    }
    panel.appendChild(sec);
  }
  document.body.appendChild(panel);
  panel.querySelector('#tuCopy').onclick = () => { const t = panel.querySelector('#tuOut'), j = JSON.stringify(diff(), null, 1); t.style.display = 'block'; t.value = j; t.select(); try { navigator.clipboard.writeText(j); } catch (e) { } };
  panel.querySelector('#tuReset').onclick = () => { try { localStorage.removeItem(KEY); } catch (e) { } location.reload(); };
  for (const e of ['keydown', 'keyup', 'mousedown', 'wheel']) panel.addEventListener(e, ev => ev.stopPropagation());
}
export function toggleTune() {
  if (!panel) build(); else panel.style.display = panel.style.display === 'none' ? '' : 'none';
  if (panel.style.display !== 'none' && document.exitPointerLock) document.exitPointerLock();
}
addEventListener('keydown', e => { if (e.code === 'F9') { e.preventDefault(); toggleTune(); } });
