// Vista: the world around an open map (Survival arenas, Shadow Hunt). The playable square and its own terrain stay as
// they are; around them this builds three planes of real geometry so no edge, void or flat sky card is ever in view:
//   near  (to ~60 m past the edge)  : relief that grows out of the map's own ground (same colours and texture), real trees
//                                     (foliage.js forests with LOD), boulders, ruined walls, a waterfall
//   mid   (to ~190 m)               : ridges, slopes, cliffs and valleys per side of the map, thousands of low-poly
//                                     instanced trees, rock outcrops, temples / pagodas / castles / villages, mountain paths
//   far   (240-560 m)               : three lit mountain ranges (sloped strips with snow caps), clouds
// Atmosphere: everything fades into the fog colour, but with a cap (haze) so distant shapes keep a soft silhouette instead
// of dissolving into a flat wall; the sky's horizon band takes the same fog colour, so land and sky meet without a seam.
// Each map describes its sides (compass degrees: N = -Z, E = +X, S = +Z, W = -X) with a kind of land, see SIDE below.
// Draw calls: 1 relief + ~2 near forest cells per visible side + 2-6 tree batches + 1-2 rock batches + 1 per landmark +
// 3 far ranges + clouds (one instanced mesh). Nothing here casts shadows; nothing here collides (it is all past the bounds).
import * as THREE from 'three';
import { forest } from './foliage.js';
import { rockGeo, stoneWall } from './arch.js';
import { tex, WQ } from './world.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3, _cp = new THREE.Vector3(), _cs = new THREE.Vector3();
// tuning (m unless noted)
export const VISTA = {
  disc: 190, rings: 66, segs: 220,          // relief: outer radius, radial rows, angular columns
  blend: 9,                                 // the relief rises out of the map's ground over this distance past its edge
  far: [[245, 0.5, 95], [330, 0.64, 135], [470, 0.76, 190]],   // far ranges: [radius, haze, peak height]
  treesMid: 2200, rocksMid: 220,            // instanced counts (scaled by quality)
  nearTrees: 90,                           // real (foliage.js) trees in the first band
  cap: { day: 0.86, dusk: 0.86, night: 0.8, fog: 0.92 },   // max haze on the relief / trees / buildings
  camFar: 900,
};
// ---------------------------------------------------------------- noise
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) { const i = Math.floor(x), j = Math.floor(y), u = x - i, v = y - j, a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1), su = u * u * (3 - 2 * u), sv = v * v * (3 - 2 * v); return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv; }
function fbm(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let k = 0; k < o; k++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s / 0.9375; }
const ridged = (x, y) => { let s = 0, a = 0.5, f = 1; for (let k = 0; k < 4; k++) { s += a * (1 - Math.abs(vnoise(x * f, y * f) * 2 - 1)); f *= 2.1; a *= 0.5; } return s / 0.9375; };
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// ---------------------------------------------------------------- land kinds: height at distance d past the map edge
// (n = fbm noise 0..1 at the point, rn = ridged noise). Each also says how dense trees grow and how rocky it is.
const SIDE = {
  mountain: { h: (d, n, rn, hf) => 3 + 78 * Math.pow(sm(6, 150, d), 1.15) + rn * 26 * sm(10, 90, d) + n * 5 + (hf - 0.5) * 9 * sm(8, 40, d), trees: 0.8, treeline: 62, rock: 0.45 },
  cliff:    { h: (d, n, rn, hf) => 2 + 30 * sm(8, 20, d) * (0.75 + 0.5 * n) + 22 * sm(24, 140, d) + rn * 16 * sm(12, 60, d) + n * 5 + (hf - 0.5) * 14 * sm(6, 22, d), trees: 0.55, treeline: 80, rock: 0.85 },
  forest:   { h: (d, n) => 1.5 + 14 * sm(6, 150, d) + n * 9 * sm(4, 40, d), trees: 1.25, treeline: 999, rock: 0.15 },
  hills:    { h: (d, n, rn) => 1 + 22 * sm(10, 150, d) + rn * 10 * sm(10, 80, d), trees: 0.7, treeline: 999, rock: 0.25 },
  valley:   { h: (d, n) => 1.5 + 2 * sm(4, 12, d) + n * 2.5 - 50 * sm(20, 62, d) + 12 * sm(110, 160, d) * n, trees: 0.6, treeline: 999, rock: 0.35, valley: true },
  lake:     { h: (d, n) => 0.6 + n * 1.2 - 9 * sm(14, 30, d), trees: 0.25, treeline: 999, rock: 0.1, lake: true },
};
// ---------------------------------------------------------------- materials with capped haze
const HZ = { cap: { value: 0.86 } };
function hazed(mat, fixed = -1, cap = null) {   // cap: own haze ceiling (water keeps more of its colour), else the shared one
  const fx = { value: fixed };
  mat.onBeforeCompile = sh => {
    sh.uniforms.hzCap = cap === null ? HZ.cap : { value: cap }; sh.uniforms.hzFix = fx;
    sh.fragmentShader = 'uniform float hzCap; uniform float hzFix;\n' + sh.fragmentShader.replace('#include <fog_fragment>',
      '#ifdef USE_FOG\n#ifdef FOG_EXP2\n float ff = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);\n#else\n float ff = smoothstep(fogNear, fogFar, vFogDepth);\n#endif\n float hf = hzFix >= 0.0 ? hzFix : min(ff, hzCap);\n gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, hf);\n#endif');
  };
  mat.customProgramCacheKey = () => 'hazed';
  mat.userData.hzFix = fx; return mat;
}
// ---------------------------------------------------------------- low-poly instanced trees for the mid plane
function treeGeo(kind) {
  const parts = [], col = (g, r, gg, b, top = null) => { const n = g.attributes.position.count, c = new Float32Array(n * 3), nr = g.attributes.normal;
    for (let i = 0; i < n; i++) { const up = top && nr ? Math.max(0, nr.getY(i)) : 0; c.set(top ? [r + (top[0] - r) * up, gg + (top[1] - gg) * up, b + (top[2] - b) * up] : [r, gg, b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
  const prep = g => { g = g.toNonIndexed(); g.deleteAttribute('uv'); g.computeVertexNormals(); return g; };
  const blob = (x, y, z, r, sy = 0.8, sx = 1) => parts.push(col(prep(new THREE.IcosahedronGeometry(r, 0).scale(sx, sy, sx).translate(x, y, z)), 1, 1, 1));
  const stick = (x0, y0, z0, x1, y1, z1, r) => { const a = new V3(x0, y0, z0), b = new V3(x1, y1, z1), d = b.clone().sub(a), g = new THREE.CylinderGeometry(r * 0.7, r, d.length(), 4, 1, true).translate(0, d.length() / 2, 0);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize())).translate(a.x, a.y, a.z); parts.push(col(prep(g), 0.25, 0.18, 0.13)); };
  if (kind === 'conifer' || kind === 'snow') {   // spruce / fir: winter maps only (art rule)
    stick(0, 0, 0, 0, 0.6, 0, 0.13); const snow = kind === 'snow' ? [0.92, 0.94, 0.97] : null;
    for (const [y, r, h] of [[0.3, 0.55, 0.5], [0.62, 0.38, 0.4]]) parts.push(col(prep(new THREE.ConeGeometry(r, h, 6).translate(0, y + h / 2, 0)), 1, 1, 1, snow));
  } else if (kind === 'pad') {   // cloud-pruned black pine: crooked trunk, flat pads at the ends of near-level limbs
    stick(0, 0, 0, 0.08, 0.35, 0.03, 0.09); stick(0.08, 0.35, 0.03, -0.05, 0.62, 0.02, 0.07); stick(0.08, 0.38, 0.03, 0.32, 0.46, 0.05, 0.04); stick(-0.02, 0.5, 0.02, -0.3, 0.52, -0.08, 0.035);
    blob(-0.05, 0.7, 0.02, 0.26, 0.32, 1.25); blob(0.34, 0.5, 0.05, 0.2, 0.3, 1.2); blob(-0.32, 0.56, -0.08, 0.18, 0.32, 1.2);
  } else if (kind === 'vase') {  // tall zelkova: long trunk forking up into a wide dome
    stick(0, 0, 0, 0, 0.5, 0, 0.08); stick(0, 0.45, 0, 0.18, 0.75, 0, 0.04); stick(0, 0.45, 0, -0.16, 0.74, 0.06, 0.04);
    blob(0, 0.82, 0, 0.36, 0.55, 1.2); blob(0.2, 0.74, 0.08, 0.24, 0.6); blob(-0.2, 0.76, -0.06, 0.24, 0.6);
  } else if (kind === 'spread') {   // camphor: short leaning trunk, wide low umbrella
    stick(0, 0, 0, 0.1, 0.3, 0, 0.11); stick(0.1, 0.28, 0, 0.36, 0.42, 0.05, 0.05); stick(0.1, 0.28, 0, -0.26, 0.4, -0.05, 0.05);
    blob(0.05, 0.48, 0, 0.42, 0.58, 1.2); blob(0.36, 0.44, 0.06, 0.25, 0.7); blob(-0.28, 0.44, -0.05, 0.27, 0.7); blob(0.02, 0.62, 0.1, 0.22, 0.7);
  } else if (kind === 'low') {   // camellia / azalea clump
    stick(0, 0, 0, 0, 0.15, 0, 0.06); blob(0, 0.25, 0, 0.32, 0.65, 1.1); blob(0.22, 0.18, 0.08, 0.2, 0.7); blob(-0.2, 0.2, -0.05, 0.22, 0.7);
  } else if (kind === 'bamboo') {   // a clump of culms with feathery tops
    for (const [x, z, h] of [[0, 0, 1], [0.08, 0.05, 0.92], [-0.07, 0.04, 0.86], [0.03, -0.08, 0.95], [-0.04, -0.05, 0.8]]) { stick(x, 0, z, x * 2.5, h, z * 2.5, 0.012); blob(x * 2.6, h - 0.04, z * 2.6, 0.09, 1.6, 0.9); }
  } else {   // broadleaf round crown
    stick(0, 0, 0, 0, 0.6, 0, 0.13);
    for (const [x, y, z, r] of [[0, 0.62, 0, 0.42], [0.2, 0.48, 0.08, 0.3]]) blob(x, y, z, r);
  }
  // the trunk keeps its brown; the crown is white so instanceColor tints it
  return mergeGeometries(parts);
}
// crowns are tinted by instanceColor, so the trunk colour is pre-divided: keep it dark by giving the trunk its own batch? no —
// simpler: trunks are tiny from afar; instanceColor multiplies them too, which only darkens them a bit more.
const TREE_TINT = {
  conifer: [[0.13, 0.24, 0.15], [0.17, 0.3, 0.17], [0.11, 0.2, 0.14], [0.2, 0.33, 0.2]],
  broad: [[0.24, 0.38, 0.17], [0.3, 0.44, 0.2], [0.2, 0.33, 0.15], [0.34, 0.42, 0.18]],
  matsu: [[0.12, 0.25, 0.15], [0.16, 0.3, 0.17], [0.1, 0.22, 0.13], [0.19, 0.33, 0.19]],   // black pine, deep green
  green: [[0.22, 0.36, 0.16], [0.28, 0.42, 0.18], [0.18, 0.31, 0.14], [0.31, 0.45, 0.2]],   // zelkova / camphor / oak
  dark: [[0.11, 0.22, 0.12], [0.14, 0.26, 0.14], [0.1, 0.19, 0.11], [0.16, 0.28, 0.15]],   // camellia, evergreen shrubs
  bamboo: [[0.36, 0.5, 0.2], [0.42, 0.56, 0.24], [0.3, 0.46, 0.18], [0.46, 0.58, 0.26]],
  autumn: [[0.5, 0.1, 0.09], [0.6, 0.14, 0.1], [0.42, 0.08, 0.08], [0.7, 0.2, 0.12]],   // momiji: Momiji Field only (art rule)
  sakura: [[0.85, 0.6, 0.66], [0.78, 0.52, 0.58], [0.88, 0.66, 0.72], [0.8, 0.56, 0.62]],   // only where the map itself has pink trees
  snow: [[0.7, 0.75, 0.78], [0.55, 0.62, 0.64], [0.75, 0.8, 0.84], [0.5, 0.58, 0.6]],
  dead: [[0.3, 0.28, 0.24], [0.26, 0.25, 0.22], [0.34, 0.3, 0.25], [0.2, 0.3, 0.17]],
};
// mid-plane sizes per shape (m) and width factor
const SHAPE_H = { conifer: 10, snow: 10, broad: 8, pad: 6.5, vase: 11, spread: 6, low: 2.6, bamboo: 9 }, SHAPE_W = { pad: 1.4, spread: 1.5, low: 1.3, bamboo: 0.8, vase: 1.1 };
const _eu = new THREE.Euler();
// species grow in groves, not salt-and-pepper: a slow noise picks the kind (weights still hold on average), a little
// randomness frays the borders between groves. kinds: [[name, weight, ...], ...]
function pickKind(kinds, x, z, R) {
  if (kinds.length < 2) return 0;
  const tot = kinds.reduce((a, k) => a + k[1], 0); let u = Math.min(0.999, Math.max(0, (fbm(x * 0.013 + 41, z * 0.013 - 17, 2) - 0.2) / 0.6 * 0.82 + R() * 0.18)) * tot, i = 0;
  for (; i < kinds.length - 1 && u > kinds[i][1]; i++) u -= kinds[i][1];
  return i;
}
// ---------------------------------------------------------------- landmarks: merged, vertex-coloured, flat-shaded
function colored(g, c) { g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv'); g.computeVertexNormals(); const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
const box = (w, h, d, x, y, z, c) => colored(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z), c);
// hip roof with a wide overhang: a 4-sided frustum turned 45 deg, slightly concave look from two stacked layers
function roof(w, d, h, y, c, over = 1.35) {
  const r0 = Math.SQRT1_2 * Math.max(w, d) * over, g1 = new THREE.CylinderGeometry(r0 * 0.28, r0, h * 0.55, 4, 1).rotateY(Math.PI / 4).scale(1, 1, d / w).translate(0, y + h * 0.275, 0);
  const g2 = new THREE.CylinderGeometry(r0 * 0.06, r0 * 0.3, h * 0.45, 4, 1).rotateY(Math.PI / 4).scale(1, 1, d / w).translate(0, y + h * 0.55 + h * 0.225, 0);
  return [colored(g1, c), colored(g2, c)];
}
const PAL = { wall: [0.86, 0.84, 0.78], wood: [0.32, 0.2, 0.14], roof: [0.16, 0.17, 0.2], red: [0.6, 0.14, 0.1], stone: [0.48, 0.46, 0.42], dark: [0.2, 0.18, 0.17], gold: [0.7, 0.55, 0.25] };
const LANDMARK = {
  pagoda(s = 1) { const p = []; let w = 7, y = 0; p.push(box(9, 1, 9, 0, 0, 0, PAL.stone)); y = 1;
    for (let i = 0; i < 5; i++) { const h = 3.2 - i * 0.2; p.push(box(w, h, w, 0, y, 0, i % 2 ? PAL.wall : PAL.red)); p.push(...roof(w, w, 1.6, y + h - 0.3, PAL.roof, 1.55)); y += h + 0.9; w *= 0.84; }
    p.push(colored(new THREE.CylinderGeometry(0.12, 0.25, 6, 6).translate(0, y + 2.4, 0), PAL.gold)); return { p, s }; },
  castle(s = 1) { const p = [];
    p.push(colored(new THREE.CylinderGeometry(14, 19, 9, 4, 1).rotateY(Math.PI / 4).translate(0, 4.5, 0), PAL.stone));   // sloped ishigaki base
    let w = 17, d = 13, y = 9;
    for (let i = 0; i < 4; i++) { const h = 4.2 - i * 0.3; p.push(box(w, h, d, 0, y, 0, PAL.wall)); p.push(...roof(w, d, 2.6, y + h - 0.4, PAL.roof, 1.3)); y += h + 1.4; w *= 0.78; d *= 0.8; }
    for (const [x, z, l, r] of [[-26, 6, 26, 0.2], [26, 4, 24, -0.25], [0, 22, 30, 0]]) { const g = new THREE.BoxGeometry(l, 4, 1.6).translate(0, 2, 0).rotateY(r).translate(x, 0, z); p.push(colored(g, PAL.wall)); const t = new THREE.BoxGeometry(l + 1, 0.8, 2.6).translate(0, 4.4, 0).rotateY(r).translate(x, 0, z); p.push(colored(t, PAL.roof)); }
    for (const [x, z] of [[-38, 10], [37, 9]]) { p.push(box(7, 6, 7, x, 0, z, PAL.stone)); p.push(box(5, 3.5, 5, x, 6, z, PAL.wall)); p.push(...roof(5, 5, 2, 9.2, PAL.roof, 1.5)); }
    return { p, s }; },
  temple(s = 1) { const p = []; p.push(box(24, 1.6, 16, 0, 0, 0, PAL.stone)); p.push(box(18, 6, 11, 0, 1.6, 0, PAL.wood)); p.push(box(16, 4.5, 9.6, 0, 1.6, 0.8, PAL.wall)); p.push(...roof(18, 11, 6.5, 7, PAL.roof, 1.4));
    p.push(box(8, 4, 5, 0, 0, 16, PAL.red)); p.push(...roof(8, 5, 2.6, 4, PAL.roof, 1.5)); return { p, s }; },
  shrine(s = 1) { const p = []; p.push(box(8, 0.8, 7, 0, 0, 0, PAL.stone)); p.push(box(6, 3.4, 5, 0, 0.8, 0, PAL.red)); p.push(...roof(6, 5, 2.6, 4, PAL.roof, 1.5));
    for (const x of [-2.6, 2.6]) p.push(box(0.5, 6, 0.5, x, 0, 9, PAL.red)); p.push(box(8, 0.6, 0.8, 0, 5.6, 9, PAL.red)); p.push(box(7, 0.4, 0.5, 0, 4.7, 9, PAL.red)); return { p, s }; },
  tower(s = 1) { const p = []; p.push(box(8, 7, 8, 0, 0, 0, PAL.stone)); p.push(box(6.5, 6, 6.5, 0, 7, 0, PAL.dark));
    for (const [x, z, h] of [[-2.8, -2.8, 4], [2.8, -2.8, 2], [2.8, 2.8, 3.2], [-2.8, 2.8, 1]]) p.push(box(1.2, h, 1.2, x, 13, z, PAL.dark)); return { p, s }; },   // ruined: the roof is gone
  village(s = 1) { const p = [], R = rng(77);
    for (let i = 0; i < 11; i++) { const a = R() * 6.283, r = 4 + R() * 22, x = Math.cos(a) * r, z = Math.sin(a) * r, w = 5 + R() * 4, d = 4 + R() * 2.5, h = 2.4 + R() * 0.8;
      p.push(box(w, h, d, x, 0, z, R() < 0.5 ? PAL.wood : PAL.wall)); p.push(...roof(w, d, 2.2, h, R() < 0.3 ? [0.36, 0.3, 0.22] : PAL.roof, 1.3)); }
    return { p, s }; },
  gate(s = 1) { const p = []; p.push(box(4, 9, 4, -7, 0, 0, PAL.stone)); p.push(box(4, 9, 4, 7, 0, 0, PAL.stone)); p.push(box(18, 5, 5, 0, 9, 0, PAL.wood)); p.push(...roof(18, 5, 3.2, 13.6, PAL.roof, 1.4));
    for (const x of [-20, 20]) p.push(box(24, 5, 2, x + Math.sign(x) * 2, 0, 0, PAL.stone)); return { p, s }; },
  torii(s = 1) { const p = []; for (const x of [-3.2, 3.2]) p.push(colored(new THREE.CylinderGeometry(0.4, 0.45, 9, 8).translate(x, 4.5, 0), PAL.red)); p.push(box(10, 0.8, 1, 0, 8.6, 0, PAL.red)); p.push(box(11.5, 0.6, 1.2, 0, 9.5, 0, PAL.roof)); p.push(box(8, 0.5, 0.7, 0, 7.2, 0, PAL.red)); return { p, s }; },
};
// ---------------------------------------------------------------- textures
function waterTex() { const t = tex('water').clone(); t.needsUpdate = true; t.repeat.set(60, 60); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
function cloudTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const x = c.getContext('2d'), R = rng(5);
  for (let i = 0; i < 46; i++) { const px = 30 + R() * 196, py = 54 + (R() - 0.5) * 36 * (1 - Math.abs(px - 128) / 128), r = 14 + R() * 30, g = x.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 128); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function fallTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d'), R = rng(9);
  x.fillStyle = 'rgba(200,220,235,0.55)'; x.fillRect(0, 0, 64, 256);
  for (let i = 0; i < 140; i++) { x.fillStyle = `rgba(255,255,255,${0.25 + R() * 0.5})`; x.fillRect(R() * 64, R() * 256, 1 + R() * 2, 10 + R() * 40); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function mistTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'), R = rng(3);
  for (let i = 0; i < 90; i++) { const px = R() * 256, py = R() * 256, r = 20 + R() * 50, g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 256, 256); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
// ================================================================== build
// P: { seed, inner: half-size of the map's own terrain square, tod, sides: [[compassDeg, kind], ...],
//      palette: { grass, rock, dirt, snowLine }, near: real (foliage.js) trees, one kind or [[kind, weight], ...] growing in groves; nearK: their density,
//      trees: [[tint, share, shape], ...] (tint: TREE_TINT; shape: pad | vase | spread | low | bamboo | broad | conifer | snow),
//      ART RULE: spruce / fir (conifer, snow, pine, snowpine) only on winter maps, and winter maps get ONLY snowy spruces; sakura only where the map has pink trees;
//      momiji (autumn) only on Momiji Field. Elsewhere: cloud-pruned pines, bonsai, zelkova, camphor, camellia, bamboo.
//      landmarks: [[kind, compassDeg, distance, scale, faceIn]],
//      paths: [[compassDeg from, compassDeg to, distance from, distance to]], waterfall: compassDeg, walls: compassDeg (ruins),
//      far: 'green' | 'snow' | 'night', clouds: n }
export function vista(g, W, cfg, P) {
  if (globalThis.KD_NO_VISTA) return null;   // test hook: compare against the bare map
  const qk = WQ.grass;   // quality: 0.4 low / 0.7 med / 1 high
  const G = new THREE.Group(); G.userData.dynamic = true; g.add(G);
  const R = rng(P.seed || 1), inner = P.inner || W.half + 5, Q = VISTA, tod = P.tod || cfg.tod || 'day', disc = P.disc || Math.max(Q.disc, inner + 150);
  HZ.cap.value = Q.cap[tod] ?? 0.86;
  const dir = a => [Math.sin(a * Math.PI / 180), -Math.cos(a * Math.PI / 180)];
  const sides = P.sides.map(([deg, kind]) => ({ a: deg * Math.PI / 180, K: SIDE[kind], kind }));
  const pal = Object.assign({ grass: [0.34, 0.42, 0.22], rock: [0.42, 0.4, 0.37], dirt: [0.45, 0.38, 0.27], snowLine: 999, forestFloor: [0.2, 0.27, 0.15] }, P.palette || {});
  // side weights: smooth angular windows, normalised (sides blend into each other, no symmetric seams)
  const weights = th => { let s = 0; const w = sides.map(S => { let d = Math.atan2(Math.sin(th - S.a), Math.cos(th - S.a)); const v = Math.exp(-((d / 0.62) ** 2)); s += v; return v; }); return w.map(v => v / (s || 1)); };
  const compass = (x, z) => Math.atan2(x, -z);   // N = 0, E = +pi/2
  const outside = (x, z) => Math.max(Math.abs(x), Math.abs(z)) - inner;   // distance past the square edge (Chebyshev)
  // land height and its "kind mix" at any point outside the map
  const sample = (x, z, out) => {
    const r = Math.hypot(x, z), th = compass(x, z), w = weights(th), d = Math.max(0, r - inner), n = fbm(x * 0.018 + 7, z * 0.018 - 3), rn = ridged(x * 0.011 + 1.7, z * 0.011 + 9.1), hf = fbm(x * 0.09 + 3, z * 0.09 + 5, 2);   // hf: crags on cliffs
    let h = 0, trees = 0, rock = 0, treeline = 0, valley = 0, lake = 0;
    for (let i = 0; i < sides.length; i++) { const K = sides[i].K; h += w[i] * K.h(d, n, rn, hf); trees += w[i] * K.trees; rock += w[i] * K.rock; treeline += w[i] * K.treeline; valley += w[i] * (K.valley ? 1 : 0); lake += w[i] * (K.lake ? 1 : 0); }
    if (out) Object.assign(out, { h, trees, rock, treeline, valley, lake, n, d });
    return h;
  };
  const edgeY = (x, z) => W.ground(Math.max(-inner, Math.min(inner, x)), Math.max(-inner, Math.min(inner, z)), true);
  const S0 = {};
  const height = (x, z, out) => {
    const o = outside(x, z); if (o <= 0) { if (out) Object.assign(out, { h: 0, trees: 0, rock: 0, treeline: 999, valley: 0, lake: 0, n: 0, d: 0 }); return W.ground(x, z, true) - 0.25 - Math.min(0.6, -o * 0.1); }
    let h = sample(x, z, out); const k = sm(0, Q.blend, o), e = edgeY(x, z);
    if (W.water) { const w = W.water, dd = Math.abs(W.riverDist(x, z)), wb = w.width * 1.8; if (dd < wb) { const t = sm(0, 0.45, 1 - dd / wb), bed = -w.depth * Math.min(1, Math.max(0, 1 - dd / w.width) * 1.6); h = h * (1 - t) + bed * t; if (out && dd < w.width) out.lake = 1; } }   // the map's stream / shore runs on out of it
    return e * (1 - k) + h * k - 0.25 * (1 - sm(0, 2, o));
  };
  cfg.vistaHeight = height;
  const ups = [];
  // ---------- relief: polar mesh from inside the map out to the disc edge
  const rows = Q.rings, cols = Q.segs, rad = i => { const t = i / (rows - 1); return inner * 0.8 + (disc - inner * 0.8) * Math.pow(t, 1.55); };
  const pos = new Float32Array(rows * cols * 3), col = new Float32Array(rows * cols * 3), uv = new Float32Array(rows * cols * 2), info = [];
  const c = new THREE.Color(), cTmp = new THREE.Color(), paths = (P.paths || []).map(([a0, a1, d0, d1]) => [a0 * Math.PI / 180, a1 * Math.PI / 180, d0, d1]);
  const onPath = (x, z, d) => { for (const [a0, a1, d0, d1] of paths) { if (d < d0 - 2 || d > d1 + 2) continue; const t = (d - d0) / (d1 - d0), a = a0 + (a1 - a0) * t + Math.sin(t * 9) * 0.05, r = inner + d; const px = Math.sin(a) * r, pz = -Math.cos(a) * r; if (Math.hypot(px - x, pz - z) < 1.2 + d * 0.006) return true; } return false; };
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const r = rad(i), th = j / cols * Math.PI * 2 + (i % 2) * Math.PI / cols, x = Math.sin(th) * r, z = -Math.cos(th) * r, k = i * cols + j;
    const y = height(x, z, S0); pos.set([x, y, z], k * 3); uv.set([x / 6, z / 6], k * 2); info.push({ ...S0, y });
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols; j++) { const a = i * cols + j, b = i * cols + (j + 1) % cols, cc = (i + 1) * cols + j, dd = (i + 1) * cols + (j + 1) % cols; if (i % 2) idx.push(a, b, cc, b, dd, cc); else idx.push(a, dd, cc, a, b, dd); }   // counter-clockwise seen from above (normals up)
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const nrm = geo.attributes.normal, base = new THREE.Color();
  for (let k = 0; k < rows * cols; k++) {
    const I = info[k], x = pos[k * 3], z = pos[k * 3 + 2], y = I.y, slope = 1 - nrm.getY(k), o = outside(x, z);
    if (o < Q.blend + 2 && W.colorFn) { W.colorFn(Math.max(-inner, Math.min(inner, x)), Math.max(-inner, Math.min(inner, z)), base); } else base.setRGB(...pal.grass).convertSRGBToLinear();
    c.setRGB(...pal.grass).convertSRGBToLinear(); const vn = 0.82 + 0.3 * I.n;
    c.multiplyScalar(vn);
    if (I.trees > 0.9 && I.d > 12) c.lerp(cTmp.setRGB(...pal.forestFloor).convertSRGBToLinear(), 0.5);
    const rockK = sm(0.2, 0.45, slope + I.rock * 0.2), strata = 0.78 + 0.22 * Math.sin(y * 0.9 + I.n * 5) * Math.sin(y * 0.23 + x * 0.02);   // layered rock on steep faces
    c.lerp(cTmp.setRGB(...pal.rock).convertSRGBToLinear().multiplyScalar((0.8 + 0.35 * I.n) * strata), rockK);
    if (y > pal.snowLine) c.lerp(cTmp.setRGB(0.92, 0.94, 0.97).convertSRGBToLinear(), sm(pal.snowLine, pal.snowLine + 14, y) * (1 - sm(0.45, 0.75, slope) * 0.6));
    if (I.lake && y < -1) c.lerp(cTmp.setRGB(0.3, 0.3, 0.26).convertSRGBToLinear(), 0.6);
    if (onPath(x, z, I.d)) c.lerp(cTmp.setRGB(...pal.dirt).convertSRGBToLinear().multiplyScalar(0.8), 0.7);
    const kb = sm(0, Q.blend, o); c.lerp(base, 1 - kb);   // near the map: the map's own ground colour
    col.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const gt = tex('ground'); const relief = new THREE.Mesh(geo, hazed(new THREE.MeshStandardMaterial({ vertexColors: true, map: gt, roughness: 1, flatShading: true })));   // faceted like the rest of the low-poly world
  relief.receiveShadow = true; relief.frustumCulled = false; G.add(relief);
  // ---------- water: lake surface / valley river glint
  for (const sd of sides.filter(s => s.K.lake)) { const wg = new THREE.RingGeometry(inner + 4, disc, 48, 1, Math.PI / 2 - sd.a - 0.95, 1.9).rotateX(-Math.PI / 2); const wm = new THREE.Mesh(wg, hazed(new THREE.MeshStandardMaterial({ color: 0x3a6070, map: waterTex(), roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.92 }), -1, 0.55)); wm.position.y = W.water ? -W.water.depth * 0.45 - 0.04 : -0.9; wm.renderOrder = -1; G.add(wm); }
  if (W.water) { const w = W.water, half = P.riverHalf ?? W.half, wt = tex('water'); wt.repeat.set(30, 2);
    const wm = new THREE.MeshStandardMaterial({ color: 0x4a7a8a, roughness: 0.2, metalness: 0.25, transparent: true, opacity: 0.85, map: wt, envMapIntensity: 1.1 });
    const halves = [-1, 1].map(sd => { const len = disc - half, geo2 = new THREE.PlaneGeometry(len, 1, 120, 1); geo2.rotateX(-Math.PI / 2); geo2.translate(sd * (half + len / 2), 0, 0); const Pp = geo2.attributes.position;
      for (let i = 0; i < Pp.count; i++) { const x = Pp.getX(i), side = Pp.getZ(i) > 0 ? 1 : -1; Pp.setZ(i, w.z + Math.sin(x * w.f) * w.amp + side * w.width * 0.62); Pp.setY(i, -w.depth * 0.45); }
      return geo2; });
    const wg2 = mergeGeometries(halves); wg2.computeVertexNormals(); G.add(new THREE.Mesh(wg2, hazed(wm, -1, 0.6)));
    ups.push(dt => { wt.offset.x += dt * 0.05; }); }
  // ---------- tree / rock scatter
  const S = {}, place = [];
  const treeOK = (x, z, d0, d1) => { const r = Math.hypot(x, z); if (r < inner + d0 || r > inner + d1 || outside(x, z) < 3) return null; const y = height(x, z, S); if (S.lake && y < 0) return null;
    const e = 1.5, sl = Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e); if (sl > 0.9 || y > S.treeline || y > pal.snowLine + 8) return null; return { y, dens: S.trees * (1 - sm(0.5, 0.9, sl)) * (0.55 + 0.9 * fbm(x * 0.03, z * 0.03, 2)) }; };
  // near band: real trees
  const nearKinds = Array.isArray(P.near) ? P.near : [[P.near || 'matsu', 1]], near = nearKinds.map(() => []);
  for (let t = 0, nN = Math.round(Q.nearTrees * (P.nearK ?? 1) * qk * inner / 35), made = 0; t < nN * 6 && made < nN; t++) { const a = R() * 6.283, r = inner + 2 + R() * 30, x = Math.sin(a) * r, z = -Math.cos(a) * r, ok = treeOK(x, z, 1, 34); if (!ok || R() > ok.dens) continue; near[pickKind(nearKinds, x, z, R)].push([x, ok.y - 0.2, z, 0.8 + R() * 0.8]); made++; }
  if (qk > 0.5) nearKinds.forEach(([k], i) => { if (near[i].length) forest(G, k, near[i], { variants: 2, shadows: false }); });   // low quality: the mid-plane trees alone
  // mid plane: instanced low-poly trees, bucketed by compass sector so the ones behind the camera are culled
  const kinds = P.trees || [['matsu', 0.4, 'pad'], ['green', 0.4, 'vase'], ['green', 0.2, 'spread']], protos = {}, M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new V3(0, 1, 0), sectors = 4, buckets = new Map();
  const nTrees = Math.round(Q.treesMid * (P.treeK ?? 1) * (0.5 + 0.5 * qk) * Math.min(1.8, (disc * disc - inner * inner) / (190 * 190 - 35 * 35)));
  for (let t = 0, made = 0; t < nTrees * 5 && made < nTrees; t++) {
    const a = R() * 6.283, r = inner + 24 + Math.pow(R(), 0.8) * (disc - inner - 30), x = Math.sin(a) * r, z = -Math.cos(a) * r, ok = treeOK(x, z, 24, disc - inner - 4); if (!ok || R() > ok.dens) continue;
    const ki = pickKind(kinds, x, z, R), [tint, , shape] = kinds[ki], sec = Math.floor(((Math.atan2(x, -z) + Math.PI) / 6.2832) * sectors) % sectors, key = shape + ':' + sec;
    if (!buckets.has(key)) buckets.set(key, []); const s = (SHAPE_H[shape] || 8) * (0.7 + R() * 0.7) + (r - inner) * 0.02;
    const tc = TREE_TINT[tint][(R() * 4) | 0]; buckets.get(key).push([x, ok.y - 0.3, z, s * (0.8 + R() * 0.45) * (SHAPE_W[shape] || 1), s, tc, R() * 6.28, (R() - 0.5) * (shape === 'pad' || shape === 'spread' ? 0.3 : 0.12)]); made++;
  }
  for (const [key, list] of buckets) {
    const shape = key.split(':')[0], geoT = protos[shape] || (protos[shape] = treeGeo(shape));
    const im = new THREE.InstancedMesh(geoT, hazed(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })), list.length);
    list.forEach(([x, y, z, w, h, tc, ry, tilt], i) => { q.setFromEuler(_eu.set(tilt, ry, tilt * 0.6)); M.compose(new V3(x, y, z), q, new V3(w, h, w)); im.setMatrixAt(i, M); im.setColorAt(i, cTmp.setRGB(...tc).convertSRGBToLinear()); });
    im.computeBoundingSphere(); G.add(im);
  }
  // rocks: boulders on steep / rocky ground, bigger further out
  const rocks = []; const nR = Math.round(Q.rocksMid * (P.rockK ?? 1));
  for (let t = 0; t < nR * 8 && rocks.length < nR; t++) { const a = R() * 6.283, r = inner + 4 + Math.pow(R(), 1.4) * 60, x = Math.sin(a) * r, z = -Math.cos(a) * r; if (outside(x, z) < 3) continue; const y = height(x, z, S); if (S.lake && y < -0.5) continue;
    const e = 2, sl = Math.hypot(height(x + e, z) - height(x - e, z), height(x, z + e) - height(x, z - e)) / (2 * e); if (sl > 2.6 || R() > S.rock * 0.45 + sl * 0.6) continue; const s = Math.min(sl > 0.9 ? 6 : 4.2, 0.8 + R() * 1.6 + (r - inner) * 0.03 + sl * 1.6); const nx = height(x - 1, z) - height(x + 1, z), nz = height(x, z - 1) - height(x, z + 1); rocks.push([x, y - s * 0.35, z, s, new V3(nx, 2, nz).normalize()]); }   // sunk a third, tilted with the slope
  if (rocks.length) { const rc = new THREE.Color().setRGB(...pal.rock).convertSRGBToLinear(); const rm = hazed(new THREE.MeshStandardMaterial({ vertexColors: true, color: rc.multiplyScalar(0.95), roughness: 0.95, flatShading: true }));
    for (let v = 0; v < 1; v++) { const L = rocks; const im = new THREE.InstancedMesh(rockGeo(2, 1), rm, L.length);
      const qs = new THREE.Quaternion(); L.forEach(([x, y, z, s, up], i) => { qs.setFromUnitVectors(Y, up); q.setFromAxisAngle(Y, R() * 6.28).premultiply(qs); M.compose(new V3(x, y, z), q, new V3(s * (0.9 + R() * 0.6), s * (0.6 + R() * 0.4), s * (0.9 + R() * 0.6))); im.setMatrixAt(i, M); }); im.computeBoundingSphere(); G.add(im); } }
  // ---------- ruined walls just past the edge (old enclosure crumbling into the slope)
  if (P.walls !== undefined) { const wm = { stone: new THREE.MeshStandardMaterial({ color: 0x6e6a62, roughness: 0.95 }), plaster: new THREE.MeshStandardMaterial({ color: 0xc9c0ac, roughness: 0.9 }), wood: new THREE.MeshStandardMaterial({ color: 0x4a3426, roughness: 0.9 }), tile: new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.7 }) };
    for (const deg of [].concat(P.walls)) for (let k = -2; k <= 2; k++) { const a = (deg + k * 9) * Math.PI / 180, r = inner + 6 + R() * 5, x = Math.sin(a) * r, z = -Math.cos(a) * r;
      try { const wl = stoneWall(wm, 7 + R() * 5, 2.4 + R() * 1.2, { broken: true, seed: (R() * 100) | 0 }); wl.position.set(x, height(x, z) - 0.2, z); wl.rotation.y = -a; wl.userData.dynamic = true; G.add(wl); } catch (e) { /* the wall kit is optional */ } } }
  // ---------- landmarks: all of them baked into one mesh (one draw call)
  const lmParts = [], mtx = new THREE.Matrix4();
  for (const [kind, deg, dist, sc = 1, rotOff = 0] of P.landmarks || []) {
    const [dx, dz] = dir(deg), x = dx * (inner + dist), z = dz * (inner + dist); let y = Infinity; for (const [ox, oz] of [[0, 0], [8, 0], [-8, 0], [0, 8], [0, -8]]) y = Math.min(y, height(x + ox * sc, z + oz * sc));
    const L = LANDMARK[kind](sc), one = mergeGeometries(L.p);
    mtx.compose(new V3(x, y - 0.5, z), new THREE.Quaternion().setFromAxisAngle(Y, Math.atan2(-x, -z) + rotOff), new V3(L.s, L.s, L.s)); one.applyMatrix4(mtx); lmParts.push(one);   // facing the arena
  }
  if (lmParts.length) { const m = new THREE.Mesh(mergeGeometries(lmParts), hazed(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }))); G.add(m); }
  // ---------- waterfall down the steepest ground on its side
  if (P.waterfall !== undefined) {
    const [dx, dz] = dir(P.waterfall); let best = null;
    for (let d = 6; d < 70; d += 1) { const h0 = height(dx * (inner + d), dz * (inner + d)), h1 = height(dx * (inner + d + 10), dz * (inner + d + 10)); if (!best || h1 - h0 > best.dh) best = { d, dh: h1 - h0, h0, h1 }; }
    if (best && best.dh > 6) { const t = fallTex(), top = best.h1 + 0.4, bot = best.h0 - 0.4, r0 = inner + best.d, wdt = 5, tx = -dz, tz = dx, lift = 1.6;
      const fp = new Float32Array([...[-1, 1].flatMap(sd => [dx * (r0 - lift) + tx * wdt / 2 * sd, bot, dz * (r0 - lift) + tz * wdt / 2 * sd]), ...[-1, 1].flatMap(sd => [dx * (r0 + 10 - lift) + tx * wdt * 0.4 * sd, top, dz * (r0 + 10 - lift) + tz * wdt * 0.4 * sd])]);
      const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 3, 1, 3]), 2)); fg.setIndex([0, 1, 2, 1, 3, 2]);
      const fm = new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.85, depthWrite: false, fog: true, side: THREE.DoubleSide }); G.add(new THREE.Mesh(fg, fm));
      const pool = new THREE.Mesh(new THREE.CircleGeometry(4.5, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5a7a88, roughness: 0.1, metalness: 0.3 })); pool.position.set(dx * (r0 - 2), bot + 0.3, dz * (r0 - 2)); G.add(pool);
      const spray = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex(), color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false })); spray.scale.set(12, 6, 1); spray.position.set(dx * (r0 - 1), bot + 2.5, dz * (r0 - 1)); G.add(spray);
      ups.push(dt => { t.offset.y -= dt * 1.4; }); cfg.waterfall = { x: dx * r0, z: dz * r0 }; }
  }
  // ---------- valley mist: a soft layer lying in the low ground
  if (sides.some(s => s.K.valley)) { const mt = mistTex(); mt.repeat.set(5, 5); const mm = new THREE.MeshBasicMaterial({ map: mt, transparent: true, opacity: 0.55, depthWrite: false, fog: true, color: 0xffffff });
    const mist = new THREE.Mesh(new THREE.RingGeometry(inner + 22, disc + 60, 64, 1).rotateX(-Math.PI / 2), mm); mist.position.y = -34; mist.renderOrder = 2; G.add(mist); cfg.vistaMist = mm;
    ups.push(dt => { mt.offset.x += dt * 0.004; }); }
  // ---------- far ranges: lit, sloped strips of mountains with snow caps, layered for depth
  const farPal = { green: [[0.16, 0.24, 0.2], [0.22, 0.3, 0.32], [0.36, 0.42, 0.5]], snow: [[0.3, 0.33, 0.36], [0.42, 0.46, 0.52], [0.6, 0.64, 0.7]], night: [[0.1, 0.12, 0.18], [0.13, 0.15, 0.24], [0.18, 0.2, 0.3]] }[P.far || 'green'];
  if (P.far !== 'none') Q.far.forEach(([Rr0, hz, peak], li) => { if (qk < 0.5 && li === 1) return; /* low quality: two ranges */ const Rr = Math.max(Rr0, disc + 55 + li * 80);
    const n = 300, rowsF = 5, fp = new Float32Array(n * rowsF * 3), fc = new Float32Array(n * rowsF * 3), fi = [];
    for (let j = 0; j < n; j++) { const th = j / n * Math.PI * 2, cx = Math.cos(th), cz = Math.sin(th);
      const mass = fbm(cx * 1.6 + li * 7, cz * 1.6 - li * 3, 3), crest = ridged(cx * 4.5 + li * 11, cz * 4.5 + li * 5);   // seamless round the circle
      const ridge = peak * (0.18 + 0.82 * Math.pow(mass, 1.4)) * (0.7 + 0.45 * crest);
      for (let k = 0; k < rowsF; k++) { const t = k / (rowsF - 1), slope = Math.pow(t, 0.7), rr = Rr - 120 * (1 - slope) + 8 * (fbm(cx * 6 + k, cz * 6 + li) - 0.5);
        const y = -70 + (ridge + 70) * (1 - Math.pow(1 - t, 1.8)) + (k && k < rowsF - 1 ? (fbm(cx * 9 + k * 2, cz * 9 + li) - 0.5) * 14 * (1 - t) : 0);
        const ix = (j * rowsF + k) * 3; fp.set([Math.sin(th) * rr, y, -Math.cos(th) * rr], ix);
        const base3 = farPal[li], snow = P.far !== 'night' && P.far !== 'none' ? sm(peak * 0.5, peak * 0.78, y) * (P.far === 'snow' ? 1 : 0.85) : 0; cTmp.setRGB(base3[0] + (0.9 - base3[0]) * snow, base3[1] + (0.92 - base3[1]) * snow, base3[2] + (0.96 - base3[2]) * snow).convertSRGBToLinear(); fc.set([cTmp.r, cTmp.g, cTmp.b], ix); } }
    for (let j = 0; j < n; j++) for (let k = 0; k < rowsF - 1; k++) { const a = j * rowsF + k, b = ((j + 1) % n) * rowsF + k; fi.push(a, b, a + 1, b, b + 1, a + 1); }
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('color', new THREE.BufferAttribute(fc, 3)); fg.setIndex(fi); fg.computeVertexNormals();
    const fm = hazed(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), hz); fm.userData.hz0 = hz;
    const mesh = new THREE.Mesh(fg, fm); mesh.frustumCulled = false; mesh.renderOrder = -5 - li; G.add(mesh); (cfg.vistaFar = cfg.vistaFar || []).push(fm);
  });
  // ---------- clouds: drifting soft banks, tinted by the sky
  const nC = qk > 0.5 ? P.clouds ?? 14 : 0; if (nC) { const ct = cloudTex(), cm = new THREE.MeshBasicMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }), clouds = [];
    const ci = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.42), cm, nC); ci.renderOrder = -4; ci.frustumCulled = false; G.add(ci);   // one draw call for the whole sky
    for (let i = 0; i < nC; i++) clouds.push({ a: R() * 6.283, r: 330 + R() * 220, y: 120 + R() * 110, s: 150 + R() * 170, v: (R() - 0.5) * 0.004 });
    cfg.vistaClouds = { cm, clouds, ci }; }
  cfg.noBackdrop = true; cfg.keepBackdrop = P.keepBackdrop || null; cfg.vista = G;
  // ---------- per frame: haze follows weather (fog distance), the sky's horizon follows the fog colour, clouds drift
  const sky = cfg.skyMat; if (sky && sky.uniforms.fk) sky.uniforms.fk.value = 1;
  cfg.vistaTick = dt => {   // called by the map manager every frame (arena.js)
    const F = cfg.fog; if (!F) return; const wk = cfg.fog0 ? Math.min(1, Math.max(0, F.isFogExp2 ? 1 - cfg.fog0 / F.density : 1 - F.far / cfg.fog0)) : 0;   // 0 clear .. ~0.6 thick weather
    for (const m of cfg.vistaFar || []) m.userData.hzFix.value = Math.min(0.97, m.userData.hz0 + (1 - m.userData.hz0) * (wk * 1.2 + (tod === 'fog' ? 0.35 : 0)));
    HZ.cap.value = Math.min(0.98, (Q.cap[tod] ?? 0.86) + wk * 0.3);
    if (sky && sky.uniforms.fc) sky.uniforms.fc.value.copy(F.color);
    if (cfg.vistaClouds) { const { cm, clouds, ci } = cfg.vistaClouds; if (cfg.night) cm.color.copy(F.color).lerp(cTmp.setRGB(0.55, 0.6, 0.75), 0.4); else cm.color.copy(F.color).lerp(cTmp.setRGB(1, 1, 1), 0.55); cm.opacity = (cfg.night ? 0.22 : 0.8) * (1 - wk * 0.6);   // moonlit veils at night, bright banks by day
      clouds.forEach((C, i) => { C.a += C.v * dt; const x = Math.sin(C.a) * C.r, z = -Math.cos(C.a) * C.r; q.setFromAxisAngle(Y, Math.atan2(x, z) + Math.PI); M.compose(_cp.set(x, C.y, z), q, _cs.set(C.s, C.s, 1)); ci.setMatrixAt(i, M); }); ci.instanceMatrix.needsUpdate = true; }
    for (const u of ups) u(dt);
  };
  return G;
}
