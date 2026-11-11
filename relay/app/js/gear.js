// Character dressing: katana, saya, cloth shells grown from the skinned body, armour plates, verlet cloth tails.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4;

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);

// ---------------- shared textures ----------------
let TEX = null;
function textures() {
  if (TEX) return TEX;
  TEX = {};
  // woven fabric (albedo modulation + normal-ish bump via roughness map)
  TEX.weave = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) { x.fillStyle = `rgba(255,255,255,${rnd(.03, .09)})`; x.fillRect(0, y, w, 1); }
    for (let i = 0; i < w; i += 2) { x.fillStyle = `rgba(0,0,0,${rnd(.03, .1)})`; x.fillRect(i, 0, 1, h); }
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(0,0,0,${rnd(.02, .08)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(2, 12), 1); }
  }, false); TEX.weave.repeat.set(6, 6);
  // hakama pleats (vertical stripes of shading)
  TEX.pleat = canvasTex(256, 64, (x, w, h) => {
    for (let i = 0; i < w; i++) { const s = 0.5 + 0.5 * Math.sin(i / w * Math.PI * 14); x.fillStyle = `rgb(${150 + s * 105 | 0},${150 + s * 105 | 0},${150 + s * 105 | 0})`; x.fillRect(i, 0, 1, h); }
  }, false);
  // tsuka-ito diamond wrap
  TEX.tsuka = canvasTex(64, 256, (x, w, h) => {
    x.fillStyle = '#e9e2d0'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(160,150,130,${rnd(.2, .5)})`; x.beginPath(); x.arc(rnd(0, w), rnd(0, h), rnd(0.6, 1.6), 0, 6.3); x.fill(); }
    x.fillStyle = '#16141a'; const n = 8, p = h / n;
    for (let i = 0; i < n; i++) { const y = i * p; x.beginPath(); x.moveTo(0, y); x.lineTo(w / 2, y + p * .42); x.lineTo(w, y); x.lineTo(w, y + p * .16); x.lineTo(w / 2, y + p * .58); x.lineTo(w, y + p); x.lineTo(w, y + p); x.lineTo(w / 2, y + p * .58 + p * .42); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(0, y); x.lineTo(w / 2, y + p * .42); x.lineTo(0, y + p * .84); x.closePath(); x.fill(); x.beginPath(); x.moveTo(w, y + p * .16); x.lineTo(w / 2, y + p * .58); x.lineTo(w, y + p); x.closePath(); x.fill(); }
  });
  // blade: hamon (wavy temper line) near the edge, polished steel toward the spine. u: 0 spine -> 1 edge, v along blade
  TEX.blade = canvasTex(128, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#5e646c'); g.addColorStop(0.45, '#9aa2ac'); g.addColorStop(0.62, '#b8bfc8'); g.addColorStop(1, '#d9dee4');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.beginPath(); x.moveTo(w, 0);
    for (let y = 0; y <= h; y += 4) { const hx = w * (0.7 + 0.06 * Math.sin(y * 0.09) + 0.03 * Math.sin(y * 0.31 + 1)); x.lineTo(hx, y); }
    x.lineTo(w, h); x.closePath(); x.fillStyle = 'rgba(245,248,252,.9)'; x.fill();
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${rnd(.05, .2)})`; x.fillRect(w * rnd(.62, .8), rnd(0, h), 1, 1); }
    x.fillStyle = 'rgba(40,44,50,.5)'; x.fillRect(w * 0.44, 0, 1.5, h);   // shinogi line
  });
  TEX.armor = canvasTex(128, 256, (x, w, h) => {   // lacquered lamellae rows with lacing
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    const rows = 8;
    for (let r = 0; r < rows; r++) { const y = r * h / rows; const g = x.createLinearGradient(0, y, 0, y + h / rows); g.addColorStop(0, '#ffffff'); g.addColorStop(0.8, '#cfcfcf'); g.addColorStop(1, '#5a5a5a'); x.fillStyle = g; x.fillRect(0, y, w, h / rows);
      for (let c = 0; c < 8; c++) { x.fillStyle = '#3a2f6a'; x.fillRect(c * w / 8 + w / 16 - 1.5, y + 3, 3, h / rows - 6); } }
  });
  return TEX;
}

// ---------------- weapons (cosmetic only: identical length, reach, damage and timing) ----------------
export const WEAPONS = {
  standard: { name: 'Kusabimaru', desc: 'Plain steel, black iron fittings.', price: 0, blade: 'steel', fit: 0x232026, fitMetal: 0.85, wrap: '#16141a', same: '#e9e2d0', saya: 0x0c0b0e, trail: 0xdfe8ff, tsuba: 'round' },
  kuro: { name: 'Shi no Ken', desc: 'Scarred black blade, gold chrysanthemum guard, green wrap.', price: 400, gems: 6, blade: 'black', worn: true, fit: 0xd0a040, fitMetal: 1, wrap: '#2f6a46', same: '#c9a24a', saya: 0x08080a, trail: 0xc0c8d8, tsuba: 'kiku', tsubaD: 0.008, kashira: 'cap', sageo: 'bow', kanji: '死の剣', W: 0.033 },
  koi: { name: 'Koi Nami', desc: 'Worn steel, gold koi and waves on a four-lobed guard.', price: 1100, gems: 14, blade: 'steel', worn: true, fit: 0x14120f, fitMetal: 0.6, tsubaTex: 'koi', wrap: '#7c7a74', same: '#6a6862', tsuka: 'rings', ringCol: 0xc8a050, saya: 0x0b0a0c, sayaTex: 'waves', trail: 0xe8dcc0, tsuba: 'mokko', tsubaR: 1.12, kashira: 'long', SORI: 0.03 },
  crimson: { name: 'Crimson Moon', desc: 'Blood-red steel under a crescent-moon guard.', price: 900, gems: 12, blade: 'red', glow: 0xff2a14, fit: 0x1a0c0c, fitMetal: 0.7, wrap: '#7a0c10', same: '#120a0a', saya: 0x3a0606, trail: 0xff5040, tsuba: 'crescent', tsubaR: 1.1, W: 0.036, moon: true },
  gilded: { name: 'Gilded Lotus', desc: 'Pierced eight-petal guard, golden temper line, gold-dotted wrap.', price: 1200, gems: 15, blade: 'gold', fit: 0xb9b6ae, fitMetal: 1, wrap: '#4a3424', same: '#3a2818', menukiRow: true, saya: 0x3a2416, bands: 3, trail: 0xffd27a, tsuba: 'sukashi8', tsubaR: 1.15, kashira: 'disk' },
  frost: { name: 'Frostbite', desc: 'Ice-pale blade that glows cold, snowflake guard, scaled scabbard.', price: 1800, gems: 22, blade: 'ice', glow: 0x6ad0ff, fit: 0xc8d4de, fitMetal: 1, wrap: '#1c3a5a', same: '#dfe8f0', saya: 0x9fb4c8, sayaTex: 'scales', trail: 0x8ae0ff, tsuba: 'snow', tsubaR: 1.15 },
  sakura: { name: 'Sakura Eda', desc: 'A blooming cherry branch for a hilt, plain wood scabbard.', price: 2000, gems: 25, blade: 'steel', fit: 0xb89a58, fitMetal: 1, saya: 0xd9a86a, sayaTex: 'wood', sageo: 'wrap', kanji: '桜', trail: 0xffc8dc, tsuba: 'square', tsubaR: 0.62, tsuka: 'branch' },
  naginata: { name: 'Naginata', desc: 'Polearm (final boss).', price: 0, hidden: true, blade: 'steel', fit: 0xb89a5a, fitMetal: 0.9, wrap: '#141214', same: '#e8e2d4', saya: 0x0c0b0e, trail: 0xdfe8ff, tsuba: 'round' },
  bisento: { name: 'Bisento', desc: 'Broad-bladed halberd (mini-boss).', price: 0, hidden: true, blade: 'steel', fit: 0x8a6a3a, fitMetal: 0.9, wrap: '#141214', same: '#c8a060', saya: 0x0c0b0e, trail: 0xffd8a0, tsuba: 'round' },
  // reward for completing Survival: a seven-branched shichishito, white hilt, gold flower guard and tassel (never sold)
  onisbane: { name: "Oni's Bane", desc: 'Shichishitō, the seven-branched blade. Won only by surviving all ten waves.', price: 0, unlock: 'survival', blade: 'steel', SORI: 0, W: 0.034, fit: 0xd4a640, fitMetal: 1, wrap: '#f2eee6', same: '#f2eee6', saya: 0xf2eee6, sayaTex: 'wood', bands: 2, trail: 0xffe2a0, tsuba: 'flower', sageo: 'wrap', branches: true },
  // Shadow Hunt: a short blade (hira-zukuri tanto), navy cord wrap, small dark round guard, black lacquer scabbard tied with a navy cord knot
  tanto: { name: 'Tantō', desc: 'Short blade of the shadow hunter. Navy wrap, black lacquer.', price: 0, hidden: true, blade: 'steel', len: 0.3, gripL: 0.13, sayaLen: 0.33, W: 0.027, SORI: 0.006, fit: 0x3a3c42, fitMetal: 0.9, wrap: '#1d2756', same: '#262a34', saya: 0x09090b, trail: 0xc8d4ff, tsuba: 'round', tsubaR: 0.62, tsubaD: 0.004, sageo: 'knot', gold: 0x9a9ca4 },
  yari: { name: 'Yari', desc: 'Spear (enemy only).', price: 0, hidden: true, blade: 'steel', fit: 0x1c1c20, fitMetal: 0.6, wrap: '#3a1a10', same: '#2a1a10', saya: 0x0c0b0e, trail: 0xdfe8ff, tsuba: 'round' },
  // gem-only blades
  raijin: { name: 'Raijin no Kiba', desc: "The thunder god's fang: violet steel crackling with storm light, pierced guard.", price: 0, gems: 50, blade: 'storm', glow: 0x9a5cff, fit: 0x2a2440, fitMetal: 1, wrap: '#2a1846', same: '#c8c0e0', saya: 0x140c22, sayaTex: 'scales', trail: 0xb48cff, tsuba: 'sukashi8', tsubaR: 1.12, kashira: 'disk' },
  ryujin: { name: 'Ryūjin', desc: "The sea dragon's blade: jade steel, gold chrysanthemum guard, wave-lacquered scabbard.", price: 0, gems: 75, blade: 'jade', glow: 0x2affb4, fit: 0xd0a040, fitMetal: 1, wrap: '#0e3a2c', same: '#d8c890', saya: 0x0a2a22, sayaTex: 'waves', trail: 0x6affc8, tsuba: 'kiku', tsubaD: 0.008, kashira: 'cap', sageo: 'bow', kanji: '龍神' },
  mortal: { name: 'Mortal Edge', desc: 'A cursed blade bleeding red light through a jagged guard.', price: 3000, gems: 35, blade: 'mortal', glow: 0xff1010, fit: 0x0b0607, fitMetal: 0.6, wrap: '#1a0606', same: '#5a0a0a', saya: 0x120404, sayaTex: 'cracks', trail: 0xff2020, tsuba: 'oni', tsubaR: 1.1, SORI: 0.018, W: 0.034 },
};
const BLADES = {   // gradient spine->edge, hamon colour, shinogi line
  steel: [['#5e646c', '#9aa2ac', '#b8bfc8', '#d9dee4'], 'rgba(245,248,252,.9)'],
  black: [['#141518', '#26282d', '#34373d', '#4a4e55'], 'rgba(150,156,166,.75)'],
  red: [['#2a0606', '#5a0c0c', '#7a1414', '#a02020'], 'rgba(255,120,100,.9)'],
  ice: [['#7f9cb8', '#b8d4ea', '#d6ecfa', '#f2fbff'], 'rgba(255,255,255,.95)'],
  mortal: [['#0b0606', '#1e0a0a', '#2c0c0c', '#400e0e'], 'rgba(255,40,30,.95)'],
  gold: [['#5a5e64', '#8c9299', '#aeb3b8', '#cfc6a8'], 'rgba(236,190,90,.95)'],
  storm: [['#140e22', '#2e2350', '#4a3c80', '#8478c4'], 'rgba(214,190,255,.95)'],
  jade: [['#06201a', '#124a3a', '#22785c', '#56c49c'], 'rgba(190,255,228,.95)'],
};
const texCache = {};
// blade texture, u = across (0 spine .. 1 edge), v = along (0 habaki .. 1 tip). Zones: mune / shinogi-ji (darker, brushed) /
// hira-ji (bright polish) / hamon (frosted temper line with a soft nioi glow and nie sparkles) / yokote line at the kissaki.
const U_SHINOGI = 0.34, YOKOTE = 0.9;
function hamonX(y, h, w) { const v = y / h; return w * (0.74 + 0.045 * Math.sin(v * 41) + 0.025 * Math.sin(v * 113 + 1.3) + 0.012 * Math.sin(v * 271 + 0.4)); }
function bladeTex(kind, worn = false) {
  const bk = 'b' + kind + (worn ? 'w' : ''); if (texCache[bk]) return texCache[bk];
  const [g4, ham] = BLADES[kind] || BLADES.steel;
  return texCache[bk] = canvasTex(256, 1024, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, g4[0]); g.addColorStop(U_SHINOGI - 0.02, g4[1]); g.addColorStop(U_SHINOGI + 0.01, g4[2]); g.addColorStop(0.7, g4[3]); g.addColorStop(1, g4[3]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    // polishing streaks along the blade (sashikomi)
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${rnd(.03, .09)})`; x.fillRect(rnd(0, w), rnd(0, h), 1, rnd(12, 70)); }
    // shinogi-ji: brushed, slightly darker band
    x.fillStyle = 'rgba(20,24,30,.22)'; x.fillRect(w * 0.06, 0, w * (U_SHINOGI - 0.06), h);
    // hamon: soft glow (nioi) then the bright frosted zone
    x.save(); x.shadowColor = ham; x.shadowBlur = 14;
    x.beginPath(); x.moveTo(w, 0); for (let y = 0; y <= h; y += 3) x.lineTo(hamonX(y, h, w), y); x.lineTo(w, h); x.closePath(); x.fillStyle = ham; x.globalAlpha = 0.75; x.fill(); x.restore();
    for (let i = 0; i < 1600; i++) { const y = rnd(0, h), hx = hamonX(y, h, w); x.fillStyle = `rgba(255,255,255,${rnd(.15, .5)})`; x.fillRect(hx + rnd(-6, 5), y, 1.2, 1.2); }   // nie
    // ridge (shinogi) and yokote lines
    x.fillStyle = 'rgba(255,255,255,.55)'; x.fillRect(w * U_SHINOGI - 1, 0, 2, h * YOKOTE);
    x.fillStyle = 'rgba(255,255,255,.6)'; x.fillRect(w * U_SHINOGI, h * YOKOTE - 1, w * (1 - U_SHINOGI), 2);
    x.fillStyle = 'rgba(30,34,40,.6)'; x.fillRect(0, 0, w * 0.03, h);   // mune shadow
    if (worn) for (let i = 0; i < 160; i++) { const px = rnd(0, w), py = rnd(0, h), a = rnd(-0.9, 0.9), l = rnd(6, 40); x.strokeStyle = `rgba(${i % 3 ? '255,255,255' : '0,0,0'},${rnd(.25, .6)})`; x.lineWidth = rnd(0.6, 1.6); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.sin(a) * l, py + Math.cos(a) * l); x.stroke(); }   // nicks and scratches
    if (kind === 'mortal') for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(255,30,20,${rnd(.3, .7)})`; x.lineWidth = rnd(1, 3); x.beginPath(); let px = rnd(0, w * 0.6), py = rnd(0, h); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += rnd(-14, 22); py += rnd(8, 30); x.lineTo(px, py); } x.stroke(); }
  });
}
// roughness: polished ji (smooth, sharp reflections) vs frosted hamon (soft sheen) -> the light runs along the edge as it swings
function bladeRough() {
  return texCache.rough || (texCache.rough = canvasTex(128, 512, (x, w, h) => {
    x.fillStyle = 'rgb(58,58,58)'; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgb(82,82,82)'; x.fillRect(0, 0, w * U_SHINOGI, h);
    x.beginPath(); x.moveTo(w, 0); for (let y = 0; y <= h; y += 3) x.lineTo(hamonX(y * 2, h * 2, w), y); x.lineTo(w, h); x.closePath(); x.fillStyle = 'rgb(120,120,120)'; x.fill();
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${rnd(.1, .3)})`; x.fillRect(rnd(0, w), rnd(0, h), 1, rnd(6, 30)); }
  }, false));
}
function edgeMask() {
  return texCache.edge || (texCache.edge = canvasTex(64, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#000'); g.addColorStop(0.62, '#000'); g.addColorStop(0.78, '#fff'); g.addColorStop(1, '#fff'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false));
}
// tsuka-maki: crossed silk bands with diamond windows of rayskin (same). Texture covers HALF the circumference
// (repeat 2 around), so each flat face of the grip shows one column of diamonds, like a real wrap.
const TSUKA_ROWS = 7;
function tsukaDiamonds(x, w, h, inset) {
  const p = h / TSUKA_ROWS;
  for (let i = 0; i < TSUKA_ROWS; i++) { const cy = (i + 0.5) * p, hw = w * 0.36 - inset, hh = p * 0.36 - inset * 0.8;
    x.beginPath(); x.moveTo(w / 2, cy - hh); x.lineTo(w / 2 + hw, cy); x.lineTo(w / 2, cy + hh); x.lineTo(w / 2 - hw, cy); x.closePath(); x.fill(); }
}
function tsukaTex(wrap, same) {
  const k = 't' + wrap + same; if (texCache[k]) return texCache[k];
  const t = texCache[k] = canvasTex(128, 512, (x, w, h) => {
    x.fillStyle = wrap; x.fillRect(0, 0, w, h);
    const p = h / TSUKA_ROWS;   // silk twist: fine diagonal threads, shaded band crossings
    for (let i = 0; i <= TSUKA_ROWS; i++) { const y = i * p;
      x.strokeStyle = 'rgba(255,255,255,.10)'; x.lineWidth = 1;
      for (let d = -w; d < w; d += 5) { x.beginPath(); x.moveTo(d, y - p / 2); x.lineTo(d + w, y + p / 2); x.stroke(); }
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, y - 2, w, 4); }
    x.fillStyle = same; tsukaDiamonds(x, w, h, 0);
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(90,80,60,${rnd(.15, .35)})`; x.beginPath(); x.arc(rnd(0, w), rnd(0, h), rnd(0.8, 1.8), 0, 6.3); x.fill(); }   // rayskin nodules
  });
  t.repeat.set(2, 1); return t;
}
function tsukaBump() {   // bands raised, diamonds sunk
  if (texCache.tb) return texCache.tb;
  const t = texCache.tb = canvasTex(128, 512, (x, w, h) => {
    x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, w, h); const p = h / TSUKA_ROWS;
    for (let i = 0; i <= TSUKA_ROWS; i++) { x.fillStyle = '#7a7a7a'; x.fillRect(0, i * p - 2, w, 4); }
    x.fillStyle = '#555'; tsukaDiamonds(x, w, h, 0); x.fillStyle = '#3a3a3a'; tsukaDiamonds(x, w, h, 4);
  }, false);
  t.repeat.set(2, 1); return t;
}
function tsubaShape(kind, S = 1) {
  const sh = new THREE.Shape(), R = 0.042 * S, poly = f => { for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2, r = f(a); i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } };
  if (kind === 'square') { const s = 0.038 * S, r = 0.01 * S; sh.moveTo(-s + r, -s); sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r); sh.lineTo(s, s - r); sh.quadraticCurveTo(s, s, s - r, s); sh.lineTo(-s + r, s); sh.quadraticCurveTo(-s, s, -s, s - r); sh.lineTo(-s, -s + r); sh.quadraticCurveTo(-s, -s, -s + r, -s); }
  else if (kind === 'flower') poly(a => R * (0.86 + 0.14 * Math.abs(Math.cos(a * 2))));
  else if (kind === 'mokko') poly(a => R * (0.8 + 0.2 * Math.abs(Math.cos(a * 2)) ** 0.45));                       // four lobes
  else if (kind === 'kiku') poly(a => R * (0.86 + 0.14 * Math.abs(Math.cos(a * 8)) ** 0.6));                       // sixteen chrysanthemum petals
  else if (kind === 'sukashi8') poly(a => R * Math.cos(Math.PI / 8) / Math.cos(((a % (Math.PI / 4)) + Math.PI * 2) % (Math.PI / 4) - Math.PI / 8));   // octagon
  else if (kind === 'snow') poly(a => R * (0.72 + 0.32 * Math.abs(Math.cos(a * 3)) ** 6 + 0.06 * Math.abs(Math.cos(a * 9))));   // six-pointed frost star
  else if (kind === 'oni') poly(a => { const t = (a * 7 / Math.PI) % 1; return R * (0.8 + 0.24 * (t < 0.7 ? t / 0.7 : (1 - t) / 0.3)); });   // jagged teeth
  else sh.absarc(0, 0, R, 0, Math.PI * 2, false);
  const h1 = new THREE.Path(); h1.absellipse(0, 0, 0.007, 0.017, 0, Math.PI * 2, true); sh.holes.push(h1);
  if (kind === 'sukashi8') for (let k = 0; k < 8; k++) { const a = (k + 0.5) / 8 * Math.PI * 2, h = new THREE.Path(); h.absarc(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, R * 0.17, 0, Math.PI * 2, true); sh.holes.push(h); }
  else if (kind === 'crescent') { const h = new THREE.Path(), r0 = R * 0.52, r1 = R * 0.82; h.moveTo(r1, 0); for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI; h.lineTo(Math.cos(a) * r1, Math.sin(a) * r1 * 0.5 + R * 0.38); } for (let i = 16; i >= 0; i--) { const a = i / 16 * Math.PI; h.lineTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.35 + R * 0.38); } sh.holes.push(h); }
  else if (kind !== 'snow' && kind !== 'oni') for (const sx of [-1, 1]) { const h = new THREE.Path(); h.absarc(sx * 0.024 * S, -0.004, 0.006, 0, Math.PI * 2, true); sh.holes.push(h); }
  return sh;
}
// engraved guard face: black iron with gold waves and koi (UVs are the shape's own coordinates, mapped by repeat/offset)
function tsubaEngrave(kind) {
  return texCache['te' + kind] || (texCache['te' + kind] = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = '#0e0c0a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#d0a64a'; x.lineWidth = 2.2;
    for (let r = 0; r < 9; r++) for (let c = -1; c < 9; c++) { const cx = c * 32 + (r % 2) * 16, cy = r * 30 + 10; for (const rr of [14, 9, 4]) { x.beginPath(); x.arc(cx, cy, rr, Math.PI, 0); x.stroke(); } }   // seigaiha waves
    x.fillStyle = '#e0b552'; for (const [cx, cy, a] of [[90, 100, 0.6], [170, 165, -2.4]]) { x.save(); x.translate(cx, cy); x.rotate(a); x.beginPath(); x.ellipse(0, 0, 34, 13, 0, 0, 6.3); x.fill(); x.beginPath(); x.moveTo(-30, 0); x.lineTo(-52, -14); x.lineTo(-48, 0); x.lineTo(-52, 14); x.closePath(); x.fill(); x.fillStyle = '#0e0c0a'; x.beginPath(); x.arc(20, -3, 3, 0, 6.3); x.fill(); for (let k = -1; k < 3; k++) { x.beginPath(); x.arc(k * 8, 0, 5, -1.2, 1.2); x.stroke(); } x.fillStyle = '#e0b552'; x.restore(); }   // two koi
  }));
}
function barkTex() {
  return texCache.bark || (texCache.bark = canvasTex(64, 256, (x, w, h) => { x.fillStyle = '#6a4a36'; x.fillRect(0, 0, w, h); for (let i = 0; i < 140; i++) { x.fillStyle = `rgba(${rnd(0, 1) < 0.5 ? '30,18,12' : '150,110,84'},${rnd(.2, .5)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(6, 26)); } for (let y = 0; y < h; y += rnd(18, 40)) { x.fillStyle = 'rgba(30,18,12,.5)'; x.fillRect(0, y, w, 2); } }));
}
function sayaTex(W0) {
  const k = 'sy' + W0.name; if (texCache[k]) return texCache[k];
  const base = '#' + W0.saya.toString(16).padStart(6, '0');
  return texCache[k] = canvasTex(1024, 128, (x, w, h) => {   // u (x) along the scabbard from the mouth, v (y) around it
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const t = W0.sayaTex;
    if (t === 'wood') for (let i = 0; i < 70; i++) { x.strokeStyle = `rgba(120,70,30,${rnd(.15, .35)})`; x.lineWidth = rnd(1, 2.5); x.beginPath(); const y0 = rnd(0, h); x.moveTo(0, y0); for (let u = 0; u <= w; u += 64) x.lineTo(u, y0 + Math.sin(u * 0.01 + i) * rnd(2, 6)); x.stroke(); }
    if (t === 'scales') for (let r = 0; r < 14; r++) for (let c = 0; c < 80; c++) { const cx = c * 13 + (r % 2) * 6.5, cy = r * 10; x.fillStyle = `rgba(255,255,255,${0.08 + 0.1 * (r % 2)})`; x.beginPath(); x.arc(cx, cy, 6.5, 0, Math.PI); x.fill(); x.strokeStyle = 'rgba(20,30,50,.5)'; x.lineWidth = 1; x.beginPath(); x.arc(cx, cy, 6.5, 0, Math.PI); x.stroke(); }
    if (t === 'waves') { x.strokeStyle = 'rgba(208,166,74,.75)'; x.lineWidth = 1.6; for (let r = 0; r < 7; r++) for (let c = 0; c < 70; c++) { const cx = c * 16 + (r % 2) * 8, cy = r * 20 + 8; for (const rr of [8, 5, 2]) { x.beginPath(); x.arc(cx, cy, rr, Math.PI, 0); x.stroke(); } } }
    if (t === 'cracks') for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(255,40,20,${rnd(.4, .8)})`; x.lineWidth = rnd(1, 2.5); x.beginPath(); let px = rnd(0, w), py = rnd(0, h); x.moveTo(px, py); for (let k = 0; k < 7; k++) { px += rnd(8, 30); py += rnd(-14, 14); x.lineTo(px, py); } x.stroke(); }
    if (t !== 'wood') { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(0,0,0,.25)'); g.addColorStop(0.5, 'rgba(255,255,255,.08)'); g.addColorStop(1, 'rgba(0,0,0,.25)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    if (W0.moon) for (const v of [0.25, 0.75]) { const cx = w * 0.42, cy = h * v; x.fillStyle = '#d0a64a'; x.beginPath(); x.arc(cx, cy, 13, 0, 6.3); x.fill(); x.fillStyle = base; x.beginPath(); x.arc(cx + 6, cy - 3, 11, 0, 6.3); x.fill(); }
    if (W0.kanji) { const chars = [...W0.kanji]; x.font = 'bold 30px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (const v of [0.25, 0.75]) chars.forEach((ch, i) => { x.save(); x.translate(w * (W0.sageo === 'bow' ? 0.22 : 0.8) + i * 34, h * v); x.rotate(Math.PI / 2); x.fillStyle = W0.sayaTex === 'wood' ? '#9a2a4a' : '#e8e4dc'; x.fillText(ch, 0, 0); x.restore(); }); }
  });
}

// Sword size (vs. the original 0.74 m blade): bigger so the skins read in play. The hilt keeps its place in the fist
// (tsuba origin), the grip just grows a little; hit detection follows the drawn blade (baseZ / tipZ).
const SZ = { len: 1.35, wide: 1.5, thick: 1.3, hilt: 1.3, grip: 1.22 };
const HIT_TIP = 0.86;   // cutting reach along the blade (m from the guard): a little past the old 0.76, short of the new drawn tip
// local frame: blade along +Z (tsuba at z=0), edge toward +Y, flats face +-X. Grip from z=-0.27 to z=-0.01 (x SZ.grip).
// Every weapon keeps the same length, grip and reach (cosmetic only); guard, grip, pommel, blade cut and scabbard differ.
export function makeKatana(key = 'standard') {
  if (key === 'yari') return makeYari();
  if (key === 'naginata' || key === 'bisento') return makePole(key);
  const W0 = WEAPONS[key] || WEAPONS.standard, g = new THREE.Group();
  // shinogi-zukuri cross-section (6 points): mune ridge, mune corners, shinogi ridges, edge. Kissaki from YOKOTE to the tip.
  const L = (W0.len || 0.74) * SZ.len, N = W0.len ? 40 : 60, W = (W0.W || 0.032) * SZ.wide, TH = 0.0078 * SZ.thick, SORI = (W0.SORI ?? 0.024) * SZ.len;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, z = 0.012 + s * L;
    const k = s > YOKOTE ? (s - YOKOTE) / (1 - YOKOTE) : 0;                     // 0..1 through the kissaki
    const w = W * (1 - 0.3 * s), th = TH * (1 - 0.35 * s) * (1 - 0.75 * k * k), curve = -SORI * s * s;
    const spine = curve - w * 0.5, edge = curve + w * 0.5 - w * 0.95 * (1 - Math.sqrt(Math.max(0, 1 - k * k)));   // fukura: edge sweeps up to the spine
    const shin = spine + (edge - spine) * (U_SHINOGI + 0.08 * k);
    pos.push(0, spine - 0.0012, z,  th * 0.55, spine + 0.0012, z,  th, shin, z,  0, edge, z,  -th, shin, z,  -th * 0.55, spine + 0.0012, z);
    uv.push(0, s, 0.06, s, U_SHINOGI, s, 1, s, U_SHINOGI, s, 0.06, s);
  }
  const R = 6;
  for (let i = 0; i < N; i++) { const a = i * R, b = a + R; for (let q = 0; q < R; q++) { const q1 = (q + 1) % R; idx.push(a + q, b + q, a + q1, a + q1, b + q, b + q1); } }
  const tipI = pos.length / 3; pos.push(0, -SORI * 1.0 - W * 0.7 * 0.5 + 0.001, 0.012 + L + 0.006); uv.push(0.5, 1);
  const lb = N * R; for (let q = 0; q < R; q++) idx.push(lb + q, tipI, lb + (q + 1) % R);
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.setIndex(idx);
  const bgf = bg.toNonIndexed(); bgf.computeVertexNormals();   // flat facets: the ridge lines catch the light
  const glow = W0.glow !== undefined;
  const bladeMat = new THREE.MeshStandardMaterial({ map: bladeTex(W0.blade, W0.worn), roughnessMap: bladeRough(), color: 0xffffff, metalness: W0.blade === 'ice' ? 0.7 : 0.95, roughness: 1, envMapIntensity: 2.2,
    emissive: glow ? W0.glow : 0x1a2028, emissiveMap: glow ? edgeMask() : null, emissiveIntensity: glow ? 2.2 : 1, side: THREE.DoubleSide });
  const blade = new THREE.Mesh(bgf, bladeMat); g.add(blade);
  if (W0.branches) for (let k = 0; k < 6; k++) {   // shichishito: three prongs on each side, alternating, curving up toward the tip
    const sd = k % 2 ? 1 : -1, z0 = 0.012 + L * (0.22 + k * 0.1), y0 = sd * W * 0.42;
    const pr = taperTube([new V3(0, y0, z0), new V3(0, y0 + sd * W * 0.9, z0 + 0.025), new V3(0, y0 + sd * W * 1.5, z0 + 0.075), new V3(0, y0 + sd * W * 1.6, z0 + 0.12)], 0.011, 0.0025, bladeMat);
    pr.scale.x = 0.45; g.add(pr); }
  let hg = new THREE.Group(); hg.scale.set(SZ.hilt, SZ.hilt, SZ.grip); g.add(hg);   // guard, grip and fittings: one scale, so the fist still closes on the grip
  const fit = new THREE.MeshStandardMaterial({ color: W0.fit, metalness: W0.fitMetal, roughness: 0.32 });
  const gold = new THREE.MeshStandardMaterial({ color: W0.gold ?? 0xc8a050, metalness: 1, roughness: 0.28 });
  const hab = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0105, 0.032, 6).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).scale(0.75, 1.55, 1), gold); hab.position.set(0, 0, 0.02); hg.add(hab);
  const TS = W0.tsubaR || 1;
  for (const z of [0.0055, -0.0055]) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.019 * Math.min(1, TS), 0.019 * Math.min(1, TS), 0.0016, 18).rotateX(Math.PI / 2).scale(0.8, 1.12, 1), gold); sp.position.z = z; hg.add(sp); }   // seppa
  const td = W0.tsubaD || 0.006, tg = new THREE.ExtrudeGeometry(tsubaShape(W0.tsuba, TS), { depth: td, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1, curveSegments: 12 }); tg.translate(0, 0, -td / 2);
  let tsMat = fit; if (W0.tsubaTex) { const t = tsubaEngrave(W0.tsubaTex).clone(); t.needsUpdate = true; const k = 1 / (0.1 * TS); t.repeat.set(k, k); t.offset.set(0.5, 0.5); tsMat = new THREE.MeshStandardMaterial({ map: t, metalness: 0.75, roughness: 0.35 }); }
  const tsuba = new THREE.Mesh(tg, tsMat); tsuba.rotation.z = Math.PI / 2; tsuba.scale.set(1, 1.18, 1); hg.add(tsuba);
  if (W0.tsuba === 'sukashi8') for (let k = 0; k < 8; k += 2) { const a = k / 8 * Math.PI * 2, d = new THREE.Mesh(new THREE.OctahedronGeometry(0.0055), gold); d.position.set(Math.sin(a) * 0.042 * TS * 1.18 * 0.93, Math.cos(a) * 0.042 * TS * 0.93, 0.0045); hg.add(d); }   // gold studs
  if (W0.tsuba === 'kiku') { const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.024, 0.006, 16).rotateX(Math.PI / 2).scale(0.85, 1, 1), fit); boss.position.z = -0.006; hg.add(boss); }
  const tsuka = W0.tsuka || 'wrap';
  if (tsuka === 'branch') sakuraBranch(hg, fit);
  else {
    const hgOuter = hg; { const tk = new THREE.Group(); tk.scale.z = (W0.gripL || 0.255) / 0.255; hgOuter.add(tk); hg = tk; }   // a shorter hilt (tanto) keeps every part, just closer together
    const tsg = new THREE.CylinderGeometry(0.0145, 0.016, 0.255, 14, 1, true); tsg.rotateX(Math.PI / 2); tsg.scale(0.8, 1, 1); tsg.translate(0, 0, -0.135);
    if (tsuka === 'rings') {   // plain cord wrap bound by gold rings
      const wrapM = new THREE.MeshStandardMaterial({ color: W0.wrap, map: stripes2('rw' + W0.wrap), roughness: 0.85 }); hg.add(new THREE.Mesh(tsg, wrapM));
      const rm = new THREE.MeshStandardMaterial({ color: W0.ringCol, metalness: 1, roughness: 0.3 });
      for (let k = 0; k < 9; k++) { const z = -0.03 - k * 0.026, rr = 0.0152 + 0.0012 * (k / 8), r = new THREE.Mesh(new THREE.TorusGeometry(rr, 0.0016, 4, 14).scale(0.82, 1, 1), rm); r.position.z = z; r.rotation.y = 0.32; hg.add(r); }
    } else {
      hg.add(new THREE.Mesh(tsg, new THREE.MeshStandardMaterial({ map: tsukaTex(W0.wrap, W0.same), bumpMap: tsukaBump(), bumpScale: 1.4, roughness: 0.88, color: 0xc4c4c4 })));
      if (W0.menukiRow) for (let k = 0; k < 9; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.0035, 0.008), gold); m.position.set(0, 0.0165 - k * 0.00018, -0.03 - k * 0.026); hg.add(m); }
      else for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.024), gold); m.position.set(sx * 0.012, 0, -0.12); hg.add(m); }
    }
    const fuchi = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 14).rotateX(Math.PI / 2).scale(0.82, 1, 1), fit); fuchi.position.z = -0.01; hg.add(fuchi);
    const kk = W0.kashira || 'cap';
    if (kk === 'long') { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.0178, 0.0168, 0.045, 12).rotateX(Math.PI / 2).scale(0.82, 1, 1), fit); c.position.z = -0.262; hg.add(c); const e = new THREE.Mesh(new THREE.SphereGeometry(0.0168, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(0.82, 1, 0.5), fit); e.position.z = -0.284; hg.add(e); }
    else if (kk === 'disk') { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.012, 16).rotateX(Math.PI / 2), fit); d.position.z = -0.27; hg.add(d); const s = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0025, 4, 16), gold); s.position.z = -0.277; hg.add(s); const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.008), gold); c.position.z = -0.278; c.scale.set(1, 1, 0.4); hg.add(c); }
    else { const kashira = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(0.82, 1, 0.7), fit); kashira.position.z = -0.264; hg.add(kashira); }
    hg = hgOuter;
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  blade.userData.keep = true; mergeRigid(g);
  g.userData = { blade, bladeMat, len: L, short: !!W0.len, trail: W0.trail, baseZ: 0.12 * SZ.len, tipZ: 0.018 + L, hitK: W0.len ? 1 : (HIT_TIP - 0.12 * SZ.len) / (0.018 + L - 0.12 * SZ.len) };
  return g;
}
function stripes2(k) {   // spiral cord texture for the ring-bound grip
  return texCache[k] || (texCache[k] = (() => { const t = canvasTex(64, 256, (x, w, h) => { x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, w, h); for (let y = -w; y < h + w; y += 9) { x.strokeStyle = 'rgba(0,0,0,.28)'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, y); x.lineTo(w, y + 14); x.stroke(); } for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(0,0,0,${rnd(.04, .12)})`; x.fillRect(rnd(0, w), rnd(0, h), 2, 2); } }); t.repeat.set(2, 1); return t; })());
}
// sakura: the grip is a cherry branch that forks behind the pommel into blossoming twigs (three merged meshes: bark, petals, buds)
function sakuraBranch(g, fit) {
  const bark = new THREE.MeshStandardMaterial({ map: barkTex(), roughness: 0.9, flatShading: true }), petal = new THREE.MeshStandardMaterial({ color: 0xf4c8d6, roughness: 0.7, side: THREE.DoubleSide, flatShading: true }),
    leafM = new THREE.MeshStandardMaterial({ color: 0x6a9a3c, roughness: 0.7, side: THREE.DoubleSide, flatShading: true }), bud = new THREE.MeshStandardMaterial({ color: 0xd65a86, roughness: 0.6, flatShading: true });
  const P = (x, y, z) => new V3(x, y, z);
  g.add(taperTube([P(0, 0, -0.004), P(0, 0.002, -0.09), P(0, -0.002, -0.18), P(0, 0.003, -0.25), P(0, 0.006, -0.285)], 0.0168, 0.0135, bark));
  const fu = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 10).rotateX(Math.PI / 2).scale(0.85, 1, 1), fit); fu.position.z = -0.008; g.add(fu);
  // a small twig off the end of the grip: three leaves, two blossoms and a bud
  const tw = [P(0, 0.006, -0.28), P(0.004, 0.018, -0.32), P(0.002, 0.034, -0.35), P(-0.004, 0.05, -0.37)];
  g.add(taperTube(tw, 0.006, 0.0018, bark));
  const lf = new THREE.Shape(); lf.moveTo(0, 0); lf.quadraticCurveTo(0.012, 0.016, 0, 0.038); lf.quadraticCurveTo(-0.012, 0.016, 0, 0); const leafG = new THREE.ShapeGeometry(lf, 3);
  for (const [p, rx, rz] of [[tw[1], 0.4, -1.1], [tw[2], -0.3, 0.9], [tw[3], 0.2, -0.2]]) { const m = new THREE.Mesh(leafG, leafM); m.position.copy(p); m.rotation.set(rx - 1.2, 0.4, rz); g.add(m); }
  const shp = new THREE.Shape(); for (let i = 0; i <= 20; i++) { const a = i / 20 * Math.PI * 2, r = 0.013 * (0.45 + 0.55 * Math.abs(Math.cos(a * 2.5)) ** 0.7); i ? shp.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shp.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  const flowerG = new THREE.ShapeGeometry(shp, 1);
  for (const [p, d, r] of [[tw[3], P(0.004, 0.008, -0.006), [0.3, 0.8, 0.2]], [tw[2], P(-0.012, 0.004, 0.0), [1.4, 0.2, 0.6]]]) { const m = new THREE.Mesh(flowerG, petal); m.position.copy(p).add(d); m.rotation.set(...r); g.add(m); }
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.0055, 0), bud); b.position.copy(tw[1]).add(P(0.008, 0.004, -0.004)); g.add(b);
}
// spear: long lacquered shaft held near its middle, leaf blade at the front (same local frame as the katana)
// naginata / bisento (refs: light wood shaft, black-and-white diamond wraps between brass rings, small round guard, curved blade).
// Local frame like the katana: the right hand holds at z=0, blade toward +Z, edge toward +Y. pole.leftZ: where the left hand grips.
function makePole(kind) {
  const W0 = WEAPONS[kind], g = new THREE.Group(), nag = kind === 'naginata';
  const wood = new THREE.MeshStandardMaterial({ color: nag ? 0xa88c64 : 0x5a3a22, roughness: 0.55, flatShading: true });
  const brass = new THREE.MeshStandardMaterial({ color: W0.fit, metalness: 0.9, roughness: 0.35, flatShading: true });
  const wrap = new THREE.MeshStandardMaterial({ map: tsukaTex(W0.wrap, W0.same), roughness: 0.8, color: 0xd0d0d0 });
  const z0 = -0.55, z1 = 1.2, len = z1 - z0;   // right (rear) hand at z=0 near the butt, left (front) hand toward the blade
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, len, 8).rotateX(Math.PI / 2), wood); shaft.position.z = (z0 + z1) / 2; g.add(shaft);
  for (const [a, b] of [[-0.16, 0.16], [0.36, 0.68]]) {   // wrapped grips: rear (right hand) and front (left hand)
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, b - a, 10).rotateX(Math.PI / 2), wrap); w.position.z = (a + b) / 2; g.add(w);
    for (const zz of [a, b]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.03, 10).rotateX(Math.PI / 2), brass); r.position.z = zz; g.add(r); } }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.02, 0.06, 10).rotateX(Math.PI / 2), brass); cap.position.z = z0 - 0.02; g.add(cap);   // ishizuki
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.027, 0.024, 0.07, 10).rotateX(Math.PI / 2), brass); collar.position.z = z1 - 0.02; g.add(collar);
  const guard = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 14).rotateX(Math.PI / 2), brass); guard.position.z = z1 + 0.02; g.add(guard);
  // blade: profile (z along the blade, y across) extruded thin; naginata = long curved sweep, bisento = broad chopping head with a back notch
  const L = nag ? 0.55 : 0.48, sh = new THREE.Shape(), P = [];   // naginata blade ~55 cm (was oversized)
  for (let i = 0; i <= 16; i++) { const u = i / 16, curve = (nag ? 0.12 : 0.06) * u * u;
    const back = -(nag ? 0.012 : 0.018) + curve - (nag ? 0 : 0.008 * Math.sin(u * Math.PI));
    const edge = (nag ? 0.018 + 0.016 * Math.sin(Math.min(1, u * 1.25) * Math.PI * 0.85) : 0.03 + 0.065 * Math.sin(Math.min(1, u * 1.1) * Math.PI * 0.7)) + curve;   // naginata ~3.5 cm, bisento broad
    P.push([u * L, back, edge]); }
  sh.moveTo(P[0][0], P[0][1]); for (const p of P) sh.lineTo(p[0], p[1]);
  const tip = P[16]; sh.lineTo(tip[0] + (nag ? 0.05 : 0.03), (tip[1] + tip[2]) / 2 + (nag ? 0.02 : 0.03));
  for (let i = 16; i >= 0; i--) sh.lineTo(P[i][0], P[i][2]);
  if (!nag) { sh.lineTo(0.02, P[0][2] * 0.6); }
  const bg = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.005, bevelSegments: 1, curveSegments: 4 });
  bg.translate(0, 0, -0.003); bg.rotateY(-Math.PI / 2);   // shape x -> blade +Z
  const bm = new THREE.MeshStandardMaterial({ color: 0xc8cdd4, metalness: 0.92, roughness: 0.34, envMapIntensity: 1.6, flatShading: true, side: THREE.DoubleSide });   // plain polished steel (the katana texture smears on an extruded profile)
  const blade = new THREE.Mesh(bg, bm); blade.position.z = z1 + 0.03; g.add(blade);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { len: z1 + 0.03 + L, trail: W0.trail, baseZ: z1 + 0.05, tipZ: z1 + 0.06 + L, pole: { leftZ: 0.45 }, blade, bladeMat: bm };
  return g;
}
function makeYari() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 2.4, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a1a10, roughness: 0.4 })); shaft.position.z = 0.35; g.add(shaft);
  const ferr = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.08, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 })); ferr.position.z = 1.55; g.add(ferr);
  const bl = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.42, 4).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.95, roughness: 0.2, envMapIntensity: 2.5 })); bl.scale.set(1, 0.35, 1); bl.position.z = 1.78; g.add(bl);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { len: 2.0, trail: 0xdfe8ff, baseZ: 1.1, tipZ: 1.98, spear: true };
  return g;
}
// saya (scabbard), same local frame: mouth at z=0, extends along +Z. Painted per weapon (wood grain, scales, waves, cracks, kanji),
// with gold bands and a sageo: plain cord, a striped bow (Shi no Ken) or a cord wrap with tassel (Sakura Eda)
export function makeSaya(key = 'standard', len = 0.8) {
  const W0 = WEAPONS[key] || WEAPONS.standard, root = new THREE.Group(), g = new THREE.Group(); g.scale.set(SZ.hilt, SZ.hilt, SZ.len); root.add(g);
  const pts = []; for (let i = 0; i <= 12; i++) { const s = i / 12; pts.push(new V3(0, -0.022 * s * s * len / 0.8, s * len)); }
  const curve = new THREE.CatmullRomCurve3(pts), tube = new THREE.TubeGeometry(curve, 24, 0.017, 10, false); tube.scale(0.75, 1.2, 1);
  const painted = W0.sayaTex || W0.kanji || W0.moon, wood = W0.sayaTex === 'wood';
  g.add(new THREE.Mesh(tube, new THREE.MeshPhysicalMaterial({ color: painted ? 0xffffff : W0.saya, map: painted ? sayaTex(W0) : null, roughness: wood ? 0.6 : 0.22, metalness: 0.1, clearcoat: wood ? 0.3 : 1, clearcoatRoughness: 0.12, emissive: W0.sayaTex === 'cracks' ? 0xff2010 : 0x000000, emissiveMap: W0.sayaTex === 'cracks' ? sayaTex(W0) : null, emissiveIntensity: 0.6 })));
  const fit = new THREE.MeshStandardMaterial({ color: W0.fit, metalness: W0.fitMetal, roughness: 0.35 });
  const kojiri = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 6).scale(0.75, 1.2, 1.1), fit); kojiri.position.copy(pts[12]); g.add(kojiri);
  const koi = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12).rotateX(Math.PI / 2).scale(0.75, 1.2, 1), fit); koi.position.z = 0.01; g.add(koi);
  for (let k = 0; k < (W0.bands || 0); k++) { const p = curve.getPointAt(0.25 + k * 0.25), b = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0185, 0.012, 12).rotateX(Math.PI / 2).scale(0.75, 1.2, 1), fit); b.position.copy(p); g.add(b); }
  const z0 = 0.12 * len / 0.8;
  if (W0.sageo === 'bow' || W0.sageo === 'knot') {   // red-and-white striped cloth tied in a bow (knot: plain navy cord, tanto)
    const st = W0.sageo === 'knot' ? new THREE.MeshStandardMaterial({ color: 0x232c64, roughness: 0.85, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ map: texCache.bowT || (texCache.bowT = canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#b43020'; x.fillRect(0, 0, w, h); x.fillStyle = '#efe4d4'; for (let i = 4; i < w; i += 14) x.fillRect(i, 0, 3, h); })), roughness: 0.9, side: THREE.DoubleSide });
    const wr = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.05, 10, 1, true).rotateX(Math.PI / 2).scale(0.75, 1.2, 1), st); wr.position.z = z0; g.add(wr);
    for (const sx of [-1, 1]) { const loop = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.008, 4, 10).scale(1, 0.6, 1), st); loop.position.set(0, 0.02, z0 + sx * 0.022); loop.rotation.set(0, Math.PI / 2, sx * 0.5); g.add(loop);
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.09), st); tail.position.set(0.004, -0.03, z0 + sx * 0.016); tail.rotation.set(0, Math.PI / 2, sx * 0.35); g.add(tail); }
  } else if (W0.sageo === 'wrap') {   // pink cord wound round the scabbard with a short tassel
    const pk = new THREE.MeshStandardMaterial({ color: 0xc8507a, roughness: 0.85 });
    for (let k = 0; k < 5; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.0185, 0.0028, 4, 12).scale(0.75, 1.2, 1), pk); r.position.z = z0 - 0.02 + k * 0.009; g.add(r); }
    const ts = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.05, 5), pk); ts.position.set(0, -0.045, z0); g.add(ts);
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.8 }); for (let k = 0; k < 3; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.0185, 0.002, 4, 12).scale(0.75, 1.2, 1), dark); r.position.z = z0 + 0.03 + k * 0.007; g.add(r); }
  } else { const cord = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16), new THREE.MeshStandardMaterial({ color: 0x5a2a7a, roughness: 0.9 })); cord.position.set(0, 0.02, z0); cord.rotation.y = Math.PI / 2; g.add(cord); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return mergeRigid(root);
}

// ---------------- armour textures (UVs come from a planar projection of the bind pose) ----------------
function lamellar(base, lace, edge, rows = 7, cols = 8) {
  const k = 'l' + base + lace + edge + rows; if (texCache[k]) return texCache[k];
  return texCache[k] = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    const rh = h / rows;
    for (let r = 0; r < rows; r++) { const y = r * rh, gr = x.createLinearGradient(0, y, 0, y + rh); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(0.75, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = gr; x.fillRect(0, y, w, rh);
      x.fillStyle = edge; x.fillRect(0, y + rh - 3, w, 2);
      x.strokeStyle = lace; x.lineWidth = 3.2; for (let c = 0; c < cols; c++) { const cx = (c + 0.5) * w / cols; x.beginPath(); x.moveTo(cx - 5, y + 2); x.lineTo(cx + 5, y + rh - 4); x.moveTo(cx + 5, y + 2); x.lineTo(cx - 5, y + rh - 4); x.stroke(); } }
  });
}
// gold cuirass with a coiling dragon in relief (SamuraiRemaster4 ref): plate rows, then a serpentine body with scales,
// a horned head and claws, shaded with light/dark strokes so it reads as embossed under the lights
function dragonPlate(key = 'd') {
  const k = 'dragon' + key; if (texCache[k]) return texCache[k];
  return texCache[k] = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#a07a24'; x.fillRect(0, 0, w, h);
    for (let r = 0; r < 9; r++) { const y = r * h / 9, gr = x.createLinearGradient(0, y, 0, y + h / 9); gr.addColorStop(0, 'rgba(255,240,180,.25)'); gr.addColorStop(1, 'rgba(60,40,0,.35)'); x.fillStyle = gr; x.fillRect(0, y, w, h / 9); x.fillStyle = 'rgba(40,24,0,.6)'; x.fillRect(0, y + h / 9 - 3, w, 3); }
    const path = []; for (let i = 0; i <= 60; i++) { const u = i / 60; path.push([w * (0.5 + 0.3 * Math.sin(u * Math.PI * 3.2 + 0.6)), h * (0.92 - 0.8 * u)]); }
    const stroke = (wd, col, dx = 0, dy = 0) => { x.strokeStyle = col; x.lineWidth = wd; x.lineCap = 'round'; x.lineJoin = 'round'; x.beginPath(); path.forEach(([px, py], i) => i ? x.lineTo(px + dx, py + dy) : x.moveTo(px + dx, py + dy)); x.stroke(); };
    stroke(46, 'rgba(50,30,0,.75)', 4, 5); stroke(40, '#d8b048'); stroke(10, 'rgba(255,245,200,.7)', -8, -8);
    for (let i = 2; i < 58; i += 2) { const [px, py] = path[i]; x.strokeStyle = 'rgba(70,45,0,.7)'; x.lineWidth = 3; x.beginPath(); x.arc(px, py, 10, 0.2, Math.PI - 0.2); x.stroke(); }
    const [hx, hy] = path[60]; x.fillStyle = '#e0bc58'; x.beginPath(); x.ellipse(hx, hy, 40, 28, 0.3, 0, Math.PI * 2); x.fill(); x.strokeStyle = 'rgba(60,35,0,.8)'; x.lineWidth = 4; x.stroke();
    x.fillStyle = '#3a0c06'; x.beginPath(); x.arc(hx + 12, hy - 4, 6, 0, 7); x.fill();
    x.strokeStyle = '#f0d070'; x.lineWidth = 6; for (const dx of [-14, 8]) { x.beginPath(); x.moveTo(hx + dx, hy - 20); x.quadraticCurveTo(hx + dx - 20, hy - 60, hx + dx - 40, hy - 70); x.stroke(); }
    for (const i of [14, 32, 48]) { const [px, py] = path[i]; x.strokeStyle = '#e8c45c'; x.lineWidth = 5; for (let c = 0; c < 3; c++) { x.beginPath(); x.moveTo(px, py); x.lineTo(px + 26 + c * 6, py + 18 - c * 10); x.stroke(); } }
  });
}
function goldTrim(base, gold) {   // black lacquer panels framed and latticed in gold
  const k = 'g' + base + gold; if (texCache[k]) return texCache[k];
  return texCache[k] = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    x.strokeStyle = gold; x.lineWidth = 5; x.strokeRect(6, 6, w - 12, h - 12); x.lineWidth = 2;
    for (let i = 1; i < 4; i++) { x.beginPath(); x.moveTo(i * w / 4, 12); x.lineTo(i * w / 4, h - 12); x.stroke(); x.beginPath(); x.moveTo(12, i * h / 4); x.lineTo(w - 12, i * h / 4); x.stroke(); }
    x.beginPath(); x.arc(w / 2, h / 2, 26, 0, 6.3); x.stroke();
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${rnd(.01, .05)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(2, 10), 1); }
  });
}
function oniChest() {
  return texCache.oc || (texCache.oc = canvasTex(256, 256, (x, w, h) => {
    x.drawImage(lamellar('#2c2420', '#8a1a14', '#b08848', 6).image, 0, 0);
    x.fillStyle = 'rgba(20,14,12,.55)'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#c09040'; x.lineWidth = 6; x.beginPath(); x.arc(w / 2, h * 0.45, 62, 0, 6.3); x.stroke();
    x.fillStyle = '#a01818'; x.beginPath(); x.arc(w / 2, h * 0.45, 40, 0, 6.3); x.fill();
    x.fillStyle = '#2a0a08'; x.font = 'bold 50px serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('鬼', w / 2, h * 0.45 + 3);
  }));
}
// woven cloth painted in the outfit colour: soft fold shading, fine threads both ways, slubs; draw() adds garment details
// (collar, hems, pleats). Hex colours are sRGB, painted as-is into an sRGB canvas. Cached per key.
function fabric(key, hex, draw) {
  if (texCache[key]) return texCache[key];
  return texCache[key] = canvasTex(512, 512, (x, w, h) => {
    const R = hex >> 16 & 255, G = hex >> 8 & 255, B = hex & 255, css = (k, a = 1) => `rgba(${Math.min(255, R * k) | 0},${Math.min(255, G * k) | 0},${Math.min(255, B * k) | 0},${a})`;
    x.fillStyle = css(1); x.fillRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) { const fx = rnd(0, w), fw = rnd(8, 42), k = rnd(0.72, 0.88), g = x.createLinearGradient(fx - fw, 0, fx + fw, 0);   // folds hanging down
      g.addColorStop(0, css(k, 0)); g.addColorStop(0.5, css(k, rnd(0.35, 0.7))); g.addColorStop(1, css(k, 0)); x.fillStyle = g; x.fillRect(fx - fw, 0, fw * 2, h); }
    for (let i = 0; i < 12; i++) { const fx = rnd(0, w), fw = rnd(4, 14), g = x.createLinearGradient(fx - fw, 0, fx + fw, 0);   // a few lit ridges
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${rnd(0.04, 0.09)})`); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(fx - fw, 0, fw * 2, h); }
    for (let y = 0; y < h; y += 2) { x.fillStyle = `rgba(255,255,255,${rnd(.025, .06)})`; x.fillRect(0, y, w, 1); }
    for (let i = 0; i < w; i += 2) { x.fillStyle = `rgba(0,0,0,${rnd(.04, .09)})`; x.fillRect(i, 0, 1, h); }
    for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(0,0,0,${rnd(.04, .1)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(2, 10), 1); }
    if (draw) draw(x, w, h, css);
  });
}
const stitch = (x, x0, y0, x1, y1, col = 'rgba(255,255,255,.22)') => { x.save(); x.setLineDash([5, 4]); x.strokeStyle = col; x.lineWidth = 1.5; x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke(); x.restore(); };
function leather(base) {
  const k = 'le' + base; if (texCache[k]) return texCache[k];
  return texCache[k] = canvasTex(128, 128, (x, w, h) => { x.fillStyle = base; x.fillRect(0, 0, w, h); for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${rnd(.03, .12)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(1, 4), rnd(1, 4)); } x.fillStyle = 'rgba(0,0,0,.45)'; for (let y = 12; y < h; y += 32) x.fillRect(0, y, w, 7); x.fillStyle = 'rgba(200,160,90,.6)'; for (let y = 14; y < h; y += 32) x.fillRect(w * 0.45, y, 12, 3); });
}

// ---------------- skinned shells ----------------
// Duplicates the body's skinned triangles of the requested regions and pushes them out along the normal.
function boneRegion(name) {
  if (name === 'Head') return 'head'; if (name === 'neck_01') return 'neck';
  if (/^spine/.test(name) || /^clavicle/.test(name)) return 'torso'; if (name === 'pelvis' || name === 'root') return 'pelvis';
  if (/^upperarm/.test(name)) return 'uarm'; if (/^lowerarm/.test(name)) return 'farm';
  if (/^(hand|index|middle|ring|pinky|thumb)/.test(name)) return 'hand';
  if (/^thigh/.test(name)) return 'thigh'; if (/^calf/.test(name)) return 'calf'; if (/^(foot|ball)/.test(name)) return 'foot';
  return 'other';
}
function analyzeBody(mesh) {
  const g = mesh.geometry, P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, n = P.count;
  const bones = mesh.skeleton.bones, reg = new Array(n), bpos = new Float32Array(n * 3);
  const v = new V3(); let minY = 1e9, maxY = -1e9;
  for (let i = 0; i < n; i++) {
    let best = 0, bw = -1; for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } }
    reg[i] = boneRegion(bones[best].name);
    v.fromBufferAttribute(P, i).applyMatrix4(mesh.bindMatrix); bpos[i * 3] = v.x; bpos[i * 3 + 1] = v.y; bpos[i * 3 + 2] = v.z;
    minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
  }
  const scale = new V3().setFromMatrixScale(mesh.bindMatrix).x;
  return { reg, bpos, minY, maxY, scale, n };
}
// opts: { regions:Set, filter(i,info,x,y,z)->bool, offset(i,info,x,y,z)->metres, material }
function makeShell(mesh, info, opts) {
  const g = mesh.geometry, idx = g.index.array, keep = [];
  const ok = new Uint8Array(info.n);
  for (let i = 0; i < info.n; i++) { const x = info.bpos[i * 3], y = info.bpos[i * 3 + 1], z = info.bpos[i * 3 + 2]; ok[i] = opts.regions.has(info.reg[i]) && (!opts.filter || opts.filter(i, info, x, y, z)) ? 1 : 0; }
  for (let t = 0; t < idx.length; t += 3) if (ok[idx[t]] + ok[idx[t + 1]] + ok[idx[t + 2]] >= (opts.loose ? 2 : 3)) keep.push(idx[t], idx[t + 1], idx[t + 2]);
  const ng = new THREE.BufferGeometry();
  const P = g.attributes.position.clone(), N = g.attributes.normal.clone();
  for (let i = 0; i < info.n; i++) {
    const x = info.bpos[i * 3], y = info.bpos[i * 3 + 1], z = info.bpos[i * 3 + 2];
    const o = opts.offset(i, info, x, y, z) / info.scale;
    let nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
    if (opts.flatten) { ny *= opts.flatten; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l; }
    P.setXYZ(i, P.getX(i) + nx * o, P.getY(i) + ny * o, P.getZ(i) + nz * o);
  }
  const N0 = g.attributes.normal;
  ng.setAttribute('position', P); ng.setAttribute('normal', N);
  if (opts.uv) { const uv = new Float32Array(info.n * 2); for (let i = 0; i < info.n; i++) { const r = opts.uv(info.bpos[i * 3], info.bpos[i * 3 + 1], info.bpos[i * 3 + 2]); uv[i * 2] = r[0]; uv[i * 2 + 1] = r[1]; } ng.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
  ng.setAttribute('skinIndex', g.attributes.skinIndex); ng.setAttribute('skinWeight', g.attributes.skinWeight);
  ng.setIndex(keep); ng.computeVertexNormals();
  const sm = new THREE.SkinnedMesh(ng, opts.material); sm.bind(mesh.skeleton, mesh.bindMatrix); sm.castShadow = true; sm.receiveShadow = true; sm.frustumCulled = false;
  mesh.parent.add(sm); return sm;
}

// ---------------- verlet cloth tail (scarf / ponytail / sashes) ----------------
export class Rope {
  constructor(scene, n, seg, width, material, opts = {}) {
    this.n = n; this.seg = seg; this.w = width; this.p = []; this.o = [];
    for (let i = 0; i < n; i++) { this.p.push(new V3(0, -i * seg, 0)); this.o.push(new V3(0, -i * seg, 0)); }
    this.grav = opts.grav ?? 6; this.drag = opts.drag ?? 0.04; this.taper = opts.taper ?? 0.5; this.inited = false;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const uv = []; for (let i = 0; i < n; i++) uv.push(0, i / (n - 1), 1, i / (n - 1)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const id = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; id.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } geo.setIndex(id);
    this.mesh = new THREE.Mesh(geo, material); this.mesh.frustumCulled = false; this.mesh.castShadow = false; scene.add(this.mesh);
    this.colliders = [];
  }
  update(dt, anchor, side, wind) {   // anchor: world V3; side: world V3 (ribbon width direction)
    dt = Math.min(dt, 1 / 30);
    if (!this.inited) { for (let i = 0; i < this.n; i++) { this.p[i].copy(anchor).y -= i * this.seg; this.o[i].copy(this.p[i]); } this.inited = true; }
    this.p[0].copy(anchor); this.o[0].copy(anchor);
    const tmp = new V3();
    for (let i = 1; i < this.n; i++) {
      const p = this.p[i], o = this.o[i];
      tmp.copy(p).sub(o).multiplyScalar(1 - this.drag);
      o.copy(p); p.add(tmp); p.y -= this.grav * dt * dt;
      if (wind) p.addScaledVector(wind, dt * dt);
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < this.n; i++) {
        const a = this.p[i - 1], b = this.p[i]; tmp.copy(b).sub(a); const d = tmp.length() || 1e-5, diff = (d - this.seg) / d;
        if (i === 1) b.addScaledVector(tmp, -diff); else { a.addScaledVector(tmp, diff * 0.5); b.addScaledVector(tmp, -diff * 0.5); }
      }
      for (const c of this.colliders) for (let i = 1; i < this.n; i++) { const p = this.p[i]; tmp.copy(p).sub(c.c); const d = tmp.length(); if (d < c.r) p.addScaledVector(tmp, (c.r - d) / (d || 1)); }
      for (let i = 1; i < this.n; i++) if (this.p[i].y < 0.02) this.p[i].y = 0.02;
    }
    const P = this.mesh.geometry.attributes.position;
    for (let i = 0; i < this.n; i++) {
      const w = this.w * (1 - this.taper * i / (this.n - 1)) * 0.5, p = this.p[i];
      P.setXYZ(i * 2, p.x - side.x * w, p.y - side.y * w, p.z - side.z * w); P.setXYZ(i * 2 + 1, p.x + side.x * w, p.y + side.y * w, p.z + side.z * w);
    }
    P.needsUpdate = true; if (((this.nf = (this.nf || 0) + 1) & 1) === 0) this.mesh.geometry.computeVertexNormals();   // normals every other frame; no bounds (never culled)
  }
  reset() { this.inited = false; }
  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

// merge a rigid group's meshes that share a material into one mesh each (armour plates, helmet ribs, sword fittings)
function mergeRigid(group) {
  group.updateMatrixWorld(true); const inv = new M4().copy(group.matrixWorld).invert(), by = new Map();
  group.traverse(o => { if (o.isMesh && !o.isSkinnedMesh && !Array.isArray(o.material) && !o.userData.keep) { let l = by.get(o.material); if (!l) by.set(o.material, l = []); l.push(o); } });
  for (const [mat, list] of by) {
    if (list.length < 2) continue;
    const geos = list.map(o => { let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.applyMatrix4(new M4().multiplyMatrices(inv, o.matrixWorld)); return g; });
    const merged = mergeGeometries(geos, false); if (!merged) continue;
    const m = new THREE.Mesh(merged, mat); m.castShadow = true; group.add(m);
    for (const o of list) { o.parent.remove(o); o.geometry.dispose(); } for (const x of geos) x.dispose();
  }
  return group;
}// after dressing: every rigid piece hanging off the same bone that shares a material becomes one mesh (fewer draw calls)
function mergeOnBones(model) {
  model.updateMatrixWorld(true); const bonesList = []; model.traverse(o => { if (o.isBone) bonesList.push(o); });
  for (const bn of bonesList) {
    const by = new Map(), walk = o => { for (const c of o.children) { if (c.isBone || c.userData.noMerge) continue; if (c.isMesh && !c.isSkinnedMesh && !Array.isArray(c.material) && !c.userData.keep) { let l = by.get(c.material); if (!l) by.set(c.material, l = []); l.push(c); } walk(c); } };
    walk(bn); const inv = new M4().copy(bn.matrixWorld).invert();
    for (const [mat, list] of by) {
      if (list.length < 2) continue;
      const geos = list.map(o => { const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); g.applyMatrix4(new M4().multiplyMatrices(inv, o.matrixWorld)); return g; });
      const merged = mergeGeometries(geos, false); if (!merged) continue;
      const m = new THREE.Mesh(merged, mat); m.castShadow = true; bn.add(m);
      for (const o of list) { o.parent.remove(o); o.geometry.dispose(); } for (const x of geos) x.dispose();
    }
  }
}
// attach a rigid object to a bone, given its desired transform in the model's bind/world space at dress time
function attachAt(bone, obj, pos, quat = new Q(), scl = 1) {
  if (obj.isGroup) mergeRigid(obj);
  const wm = new M4().compose(pos, quat, new V3(scl, scl, scl));
  const local = bone.matrixWorld.clone().invert().multiply(wm);
  local.decompose(obj.position, obj.quaternion, obj.scale); bone.add(obj);
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return obj;
}
// tapered tube along a curve (horns)
function taperTube(points, r0, r1, mat) {
  const curve = new THREE.CatmullRomCurve3(points), g = new THREE.TubeGeometry(curve, 20, 1, 8, false), P = g.attributes.position, c = new V3(), n = 21;
  for (let i = 0; i < P.count; i++) { const seg = Math.floor(i / 9), u = Math.min(1, seg / (n - 1)); curve.getPointAt(u, c); const r = r0 + (r1 - r0) * u; P.setXYZ(i, c.x + (P.getX(i) - c.x) * r, c.y + (P.getY(i) - c.y) * r, c.z + (P.getZ(i) - c.z) * r); }
  g.computeVertexNormals(); return new THREE.Mesh(g, mat);
}

const LOWPOLY = true;   // faceted (flat-shaded) cloth and armour, the low-poly samurai look
// Skins. All share the same skeleton, hit-box and animations; they only change the look.
export const OUTFITS = {
  shinobi: { name: 'Shinobi', desc: 'Teal kimono, leather corset and guards, tattered scarf.', price: 0, kimono: 0x2c4644, hakama: 0x1f2a2b, under: 0x171b1c, hands: 0x2a2320, feet: 0x262422, skin: 0xb48a6e, hair: 0x141210, scarf: 0x7a3a26, sash: 0x6e4228, obiH: 0.15, obiCol: () => leather('#6e4228'), sleeveLen: 0.55, sleeveFlare: 0.035, puff: 0.07, style: 'shinobi' },
  ashina: { name: 'Ashina Samurai', desc: 'Red lacquer plates, kuwagata kabuto, fanged menpo.', price: 0, kimono: 0x221a1c, hakama: 0x1c1a20, under: 0x151416, hands: 0x1d1716, feet: 0x2a2624, skin: 0xa07a62, hair: 0x101010, armor: 0x8f1c1c, sash: 0x241a1a, sleeve: 0, puff: 0.05, sandals: [0x2a1c14, 0x8e1d1d], style: 'samurai' },
  ronin: { name: 'Wandering Ronin', desc: 'Faded red haori, striped leg wraps, straw kasa.', price: 600, gems: 8, kimono: 0x2a2624, haori: 0x8c3c3a, sleeve: 0x8c3c3a, sleeveLen: 0.5, sleeveFlare: 0.06, hakama: 0x2d2b38, under: 0x2d2b38, arm: 0xb48a6e, hands: 0xb48a6e, feet: 0x4a4650, skin: 0xb48a6e, hair: 0x15120f, sash: 0xb8a283, puff: 0.075, sandals: [0x3a2418, 0x1c1410], style: 'ronin' },
  kensei: { name: 'Kensei', desc: 'Dark kimono and hakama with the family crest.', price: 800, gems: 10, kimono: 0x30343c, hakama: 0x272a31, under: 0x22252b, sleeveFlare: 0.035, arm: 0xb08468, hands: 0xb08468, feet: 0xb08468, skin: 0xb08468, hair: 0x1a1512, sash: 0x1e2024, mon: true, pants: 'slim', sandals: [0x5a4230, 0x1a1410], style: 'kensei' },
  oni: { name: 'Crimson Oni', desc: 'Oni mask, white mane, hakama licked by flames.', price: 1500, gems: 18, top: 'bare', torso: 0xb88a6c, kimono: 0x16151a, sleeve: 0, hakama: 0x141216, hakamaTex: () => flameHakama(), under: 0x141216, hands: 0x141214, feet: 0x1a1414, skin: 0xb88a6c, hair: 0xe8e4dc, sash: 0xa81818, obiH: 0.11, puff: 0.11, sandals: [0x2a1a14, 0xa81818], style: 'oni' },
  bone: { name: 'Gashadokuro', desc: 'Rusted armour on a samurai who refused to die.', price: 2400, gems: 28, kimono: 0x2a1e18, hakama: 0x2e2018, under: 0x1e1612, hands: 0xd8ccb0, feet: 0x2a1e16, skin: 0xd8ccb0, hair: 0x1a1410, armor: 0x6a4228, sash: 0x3a1410, sleeve: 0, puff: 0.05, sandals: [0x2a1a10, 0x5a1410], style: 'bone' },
  dragonGold: { name: 'Golden Dragon General', desc: 'Gilded scale armour of the dragon generals, blue sash. A Survival mini-boss, now yours.', price: 0, gems: 80, kimono: 0xc8781e, hakama: 0xd89a2a, under: 0x8a4a14, hands: 0x2a1e14, feet: 0xb08a3a, skin: 0xd8ceb4, hair: 0x1a1410, armor: 0xc9a040, sash: 0x2c3e7a, sleeve: 0, puff: 0.07, sandals: [0x2a1a10, 0xc9a040], style: 'dragon' },
  dragonBlack: { name: 'Black Dragon General', desc: 'Black lacquer and gold scales, the darker of the two generals.', price: 0, gems: 60, kimono: 0x1a1612, hakama: 0x161310, under: 0x100e0c, hands: 0x1a1612, feet: 0xb08a3a, skin: 0xd8ceb4, hair: 0x1a1410, armor: 0xc9a040, sash: 0x2c3e7a, sleeve: 0, puff: 0.07, sandals: [0x1a1410, 0xc9a040], style: 'dragon' },
  skullLord: { name: 'Skeleton Shogun', desc: 'The final boss of Survival: bone, rusted iron and a crimson sash.', price: 0, gems: 120, kimono: 0x2a1410, hakama: 0x221812, under: 0x1a1210, arm: 0xd8ccb0, hands: 0xd8ccb0, feet: 0x2a1e16, skin: 0xd8ccb0, hair: 0x0e0c0a, armor: 0x1e1a16, sash: 0x5a1410, sleeve: 0, puff: 0.06, sandals: [0x2a1a10, 0x5a1410], style: 'skull' },
  kage: { name: 'Shadow Gold', desc: 'Black lacquer and gold, jingasa, red-eyed mask.', price: 3000, gems: 35, kimono: 0x0e0e12, hakama: 0x101014, under: 0x0c0c0e, hands: 0x101012, feet: 0xb08a3a, skin: 0x8a6a56, hair: 0x0a0a0a, armor: 0x0c0b0e, lace: 0xc9a14a, sash: 0xd9c9a0, sleeve: 0, puff: 0.05, sandals: [0x1a1410, 0xc9a14a], style: 'kage' },
};
// hakama fading from black to red at the hem, with flame tongues (oni)
function flameHakama() {
  return texCache.flameH || (texCache.flameH = canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#141216'; x.fillRect(0, 0, w, h);
    const g = x.createLinearGradient(0, h * 0.35, 0, h); g.addColorStop(0, 'rgba(168,24,24,0)'); g.addColorStop(0.6, 'rgba(168,24,24,.85)'); g.addColorStop(1, 'rgba(200,40,20,1)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 16; k++) { const cx = (k + 0.5) * w / 16 + rnd(-8, 8), top = h * rnd(0.42, 0.62); x.fillStyle = k % 2 ? 'rgba(240,120,40,.55)' : 'rgba(110,10,10,.7)';
      x.beginPath(); x.moveTo(cx - 18, h); x.quadraticCurveTo(cx - 20, h * 0.8, cx + rnd(-10, 10), top); x.quadraticCurveTo(cx + 22, h * 0.8, cx + 18, h); x.fill(); }
    for (let i = 0; i < w; i += 2) { x.fillStyle = `rgba(0,0,0,${rnd(.03, .08)})`; x.fillRect(i, 0, 1, h); }
    for (const u of [0.4, 0.45, 0.5, 0.55, 0.6, 0.02, 0.98]) { x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(u * w - 1, 0, 2.5, h); }
  }));
}

// Dress a cloned mannequin. Returns handles used by Fighter (katana, saya, ropes, materials for tinting).
export function dress(model, scene, outfitKey = 'shinobi', weaponKey = 'standard') {
  const outfit = OUTFITS[outfitKey] || OUTFITS.shinobi, S = outfit.style;
  const bodies = []; model.traverse(o => { if (o.isSkinnedMesh) bodies.push(o); });
  const main = bodies.find(b => b.material.name === 'M_Main') || bodies[0];
  const joints = bodies.find(b => b !== main);
  main.skeleton.pose(); model.updateMatrixWorld(true);
  const bone = n => model.getObjectByName(n);
  const info = analyzeBody(main), H = info.maxY - info.minY;
  const hy = y => (y - info.minY) / H;                         // 0 feet .. 1 head top
  const wp = n => bone(n).getWorldPosition(new V3());
  const head = wp('Head'), neck = wp('neck_01'), pel = wp('pelvis'), sp1 = wp('spine_01');
  const mats = [];
  const cloth = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: LOWPOLY, ...extra }); mats.push(m); return m; };
  const lacq = (color, map, extra = {}) => { const m = new THREE.MeshPhysicalMaterial({ color, map: map || null, roughness: 0.35, metalness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.25, flatShading: LOWPOLY, ...extra }); mats.push(m); return m; };
  const metal = (color, r = 0.3) => { const m = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: r, flatShading: LOWPOLY }); mats.push(m); return m; };
  const shell = o => makeShell(main, info, o);
  const planar = k => (x, y) => [x * k + 0.5, y * k];
  const armUV = (x, y, z) => [Math.atan2(z, y) / Math.PI + 0.5, Math.abs(x) * 3];
  const legUV = (x, y, z) => [Math.atan2(x - Math.sign(x) * 0.1, z) / Math.PI + 0.5, y * 3];
  // cylindrical UV around the body (u: 0.5 = front centre, wearer's left > 0.5; v: height between v0 and v1 in body units)
  const cylUV = (v0, v1) => (x, y, z) => [Math.atan2(x, z) / (2 * Math.PI) + 0.5, (hy(y) - v0) / (v1 - v0)];
  let fx0 = 9, fx1 = 0; for (let i = 0; i < info.n; i++) if (info.reg[i] === 'farm') { const ax = Math.abs(info.bpos[i * 3]); fx0 = Math.min(fx0, ax); fx1 = Math.max(fx1, ax); }
  const sleeveUV = (x, y, z) => [Math.atan2(z, y) / Math.PI + 0.5, (Math.abs(x) - fx0) / Math.max(0.01, fx1 - fx0)];

  // base body: vertex colours by region (dark undersuit, gloves, tabi/sandals, face skin)
  const cols = new Float32Array(info.n * 3), c = new THREE.Color();
  for (let i = 0; i < info.n; i++) {
    const r = info.reg[i]; c.setHex(r === 'hand' ? outfit.hands : r === 'foot' ? outfit.feet : r === 'head' || r === 'neck' ? outfit.skin : (r === 'torso' || r === 'uarm') && outfit.torso ? outfit.torso : r === 'farm' && outfit.arm ? outfit.arm : outfit.under);
    c.convertSRGBToLinear(); cols.set([c.r, c.g, c.b], i * 3);
  }
  main.geometry = main.geometry.clone(); main.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  main.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: S === 'kage' ? 0.3 : 0, flatShading: LOWPOLY });
  main.castShadow = true; main.receiveShadow = true; main.frustumCulled = false;
  if (joints) { joints.userData.sharedGeo = true; joints.material = new THREE.MeshStandardMaterial({ color: outfit.under, roughness: 0.85 }); joints.castShadow = true; joints.frustumCulled = false; }

  const out = { mats, ropes: [], tint: [], extra: [] };
  // ---- low-poly garment kit. Everything is skinned to the existing skeleton (no new bones), so the rig and animations stay as they are ----
  const bones = main.skeleton.bones, bi = n => bones.findIndex(b => b.name === n);
  const BI = { pel: bi('pelvis'), tl: bi('thigh_l'), tr: bi('thigh_r'), cl: bi('calf_l'), cr: bi('calf_r') };
  const bindInv = main.bindMatrix.clone().invert(), knee = wp('calf_l'), waist = (pel.y + sp1.y) / 2 + 0.06;
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const legPts = []; for (let i = 0; i < info.n; i++) if (info.reg[i] === 'pelvis' || info.reg[i] === 'thigh' || info.reg[i] === 'calf') legPts.push(info.bpos[i * 3], info.bpos[i * 3 + 1], info.bpos[i * 3 + 2]);
  const fitR = (a, y) => { const dx = Math.sin(a), dz = Math.cos(a); let r = 0.06; for (let k = 0; k < legPts.length; k += 3) if (Math.abs(legPts[k + 1] - y) < 0.045) r = Math.max(r, (legPts[k] - pel.x) * dx + (legPts[k + 2] - pel.z) * dz); return r; };
  // skirt / coat tails / tassets: rings of quads fitted round hips and legs (angle 0 = front, +pi/2 = wearer's left).
  // Weights blend pelvis -> thighs (-> calves) with height and side, so the cloth follows the stride instead of sliding through the legs
  // slits: [[centre angle, half width]] cut from the top down to slitTo (0..1): side openings where the sword hand and hilt rest
  // in the idle stance (right hip, a little behind), so the coat / hakama / tassets never swallow the grip
  const SLITS = [[-2.0, 0.46], [1.95, 0.3]];
  const cut = (panels, slits) => { let out = panels.slice();
    for (const [c0, hw] of slits) for (const c of [c0 - 2 * Math.PI, c0, c0 + 2 * Math.PI]) { const s0 = c - hw, s1 = c + hw, nx = [];
      for (const [a0, a1] of out) { if (s1 <= a0 || s0 >= a1) { nx.push([a0, a1]); continue; } if (s0 > a0 + 0.02) nx.push([a0, s0]); if (s1 < a1 - 0.02) nx.push([s1, a1]); } out = nx; }
    return out; };
  const skirt = ({ y0, y1, mat, panels = [[-Math.PI, Math.PI]], segs = 16, rows = 4, margin = 0.03, flare = 0.08, legK = 0.85, calfK = 0, lean = 0, slits = SLITS, slitTo = 1 }) => {
    const pos = [], uv = [], si = [], sw = [], idx = [], v = new V3(), rA = Math.round(slitTo * rows);
    const pieces = slits && slits.length && rA > 0 ? [[cut(panels, slits), 0, rA], ...(rA < rows ? [[panels, rA, rows]] : [])] : [[panels, 0, rows]];
    for (const [pl, rs, re] of pieces) for (const [a0, a1] of pl) {
      const nc = Math.max(1, Math.round(segs * (a1 - a0) / (2 * Math.PI))), base = pos.length / 3, rmax = new Array(nc + 1).fill(0);
      for (let r = 0; r <= re; r++) {
        const t = r / rows, y = y0 + (y1 - y0) * t;
        for (let c = 0; c <= nc; c++) {
          const a = a0 + (a1 - a0) * c / nc; rmax[c] = Math.max(rmax[c], fitR(a, y) + trouserOff(y) + margin);
          if (r < rs) continue;
          const rr = rmax[c] + flare * t; v.set(pel.x + Math.sin(a) * rr, y, pel.z + Math.cos(a) * rr + lean * t).applyMatrix4(bindInv); pos.push(v.x, v.y, v.z);
          uv.push(((a / (2 * Math.PI) + 0.5) % 1 + 1) % 1, 1 - t);
          const lw = legK * sstep(0, 0.65, t), sl = Math.min(1, Math.max(0, 0.5 + Math.sin(a) * 0.9)), cs = calfK * sstep(knee.y + 0.05, knee.y - 0.25, y), lc = sl >= 0.5;
          const wl = lw * sl, wr = lw * (1 - sl);
          si.push(BI.pel, BI.tl, BI.tr, lc ? BI.cl : BI.cr); sw.push(1 - lw, wl * (lc ? 1 - cs : 1), wr * (lc ? 1 : 1 - cs), (lc ? wl : wr) * cs);
        }
      }
      for (let r = 0; r < re - rs; r++) for (let c = 0; c < nc; c++) { const a = base + r * (nc + 1) + c, b = a + nc + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.setIndex(idx); g.computeVertexNormals();
    mat.side = THREE.DoubleSide;
    const sm = new THREE.SkinnedMesh(g, mat); sm.bind(main.skeleton, main.bindMatrix); sm.castShadow = true; sm.receiveShadow = true; sm.frustumCulled = false; main.parent.add(sm); return sm;
  };
  // strap / sash across the body: a clean low-poly ring on a tilted plane (normal n through c), fitted to the torso.
  // Each ring vertex copies the skin weights of the body vertex it rests on, so it rides the spine, clavicles and hips
  const band = (mat, c, n, w, margin = 0.02, segs = 16) => {
    n = n.clone().normalize(); const e1 = new V3(0, 0, 1).addScaledVector(n, -n.z).normalize(), e2 = new V3().crossVectors(n, e1).normalize();
    const SI = main.geometry.attributes.skinIndex, SW = main.geometry.attributes.skinWeight, slab = [];
    for (let i = 0; i < info.n; i++) { const r = info.reg[i]; if (r !== 'torso' && r !== 'pelvis' && r !== 'neck') continue; const x = info.bpos[i * 3] - c.x, y = info.bpos[i * 3 + 1] - c.y, z = info.bpos[i * 3 + 2] - c.z; if (Math.abs(x * n.x + y * n.y + z * n.z) < 0.045) slab.push(i, x * e1.x + y * e1.y + z * e1.z, x * e2.x + y * e2.y + z * e2.z); }
    const pos = [], uv = [], si = [], sw = [], idx = [], v = new V3();
    for (let k = 0; k <= segs; k++) { const t = k / segs * Math.PI * 2, ca = Math.cos(t), sa = Math.sin(t); let best = -1, bd = 0.05;
      for (let j = 0; j < slab.length; j += 3) { const d = slab[j + 1] * ca + slab[j + 2] * sa; if (d > bd) { bd = d; best = slab[j]; } }
      const r = bd + margin; for (const side of [-0.5, 0.5]) { v.copy(c).addScaledVector(e1, ca * r).addScaledVector(e2, sa * r).addScaledVector(n, side * w).applyMatrix4(bindInv); pos.push(v.x, v.y, v.z); uv.push(k / segs * 4, side + 0.5);
        for (let q = 0; q < 4; q++) { si.push(best < 0 ? BI.pel : SI.getComponent(best, q)); sw.push(best < 0 ? (q ? 0 : 1) : SW.getComponent(best, q)); } } }
    for (let k = 0; k < segs; k++) { const a = k * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); g.setIndex(idx); g.computeVertexNormals(); mat.side = THREE.DoubleSide;
    const sm = new THREE.SkinnedMesh(g, mat); sm.bind(main.skeleton, main.bindMatrix); sm.castShadow = true; sm.frustumCulled = false; main.parent.add(sm); return sm;
  };
  // leg wraps (kyahan) / bracers between two heights of the calf (or forearm)
  const wraps = (mat, h0, h1, off = 0.018) => shell({ regions: new Set(['calf']), loose: true, filter: (i, f, x, y) => hy(y) > h0 && hy(y) < h1, offset: () => off, material: mat,
    uv: (x, y, z) => [Math.atan2(x - pel.x - Math.sign(x - pel.x) * 0.1, z - pel.z) / Math.PI + 0.5, (hy(y) - h0) / (h1 - h0)] });
  // a thin rod between two points (sandal thongs, cords)
  const rod = (a, b, r, mat) => { const d = b.clone().sub(a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 5), mat); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); return m; };
  // zori: a sole under each foot and a thong strap, fixed to the foot bone
  const sandals = (soleCol, strapCol) => { const sm = cloth(soleCol, { roughness: 0.9 }), tm = cloth(strapCol);
    for (const s of ['l', 'r']) { const sx = s === 'l' ? 1 : -1; let x0 = 9, x1 = -9, z0 = 9, z1 = -9, y0 = 9;
      for (let i = 0; i < info.n; i++) if (info.reg[i] === 'foot' && Math.sign(info.bpos[i * 3] - pel.x) === sx) { const x = info.bpos[i * 3], y = info.bpos[i * 3 + 1], z = info.bpos[i * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); y0 = Math.min(y0, y); }
      const g = new THREE.Group(), w = x1 - x0 + 0.025, l = z1 - z0 + 0.035, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      g.add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.024, l), sm));
      const toe = new V3(-sx * 0.012, 0.03, l * 0.36), top = new V3(0, 0.065, l * 0.05);
      g.add(rod(toe, new V3(w * 0.5, 0.04, -l * 0.02), 0.007, tm), rod(toe, new V3(-w * 0.5, 0.04, -l * 0.02), 0.007, tm), rod(new V3(-sx * 0.012, 0.012, l * 0.36), toe, 0.006, tm));
      attachAt(bone('foot_' + s), g, new V3(cx, y0 - 0.006, cz + 0.006)); void top; } };
  // stripe texture (wraps, bracers, rope belts): base colour, diagonal binding lines, horizontal bands [v, height, colour]
  const stripes = (key, base, bands, diag = 'rgba(0,0,0,.18)') => texCache['st' + key] || (texCache['st' + key] = canvasTex(64, 256, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h); x.strokeStyle = diag; x.lineWidth = 2;
    for (let y = -w; y < h + w; y += 22) { x.beginPath(); x.moveTo(0, y); x.lineTo(w, y + w * 0.6); x.stroke(); }
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${rnd(.03, .08)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(2, 8), 1); }
    for (const [v, t, col] of bands) { x.fillStyle = col; x.fillRect(0, (1 - v) * h - t * h / 2, w, t * h); }
  }));

  const pantsMode = outfit.pants || 'tucked', bare = outfit.top === 'bare';
  // kimono (torso + upper arms): crossed collar (left panel over right, the "y" seen from the front) with a strip of white under-collar
  const kv0 = hy(pel.y) - 0.08, kv1 = hy(neck.y) + 0.05, KV = y => (hy(y) - kv0) / (kv1 - kv0);
  const nV = KV(neck.y) + 0.01, oV = KV((pel.y + sp1.y) / 2 + 0.11), juban = outfit.kimono === 0xcfc6b2 ? '#8a8476' : '#b9b4a8';
  if (!bare) {
    const kimTex = fabric('kim' + outfit.kimono + S, outfit.kimono, (x, w, h, css) => {
      const P = (u, v) => [u * w, (1 - v) * h], bw = w * 0.042, band = (a, b, col, lw) => { x.strokeStyle = col; x.lineWidth = lw; x.lineCap = 'butt'; x.beginPath(); x.moveTo(...P(...a)); x.lineTo(...P(...b)); x.stroke(); };
      const lum = ((outfit.kimono >> 16 & 255) * 0.3 + (outfit.kimono >> 8 & 255) * 0.59 + (outfit.kimono & 255) * 0.11) / 255, ek = lum > 0.45 ? 0.72 : 1.45, ed = lum > 0.45 ? 0.45 : 0.6;
      const qx = 0.095, cx = 0.075, mid = nV - (nV - oV) * 0.22;
      band([0.5 - qx, nV], [0.5 + cx * 0.6, oV], css(ed), bw + 4); band([0.5 - qx, nV], [0.5 + cx * 0.6, oV], css(ek * 0.95), bw);        // right panel (under)
      band([0.5 + qx - 0.032, nV], [0.5 + qx * 0.45, mid], juban, bw * 0.5);                                                                  // white under-collar
      band([0.5 + qx, nV], [0.5 - cx, oV], css(ed), bw + 5); band([0.5 + qx, nV], [0.5 - cx, oV], css(ek), bw);                       // left panel (over)
      stitch(x, ...P(0.5 + qx - 0.014, nV), ...P(0.5 - cx - 0.014, oV));
      x.fillStyle = css(ek); x.fillRect(0, (1 - nV) * h - bw * 0.5, 0.26 * w, bw); x.fillRect(0.74 * w, (1 - nV) * h - bw * 0.5, 0.26 * w, bw);   // collar round the back of the neck (back half only)
      x.fillStyle = css(0.42); x.fillRect(0, (1 - nV) * h + bw * 0.5, 0.26 * w, 2); x.fillRect(0.74 * w, (1 - nV) * h + bw * 0.5, 0.26 * w, 2);
      if (outfit.mon) for (const [u, v] of [[0.5 + 0.17, nV - 0.2], [0.5 - 0.17, nV - 0.2], [0.02, nV - 0.08], [0.98, nV - 0.08]]) { const [px, py] = P(u, v); x.strokeStyle = '#d8d2c4'; x.lineWidth = 3; x.beginPath(); x.arc(px, py, 11, 0, 6.3); x.stroke(); x.fillStyle = '#d8d2c4'; x.beginPath(); x.arc(px, py, 4, 0, 6.3); x.fill(); }
      x.fillStyle = css(0.55, 0.9); x.fillRect(0, 0, w, 3);
    });
    shell({ regions: new Set(['torso', 'uarm', 'neck', 'pelvis']), loose: true, filter: (i, f, x, y) => f.reg[i] !== 'neck' || y < neck.y + 0.03,
      offset: (i, f) => f.reg[i] === 'pelvis' ? 0.012 : f.reg[i] === 'uarm' ? 0.012 : 0.008, material: cloth(0xffffff, { map: kimTex }), uv: cylUV(kv0, kv1) });
  }
  // sleeves: wide and squared, ending part-way down the forearm (sleeveLen 0..1) with a darker hem band
  if (outfit.sleeve !== 0) {
    const sc = outfit.sleeve || outfit.kimono, len = outfit.sleeveLen ?? 1;
    const slv = cloth(0xffffff, { map: fabric('slv' + sc, sc, (x, w, h, css) => { x.fillStyle = css(0.62); x.fillRect(0, 0, w, h * 0.07); x.fillStyle = css(0.45); x.fillRect(0, h * 0.07, w, 3); stitch(x, 0, h * 0.1, w, h * 0.1); }) });
    shell({ regions: new Set(['farm']), loose: true, filter: (i, f, x) => (Math.abs(x) - fx0) / Math.max(0.01, fx1 - fx0) < len, offset: (i, f, x) => { const d = Math.abs(x) - 0.36; return 0.014 + (outfit.sleeveFlare ?? 0.05) * Math.min(1, Math.max(0, d / 0.22)) ** 1.5; }, material: slv,
      uv: (x, y, z) => { const r = sleeveUV(x, y, z); return [r[0], r[1] / len]; } });
  }
  // trousers: bloused above the knee and tucked into wraps / guards (or slim under a hakama skirt)
  const hv1 = hy((pel.y + sp1.y) / 2 + 0.1), puff = outfit.puff ?? 0.06;
  const hak = cloth(0xffffff, { map: outfit.hakamaTex ? outfit.hakamaTex() : fabric('hak' + outfit.hakama, outfit.hakama, (x, w, h, css) => {
    for (const u of [0.4, 0.45, 0.5, 0.55, 0.6, 0.02, 0.98]) { x.fillStyle = css(0.5, 0.85); x.fillRect(u * w - 1, 0, 2.5, h); x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(u * w + 2, 0, 3, h); }
    x.fillStyle = css(0.6); x.fillRect(0, h * 0.965, w, h * 0.035); stitch(x, 0, h * 0.955, w, h * 0.955);
  }) });
  const trouserOff = y => { const h = hy(y); if (pantsMode === 'slim') return 0.014; const p = Math.max(0, Math.min(1, (h - 0.18) / 0.12)) * Math.max(0, Math.min(1, (0.56 - h) / 0.1)); return 0.014 + puff * p; };
  shell({ regions: new Set(['pelvis', 'thigh', 'calf']), loose: true, flatten: 0.3, material: hak, uv: cylUV(0, hv1), offset: (i, f, x, y) => trouserOff(y) });
  // obi
  const obiH = outfit.obiH || 0.09;
  const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.17, obiH, 12, 1, true), cloth(outfit.obiCol ? 0xffffff : outfit.sash || 0x222222, { side: THREE.DoubleSide, map: outfit.obiCol ? outfit.obiCol() : null }));
  obi.geometry.scale(1, 1, 0.78); attachAt(bone('pelvis'), obi, new V3(pel.x, (pel.y + sp1.y) / 2 + 0.06 - (obiH - 0.09) * 0.25, pel.z + 0.005));
  if (outfit.sandals) sandals(...outfit.sandals);
  // katana + saya(s) on the left hip
  out.katana = makeKatana(weaponKey); scene.add(out.katana); out.trail = out.katana.userData.trail;
  const poleW = weaponKey === 'yari' || weaponKey === 'naginata' || weaponKey === 'bisento';
  out.saya = makeSaya(poleW ? 'standard' : weaponKey, (WEAPONS[weaponKey] || {}).sayaLen || 0.8); if (poleW) out.saya.visible = false;
  const sq = new Q().setFromEuler(new THREE.Euler(-0.35, -0.25, 0, 'YXZ')), sd = new V3(0, 0, 1).applyQuaternion(sq);
  const back = new Q().setFromUnitVectors(new V3(0, 0, 1), new V3(-sd.x, sd.y, -sd.z).normalize());
  attachAt(bone('pelvis'), out.saya, new V3(pel.x + 0.19, pel.y + 0.12, pel.z + 0.17), back);
  if (S === 'kage') { const w = makeSaya(weaponKey, 0.55); const wk = makeKatana(weaponKey); wk.scale.set(1, 1, 0.68); wk.position.z = -0.002; w.add(wk); attachAt(bone('pelvis'), w, new V3(pel.x + 0.21, pel.y + 0.16, pel.z + 0.1), back.clone().multiply(new Q().setFromAxisAngle(new V3(1, 0, 0), 0.25))); }

  // ---- reusable armour parts ----
  const cuirass = (mat, off = 0.05) => shell({ regions: new Set(['torso']), filter: (i, f, x, y) => y < neck.y - 0.06, offset: () => off, material: mat, uv: planar(2.2) });
  const kote = mat => shell({ regions: new Set(['farm']), loose: true, offset: () => 0.018, material: mat, uv: armUV });
  const suneate = mat => shell({ regions: new Set(['calf']), filter: (i, f, x, y) => hy(y) < 0.22 && hy(y) > 0.05, offset: () => 0.03, material: mat, uv: legUV });
  const sode = (mat, rows, w, drop) => { for (const s of ['l', 'r']) {
    const ua = wp('upperarm_' + s), la = wp('lowerarm_' + s), dir = la.clone().sub(ua).normalize(), sx = s === 'l' ? 1 : -1, sg = new THREE.Group();
    for (let k = 0; k < rows; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(w, w * 1.04, drop, 16, 1, true, -1.0, 2.0), mat); p.position.y = -k * drop * 0.9; p.material.side = THREE.DoubleSide; sg.add(p); }
    const q = new Q().setFromUnitVectors(new V3(0, -1, 0), new V3(dir.x * 0.35, -1, dir.z * 0.35).normalize()).multiply(new Q().setFromAxisAngle(new V3(0, 1, 0), sx * Math.PI / 2));
    attachAt(bone('upperarm_' + s), sg, ua.clone().add(new V3(sx * 0.05, 0.04, 0)), q); } };
  const kusazuri = (mat, rows, wide) => { for (const [b, ax, az] of [['thigh_l', 0.12, 0.1], ['thigh_r', -0.12, 0.1], ['thigh_l', 0.18, -0.04], ['thigh_r', -0.18, -0.04], ['pelvis', 0.08, -0.15], ['pelvis', -0.08, -0.15]]) {
    const pl = new THREE.Group(); for (let k = 0; k < rows; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.05, 0.016), mat); m.position.y = -k * 0.048; m.position.z = k * 0.005; pl.add(m); }
    attachAt(bone(b), pl, new V3(pel.x + ax, pel.y - 0.03, pel.z + az), new Q().setFromEuler(new THREE.Euler(-0.14, Math.atan2(ax, az), 0, 'YXZ'))); } };
  // minimal face: almond eyes with a wet glint, angled brows, a mouth line. Placed on the real face surface of the bind mesh.
  const faceZ = (fx, fy) => { let z = -1; for (let i = 0; i < info.n; i++) if (info.reg[i] === 'head' && Math.abs(info.bpos[i * 3] - fx) < 0.016 && Math.abs(info.bpos[i * 3 + 1] - fy) < 0.02) z = Math.max(z, info.bpos[i * 3 + 2]); return z > 0 ? z : head.z + 0.105; };
  const face = ({ brows = true, mouth = false, eyeY = 0.075 } = {}) => {
    const eyeM = new THREE.MeshStandardMaterial({ color: 0x0e0a08, roughness: 0.18, metalness: 0 }), browM = new THREE.MeshStandardMaterial({ color: outfit.hair, roughness: 0.8 }); mats.push(eyeM, browM);
    for (const sx of [-1, 1]) {
      const ex = head.x + sx * 0.032, ey = head.y + eyeY, ez = faceZ(ex, ey);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 12, 6).scale(1.5, 0.55, 0.32), eyeM);   // shape baked in: attachAt() resets object scale
      attachAt(bone('Head'), eye, new V3(ex, ey, ez + 0.001), new Q().setFromEuler(new THREE.Euler(0, sx * 0.25, sx * -0.12)));
      if (brows) { const br = new THREE.Mesh(new THREE.BoxGeometry(0.027, 0.0045, 0.006), browM); attachAt(bone('Head'), br, new V3(ex - sx * 0.002, ey + 0.013, ez + 0.003), new Q().setFromEuler(new THREE.Euler(0, sx * 0.25, sx * 0.22))); }
    }
    if (mouth) { const my = head.y + 0.018, m = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.0028, 0.004), cloth(0x4a2a22)); attachAt(bone('Head'), m, new V3(head.x, my, faceZ(head.x, my) + 0.001)); }
  };
  const hairCap = mat => shell({ regions: new Set(['head']), filter: (i, f, x, y, z) => y > head.y + 0.06 || (z < head.z - 0.01 && y > head.y - 0.02), offset: () => 0.011, material: mat });
  const mempo = (mat, plateMat, stache) => {
    shell({ regions: new Set(['head', 'neck']), filter: (i, f, x, y, z) => z > head.z - 0.01 && y < head.y + 0.058 && y > head.y - 0.075, offset: () => 0.017, material: mat });
    const n = new THREE.Mesh(new THREE.TetrahedronGeometry(0.02).rotateY(Math.PI / 4).scale(0.85, 1.3, 1.1), mat); attachAt(bone('Head'), n, new V3(head.x, head.y + 0.045, faceZ(head.x, head.y + 0.045) + 0.02));
    if (stache) for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.06, 4).rotateZ(sx * 1.25), stache); attachAt(bone('Head'), m, new V3(head.x + sx * 0.026, head.y + 0.022, faceZ(head.x + sx * 0.02, head.y + 0.02) + 0.021)); }
    for (let k = 0; k < 3; k++) { const g = new THREE.Mesh(new THREE.CylinderGeometry(0.07 + k * 0.012, 0.078 + k * 0.012, 0.028, 8, 1, true, -1.15, 2.3), plateMat); plateMat.side = THREE.DoubleSide; attachAt(bone('Head'), g, head.clone().add(new V3(0, -0.07 - k * 0.025, 0.03 - k * 0.004))); }
  };
  const menpo = (mat, full) => shell({ regions: new Set(['head', 'neck']), filter: (i, f, x, y, z) => z > head.z - (full ? 0.02 : 0) && y < head.y + (full ? 0.11 : 0.06), offset: () => 0.012, material: mat });
  const ropeTails = (mat, list, n = 7, seg = 0.08, w = 0.05, parent = 'pelvis') => { for (const p of list) { const r = new Rope(scene, n, seg, w, mat, { grav: 5, drag: 0.08, taper: 0.4 }), a = new THREE.Object3D(); attachAt(bone(parent), a, p); out.ropes.push({ rope: r, anchor: a, sideBone: bone(parent) }); } };
  const kabuto = (bowlMat, trimMat, shikoroMat, crest) => {
    const kab = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 5, 0, Math.PI * 2, 0, Math.PI / 2), bowlMat); bowl.scale.set(1, 1.05, 1.1); kab.add(bowl);
    for (let k = 0; k < 12; k++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.136, 0.004, 4, 16, Math.PI / 2), trimMat); rib.rotation.set(0, k / 12 * Math.PI * 2, Math.PI / 2); rib.scale.set(1.1, 1.15, 1.21); kab.add(rib); }
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.012), shikoroMat); w.position.set(sx * 0.155, -0.03, 0.075); w.rotation.set(0, sx * 0.9, sx * -0.2); kab.add(w); const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.008, 0.016), trimMat); e.position.set(sx * 0.157, 0.005, 0.077); e.rotation.copy(w.rotation); kab.add(e); }
    for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.14 + k * 0.022, 0.155 + k * 0.022, 0.035, 10, 1, true, Math.PI * 0.3, Math.PI * 1.4), shikoroMat); s.material.side = THREE.DoubleSide; s.position.set(0, -0.03 - k * 0.032, -0.012); kab.add(s); }   // open at the front (theta 0 = +z = face)
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.165, 0.02, 20, 1, false, -0.9, 1.8), bowlMat); kab.add(visor);
    if (crest === 'crescent') { const cr = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.009, 6, 28, Math.PI * 0.92), trimMat); cr.position.set(0, 0.2, 0.125); cr.rotation.z = Math.PI + Math.PI * 0.04; cr.scale.set(1, 0.8, 1); kab.add(cr); }
    if (crest === 'dragon') {   // a small gold dragon coiling up the front of the bowl, horned head on top
      kab.add(taperTube([new V3(0, 0.03, 0.16), new V3(0.06, 0.09, 0.175), new V3(-0.045, 0.16, 0.17), new V3(0.035, 0.23, 0.145), new V3(0, 0.29, 0.11)], 0.02, 0.006, trimMat));
      const hd = new THREE.Mesh(new THREE.DodecahedronGeometry(0.03, 0).scale(1, 0.8, 1.4), trimMat); hd.position.set(0, 0.3, 0.13); kab.add(hd);
      for (const sx of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.08, 4), trimMat); h.position.set(sx * 0.018, 0.34, 0.11); h.rotation.set(-0.6, 0, sx * -0.35); kab.add(h); }
      for (let k = 0; k < 5; k++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.04, 4), trimMat); const u = 0.15 + k * 0.17, y = 0.04 + u * 0.25; f.position.set(Math.sin(u * 9) * 0.04, y, 0.16 - u * 0.04); f.rotation.x = -0.8; kab.add(f); }
    }
    if (crest === 'kuwagata' || crest === 'kuwagataXL') {
      const bl = new THREE.Shape(); bl.moveTo(-0.01, 0); bl.lineTo(0.01, 0); bl.lineTo(0.022, 0.16); bl.lineTo(0.034, 0.215); bl.lineTo(0.016, 0.205); bl.lineTo(0.006, 0.232); bl.lineTo(-0.012, 0.2); bl.lineTo(-0.02, 0.16); bl.closePath();
      const bg = new THREE.ExtrudeGeometry(bl, { depth: 0.005, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1 });
      const big = crest === 'kuwagataXL' ? 1.75 : 1;   // the skeleton shogun's towering horns
      for (const sx of [-1, 1]) { const b = new THREE.Mesh(bg, trimMat); b.scale.setScalar(big); b.position.set(sx * 0.014, 0.035, 0.158); b.rotation.set(-0.12, 0, -sx * (big > 1 ? 0.36 : 0.44)); kab.add(b); }
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.012, 8).rotateX(Math.PI / 2).scale(1.3, 1, 1), trimMat); plate.position.set(0, 0.035, 0.16); kab.add(plate);
      const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.03, 1), trimMat); ball.position.set(0, 0.09, 0.15); kab.add(ball);
    }
    if (crest === 'vhorn') { for (const sx of [-1, 1]) kab.add(taperTube([new V3(sx * 0.05, 0.03, 0.15), new V3(sx * 0.15, 0.1, 0.17), new V3(sx * 0.21, 0.24, 0.15), new V3(sx * 0.17, 0.37, 0.1)], 0.024, 0.005, trimMat)); const pl = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.012, 6).rotateX(Math.PI / 2), trimMat); pl.position.set(0, 0.035, 0.158); kab.add(pl); }   // horns rise from the brow plate, in front
    if (crest === 'oni') {
      const horn = cloth(0x1c1614, { roughness: 0.45 });
      for (const sx of [-1, 1]) kab.add(taperTube([new V3(sx * 0.1, 0.03, 0.07), new V3(sx * 0.2, 0.14, 0.05), new V3(sx * 0.24, 0.32, 0.0), new V3(sx * 0.18, 0.48, -0.06)], 0.03, 0.006, horn));
      const dg = new THREE.Group(); const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 20).rotateX(Math.PI / 2), trimMat); dg.add(disc);
      for (let k = 0; k < 7; k++) { const a = -1.2 + k * 0.4, f = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.1, 6), trimMat); f.position.set(Math.sin(a) * 0.06, Math.cos(a) * 0.06 + 0.02, 0); f.rotation.z = -a; dg.add(f); }
      dg.position.set(0, 0.06, 0.155); kab.add(dg);
    }
    attachAt(bone('Head'), kab, head.clone().add(new V3(0, 0.085, -0.01)));
    return kab;
  };

  // ---- shared head pieces ----
  const hairM = new THREE.MeshStandardMaterial({ color: outfit.hair, roughness: 0.6, flatShading: true }); mats.push(hairM);
  const topknot = (tail = true) => {
    shell({ regions: new Set(['head']), filter: (i, f, x, y, z) => y > head.y + 0.085 || (z < head.z - 0.01 && y > head.y - 0.01), offset: () => 0.012, material: hairM });
    const top = head.clone().add(new V3(0, 0.2, -0.06));
    const knot = new THREE.Mesh(new THREE.DodecahedronGeometry(0.033, 0).scale(1, 0.8, 1.4), hairM); attachAt(bone('Head'), knot, top);
    const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.018, 0.03, 6).rotateX(Math.PI / 2), cloth(0xe8e2d4)); attachAt(bone('Head'), tie, top.clone().add(new V3(0, -0.005, 0.03)));
    if (tail) { const ropeM = new THREE.MeshStandardMaterial({ color: outfit.hair, roughness: 0.7, side: THREE.DoubleSide }); mats.push(ropeM);
      const t = new Rope(scene, 5, 0.05, 0.045, ropeM, { grav: 5, drag: 0.06, taper: 0.8 }), anchor = new THREE.Object3D();
      attachAt(bone('Head'), anchor, top.clone().add(new V3(0, 0, -0.04))); out.ropes.push({ rope: t, anchor, sideBone: bone('Head') }); }
  };
  const beard = () => {   // low-poly full beard and moustache grown from the jaw
    shell({ regions: new Set(['head', 'neck']), filter: (i, f, x, y, z) => z > head.z - 0.035 && y < head.y + 0.035 && y > head.y - 0.075, offset: (i, f, x, y) => 0.012 + 0.012 * sstep(head.y + 0.02, head.y - 0.06, y), material: hairM });
    const mu = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.009, 0.012), hairM); attachAt(bone('Head'), mu, new V3(head.x, head.y + 0.034, faceZ(head.x, head.y + 0.034) + 0.008));
  };
  const nose = (col) => { const n = new THREE.Mesh(new THREE.TetrahedronGeometry(0.016).rotateY(Math.PI / 4).scale(0.8, 1.2, 0.9), cloth(col)); attachAt(bone('Head'), n, new V3(head.x, head.y + 0.052, faceZ(head.x, head.y + 0.052) + 0.004)); };
  // straw kasa: a shallow low-poly cone with a folded rim and a crown
  const kasa = (r = 0.37, hgt = 0.15) => {
    const straw = texCache.straw || (texCache.straw = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#c4a466'; x.fillRect(0, 0, w, h); for (let i = 0; i < 220; i++) { x.strokeStyle = `rgba(90,60,20,${rnd(.12, .35)})`; x.beginPath(); const a = rnd(0, 6.3); x.moveTo(w / 2, h / 2); x.lineTo(w / 2 + Math.cos(a) * w, h / 2 + Math.sin(a) * h); x.stroke(); } for (let k = 1; k < 6; k++) { x.strokeStyle = 'rgba(80,50,20,.35)'; x.lineWidth = 2; x.beginPath(); x.arc(w / 2, h / 2, k * w / 12, 0, 6.3); x.stroke(); } }));
    const m = new THREE.MeshStandardMaterial({ map: straw, roughness: 1, side: THREE.DoubleSide, flatShading: true }); mats.push(m);
    const g = new THREE.Group(), cone = new THREE.Mesh(new THREE.ConeGeometry(r, hgt, 14, 2, true), m); g.add(cone);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.02, 0.025, 14, 1, true), m); rim.position.y = -hgt / 2 - 0.01; g.add(rim);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.04, 8), m); cap.position.y = hgt / 2 + 0.01; g.add(cap);
    attachAt(bone('Head'), g, head.clone().add(new V3(0, 0.205, 0)));
    const cord = cloth(0x3a2a20); for (const sx of [-1, 1]) { const c = rod(new V3(sx * 0.1, -0.06, 0.0), new V3(sx * 0.055, -0.2, 0.06), 0.004, cord); attachAt(bone('Head'), c, head.clone().add(new V3(0, 0.2, 0))); }
  };
  // a half or full face guard with a row of teeth (menpo): shell over the lower face + rigid teeth / fangs
  const fangs = (mat, y, n = 6, fang = false, dz = 0) => { for (let k = 0; k < n; k++) { const u = (k + 0.5) / n - 0.5, x = head.x + u * 0.07, t = new THREE.Mesh(fang && (k === 0 || k === n - 1) ? new THREE.ConeGeometry(0.007, 0.03, 4) : new THREE.BoxGeometry(0.009, 0.012, 0.006), mat); if (fang && (k === 0 || k === n - 1)) t.rotation.x = Math.PI; attachAt(bone('Head'), t, new V3(x, head.y + y + (fang && (k === 0 || k === n - 1) ? -0.006 : 0), faceZ(x, head.y + y) + 0.016 + dz)); } };
  const glowEyes = (col, y = 0.088, s = 1, dz = 0.013) => { const em = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(1.7) });   /* HDR: blooms */ for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.011 * s, 6, 4).scale(1.6, 0.6, 0.8), em); attachAt(bone('Head'), e, new V3(head.x + sx * 0.034, head.y + y, faceZ(head.x + sx * 0.034, head.y + y) + dz)); } };
  const ribbons = (mat, pts, n = 9, seg = 0.085, w = 0.05, parent = 'Head', grav = 4.5) => { for (const p of pts) { const r = new Rope(scene, n, seg, w, mat, { grav, drag: 0.07, taper: 0.35 }), a = new THREE.Object3D(); attachAt(bone(parent), a, p); out.ropes.push({ rope: r, anchor: a, sideBone: bone(parent === 'Head' ? 'Head' : parent) }); } };
  // plate texture: horizontal lacquered plates with square rivets (low-poly armour, refs: faceted red do-maru)
  const plates = (key, base, rivet, edge, rows = 5) => texCache['pl' + key] || (texCache['pl' + key] = canvasTex(256, 256, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h); const rh = h / rows;
    for (let r = 0; r < rows; r++) { const y = r * rh, g = x.createLinearGradient(0, y, 0, y + rh); g.addColorStop(0, 'rgba(255,255,255,.14)'); g.addColorStop(0.7, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)'); x.fillStyle = g; x.fillRect(0, y, w, rh);
      x.fillStyle = edge; x.fillRect(0, y + rh - 4, w, 3); x.fillStyle = rivet; for (let c = 0; c < 6; c++) x.fillRect((c + 0.5) * w / 6 - 5, y + rh * 0.45, 10, 9); }
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(0,0,0,${rnd(.02, .08)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(1, 6), rnd(1, 3)); }
  }));
  const rust = key => texCache['ru' + key] || (texCache['ru' + key] = canvasTex(256, 256, (x, w, h) => {   // rusted iron plates with rivets
    x.fillStyle = '#6a4228'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const c = [[150, 80, 40], [70, 40, 25], [110, 60, 30], [40, 28, 22], [170, 100, 50]][i % 5]; x.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${rnd(.15, .5)})`; x.beginPath(); x.arc(rnd(0, w), rnd(0, h), rnd(1, 5), 0, 6.3); x.fill(); }
    const rows = 5, rh = h / rows; for (let r = 0; r < rows; r++) { x.fillStyle = 'rgba(20,12,8,.7)'; x.fillRect(0, r * rh + rh - 4, w, 4); x.fillStyle = 'rgba(200,140,90,.25)'; x.fillRect(0, r * rh, w, 2);
      for (let c = 0; c < 7; c++) { x.fillStyle = '#2a1a12'; x.beginPath(); x.arc((c + 0.5) * w / 7, r * rh + rh * 0.5, 4, 0, 6.3); x.fill(); x.fillStyle = 'rgba(220,160,110,.5)'; x.fillRect((c + 0.5) * w / 7 - 2, r * rh + rh * 0.5 - 3, 2, 2); } }
  }));
  const tatter = (key, col) => texCache['ta' + key] || (texCache['ta' + key] = (() => { const t = canvasTex(64, 256, (x, w, h) => {   // torn cloth strip: ragged bottom and holes (alpha)
    x.fillStyle = col; x.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(0,0,0,${rnd(.05, .2)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(1, 3), rnd(4, 20)); }
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.moveTo(0, h); for (let u = 0; u <= w; u += 8) x.lineTo(u, h - rnd(10, 70)); x.lineTo(w, h); x.fill();
    for (let i = 0; i < 7; i++) { x.beginPath(); x.ellipse(rnd(8, w - 8), rnd(h * 0.3, h * 0.9), rnd(2, 6), rnd(5, 14), 0, 0, 6.3); x.fill(); } }); return t; })());
  const sides = s => s === 'l' ? 1 : -1;
  // one shoulder plate stack (sode) on a chosen side
  const pauldron = (mat, s, rows = 3, w = 0.15, drop = 0.06, trim = null) => { const ua = wp('upperarm_' + s), la = wp('lowerarm_' + s), dir = la.clone().sub(ua).normalize(), sx = sides(s), g = new THREE.Group();
    for (let k = 0; k < rows; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(w * (1 + k * 0.06), w * (1.05 + k * 0.06), drop, 7, 1, true, -1.05, 2.1), mat); p.position.y = -k * drop * 0.82; p.position.x = k * 0.006; g.add(p);
      if (trim) { const t = new THREE.Mesh(new THREE.CylinderGeometry(w * (1.06 + k * 0.06), w * (1.06 + k * 0.06), 0.008, 7, 1, true, -1.05, 2.1), trim); t.position.copy(p.position); t.position.y -= drop / 2; g.add(t); } }
    mat.side = THREE.DoubleSide; if (trim) trim.side = THREE.DoubleSide;
    const q = new Q().setFromUnitVectors(new V3(0, -1, 0), new V3(dir.x * 0.35, -1, dir.z * 0.35).normalize()).multiply(new Q().setFromAxisAngle(new V3(0, 1, 0), sx * Math.PI / 2));
    attachAt(bone('upperarm_' + s), g, ua.clone().add(new V3(sx * 0.05, 0.05, 0)), q); };
  const tassets = (mat, top, len, rows = 4, n = 5, flare = 0.07) => { const P = [], gap = 0.07, span = (2 * Math.PI) / n; for (let k = 0; k < n; k++) { const a0 = -Math.PI + span * 0.5 + k * span - span / 2 + gap, a1 = a0 + span - gap * 2; P.push([a0 + Math.PI, a1 + Math.PI]); }
    return skirt({ y0: top, y1: top - len, mat, panels: P, segs: 22, rows, margin: 0.045, flare, legK: 0.9 }); };
  const ropeBelt = (col, tails = true) => { const m = cloth(0xffffff, { map: stripes('rope' + col, col, [], 'rgba(0,0,0,.35)'), roughness: 0.95, side: THREE.DoubleSide });
    for (const [dy, r] of [[0.02, 0.195], [0.06, 0.19]]) { const b = new THREE.Mesh(new THREE.TorusGeometry(r, 0.022, 6, 16).scale(1, 0.8, 1), m); attachAt(bone('pelvis'), b, new V3(pel.x, waist + dy - 0.05, pel.z), new Q().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))); }
    const k = new THREE.Mesh(new THREE.DodecahedronGeometry(0.04, 0), m); attachAt(bone('pelvis'), k, new V3(pel.x - 0.07, waist - 0.02, pel.z + 0.16));
    if (tails) ropeTails(m, [new V3(pel.x - 0.08, waist - 0.04, pel.z + 0.17), new V3(pel.x - 0.04, waist - 0.04, pel.z + 0.175)], 6, 0.065, 0.035); return m; };

  if (S === 'shinobi') {
    // ref: teal kimono, wide leather corset obi with tassets, one leather pauldron on a cross-body strap, strapped bracers and shin guards
    topknot(true);
    const scarfM = cloth(outfit.scarf, { side: THREE.DoubleSide, map: fabric('weaveN', 0xf4f4f4) }); out.tint.push(scarfM);
    const mask = cloth(0x1d1c1f); shell({ regions: new Set(['head', 'neck']), filter: (i, f, x, y, z) => y < head.y + 0.065 && z > head.z - 0.025, offset: () => 0.008, material: mask });
    face({ brows: true });
    for (const [r, dy, tilt] of [[0.094, 0.0, 0.1], [0.104, -0.026, 0.2]]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.017, 6, 14).scale(1, 1.12, 0.55), scarfM); attachAt(bone('neck_01'), ring, neck.clone().add(new V3(0, dy, 0.01)), new Q().setFromEuler(new THREE.Euler(Math.PI / 2 - tilt, 0, 0))); }
    for (const sx of [-1, 1]) { const r = new Rope(scene, 8, 0.085, 0.08, scarfM, { grav: 4.5, drag: 0.07, taper: 0.55 }), a = new THREE.Object3D(); attachAt(bone('neck_01'), a, neck.clone().add(new V3(sx * 0.04, -0.03, -0.09))); out.ropes.push({ rope: r, anchor: a, sideBone: bone('spine_03') }); }
    const lea = cloth(0xffffff, { map: leather('#6e4228'), roughness: 0.62 }), leaD = cloth(0xffffff, { map: stripes('lea', '#5e3820', [[0.15, 0.06, '#2a1a10'], [0.5, 0.06, '#2a1a10'], [0.85, 0.06, '#2a1a10']], 'rgba(0,0,0,.08)'), roughness: 0.6 });
    tassets(lea, waist - 0.06, 0.2, 2, 4, 0.04);
    pauldron(lea, 'l', 2, 0.14, 0.07);
    band(lea, wp('spine_02').add(new V3(0, 0.03, 0)), new V3(-1.25, 1, 0), 0.055, 0.02);
    kote(leaD); wraps(leaD, 0.06, 0.25, 0.026);
  } else if (S === 'ronin') {
    // refs: faded red haori over a dark kimono, open at the front and falling to the knee, wide short sleeves,
    // dark trousers bloused into striped leg wraps, straw zori, low-poly kasa
    topknot(false); face({ brows: true, mouth: true }); nose(outfit.skin);
    const edgeHex = new THREE.Color(outfit.haori).multiplyScalar(0.32).getHex(), edge = cloth(edgeHex), kimCss = '#' + outfit.kimono.toString(16).padStart(6, '0'), edgeCss = '#' + edgeHex.toString(16).padStart(6, '0');
    const hao = cloth(0xffffff, { map: fabric('hao' + outfit.haori, outfit.haori, (x, w, h, css) => { x.fillStyle = css(0.6); x.fillRect(0, h * 0.965, w, h * 0.035); stitch(x, 0, h * 0.95, w, h * 0.95); }) });
    const haoTop = cloth(0xffffff, { map: fabric('haoT' + outfit.haori, outfit.haori, (x, w, h) => {   // open front: the dark kimono shows in a V framed by the haori's collar bands
      const P = (u, v) => [u * w, (1 - v) * h], q0 = 0.03, q1 = 0.075, bw = w * 0.024;
      x.fillStyle = kimCss; x.beginPath(); x.moveTo(...P(0.5 - q0, nV + 0.03)); x.lineTo(...P(0.5 + q0, nV + 0.03)); x.lineTo(...P(0.5 + q1, 0)); x.lineTo(...P(0.5 - q1, 0)); x.fill();
      x.strokeStyle = '#cfc8b8'; x.lineWidth = bw * 0.5; x.beginPath(); x.moveTo(...P(0.5 - q0 * 0.8, nV + 0.02)); x.lineTo(...P(0.5, nV - 0.18)); x.lineTo(...P(0.5 + q0 * 0.8, nV + 0.02)); x.stroke();   // under-collar V
      x.strokeStyle = edgeCss; x.lineWidth = bw; for (const sx of [-1, 1]) { x.beginPath(); x.moveTo(...P(0.5 + sx * (q0 + 0.01), nV + 0.05)); x.lineTo(...P(0.5 + sx * (q1 + 0.01), 0)); x.stroke(); }
    }) });
    shell({ regions: new Set(['torso', 'uarm', 'pelvis']), loose: true, filter: (i, f, x, y) => y > waist - 0.03, offset: (i, f) => f.reg[i] === 'uarm' ? 0.026 : 0.024, material: haoTop, uv: cylUV(kv0, kv1) });
    out.tint.push(hao, haoTop);
    const coat = skirt({ y0: waist + 0.01, y1: knee.y + 0.02, mat: hao, panels: [[0.34, 2 * Math.PI - 0.34]], segs: 16, rows: 4, margin: 0.04, flare: 0.07, legK: 0.9 });
    skirt({ y0: waist + 0.01, y1: knee.y + 0.02, mat: edge, panels: [[0.26, 0.36], [2 * Math.PI - 0.36, 2 * Math.PI - 0.26]], segs: 16, rows: 4, margin: 0.043, flare: 0.07, legK: 0.9 }); void coat;
    wraps(cloth(0xffffff, { map: stripes('kya', '#a39780', [[0.9, 0.05, '#2a2a3a'], [0.83, 0.035, '#8a1c1c'], [0.77, 0.03, '#2a2a3a']]) }), 0.055, 0.27, 0.024);
    kasa();
  } else if (S === 'samurai') {
    // refs: faceted red do-maru with blue-laced plates, square sode, five-panel kusazuri, kuwagata kabuto, fanged menpo, rope belt
    const red = lacq(0xffffff, plates('ash', '#8e1d1d', '#2f4a9a', '#1a0c0c', 5)); out.tint.push(red);
    const dark = lacq(0x161417, null, { clearcoat: 0.3 }), gold = metal(0xc9a24a, 0.3);
    cuirass(red, 0.055); pauldron(red, 'l', 3, 0.15, 0.075, dark); pauldron(red, 'r', 3, 0.15, 0.075, dark);
    tassets(red, waist - 0.05, 0.3, 4, 5, 0.07);
    kote(lacq(0xffffff, plates('ashk', '#2a2628', '#8e1d1d', '#0e0c0c', 4))); suneate(red);
    for (const s of ['l', 'r']) { const kn = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05, 0).scale(1, 0.8, 0.7), red); attachAt(bone('calf_' + s), kn, wp('calf_' + s).add(new V3(0, 0.0, 0.07))); }
    hairCap(dark); kabuto(dark, gold, red, 'kuwagata');
    mempo(lacq(0x0e0c0e, null, { clearcoat: 0.9 }), red, cloth(0xd8d2c6)); glowEyes(0xff0602, 0.066, 1.35, 0.02);
    ropeBelt('#b08a52');
  } else if (S === 'oni') {
    // refs: oni mask with horns, wild white hair and long red ribbons, bare chest with a strap, one gold-trimmed black pauldron,
    // red sash with a cream rope and tassels, hakama fading from black to red with flames, bound at the ankle
    const red = cloth(0xa81818), blk = lacq(0x121012, null, { clearcoat: 0.4 }), gold = metal(0xd8a63a, 0.25);
    const onim = lacq(0xa8181a, null); out.tint.push(onim, red); menpo(onim, true);
    const hornM = lacq(0x5a0c0c, null); for (const sx of [-1, 1]) { attachAt(bone('Head'), taperTube([new V3(sx * 0.045, 0, 0.07), new V3(sx * 0.07, 0.09, 0.06), new V3(sx * 0.085, 0.19, 0.0), new V3(sx * 0.065, 0.25, -0.06)], 0.022, 0.004, hornM), head.clone().add(new V3(0, 0.11, 0))); const br = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.012, 0.012), blk); attachAt(bone('Head'), br, new V3(head.x + sx * 0.033, head.y + 0.103, faceZ(head.x + sx * 0.033, head.y + 0.1) + 0.016), new Q().setFromEuler(new THREE.Euler(0, 0, sx * 0.35))); }
    glowEyes(0xffd27a, 0.088, 0.9); fangs(cloth(0xf0e8d8), 0.03, 6, true);
    const white = new THREE.MeshStandardMaterial({ color: 0xbdb8ae, roughness: 0.9, flatShading: true }); mats.push(white);
    shell({ regions: new Set(['head']), filter: (i, f, x, y, z) => y > head.y + 0.1 || z < head.z - 0.02, offset: () => 0.016, material: white });
    const hair = new THREE.Group(); for (let k = 0; k < 30; k++) { const a = rnd(-2.7, 2.7), up = rnd(0.1, 1.2), len = rnd(0.16, 0.3), sp = new THREE.Mesh(new THREE.ConeGeometry(0.045, len, 4), white);
      const d = new V3(Math.sin(a) * Math.cos(up) * 0.9, Math.sin(up) + 0.25, -Math.abs(Math.cos(a)) * Math.cos(up) - 0.25).normalize(); sp.quaternion.setFromUnitVectors(new V3(0, 1, 0), d); sp.position.copy(d).multiplyScalar(0.08 + len * 0.45); sp.position.y += 0.02; hair.add(sp); }
    attachAt(bone('Head'), hair, head.clone().add(new V3(0, 0.1, -0.03)));
    ribbons(red, [head.clone().add(new V3(0.04, 0.08, -0.14)), head.clone().add(new V3(-0.04, 0.06, -0.14))], 8, 0.085, 0.05);
    band(blk, wp('spine_02').add(new V3(0, 0.03, 0)), new V3(1.25, 1, 0), 0.05, 0.016);
    pauldron(blk, 'l', 3, 0.16, 0.075, gold);
    kote(blk); wraps(blk, 0.055, 0.15, 0.03);
    ropeBelt('#e6d6b0');
    ribbons(red, [new V3(pel.x - 0.02, waist - 0.05, pel.z + 0.19)], 6, 0.075, 0.07, 'pelvis', 5);
  } else if (S === 'kage') {
    // black lacquer and gold: lattice panels, jingasa with horns, black mask with glowing red eyes, rope belt, daisho
    const blkGold = lacq(0xffffff, goldTrim('#0c0b0e', '#c9a14a'), { metalness: 0.4 }); out.tint.push(blkGold);
    const plt = lacq(0xffffff, lamellar('#0e0d10', '#c9a14a', '#d8b860', 6));
    cuirass(blkGold, 0.055); pauldron(plt, 'l', 4, 0.15, 0.06); pauldron(plt, 'r', 4, 0.15, 0.06); tassets(blkGold, waist - 0.05, 0.28, 3, 6, 0.06);
    kote(plt); suneate(blkGold);
    const blk = lacq(0x0b0a0c, null, { envMapIntensity: 0.7 }), gold = metal(0xcfa042, 0.2);
    hairCap(blk); menpo(lacq(0x0e0d10, null), true); glowEyes(0xff2010);
    const hat = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.14, 16, 1, true), blk); cone.material.side = THREE.DoubleSide; hat.add(cone);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.008, 4, 16), gold); rim.rotation.x = Math.PI / 2; rim.position.y = -0.07; hat.add(rim);
    const knob = new THREE.Mesh(new THREE.DodecahedronGeometry(0.025, 0), gold); knob.position.y = 0.075; hat.add(knob);
    for (const sx of [-1, 1]) hat.add(taperTube([new V3(sx * 0.07, 0.0, 0.13), new V3(sx * 0.11, 0.1, 0.16), new V3(sx * 0.13, 0.2, 0.13)], 0.018, 0.003, gold));
    attachAt(bone('Head'), hat, head.clone().add(new V3(0, 0.2, 0)));
    const rope = cloth(outfit.sash, { roughness: 0.95, side: THREE.DoubleSide });
    for (const [dy, r] of [[0.06, 0.19], [0.1, 0.185]]) { const b = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 6, 16), rope); b.scale.set(1, 0.78, 1); attachAt(bone('pelvis'), b, new V3(pel.x, (pel.y + sp1.y) / 2 + dy, pel.z), new Q().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))); }
    ropeTails(rope, [new V3(pel.x - 0.05, pel.y + 0.1, pel.z + 0.16), new V3(pel.x + 0.05, pel.y + 0.1, pel.z + 0.16)], 6, 0.07, 0.03);
  } else if (S === 'kensei') {
    // ref: dark kimono with white mon, wide hakama skirt to the ankle, topknot and beard, bare feet in zori
    topknot(false); beard(); face({ brows: true }); nose(outfit.skin);
    const hk = cloth(0xffffff, { map: fabric('hks' + outfit.hakama, outfit.hakama, (x, w, h, css) => { for (let k = 0; k < 14; k++) { const u = k / 14; x.fillStyle = css(0.55, 0.8); x.fillRect(u * w, 0, 2, h); x.fillStyle = 'rgba(255,255,255,.07)'; x.fillRect(u * w + 3, 0, 4, h); } x.fillStyle = css(0.6); x.fillRect(0, h * 0.96, w, h * 0.04); }) });
    out.tint.push(hk);
    skirt({ y0: waist + 0.02, y1: wp('foot_l').y + 0.0, mat: hk, segs: 18, rows: 6, margin: 0.03, flare: 0.13, legK: 0.92, calfK: 0.45, slitTo: 0.5 });
  } else if (S === 'bone') {
    // ref: a samurai that would not die: rusted plates, tattered red cloth, skull face with red eyes, V-horned kabuto, bone hands
    const ru = lacq(0xffffff, rust('a'), { clearcoat: 0.05, roughness: 0.75, metalness: 0.35 }); out.tint.push(ru);
    const iron = metal(0x3a2c24, 0.7);
    cuirass(ru, 0.055); pauldron(ru, 'l', 4, 0.16, 0.07); pauldron(ru, 'r', 4, 0.16, 0.07); tassets(ru, waist - 0.05, 0.3, 4, 6, 0.08);
    kote(ru); suneate(ru);
    hairCap(iron); kabuto(iron, iron, ru, 'vhorn');
    mempo(iron, ru, null); glowEyes(0xff0602, 0.066, 1.35, 0.02); fangs(cloth(0xd8ccb0), 0.012, 7, true, 0.006);   // rusted face guard with bared teeth
    const torn = cloth(0xffffff, { map: tatter('red', '#8a1a14'), alphaTest: 0.5, side: THREE.DoubleSide });
    ropeTails(torn, [new V3(pel.x + 0.15, waist - 0.06, pel.z + 0.1), new V3(pel.x - 0.13, waist - 0.06, pel.z + 0.12), new V3(pel.x, waist - 0.06, pel.z - 0.18)], 8, 0.07, 0.12);
    for (const s of ['l', 'r']) ribbons(torn, [wp('upperarm_' + s).add(new V3(sides(s) * 0.12, -0.05, 0))], 7, 0.07, 0.1, 'upperarm_' + s, 5);
    ropeBelt('#5a1410', false);
  }
  if (S === 'dragon' || S === 'skull') {
    // shared: a skull for a face — bone mask over the whole face, dark sockets, nose cavity, bared teeth, a faint glow deep in the eyes
    const boneM = cloth(outfit.skin, { roughness: 0.55 }), hole = cloth(0x0a0706, { roughness: 1 }); menpo(boneM, true);
    for (const sx of [-1, 1]) { const ex = head.x + sx * 0.031, ey = head.y + 0.072, sk = new THREE.Mesh(new THREE.SphereGeometry(0.019, 8, 6).scale(1.25, 1, 0.45), hole); attachAt(bone('Head'), sk, new V3(ex, ey, faceZ(ex, ey) + 0.012)); }
    const nz = new THREE.Mesh(new THREE.TetrahedronGeometry(0.012).scale(1, 1.4, 0.5), hole); attachAt(bone('Head'), nz, new V3(head.x, head.y + 0.04, faceZ(head.x, head.y + 0.04) + 0.013));
    fangs(cloth(0xe8e0cc), 0.018, 8, false, 0.008); glowEyes(S === 'dragon' ? 0xffa030 : 0xd8ecff, 0.072, 0.7, 0.024);
  }
  if (S === 'dragon') {
    // refs (SamuraiRemaster4): gold cuirass with a dragon in relief, blue-laced gold lamellar shoulders and skirt, gold kote and
    // greaves, dragon-crested gold kabuto, skull face, cream rope ties
    const goldD = lacq(0xffffff, dragonPlate(), { metalness: 0.5, roughness: 0.45, clearcoat: 0.15 }), gold = metal(0xb8923a, 0.45);   // satin gold: no blown-out highlights
    const lam = lacq(0xffffff, lamellar('#b8902e', '#2c3e7a', '#e8c868', 6), { metalness: 0.4, roughness: 0.48, clearcoat: 0.15 });
    cuirass(goldD, 0.06); pauldron(lam, 'l', 4, 0.17, 0.085, gold); pauldron(lam, 'r', 4, 0.17, 0.085, gold); tassets(lam, waist - 0.05, 0.33, 4, 6, 0.085);
    kote(lacq(0xffffff, lamellar('#c9a040', '#7a2a14', '#f0d070', 5), { metalness: 0.45, roughness: 0.45, clearcoat: 0.1 })); suneate(goldD);
    for (const sd of ['l', 'r']) { const kn = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05, 0).scale(1, 0.8, 0.7), gold); attachAt(bone('calf_' + sd), kn, wp('calf_' + sd).add(new V3(0, 0, 0.07))); }
    hairCap(lacq(0x1a1410, null)); kabuto(gold, gold, lam, 'dragon');
    ropeBelt('#e2cf9c');
  } else if (S === 'skull') {
    // refs (SkeletonSamurai): dark iron lamellar with gold studs and red lacing, towering gold kuwagata, skull face, bare bone arms
    // bound with red cord, rope belt, tattered dark-red cloth
    const lam = lacq(0xffffff, lamellar('#1e1a16', '#7a1c14', '#b08a3a', 7), { metalness: 0.5, roughness: 0.5, clearcoat: 0.2 }); out.tint.push(lam);
    const iron = metal(0x2a221c, 0.55), gold = metal(0xb89040, 0.3);
    cuirass(lam, 0.06); pauldron(lam, 'l', 5, 0.18, 0.085, gold); pauldron(lam, 'r', 5, 0.18, 0.085, gold); tassets(lam, waist - 0.05, 0.35, 5, 6, 0.09);
    suneate(lam); wraps(cloth(0x5a1612), 0.06, 0.2, 0.022);
    hairCap(iron); kabuto(iron, gold, lam, 'kuwagataXL');
    const torn = cloth(0xffffff, { map: tatter('red2', '#5a1410'), alphaTest: 0.5, side: THREE.DoubleSide });
    ropeTails(torn, [new V3(pel.x + 0.15, waist - 0.06, pel.z + 0.1), new V3(pel.x - 0.13, waist - 0.06, pel.z + 0.12), new V3(pel.x, waist - 0.06, pel.z - 0.18)], 9, 0.07, 0.13);
    ropeBelt('#b8a27a');
  }
  out.saya.userData.noMerge = true; mergeOnBones(model);
  // grip cutaway: clothing never hides the sword hand and hilt. Every garment / armour material discards the fragments inside a
  // thin capsule along the grip (fist -> pommel); the fighter moves the capsule each frame and opens it only in the stance poses
  out.cut = { cutA: { value: new V3() }, cutB: { value: new V3() }, cutR: { value: 0 } };
  const seen = new Set();
  model.traverse(o => { if (!o.isMesh || o === main || o === joints) return; for (const m of [].concat(o.material)) { if (!m || seen.has(m) || m.isMeshBasicMaterial) continue; seen.add(m);
    m.onBeforeCompile = sh => { Object.assign(sh.uniforms, out.cut);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vCutW;').replace('#include <project_vertex>', '#include <project_vertex>\nvCutW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vCutW; uniform vec3 cutA, cutB; uniform float cutR;')
        .replace('void main() {', 'void main() {\n  if (cutR > 0.0) { vec3 ab = cutB - cutA; float t = clamp(dot(vCutW - cutA, ab) / dot(ab, ab), 0.0, 1.0); if (length(vCutW - cutA - ab * t) < cutR) discard; }'); };
    m.customProgramCacheKey = () => 'gripcut'; m.needsUpdate = true; } });
  model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return out;
}
