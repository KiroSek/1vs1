// Open-world maps built from the World kit: the Samurai Hunt valley and five Survival arenas.
// Everything is generated from a fixed seed so both players get an identical layout.
import * as THREE from 'three';
import { registerMap, gradSky, skyAndEnv, particles } from './arena.js';
import { World, rng } from './world.js';

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
  W.broadleaf([[-48, -44, 1.2], [-31, -47, 1.1], [-46, -33, 1]], 'maple');
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
  W.pines(pines);
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
  return { setQuality: lit.setQuality, update: () => { } };
}
registerMap('hunt_valley', 'Kirigakure Valley', buildHunt);

// =====================================================================================  SURVIVAL ARENAS
// common: a walled / wooded ring of radius ~24 with gates where waves enter
function arenaBase(g, cfg, opts, tod, surfaceBase) {
  const W = new World(g, { half: 30 }); cfg.world = W; cfg.amb = null;
  const lit = lighting(g, cfg, opts.tod || tod, 30);
  W.flat(0, 0, 18, 18, 0);
  return { W, lit };
}
function ringOfPines(W, R, r0, r1, n, gates) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = R() * 6.283, r = r0 + R() * (r1 - r0); if (gates.some(gt => Math.abs(Math.atan2(Math.sin(a - gt), Math.cos(a - gt))) < 0.18)) continue; pts.push([Math.cos(a) * r, Math.sin(a) * r, 0.9 + R() * 0.6]); }
  W.pines(pts);
}
// temple courtyard: shrine (N), torii gate (S), side gates, sakura
function svTemple(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'dusk'); const R = rng(201);
  W.region(0, 0, 16, 16, 'stone');
  W.house(0, -20, 0, 10, 6, { lit: true }); W.torii(0, 15, 0, 1.2); W.torii(0, 22, 0, 1.05);
  for (const [x, z, len, rot] of [[-12, -24, 14, 0], [12, -24, 14, 0], [-24, -12, 18, Math.PI / 2], [24, -12, 18, Math.PI / 2], [-24, 13, 14, Math.PI / 2], [24, 13, 14, Math.PI / 2], [-14, 24, 12, 0], [14, 24, 12, 0]]) W.wall(x, z, len, rot, 3);
  for (const [x, z] of [[-6, -12], [6, -12], [-10, 6], [10, 6], [-6, 14], [6, 14]]) W.stoneLantern(x, z);
  W.broadleaf([[-16, -8, 1.1], [16, -8, 1], [-15, 12, 1], [16, 14, 1.1]], 'sakura');
  W.terrainMesh(70, 70, groundColor(W, [0.35, 0.38, 0.25]));
  ringOfPines(W, R, 27, 34, 60, [Math.PI / 2, 0, Math.PI]);
  W.spawns = [[0, 27], [27, 4], [-27, 4]]; cfg.weathers = ['clear', 'rain', 'wind', 'fog'];
  return { setQuality: lit.setQuality, update: particles(g, 'petals', 160) };
}
// abandoned village at night: plaza ringed by houses, alleys as entries
function svVillage(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'night'); const R = rng(202);
  W.region(0, 0, 10, 10, 'stone');
  const hs = [[-14, -12, 0.6], [0, -17, 0], [14, -12, -0.6], [17, 3, Math.PI / 2], [12, 15, 0.7], [-12, 15, -0.7], [-17, 3, Math.PI / 2]];
  hs.forEach(([x, z, r], i) => W.house(x, z, r, 7, 5, { lit: i % 2 === 0, ruined: i === 3 }));
  for (const [x, z] of [[-6, -6], [6, -6], [-7, 7], [7, 7], [0, 10]]) W.prop('lantern', x, z, R() * 6);
  for (const [x, z] of [[-4, 12], [-3, 13], [9, -2], [-9, 1], [3, -9]]) W.prop(R() < 0.5 ? 'crate' : 'barrel', x, z);
  W.grassField(0, 0, 22, 22, 500, 31, (x, z) => Math.hypot(x, z) < 15);
  W.terrainMesh(70, 70, groundColor(W, [0.25, 0.3, 0.2]));
  ringOfPines(W, R, 24, 32, 70, [-Math.PI / 2 - 0.4, 0.15, Math.PI - 0.15, Math.PI / 2]);
  W.spawns = [[-8, -24], [24, 2], [-24, 2], [0, 25]]; cfg.weathers = ['rain', 'fog', 'clear'];
  return { setQuality: lit.setQuality, update: () => { } };
}
// castle courtyard: high walls, keep facade, main gate
function svCastle(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'day'); const R = rng(203);
  W.region(0, 0, 22, 22, 'stone');
  const keep = W.house(0, -21, 0, 16, 7, { lit: false }); keep.scale.y = 1.6;
  for (const [x, z, len, rot] of [[-14, 21, 18, 0], [14, 21, 18, 0], [-22, 0, 36, Math.PI / 2], [22, 0, 36, Math.PI / 2], [-15, -25, 12, 0], [15, -25, 12, 0]]) W.wall(x, z, len, rot, 5.2);
  W.torii(0, 23, 0, 0.75);
  for (const [x, z] of [[-10, -12], [10, -12], [-16, 10], [16, 10]]) W.stoneLantern(x, z);
  for (const [x, z] of [[-18, -8], [-18, -6.8], [18, 14], [18, 15.3]]) W.prop('crate', x, z);
  W.prop('rack', -12, 16, 0); W.prop('rack', 12, 16, 0);
  W.broadleaf([[-14, -14, 1.2], [14, -14, 1.2]], 'maple');
  W.terrainMesh(70, 70, groundColor(W, [0.36, 0.36, 0.3]));
  W.spawns = [[0, 26], [-21, -19], [21, -19]]; cfg.weathers = ['clear', 'wind', 'snow'];
  return { setQuality: lit.setQuality, update: () => { } };
}
// forest glade: clearing surrounded by pines and bamboo
function svGlade(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'dusk'); const R = rng(204);
  for (let i = 0; i < 8; i++) W.bump(R() * 40 - 20, R() * 40 - 20, 6 + R() * 6, R() * 0.8);
  W.grassField(0, 0, 18, 18, 900, 41, (x, z) => Math.hypot(x, z) < 7);
  for (const [x, z] of [[-7, -5], [8, 6], [3, -11], [-10, 9]]) W.rock(x, z, 0.8 + R() * 0.6);
  W.bambooGrove(-18, -18, 9, 260, 42); W.bambooGrove(19, 17, 8, 220, 43);
  W.stoneLantern(0, 0);
  W.terrainMesh(70, 70, groundColor(W, [0.3, 0.42, 0.2]));
  ringOfPines(W, R, 21, 32, 140, [0.5, 2.6, -1.6]);
  W.spawns = [[Math.cos(0.5) * 24, Math.sin(0.5) * 24], [Math.cos(2.6) * 24, Math.sin(2.6) * 24], [Math.cos(-1.6) * 24, Math.sin(-1.6) * 24]]; cfg.weathers = ['fog', 'rain', 'clear', 'wind'];
  return { setQuality: lit.setQuality, update: particles(g, 'fireflies', 120) };
}
// ruined fortress: broken walls with breaches, braziers, rubble, snow
function svFortress(g, renderer, cfg, opts) {
  const { W, lit } = arenaBase(g, cfg, opts, 'night'); const R = rng(205);
  W.region(0, 0, 20, 20, 'stone');
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; if (i % 4 === 1) continue; W.wall(Math.cos(a) * 22, Math.sin(a) * 22, 11, -a + Math.PI / 2, 3.6, { broken: i % 3 === 0 }); }
  for (let i = 0; i < 20; i++) { const a = R() * 6.28, r = 8 + R() * 11; W.rock(Math.cos(a) * r, Math.sin(a) * r, 0.4 + R() * 0.7); }
  for (const [x, z] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 1, 10), new THREE.MeshStandardMaterial({ color: 0x2a2624, metalness: 0.6, roughness: 0.5 })); W.add(b, x, z, 0, W.ground(x, z) + 0.5); W.circle(x, z, 0.5, 1.2);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xff9030 })); W.add(f, x, z, 0, W.ground(x, z) + 1.35); W.addLight(x, z, 1.6, 0xff8a3a, 9, 11); }
  W.house(0, -14, 0, 7, 5, { ruined: true });
  W.terrainMesh(70, 70, groundColor(W, [0.3, 0.3, 0.28]));
  W.spawns = [[Math.cos(Math.PI / 6) * 24, Math.sin(Math.PI / 6) * 24], [Math.cos(Math.PI / 6 + 2.094) * 24, Math.sin(Math.PI / 6 + 2.094) * 24], [Math.cos(Math.PI / 6 + 4.189) * 24, Math.sin(Math.PI / 6 + 4.189) * 24]];
  cfg.weathers = ['snow', 'wind', 'clear', 'fog'];
  return { setQuality: lit.setQuality, update: () => { } };
}
registerMap('sv_temple', 'Shrine Courtyard', svTemple);
registerMap('sv_village', 'Abandoned Village', svVillage);
registerMap('sv_castle', 'Castle Courtyard', svCastle);
registerMap('sv_glade', 'Forest Glade', svGlade);
registerMap('sv_fortress', 'Ruined Fortress', svFortress);
export const SV_MAPS = ['sv_temple', 'sv_village', 'sv_castle', 'sv_glade', 'sv_fortress'];
