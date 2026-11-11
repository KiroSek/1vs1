// Open-world maps built from the World kit: the Samurai Hunt valley and five Survival arenas.
// Everything is generated from a fixed seed so both players get an identical layout.
import * as THREE from 'three';
import { registerMap, gradSky, skyAndEnv, particles } from './arena.js';
import { World, rng } from './world.js';
import * as SP from './svprops.js';
import { vista } from './vista.js';

const V3 = THREE.Vector3;
// time of day presets: sky colours, sun/moon, ambient, fog distance, exposure
const TOD = {
  day: { top: 0x4a78c0, mid: 0x9cc0e0, hor: 0xe8e0d0, sun: [0.5, 0.75, -0.4], sunCol: 0xfff2dc, sunI: 3.0, hemi: [0xdbe8ff, 0x6a5a40, 1.1], fog: 0xb8c8d8, fogD: [40, 160], exp: 0.85, night: false },
  dusk: { top: 0x3a4a90, mid: 0xd77a6a, hor: 0xffb070, sun: [-0.6, 0.18, -0.75], sunCol: 0xffc890, sunI: 2.6, hemi: [0xffd0c0, 0x4a3428, 0.9], fog: 0xb88878, fogD: [30, 130], exp: 0.95, night: false },
  night: { top: 0x0a1428, mid: 0x1c3058, hor: 0x34486a, sun: [-0.4, 0.55, 0.6], sunCol: 0xb8ccff, sunI: 1.8, hemi: [0x7a8ac0, 0x2a2018, 1.05], fog: 0x18223a, fogD: [16, 75], exp: 1.6, night: true },
  fog: { top: 0x8a96a4, mid: 0xb0b8c0, hor: 0xc8ccd0, sun: [0.3, 0.5, -0.8], sunCol: 0xfff0e0, sunI: 1.4, hemi: [0xd8e0e8, 0x5a5a52, 1.05], fog: 0xb8bec4, fogD: [6, 42], exp: 0.85, night: false },
};
// Shadow Hunt day: the match runs on a clock from the dead of night to noon (lighting, fog and mist follow it).
// [hour, preset]: lerped between neighbours. 12:30 = the hour of the duel (hunt.js).
const DAWN = { top: 0x34508e, mid: 0xd88c7a, hor: 0xffbe84, sun: [0.9, 0.12, -0.3], sunCol: 0xffbc8a, sunI: 2.2, hemi: [0xffd6c6, 0x46382c, 0.95], fog: 0xc8988c, fogD: [16, 95], exp: 1.05, night: false };
const PREDAWN = { top: 0x141e3e, mid: 0x3a4474, hor: 0x8a6e84, sun: [0.75, 0.3, -0.1], sunCol: 0xc0b0d8, sunI: 1.5, hemi: [0x8a92c0, 0x2a2420, 0.95], fog: 0x3e4662, fogD: [12, 70], exp: 1.4, night: true };
const NOON = { ...TOD.day, sun: [0.18, 0.95, -0.22], exp: 0.82, fogD: [45, 170] };
export const DAY = { start: 3.5, duel: 12.5, keys: [[3.5, TOD.night], [4.8, PREDAWN], [6.0, DAWN], [7.6, TOD.fog], [9.0, TOD.day], [12.5, NOON]],
  mist: [[3.5, 0.55], [5.0, 0.9], [6.5, 1], [8.0, 0.8], [9.5, 0.25], [10.5, 0]],                    // thickness of the ground mist through the morning
  sense: h => h < 5.2 ? 'night' : h < 6.6 ? 'dusk' : h < 8.4 ? 'fog' : 'day' };                       // sight model (stealth.js SENSE.range) for the hour
const _ca = new THREE.Color(), _cb = new THREE.Color(), _va = new V3(), _vb = new V3();
function keyAt(list, h) { let i = 0; while (i < list.length - 2 && h > list[i + 1][0]) i++; const [h0, A] = list[i], [h1, B] = list[i + 1]; return [A, B, Math.min(1, Math.max(0, (h - h0) / (h1 - h0)))]; }
export function mistAt(h) { const [a, b, u] = keyAt(DAY.mist, h); return a + (b - a) * u; }
function dayCycle(g, cfg, renderer) {
  const col = (k, A, B, u, out) => out.copy(_ca.set(A[k])).lerp(_cb.set(B[k]), u), num = (k, A, B, u) => A[k] + (B[k] - A[k]) * u;
  cfg.setHour = h => {
    const [A, B, u] = keyAt(DAY.keys, h), S = cfg.skyMat.uniforms, sm = (A.night ? 1 : 0) + ((B.night ? 1 : 0) - (A.night ? 1 : 0)) * u;
    col('hor', A, B, u, S.a.value); col('mid', A, B, u, S.b.value); col('top', A, B, u, S.c.value); col('sunCol', A, B, u, S.sc.value);
    const dir = _va.set(...A.sun).normalize().lerp(_vb.set(...B.sun).normalize(), u).normalize(); S.s.value.copy(dir); S.sp.value = 500 + 1000 * sm; S.gl.value = 0.8 - 0.5 * sm;
    col('sunCol', A, B, u, cfg.sun.color); cfg.sun.intensity = num('sunI', A, B, u); cfg.sunOff.copy(dir).multiplyScalar(40);
    _ca.set(A.hemi[0]).lerp(_cb.set(B.hemi[0]), u); cfg.hemiL.color.copy(_ca); _ca.set(A.hemi[1]).lerp(_cb.set(B.hemi[1]), u); cfg.hemiL.groundColor.copy(_ca); cfg.hemiL.intensity = A.hemi[2] + (B.hemi[2] - A.hemi[2]) * u;
    col('fog', A, B, u, cfg.fog.color); cfg.background.copy(cfg.fog.color); cfg.fog.near = A.fogD[0] + (B.fogD[0] - A.fogD[0]) * u; cfg.fog.far = cfg.fog0 = A.fogD[1] + (B.fogD[1] - A.fogD[1]) * u; cfg.fogFar = cfg.fog.far;
    renderer.toneMappingExposure = cfg.baseExposure = cfg.exposure = num('exp', A, B, u);
    if (g.parent) g.parent.environmentIntensity = 0.45 + 0.35 * (1 - sm);
    if (cfg.moon) { cfg.moon.material.opacity = Math.max(0, 1 - (h - 4.6) / 1.2); cfg.moon.visible = cfg.moon.material.opacity > 0.01; }
    cfg.night = sm > 0.5; cfg.bloom = { strength: 0.4 + 0.2 * sm, threshold: 1.2 - 0.2 * sm }; cfg.camFill = 0.15 + 0.2 * sm;
    const W = cfg.world; if (W) { W.mistK = mistAt(h); if (W.mistMat) W.mistMat.color.copy(cfg.fog.color).lerp(_ca.set(0xffffff), 0.45); }
  };
}
function lighting(g, cfg, tod, half) {
  const T = TOD[tod] || TOD.dusk;
  cfg.background = new THREE.Color(T.fog); cfg.fog = new THREE.Fog(T.fog, T.fogD[0], T.fogD[1]); cfg.exposure = T.exp; cfg.envI = T.night ? 0.45 : 0.8;
  const skyMat = gradSky(T.top, T.mid, T.hor, T.sun, T.sunCol, T.night ? 1500 : 500, T.night ? 0.3 : 0.8); skyAndEnv(g, cfg, skyMat); cfg.skyMat = skyMat;
  const hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]); g.add(hemi); cfg.hemiL = hemi;
  const sun = new THREE.DirectionalLight(T.sunCol, T.sunI); const off = new V3(...T.sun).normalize().multiplyScalar(40);
  sun.position.copy(off); sun.castShadow = true; Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 120 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  g.add(sun, sun.target); cfg.sun = sun; cfg.sunOff = off; cfg.tod = tod; cfg.night = T.night; cfg.fogFar = T.fogD[1];
  if (T.night) { const big = new THREE.Mesh(new THREE.CircleGeometry(7, 32), new THREE.MeshBasicMaterial({ color: 0xeef2ff, fog: false, transparent: true })); big.position.copy(off.clone().normalize().multiplyScalar(190)); big.lookAt(0, 0, 0); big.userData.dynamic = true; g.add(big); cfg.moon = big; }
  cfg.bloom = { strength: T.night ? 0.6 : 0.4, threshold: T.night ? 1.0 : 1.2 }; cfg.camFill = T.night ? 0.35 : 0.15;
  return { sun, setQuality(q) { sun.shadow.mapSize.setScalar(q === 'high' ? 2048 : 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } } };
}
const groundColor = (W, base = [0.4, 0.5, 0.26]) => (x, z, c) => {
  const s = W.surfaceAt(x, z); const n = 0.85 + 0.15 * Math.sin(x * 0.37) * Math.cos(z * 0.29);
  if (W.inWater(x, z) || (W.water && Math.abs(W.riverDist(x, z)) < W.water.width * 0.75)) c.setRGB(0.28 * n, 0.26 * n, 0.2 * n);
  else if (s === 'stone') c.setRGB(0.45 * n, 0.43 * n, 0.4 * n); else if (s === 'wood') c.setRGB(0.38 * n, 0.33 * n, 0.26 * n);
  else c.setRGB(base[0] * n, base[1] * n, base[2] * n);
  c.convertSRGBToLinear();
};

// =====================================================================================  SAMURAI HUNT: Kirigakure Valley
function buildHunt(g, renderer, cfg, opts = {}) {
  const cycle = opts.tod === 'cycle', tod = cycle ? 'night' : opts.tod || 'dusk', W = new World(g, { half: 70 }); cfg.world = W; cfg.amb = null;
  const lit = lighting(g, cfg, tod, 70);
  if (cycle) dayCycle(g, cfg, renderer);
  const R = rng(1337);
  // relief: shrine hill (NW), ridge (SW), knoll (E), rolling ground
  W.bump(-40, -42, 24, 6.5); W.bump(-48, 34, 18, 4); W.bump(42, -14, 14, 3); W.bump(10, -55, 16, 2.5); W.bump(-15, 52, 14, 2);
  for (let i = 0; i < 18; i++) W.bump(R() * 130 - 65, R() * 130 - 65, 8 + R() * 10, (R() - 0.5) * 1.4);
  W.river(22, 5, 0.05, 7, 1.6, 70); W.water.fords.push([47, 58]);
  W.bridge(0, 22, -Math.PI / 2, 12);
  // ---- village (centre-west): plaza with houses around it ----
  W.flat(-12, -6, 9, 7, W.ground(-12, -6));
  W.region(-12, -6, 9, 7, 'stone');
  const houses = [[-24, -12, 0.1, 7, 5, true], [-24, 2, -0.05, 6, 5], [-12, -18, Math.PI / 2, 6, 5, true], [0, -16, 0.2, 7, 5], [2, 2, -0.15, 6, 5, true], [-12, 8, Math.PI / 2 + 0.1, 7, 5],
    [-34, -4, 0.3, 6, 4.5], [10, -6, -0.4, 6, 4.5], [-2, 14, 0.1, 5, 4]];
  for (const [x, z, r, w, d, l] of houses) W.house(x, z, r, w, d, { lit: !!l && tod !== 'day' });
  for (const [x, z] of [[-16, -2], [-8, -10], [-6, 2], [-18, -11], [4, -9], [-28, -6]]) W.prop('lantern', x, z, R() * 6);
  for (const [x, z] of [[-20, 5], [-19, 6.2], [-4, -14], [6, 7], [7, 8.2], [-30, 6], [12, -12], [-14, 12]]) W.prop(R() < 0.5 ? 'crate' : 'barrel', x, z, R() * 3);
  W.prop('rack', -9, -12.5, 0.2); W.prop('rack', -27, -9, 1.4);
  // ---- shrine on the NW hill ----
  const sy = W.ground(-40, -44); W.flat(-40, -46, 7, 6, sy);
  W.keep(-40, -49, 0, 3, 9, 6.5, { lit: tod !== 'day' }); W.torii(-40, -36, 0, 1.1); W.torii(-36, -24, 0.4, 0.9);   // the castle keep crowns the hill
  for (const [x, z] of [[-44, -40], [-36, -40], [-49, -50], [-31, -50]]) W.stoneLantern(x, z);
  W.broadleaf([[-48, -44, 1.2], [-31, -47, 1.1], [-46, -33, 1]], 'keyaki');
  // ---- a pagoda above the east road, with cherries around it ----
  W.keep(22, -18, 0.35, 4, 4.2, 4.2, { base: 0.9, lit: tod !== 'day' }); W.broadleaf([[17, -22, 0.9], [27, -21, 0.9]], 'sakura'); W.stoneLantern(19, -13); W.stoneLantern(25, -14);
  // ---- bamboo forest (NE) with a path through it ----
  const bambooPath = (x, z) => Math.abs((x - 35) * 0.45 - (z + 40)) < 2.2;
  W.bambooGrove(36, -40, 22, 900, 77, bambooPath);
  // ---- tall grass fields ----
  W.grassField(6, -34, 16, 9, 1400, 11);
  W.grassField(-46, 8, 11, 14, 1200, 12);
  W.grassField(28, 6, 13, 9, 1100, 13);
  W.grassField(-28, 30, 18, 4, 800, 14);
  W.grassField(30, 32, 16, 4, 800, 15);
  // ---- ruins (SE, across the river) ----
  for (const [x, z, r] of [[34, 44, 0.3], [48, 52, -0.2], [26, 56, 0.9]]) W.house(x, z, r, 6, 5, { ruined: true });
  W.wall(40, 38, 10, 0.1, 2.6, { broken: true }); W.wall(54, 44, 8, Math.PI / 2, 2.6, { broken: true }); W.wall(20, 48, 7, 1.2, 2.4, { broken: true });
  for (let i = 0; i < 14; i++) W.rock(24 + R() * 34, 36 + R() * 26, 0.5 + R() * 0.9);
  W.torii(12, 60, 0.2, 0.9);
  // ---- paths ----
  W.path([[-12, 1], [-6, 10], [0, 15], [0, 29], [6, 38], [24, 44], [40, 50]]);
  W.path([[-18, -12], [-26, -20], [-34, -26], [-40, -34], [-40, -42]]);
  W.path([[-2, -12], [10, -20], [22, -28], [35, -40], [48, -52]]);
  W.path([[10, -2], [30, -2], [50, 10], [52, 22], [52, 34]]);
  // ---- trees: border forest + scattered pines and accents ----
  const pines = [];
  for (let i = 0; i < 230; i++) { const x = R() * 136 - 68, z = R() * 136 - 68, edge = Math.max(Math.abs(x), Math.abs(z)) > 58;
    if (!edge && R() < 0.62) continue; if (W.inWater(x, z) || W.solidAt(x, W.ground(x, z) + 1, z)) continue;
    if (Math.hypot(x + 12, z + 4) < 22 || Math.hypot(x - 36, z + 40) < 23 || Math.hypot(x + 40, z + 46) < 9 || Math.hypot(x - 22, z + 18) < 9 || Math.abs(W.riverDist(x, z)) < 6) continue; pines.push([x, z, 0.8 + R() * 0.7]); }
  W.pines(pines, [['matsu', 0.35], ['keyaki', 0.25], ['kusu', 0.25], ['bonsai', 0.1], ['tsubaki', 0.05]]);
  W.broadleaf([[-30, 14, 1.1], [14, 12, 1], [-50, -14, 1.2], [8, -46, 1], [-56, 52, 1.1], [26, -10, 0.9]], 'sakura');
  for (let i = 0; i < 26; i++) { const x = R() * 120 - 60, z = R() * 120 - 60; if (W.inWater(x, z) || Math.hypot(x + 12, z + 4) < 16) continue; W.rock(x, z, 0.4 + R() * 0.8); }
  // ---- bushes: cover to crouch in along the village, paths, river banks, shrine slopes and ruins ----
  const shrubs = [], RB = rng(4242);
  for (const [cx, cz, n] of [[-30, -14, 4], [-31, 8, 4], [-18, 15, 3], [6, 12, 4], [15, -11, 3], [4, -23, 3], [-7, -23, 3], [-48, -36, 4], [-32, -36, 3], [-52, -26, 3],
    [-20, 15.5, 3], [10, 30, 3], [32, 14, 4], [-40, 17, 4], [-56, 24, 3], [30, 40, 3], [44, 47, 4], [20, 53, 3], [26, -30, 3], [47, -28, 3], [55, 4, 3], [-58, -18, 3], [-6, 40, 4], [40, -2, 3], [-24, 40, 3], [12, 45, 3]])
    for (let i = 0; i < n; i++) { const x = cx + (RB() - 0.5) * 6, z = cz + (RB() - 0.5) * 6, y = W.ground(x, z); if (W.inWater(x, z) || W.solidAt(x, y + 0.6, z) || W.surfaceAt(x, z) === 'stone') continue; shrubs.push([x, z, 0.85 + RB() * 0.45]); }
  W.shrubs(shrubs);
  // ---- ground mist: the river valley and the low fields (thick before dawn, gone by mid-morning) ----
  W.mist([[-50, 20, 10], [-26, 24, 11], [0, 22, 10], [24, 20, 11], [50, 24, 10], [6, -34, 10], [-46, 8, 9], [36, 46, 10]]);
  W.mistK = cycle ? mistAt(DAY.start) : tod === 'fog' ? 1 : tod === 'night' ? 0.5 : tod === 'dusk' ? 0.35 : 0;
  W.terrainMesh(150, 150, groundColor(W));
  W.duelSpot = [-12, -6];   // the village square: where the hunters must face each other at 12:30
  // spawn points (opposite pairs) and bot waypoints
  W.spawns = [[-56, -56], [52, 58], [58, -58], [-58, 52], [-62, -8], [62, 6]];
  W.waypoints = [[-12, -6], [-40, -44], [36, -40], [6, -34], [0, 22], [52, 22], [36, 46], [-46, 8], [28, 6], [-28, 30], [-24, -20], [10, -6], [48, -52], [-50, 34], [22, 49]];
  cfg.huntStart = [[0, 1], [2, 3], [4, 5]];
  vista(g, W, cfg, { seed: 30, inner: 75, tod: cycle ? 'night' : tod, sides: [[0, 'mountain'], [70, 'forest'], [150, 'hills'], [215, 'valley'], [290, 'cliff']], near: [['matsu', 0.4], ['keyaki', 0.3], ['kusu', 0.2], ['sakura', 0.1]],
    trees: [['matsu', 0.3, 'pad'], ['green', 0.25, 'vase'], ['green', 0.2, 'spread'], ['dark', 0.1, 'low'], ['bamboo', 0.08, 'bamboo'], ['sakura', 0.07, 'broad']], palette: { grass: [0.36, 0.42, 0.24] },
    landmarks: [['pagoda', 345, 70, 1.2], ['castle', 40, 140, 1.6], ['temple', 120, 60, 1], ['village', 200, 90, 1], ['torii', 300, 30, 1.3]], paths: [[340, 350, 4, 60]], waterfall: 290, far: 'green' });
  return { setQuality: lit.setQuality, update: () => { } };
}
registerMap('hunt_valley', 'Kirigakure Valley', buildHunt);

// =====================================================================================  SURVIVAL ARENAS
// common: a walled / wooded ring of radius ~24 with gates where waves enter
function arenaBase(g, cfg, opts, tod, flat = true) {
  const W = new World(g, { half: 30 }); cfg.world = W; cfg.amb = null;
  const lit = lighting(g, cfg, opts.tod || tod, 30);
  if (flat) W.flat(0, 0, 18, 18, 0);   // a level court (maps with their own relief skip it)
  return { W, lit };
}
// low bushes in a band around the arena, leaving the gates clear
function shrubRing(W, R, r0, r1, n, gates) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = R() * 6.283, r = r0 + R() * (r1 - r0); if (gates.some(gt => Math.abs(Math.atan2(Math.sin(a - gt), Math.cos(a - gt))) < 0.3)) continue; const x = Math.cos(a) * r, z = Math.sin(a) * r; if (W.solidAt(x, W.ground(x, z) + 0.6, z)) continue; pts.push([x, z, 0.8 + R() * 0.4]); }
  W.shrubs(pts);
}
function ringOfPines(W, R, r0, r1, n, gates, kinds) {   // kinds: see World.pines (groves of Japanese trees by default)
  const pts = [];
  for (let i = 0; i < n; i++) { const a = R() * 6.283, r = r0 + R() * (r1 - r0); if (gates.some(gt => Math.abs(Math.atan2(Math.sin(a - gt), Math.cos(a - gt))) < 0.18)) continue; pts.push([Math.cos(a) * r, Math.sin(a) * r, 0.75 + R() * 0.8]); }
  W.pines(pts, kinds);
}
// sand / rock / earth tints for the arena ground (on top of the surface colours)
const tintGround = (W, fn) => (x, z, c) => { groundColor(W)(x, z, c); const t = fn(x, z, W.surfaceAt(x, z)); if (t) { c.setRGB(t[0], t[1], t[2]); c.convertSRGBToLinear(); } };
const ring = (R, r, a0, a1) => [Math.cos(a0) * r, Math.sin(a0) * r, Math.cos(a1) * r, Math.sin(a1) * r];
// ---------------------------------------------------------------- surroundings of the Survival arenas (vista.js)
// each side of each arena gets its own land (mountain slope, cliff wall, forest, hills, valley, shore), landmarks on it
// and far ranges behind, so the arena reads as a place inside a big mountain country, not a square in the void
const AROUND = {
  sv_dojo: { seed: 31, sides: [[0, 'mountain'], [80, 'forest'], [165, 'valley'], [235, 'hills'], [295, 'cliff']], near: [['matsu', 0.45], ['keyaki', 0.3], ['sakura', 0.15], ['bonsai', 0.1]],
    trees: [['matsu', 0.35, 'pad'], ['green', 0.25, 'vase'], ['green', 0.15, 'spread'], ['sakura', 0.12, 'broad'], ['dark', 0.13, 'low']], palette: { grass: [0.34, 0.42, 0.23] },
    landmarks: [['pagoda', 8, 52, 1.1], ['temple', 92, 64, 1], ['castle', 178, 150, 1.5], ['shrine', 238, 46, 1], ['torii', 352, 22, 1.2]], paths: [[350, 6, 4, 50]], waterfall: 295, far: 'green' },
  sv_cave: { seed: 32, sides: [[0, 'cliff'], [95, 'mountain'], [185, 'cliff'], [265, 'mountain']], near: [['bonsai', 0.55], ['matsu', 0.45]], treeK: 0.7, rockK: 1.8,
    trees: [['matsu', 0.55, 'pad'], ['dark', 0.25, 'low'], ['dead', 0.2, 'broad']], palette: { grass: [0.24, 0.27, 0.2], rock: [0.36, 0.35, 0.36] },
    landmarks: [['shrine', 200, 26, 0.9], ['tower', 80, 70, 1.2]], waterfall: 0, far: 'night', clouds: 8 },
  sv_trade: { seed: 33, sides: [[0, 'forest'], [90, 'valley'], [185, 'mountain'], [270, 'hills']], near: [['keyaki', 0.4], ['kusu', 0.35], ['matsu', 0.25]],
    trees: [['green', 0.3, 'vase'], ['green', 0.25, 'spread'], ['matsu', 0.25, 'pad'], ['bamboo', 0.12, 'bamboo'], ['dark', 0.08, 'low']], palette: { grass: [0.38, 0.36, 0.22] },
    landmarks: [['village', 95, 70, 1], ['castle', 268, 120, 1.3], ['pagoda', 192, 60, 1], ['torii', 4, 16, 1]], paths: [[2, 12, 3, 55], [180, 172, 3, 45]], far: 'green' },
  sv_bamboo: { seed: 34, sides: [[0, 'mountain'], [90, 'forest'], [180, 'cliff'], [270, 'forest']], near: [['kusu', 0.4], ['matsu', 0.3], ['tsubaki', 0.3]],
    trees: [['bamboo', 0.4, 'bamboo'], ['green', 0.25, 'spread'], ['matsu', 0.2, 'pad'], ['green', 0.15, 'vase']], palette: { grass: [0.3, 0.4, 0.22] },
    landmarks: [['shrine', 6, 44, 1], ['pagoda', 125, 95, 1.1], ['temple', 300, 110, 1]], paths: [[0, 8, 4, 40]], waterfall: 180, far: 'green' },
  sv_ruins: { seed: 35, sides: [[0, 'mountain'], [75, 'hills'], [180, 'lake'], [285, 'cliff']], near: [['matsu', 0.5], ['bonsai', 0.25], ['kusu', 0.25]], walls: [40, 320],
    trees: [['matsu', 0.4, 'pad'], ['green', 0.25, 'spread'], ['green', 0.2, 'vase'], ['dark', 0.15, 'low']], palette: { grass: [0.4, 0.38, 0.26], rock: [0.44, 0.41, 0.36] },
    landmarks: [['tower', 55, 45, 1], ['temple', 335, 66, 1], ['castle', 228, 150, 1.4], ['village', 125, 80, 0.8]], waterfall: 285, far: 'green' },
  sv_castle: { seed: 36, sides: [[0, 'hills'], [90, 'valley'], [180, 'forest'], [270, 'mountain']], near: [['matsu', 0.4], ['keyaki', 0.3], ['sakura', 0.2], ['tsubaki', 0.1]],
    trees: [['matsu', 0.3, 'pad'], ['green', 0.3, 'vase'], ['green', 0.15, 'spread'], ['sakura', 0.15, 'broad'], ['dark', 0.1, 'low']], palette: { grass: [0.36, 0.42, 0.25] },
    landmarks: [['village', 92, 72, 1.1], ['gate', 180, 14, 1], ['pagoda', 270, 62, 1.1], ['temple', 30, 80, 1]], paths: [[180, 186, 18, 60], [268, 272, 4, 40]], far: 'green' },
  sv_fortress: { seed: 37, sides: [[0, 'mountain'], [115, 'cliff'], [200, 'valley'], [285, 'forest']], near: 'snowpine',
    trees: [['snow', 1, 'snow']], palette: { grass: [0.78, 0.81, 0.86], rock: [0.38, 0.38, 0.41], dirt: [0.6, 0.6, 0.62], forestFloor: [0.7, 0.73, 0.78], snowLine: 4 },
    landmarks: [['tower', 40, 55, 1.2], ['shrine', 300, 40, 1], ['gate', 200, 10, 1]], far: 'snow', clouds: 10 },
};
function around(g, W, cfg, name) { vista(g, W, cfg, AROUND[name]); }
// ---------------------------------------------------------------- Dojo Court
// a walled dojo yard: the hall on its plinth (N), covered galleries down both sides, a polished slab court with
// training posts, low fences and racks to fight around; gates S, E, W
function svDojo(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'day'); const R = rng(211);
  SP.slabFloor(W, 0, 1, 11.4, 11.8);
  W.house(0, -17, 0, 14, 7, { lit: true });
  SP.gallery(W, -15, -1, 22, Math.PI / 2); SP.gallery(W, 15, -1, 22, Math.PI / 2);
  for (const [x, z, len, rot] of [[-11, 18, 14, 0], [11, 18, 14, 0], [-13, -22, 10, 0], [13, -22, 10, 0], [-18.6, -12, 16, Math.PI / 2], [18.6, -12, 16, Math.PI / 2], [-18.6, 14.5, 7, Math.PI / 2], [18.6, 14.5, 7, Math.PI / 2]]) W.wall(x, z, len, rot, 3.2);
  W.torii(0, 19, 0, 0.85);
  for (const [x, z] of [[-8, -8], [-5, -8.6], [5, -8.6], [8, -8]]) SP.makiwara(W, x, z);
  SP.fence(W, -7, 9, 5, 0.25); SP.fence(W, 7, 9, 5, -0.25); SP.fence(W, 0, 13.5, 4, 0);
  W.prop('rack', -11, 2, Math.PI / 2); W.prop('rack', 11, -3, Math.PI / 2); W.prop('barrel', -11, 7); W.prop('barrel', -11.2, 8.1); W.prop('crate', 11, 6, 0.3);
  for (const [x, z] of [[-11.5, -12], [11.5, -12], [-11.5, 15], [11.5, 15]]) W.stoneLantern(x, z);
  for (const [x, z, c] of [[-13, -15, 0xb02a20], [13, -15, 0xb02a20], [-4, 16.5, 0x1c2a4a], [4, 16.5, 0x1c2a4a]]) SP.banner(W, x, z, c);
  W.broadleaf([[-24, -18, 1.2], [24, -18, 1.1], [-25, 8, 1.1], [25, 10, 1], [-8, -26, 1], [9, -26, 1.1]], 'sakura');
  for (let i = 0; i < 6; i++) W.bump(R() * 50 - 25, -27 - R() * 3, 6, 2 + R() * 2);
  for (const [x, z] of [[-26, -2], [26, -4], [-22, 24], [22, 24]]) W.bump(x, z, 7, 2.2);
  W.mist([[-24, 6, 8], [24, 6, 8], [0, 26, 9]]); W.mistK = 0.4;
  W.terrainMesh(70, 70, groundColor(W, [0.34, 0.4, 0.24]));
  ringOfPines(W, R, 27, 34, 60, [Math.PI / 2, 0, Math.PI], [['matsu', 0.4], ['keyaki', 0.25], ['kusu', 0.2], ['bonsai', 0.15]]);
  W.spawns = [[0, 25], [25, 7.5], [-25, 7.5]]; cfg.weathers = ['clear', 'rain', 'wind'];
  around(g, W, cfg, 'sv_dojo');
  return { setQuality: lit.setQuality, update: particles(g, 'petals', 140) };
}
// ---------------------------------------------------------------- Cave Grottos
// a sunken cave basin under an open shaft: cliff walls of piled rock, a raised ledge with a row of Jizo (N), a candle-lit
// grotto niche (E), stalagmites to fight around, three tunnels in under rock arches
function svCave(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'night', false); const R = rng(212);
  const gaps = [-Math.PI / 4, Math.PI / 2, Math.PI];   // tunnel mouths, ascending: the cliff runs from each to the next
  for (let i = 0; i < 3; i++) { const a0 = gaps[i] + 0.36, a1 = (i < 2 ? gaps[i + 1] : gaps[0] + Math.PI * 2) - 0.36; const n = Math.ceil((a1 - a0) / 0.3);
    for (let k = 0; k < n; k++) { const [x0, z0, x1, z1] = ring(R, 20.5, a0 + (a1 - a0) * k / n, a0 + (a1 - a0) * (k + 1) / n); SP.cliff(W, R, x0, z0, x1, z1, { s: [2.8, 4.4], step: 2.4, bump: 4 }); } }
  for (const a of gaps) SP.rockArch(W, Math.cos(a) * 21.5, Math.sin(a) * 21.5, -a - Math.PI / 2, 7.5);
  W.flat(0, -13, 8, 3.2, 1.7);   // the Jizo ledge, ramps at both ends
  for (let i = 0; i < 7; i++) SP.jizo(W, -6 + i * 2, -15.2, 0, 1 + (i % 3) * 0.1);
  SP.candles(W, -1, -14, true); SP.candles(W, 3, -14.2);
  for (const [x, z] of [[17, -5], [17.6, -2.4], [17.4, 0.2]]) SP.jizo(W, x, z, -Math.PI / 2, 0.9); SP.candles(W, 15.8, -2.6, true);
  SP.crag(W, R, 16.5, -8, 2.2); SP.crag(W, R, 16, 3, 2);   // the niche's sides
  for (const [x, z, s] of [[-6, 2, 1.1], [6, 5, 1], [-2, 9, 0.8], [9, -6, 1.2], [-10, -5, 1.1], [-12, 8, 0.9], [3, -4, 0.7]]) SP.crag(W, R, x, z, s);   // stalagmites
  for (let i = 0; i < 10; i++) W.bump(R() * 24 - 12, R() * 20 - 6, 3 + R() * 3, (R() - 0.5) * 0.7);   // uneven floor
  SP.brazier(W, -8, -9); SP.brazier(W, 8, 11); SP.brazier(W, -13, 3); SP.brazier(W, 12, -12, false);
  W.region(0, 0, 20, 20, 'stone');
  W.mist([[-12, 10, 7], [10, -10, 7]]); W.mistK = 0.45;
  W.terrainMesh(70, 70, tintGround(W, (x, z) => { const n = 0.85 + 0.15 * Math.sin(x * 0.5) * Math.cos(z * 0.43); return [0.34 * n, 0.31 * n, 0.27 * n]; }));
  W.spawns = gaps.map(a => [Math.cos(a) * 25, Math.sin(a) * 25]); cfg.weathers = ['fog', 'clear'];
  around(g, W, cfg, 'sv_cave');
  return { setQuality: lit.setQuality, update: particles(g, 'fireflies', 140) };
}
// ---------------------------------------------------------------- Trade Post
// a crossroads market: two narrow streets meeting at a small plaza with a well, shop houses on both sides, stalls with
// awnings, hand carts and stacked goods as cover, strings of lanterns over the streets
function svTrade(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'dusk'); const R = rng(213);
  W.region(0, 0, 3.6, 28, 'stone'); W.region(0, 0, 28, 3.6, 'stone');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    W.house(sx * 9, sz * 9.5, sz < 0 ? 0 : Math.PI, 7, 5, { lit: (sx + sz) % 4 === 0 });
    W.house(sx * 9, sz * 19, sz < 0 ? 0 : Math.PI, 7, 5, { lit: sx > 0 });
    W.house(sx * 19, sz * 9, sx < 0 ? Math.PI / 2 : -Math.PI / 2, 7, 5, { lit: sz > 0 });
  }
  const cl = [0x2a4a7a, 0x7a2a22, 0x3a5a2a, 0x6a4a1a];
  SP.stall(W, 4.6, -13.5, -Math.PI / 2, cl[0]); SP.stall(W, -4.6, -6.5, Math.PI / 2, cl[1]); SP.stall(W, 4.6, 7, -Math.PI / 2, cl[2]); SP.stall(W, -4.6, 14, Math.PI / 2, cl[3]);
  SP.stall(W, 13.5, 4.6, Math.PI, cl[1]); SP.stall(W, -13.5, -4.6, 0, cl[2]);
  SP.cart(W, -1.6, 17.5, 1.3); SP.cart(W, 16.5, -1.4, 0.25, 0.1); SP.cart(W, -18, 1.8, -0.2);
  SP.well(W, 4.2, -4.2);
  for (const [x, z, k] of [[-4.5, 4.6, 'barrel'], [-4.6, 5.6, 'barrel'], [4.8, 15.5, 'crate'], [4.6, 16.5, 'crate'], [-4.6, -15, 'crate'], [11, -4.6, 'barrel'], [-10, 4.7, 'crate'], [-4.7, -18, 'barrel']]) W.prop(k, x, z, R() * 3);
  for (const [x, z] of [[-4, -3.5], [4, 3.6]]) W.prop('lantern', x, z, R() * 6);
  SP.lanternString(W, -4.4, -11, 4.4, -11); SP.lanternString(W, -4.4, 11.5, 4.4, 11.5); SP.lanternString(W, 11.5, -4.4, 11.5, 4.4); SP.lanternString(W, -11.5, -4.4, -11.5, 4.4);
  for (const [x, z, c] of [[-4.2, -9.4, 0x7a2a22], [4.2, 10, 0x2a4a7a], [10, 4.2, 0x3a5a2a]]) SP.banner(W, x, z, c);
  W.broadleaf([[-14, -14, 1], [14, 14, 1.1]], 'kusu'); W.broadleaf([[-14, 14, 0.9], [14, -14, 0.8]], 'tsubaki');
  for (const [x, z] of [[-27, -26], [27, -26], [-27, 26], [27, 26]]) W.bump(x, z, 9, 3);
  W.mist([[0, -26, 7], [0, 26, 7], [26, 0, 7], [-26, 0, 7]]); W.mistK = 0.5;
  W.terrainMesh(70, 70, groundColor(W, [0.36, 0.33, 0.24]));
  ringOfPines(W, R, 27, 34, 50, [Math.PI / 2, -Math.PI / 2, 0, Math.PI], [['keyaki', 0.35], ['kusu', 0.3], ['matsu', 0.25], ['tsubaki', 0.1]]);
  W.spawns = [[0, 26], [0, -26], [26, 0], [-26, 0]]; cfg.weathers = ['clear', 'rain', 'fog'];
  around(g, W, cfg, 'sv_trade');
  return { setQuality: lit.setQuality, update: () => {} };   // no falling momiji here: red maples belong to Momiji Field
}
// ---------------------------------------------------------------- Bamboo Crossing
// a stream through a bamboo forest: an arched bridge, a plank bridge and a ford of stepping stones are the only ways
// across; on the north bank an abandoned shrine on a terrace, on the south a fenced clearing with fallen logs
function svBamboo(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'fog', false); const R = rng(214);
  W.river(1.5, 1.4, 0.16, 4.6, 1.3, 30);
  const rz = x => 1.5 + Math.sin(x * 0.16) * 1.4;
  W.bridge(-9, rz(-9), Math.PI / 2, 7.5, 2.6, 1.1); W.bridge(11, rz(11), Math.PI / 2, 7, 2.2, 0.8);
  SP.steppingStones(W, 1.5, rz(1.5), Math.PI / 2, 5.2, 6);
  W.flat(0, -15, 7.5, 4, 1.2); W.house(0, -17.5, 0, 8, 5, { ruined: true }); W.torii(0, -10, 0, 0.9);
  W.stoneLantern(-4.5, -10.5); W.stoneLantern(4.5, -10.5); SP.jizo(W, -7, -13, 0.4); SP.jizo(W, 7.5, -12.5, -0.4);
  SP.fence(W, -9, 12, 6, 0.2); SP.fence(W, 8, 13, 5, -0.3); SP.log(W, -3, 9, 0.4, 3.4); SP.log(W, 5, 16, -0.7, 3);
  for (const [x, z, s] of [[-14, -4, 1.2], [14, -6, 1.1], [-6, -5, 0.8], [13, 9, 1], [-15, 9, 0.9]]) W.rock(x, z, s);
  W.path([[0, 27], [1, 18], [1.5, 8], [1.5, rz(1.5) + 3]], 2.2); W.path([[1.5, rz(1.5) - 3], [0, -7]], 2.2);
  W.bambooGrove(-19, -14, 7, 230, 241); W.bambooGrove(19, -15, 7, 230, 242); W.bambooGrove(-20, 15, 7, 230, 243); W.bambooGrove(20, 16, 7, 220, 244);
  W.bambooGrove(-9, -24, 6, 150, 245); W.bambooGrove(10, 24, 6, 150, 246); W.bambooGrove(-11, 23, 5, 120, 247);
  W.grassField(0, 4, 20, 8, 500, 248, (x, z) => Math.abs(z - rz(x)) < 3.5 || Math.abs(x - 1.5) < 2);
  W.mist([[-12, 2, 9], [12, 2, 9], [0, -20, 8], [0, 20, 8]]); W.mistK = 0.85;
  W.terrainMesh(70, 70, groundColor(W, [0.3, 0.4, 0.22]));
  ringOfPines(W, R, 27, 34, 70, [Math.PI / 2, 0, Math.PI], [['kusu', 0.35], ['matsu', 0.3], ['tsubaki', 0.2], ['keyaki', 0.15]]);
  W.spawns = [[0, 26], [26, -6], [-26, -6]]; cfg.weathers = ['fog', 'rain', 'clear', 'wind'];
  around(g, W, cfg, 'sv_bamboo');
  return { setQuality: lit.setQuality, update: particles(g, 'fireflies', 120) };
}
// ---------------------------------------------------------------- Sunken Ruins
// a ruined fishing village on the shore: the sea along the south edge with a torii standing in the water, a broken pier,
// boats pulled up on the sand, net racks and driftwood, fallen houses and foundation walls up the slope
function svRuins(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'dusk', false); const R = rng(215);
  W.river(27, 1.2, 0.12, 24, 1.8, 30);   // the sea: a band wide enough to run off the south edge
  W.torii(-9, 19.5, 0, 1.1); SP.pier(W, 9, 11, 0, 12, 2.2, 3, -0.2);
  W.house(-12, -6, 0.25, 6.5, 4.5, { ruined: true }); W.house(11, -8, -0.2, 6.5, 4.5, { ruined: true }); W.house(-1, -17, 0, 7, 5, { ruined: true });
  for (const [x, z, s] of [[-14.5, -3, 0.7], [-9, -8.5, 0.6], [13.5, -5, 0.7], [8.5, -10.5, 0.5], [2.5, -15, 0.6], [-4, -19, 0.5]]) W.rock(x, z, s);   // rubble from the fallen houses
  W.wall(-3, 2, 6, 0.2, 1.6, { broken: true }); W.wall(15, 4, 5, -0.5, 1.4, { broken: true }); W.wall(-16, 4, 5, 0.9, 1.5, { broken: true });
  SP.boat(W, -3, 9, 0.35); SP.boat(W, 15, 9.5, -0.4, true); SP.boat(W, -16, 9, 0.9);
  SP.netRack(W, -8, 3.5, 0.1); SP.netRack(W, 5, 0.5, -0.3); SP.log(W, -11, 12, 0.5, 3.2); SP.log(W, 3, 11, -0.3, 2.6);
  for (const [x, z, s] of [[-20, 12, 1.6], [20, 13, 1.8], [-6, 13.5, 0.9], [6, -3, 0.8], [-7, -9, 1]]) W.rock(x, z, s);
  SP.cliff(W, R, -24, -22, -25, 10, { s: [2.4, 3.8], tone: SP.CRAG.mid }); SP.cliff(W, R, 24, -22, 25, 10, { s: [2.4, 3.8], tone: SP.CRAG.mid });
  for (let i = 0; i < 5; i++) W.bump(-18 + i * 9, -25, 7, 2.5 + R() * 1.5);
  for (const [x, z] of [[-7, -2], [8, -1]]) W.prop('lantern', x, z, R() * 6);
  W.mist([[-12, 16, 9], [10, 18, 9], [0, -10, 8]]); W.mistK = 0.65;
  W.terrainMesh(70, 70, tintGround(W, (x, z, s) => s === 'stone' || s === 'wood' ? null : z > 5 ? [0.62, 0.55, 0.4] : z > 1 ? [0.5, 0.48, 0.32] : null));
  { const pts = []; for (let i = 0; i < 46; i++) { const x = R() * 64 - 32, z = -32 + R() * 30; if (Math.abs(x) < 24 && z > -26) continue; pts.push([x, z, 0.9 + R() * 0.6]); } W.pines(pts, [['matsu', 0.45], ['bonsai', 0.25], ['kusu', 0.3]]); }   // wind-bent pines on the hills only, never in the sea
  W.spawns = [[0, -26], [-24, -10], [24, -10]]; cfg.weathers = ['fog', 'rain', 'wind', 'clear'];
  around(g, W, cfg, 'sv_ruins');
  return { setQuality: lit.setQuality, update: particles(g, 'snow', 90) };
}
// castle courtyard: high walls, keep facade, main gate
function svCastle(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'day'); const R = rng(203);
  W.region(0, 0, 22, 22, 'stone');
  W.flat(0, -18, 12, 3, 1.1);   // an earthen terrace under the keep wall (before anything stands on it)
  W.keep(0, -30, 0, 3, 13, 8, { base: 3.4, lit: false });   // the keep towers over the north wall
  for (const [x, z, len, rot] of [[-14, 21, 18, 0], [14, 21, 18, 0], [-22, 0, 36, Math.PI / 2], [22, 0, 36, Math.PI / 2], [-15, -25, 12, 0], [15, -25, 12, 0]]) W.wall(x, z, len, rot, 5.2);
  W.torii(0, 23, 0, 0.75);
  for (const [x, z] of [[-10, -12], [10, -12], [-16, 10], [16, 10]]) W.stoneLantern(x, z);
  for (const [x, z] of [[-18, -8], [-18, -6.8], [18, 14], [18, 15.3]]) W.prop('crate', x, z);
  W.prop('rack', -12, 16, 0); W.prop('rack', 12, 16, 0);
  SP.slabFloor(W, 0, 2, 9, 9);   // polished court
  SP.fence(W, -8, 6, 4.5, 0.5); SP.fence(W, 8, 6, 4.5, -0.5); SP.fence(W, 0, -11.5, 6, 0); SP.cart(W, -15, -2, 0.4); SP.cart(W, 15, 3, -2.6, 0.08);
  for (const [x, z, c] of [[-6, -14.5, 0xb02a20], [6, -14.5, 0xb02a20], [-20, 18, 0x1c2a4a], [20, 18, 0x1c2a4a]]) SP.banner(W, x, z, c);
  W.broadleaf([[-14, -14, 1.2], [14, -14, 1.2], [-17, 4, 1], [17, 4, 1]], 'sakura');
  W.shrubs([[-19, -16, 1], [-19, -12, 0.9], [19, -16, 1], [19, -12, 0.9], [-8, 18, 0.9], [8, 18, 0.9]]);
  W.terrainMesh(70, 70, groundColor(W, [0.36, 0.36, 0.3]));
  W.spawns = [[0, 26], [-21, -19], [21, -19]]; cfg.weathers = ['clear', 'wind', 'snow'];
  around(g, W, cfg, 'sv_castle');
  return { setQuality: lit.setQuality, update: particles(g, 'petals', 150) };
}
// ruined fortress: broken walls with breaches, braziers, rubble, snow
function svFortress(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'night', false); const R = rng(205);
  for (let i = 0; i < 9; i++) W.bump(R() * 30 - 15, R() * 30 - 15, 4 + R() * 4, (R() - 0.4) * 1.1);   // frozen, uneven ground
  W.region(0, 0, 20, 20, 'stone');
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (i % 4 === 1) continue; W.wall(Math.cos(a) * 22, Math.sin(a) * 22, 11, -a + Math.PI / 2, 3.6, { broken: i % 3 === 0 }); }
  for (let i = 0; i < 20; i++) { const a = R() * 6.28, r = 8 + R() * 11; W.rock(Math.cos(a) * r, Math.sin(a) * r, 0.4 + R() * 0.7); }
  for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 1, 10), new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: 0.6, roughness: 0.5 })); W.add(b, x, z, 0, W.ground(x, z) + 0.5); W.circle(x, z, 0.5, 1.2);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xff9030 })); W.add(f, x, z, 0, W.ground(x, z) + 1.35); W.addLight(x, z, 1.6, 0xff8a3a, 9, 11); }
  W.house(0, -14, 0, 7, 5, { ruined: true });
  SP.fence(W, -12, 3, 5, 1.2); SP.fence(W, 12, -2, 5, -1.1); SP.fence(W, 3, 13, 5, 0.1); SP.log(W, -4, 6, 0.8, 3.2); SP.log(W, 7, 3, -0.4, 2.8); SP.cart(W, -14, -10, 0.9, 0.3);
  for (const [x, z] of [[-17, 5], [17, 5], [0, 18]]) SP.banner(W, x, z, 0x6a1a14);
  W.mist([[24, 0, 8], [-12, 21, 8], [-12, -21, 8]]); W.mistK = 0.6;
  W.terrainMesh(70, 70, groundColor(W, [0.3, 0.3, 0.28]));
  W.spawns = [[Math.cos(Math.PI / 6) * 24, Math.sin(Math.PI / 6) * 24], [Math.cos(Math.PI / 6 + 2.094) * 24, Math.sin(Math.PI / 6 + 2.094) * 24], [Math.cos(Math.PI / 6 + 4.189) * 24, Math.sin(Math.PI / 6 + 4.189) * 24]];
  cfg.weathers = ['snow', 'wind', 'clear', 'fog'];
  around(g, W, cfg, 'sv_fortress');
  return { setQuality: lit.setQuality, update: particles(g, 'snow', 220) };
}
registerMap('sv_dojo', 'Dojo Court', svDojo);
registerMap('sv_cave', 'Cave Grottos', svCave);
registerMap('sv_trade', 'Trade Post', svTrade);
registerMap('sv_bamboo', 'Bamboo Crossing', svBamboo);
registerMap('sv_ruins', 'Sunken Ruins', svRuins);
registerMap('sv_castle', 'Castle Courtyard', svCastle);
registerMap('sv_fortress', 'Ruined Fortress', svFortress);
// the old ring arenas were replaced: their keys (saved settings, records) open the arena that took their place
registerMap('sv_temple', 'Dojo Court', svDojo); registerMap('sv_village', 'Trade Post', svTrade); registerMap('sv_glade', 'Bamboo Crossing', svBamboo);
export const SV_MAPS = ['sv_dojo', 'sv_cave', 'sv_trade', 'sv_bamboo', 'sv_ruins', 'sv_castle', 'sv_fortress'];
