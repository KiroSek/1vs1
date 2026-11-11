// Achievements: 18 feats (6 x 3 grid in the menu). Progress lives in REC.ach (saved with the record), counted from
// game events: ach.add(stat, n) for running totals, ach.max(stat, v) for best-reached values (stages, waves).
// Each feat: [id, seal kanji, stat, goal]. Names and descriptions: i18n 'ach.<id>' / 'ach.<id>.d'.
export const ACH = [
  ['firstBlood', '血', 'kills', 1], ['deflects', '弾', 'deflects', 50], ['deathblows', '止', 'deathblows', 25],
  ['mikiri', '見', 'mikiri', 1], ['duelist', '決', 'aiWins', 10], ['saint', '聖', 'saintWins', 1],
  ['gauntlet5', '道', 'gauntletStage', 5], ['gauntlet10', '極', 'gauntletStage', 10], ['waves5', '波', 'svWave', 5],
  ['oniSlayer', '鬼', 'svCleared', 1], ['flasks', '薬', 'flasks', 10], ['shuriken', '星', 'shurikenHits', 10],
  ['hunter', '狩', 'huntWins', 1], ['shadow', '影', 'ambushes', 5], ['noon', '午', 'noonWins', 1],
  ['bond', '縁', 'onlineWins', 1], ['collector', '蔵', 'blades', 5], ['wealth', '金', 'earned', 5000],
];
let REC = null, save = () => {}, notify = () => {};
export function initAch(rec, saveFn, notifyFn) { REC = rec; save = saveFn; notify = notifyFn; REC.ach = REC.ach || { n: {}, done: {} }; REC.ach.n = REC.ach.n || {}; REC.ach.done = REC.ach.done || {}; }
const val = stat => (REC && REC.ach.n[stat]) || 0;
export function progress(id) { const a = ACH.find(x => x[0] === id); return { have: Math.min(val(a[2]), a[3]), goal: a[3], done: !!(REC && REC.ach.done[id]) }; }
function check(stat) {
  let got = false;
  for (const [id, , st, goal] of ACH) if (st === stat && !REC.ach.done[id] && val(st) >= goal) { REC.ach.done[id] = Date.now(); got = true; notify(id); }
  save(); return got;
}
export const ach = {
  add(stat, n = 1) { if (!REC || !(n > 0)) return; REC.ach.n[stat] = val(stat) + n; check(stat); },
  max(stat, v) { if (!REC || !(v > val(stat))) return; REC.ach.n[stat] = v; check(stat); },
  count() { return REC ? Object.keys(REC.ach.done).length : 0; },
};
