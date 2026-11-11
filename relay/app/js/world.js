// World kit for the open maps (Samurai Hunt, Survival arenas): terrain height, colliders on a spatial grid,
// line-of-sight with foliage, surfaces (for footstep noise), lights, destructible props and weather.
import * as THREE from 'three';
import { torii as archTorii, lantern as archLantern, tiledRoof, lattice, grime, rockGeo, stoneWall, archBridge } from './arch.js';
import { grass as grassClumps } from './foliage.js';
import { forest, tuftGeo, foliageMat, foliageDepth, TREE_KINDS } from './foliage.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// quality knobs set by main.js before a map is built
export const WQ = { grass: 1, lights: 8 };
export function setWorldQuality(q) { WQ.grass = q === 'low' ? 0.4 : q === 'med' ? 0.7 : 1; WQ.lights = q === 'low' ? 3 : q === 'med' ? 5 : 8; }

// Draw-call reduction: merge every static mesh under root that shares a material (and shadow flags) into one mesh.
// Skips instanced/skinned meshes, vertex-coloured terrain, sprites/points, and anything under userData.dynamic.
export function bakeStatic(root) {
  root.updateMatrixWorld(true); const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(); const buckets = new Map();
  root.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || o.geometry.attributes.color || Array.isArray(o.material)) return;
    for (let p = o; p && p !== root; p = p.parent) if (p.userData.dynamic || !p.visible) return;
    const key = o.material.uuid + (o.castShadow ? 's' : '') + (o.receiveShadow ? 'r' : '') + o.renderOrder; let b = buckets.get(key); if (!b) buckets.set(key, b = []); b.push(o);
  });
  let saved = 0;
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = [];
    for (const o of list) { let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); g.morphAttributes = {}; g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)); geos.push(g); }
    const merged = mergeGeometries(geos, false); if (!merged) continue;
    const m = new THREE.Mesh(merged, list[0].material); m.castShadow = list[0].castShadow; m.receiveShadow = list[0].receiveShadow; m.renderOrder = list[0].renderOrder; root.add(m);
    for (const o of list) { o.parent.remove(o); } for (const g of geos) g.dispose(); saved += list.length - 1;
  }
  return saved;
}

const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
// deterministic RNG so both players build the same map
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const TX = {};
export function tex(name) {
  if (TX[name]) return TX[name];
  const R = Math.random;
  const mk = {
    ground: () => canvasTex(512, 512, (x, w, h) => { x.fillStyle = '#c4c4c4'; x.fillRect(0, 0, w, h); for (let i = 0; i < 9000; i++) { const l = 90 + R() * 80 | 0; x.fillStyle = `rgba(${l},${l},${l},${0.12 + R() * 0.25})`; x.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3); } }, false),
    plaster: () => canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#d8cdb4'; x.fillRect(0, 0, w, h); for (let i = 0; i < 1600; i++) { x.fillStyle = `rgba(90,70,40,${R() * 0.08})`; x.fillRect(R() * w, R() * h, 2 + R() * 10, 2 + R() * 6); } x.fillStyle = 'rgba(60,40,25,.25)'; x.fillRect(0, h - 30, w, 30); }),
    timber: () => canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#4a2f1e'; x.fillRect(0, 0, w, h); for (let i = 0; i < 120; i++) { x.strokeStyle = `rgba(20,10,5,${R() * 0.4})`; x.beginPath(); const px = R() * w; x.moveTo(px, 0); x.bezierCurveTo(px + R() * 8 - 4, h / 3, px + R() * 8 - 4, h * 2 / 3, px, h); x.stroke(); } }),
    tiles: () => canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#2a2c32'; x.fillRect(0, 0, w, h); for (let r = 0; r < 16; r++) for (let c = 0; c < 8; c++) { const l = 34 + R() * 14 | 0; x.fillStyle = `rgb(${l},${l + 2},${l + 6})`; x.fillRect(c * 32 + (r % 2) * 16, r * 16, 30, 13); } }),
    stone: () => canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#6c6a64'; x.fillRect(0, 0, w, h); for (let r = 0; r < 6; r++) for (let c = 0; c < 4; c++) { const l = 80 + R() * 40 | 0; x.fillStyle = `rgb(${l},${l - 2},${l - 6})`; x.fillRect(c * 64 + (r % 2) * 32 + 2, r * 42 + 2, 60, 38); } }),
    shoji: () => canvasTex(128, 256, (x, w, h) => { x.fillStyle = '#e8dcc0'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a2416'; for (let i = 0; i <= 4; i++) x.fillRect(i * w / 4 - 2, 0, 4, h); for (let j = 0; j <= 8; j++) x.fillRect(0, j * h / 8 - 2, w, 4); }),
    path: () => canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#5a5248'; x.fillRect(0, 0, w, h); for (let i = 0; i < 40; i++) { const l = 95 + R() * 50 | 0; x.fillStyle = `rgb(${l},${l - 4},${l - 10})`; x.beginPath(); x.ellipse(R() * w, R() * h, 14 + R() * 20, 10 + R() * 14, R() * 3, 0, 6.3); x.fill(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.stroke(); } }),
    grassBlade: () => canvasTex(64, 128, (x, w, h) => { x.clearRect(0, 0, w, h); for (let i = 0; i < 14; i++) { const bx = 4 + R() * (w - 8), lean = (R() - 0.5) * 18, g = 90 + R() * 60 | 0; x.strokeStyle = `rgb(${40 + R() * 30 | 0},${g},${30 + R() * 20 | 0})`; x.lineWidth = 2 + R() * 2; x.beginPath(); x.moveTo(bx, h); x.quadraticCurveTo(bx + lean * 0.3, h * 0.5, bx + lean, 4 + R() * 30); x.stroke(); } }),
    bark: () => canvasTex(64, 256, (x, w, h) => { x.fillStyle = '#3a2a20'; x.fillRect(0, 0, w, h); for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(0,0,0,${R() * 0.4})`; x.fillRect(R() * w, R() * h, 2 + R() * 4, 10 + R() * 30); } }),
    bamboo: () => canvasTex(32, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#3a6a2c'); g.addColorStop(0.5, '#86b45a'); g.addColorStop(1, '#3a6a2c'); x.fillStyle = g; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(30,50,15,.85)'; for (let y = 0; y < h; y += 64) x.fillRect(0, y, w, 4); }),
    water: () => canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#808080'; x.fillRect(0, 0, w, h); for (let i = 0; i < 300; i++) { x.strokeStyle = `rgba(255,255,255,${R() * 0.25})`; x.lineWidth = 1 + R() * 2; x.beginPath(); const px = R() * w, py = R() * h; x.moveTo(px, py); x.quadraticCurveTo(px + 10, py - 3, px + 20 + R() * 20, py); x.stroke(); } }, false),
  };
  const t = mk[name](); t.userData.shared = true; return TX[name] = t;
}
const MAT = {};
export const MIST = { h: 2.6, dens: 0.11, size: 9, opacity: 0.32 };   // bank height (m), sight loss per metre at full thickness, puff size (m), max opacity
let _mistTex = null;
function mistTex() {
  if (_mistTex) return _mistTex; const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.5, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return _mistTex = new THREE.CanvasTexture(c);
}
export function mat(name) {
  if (MAT[name]) return MAT[name];
  const S = (o) => new THREE.MeshStandardMaterial(o);
  const m = {
    plaster: () => S({ map: tex('plaster'), roughness: 0.95 }), timber: () => S({ map: tex('timber'), roughness: 0.8 }), woodDark: () => S({ color: 0x2c1c12, roughness: 0.75 }),
    roof: () => S({ map: tex('tiles'), roughness: 0.6, side: THREE.DoubleSide }), stone: () => S({ map: tex('stone'), roughness: 0.95 }), rock: () => S({ color: 0x8a867c, roughness: 0.95, vertexColors: true }), lanternStone: () => S({ map: tex('stone'), color: 0xb0aca2, roughness: 0.95 }),
    shoji: () => S({ map: tex('shoji'), roughness: 0.9, emissive: 0x000000 }), shojiLit: () => S({ map: tex('shoji'), roughness: 0.9, emissive: 0xffa040, emissiveIntensity: 0.6, emissiveMap: tex('shoji') }),
    red: () => S({ color: 0xb21e18, roughness: 0.5 }), black: () => S({ color: 0x151414, roughness: 0.6 }), bark: () => S({ map: tex('bark'), roughness: 1 }),
    pine: () => S({ color: 0x1f3d2a, roughness: 1, flatShading: true }), sakura: () => S({ color: 0xf2aac0, roughness: 0.85, flatShading: true }), maple: () => S({ color: 0xb8401e, roughness: 0.85, flatShading: true }),
    bamboo: () => S({ map: tex('bamboo'), roughness: 0.6 }), bambooLeaf: () => S({ color: 0x4f7c34, roughness: 0.9, flatShading: true }),
    paper: () => S({ color: 0xffe2b0, emissive: 0xff9a40, emissiveIntensity: 2.2, roughness: 0.8 }), paperOff: () => S({ color: 0x8a7a60, roughness: 0.9 }),
    path: () => S({ map: tex('path'), roughness: 0.95 }), crate: () => S({ map: tex('timber'), color: 0xc8a070, roughness: 0.85 }), straw: () => S({ color: 0xb89a58, roughness: 1 }),
  };
  const mm = m[name](); mm.userData.shared = true; return MAT[name] = mm;
}

// =====================================================================================
const HGRID = { res: 0.5, pad: 8 };   // cached height grid: cell size (m), margin past the world bounds (m)
export class World {
  constructor(scene, opts) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.half = opts.half;                 // walkable square half-size (m)
    this.boxes = []; this.circles = []; this.foliage = []; this.regions = []; this.lights = []; this.props = []; this.spawns = []; this.waypoints = [];
    this.bumps = []; this.flats = []; this.bridges = []; this.edge = []; this.edgeGrass = []; this.water = null;
    this.cell = 8; this.grid = new Map();
    this.wind = new V3(0.6, 0, 0.3); this.time = 0; this.updaters = [];
    this.fogRange = opts.fogRange || 60; this.night = !!opts.night;
  }
  // ---------- terrain ----------
  bump(x, z, r, h) { this.bumps.push({ x, z, r, h }); this.hc = null; }
  flat(x, z, hx, hz, h, rot = 0) { this.flats.push({ x, z, hx, hz, h, c: Math.cos(rot), s: Math.sin(rot) }); this.hc = null; }   // levelled pad (house plots, plazas)
  // terrain height. Game-time queries (many per frame per fighter / prop) read a lazily filled 0.5 m height grid with bilinear
  // interpolation instead of summing every bump and pad; the grid is dropped whenever the relief changes. Bridges stay exact.
  ground(x, z, noBridge = false) {
    if (noBridge) return this.groundRaw(x, z, true);
    let y = this.groundCached(x, z);
    for (const b of this.bridges) { const dx = x - b.x, dz = z - b.z, la = dx * b.c - dz * b.s, lb = dx * b.s + dz * b.c; if (Math.abs(la) < b.len / 2 && Math.abs(lb) < b.w / 2) y = Math.max(y, b.flat ? b.h : b.h * Math.cos(Math.PI * la / b.len) * 0.9 + 0.35); }
    return y;
  }
  groundCached(x, z) {
    const R = HGRID.res, H = this.half + HGRID.pad, n = Math.ceil(2 * H / R) + 1;
    if (!this.hc) { this.hc = new Float32Array(n * n).fill(NaN); }
    const gx = (x + H) / R, gz = (z + H) / R, i = Math.floor(gx), j = Math.floor(gz);
    if (i < 0 || j < 0 || i >= n - 1 || j >= n - 1) return this.groundRaw(x, z, false);
    const c = this.hc, v = (a, b) => { const k = b * n + a; let h = c[k]; if (h !== h) h = c[k] = this.groundRaw(a * R - H, b * R - H, false); return h; };
    const u = gx - i, w = gz - j;
    return (v(i, j) * (1 - u) + v(i + 1, j) * u) * (1 - w) + (v(i, j + 1) * (1 - u) + v(i + 1, j + 1) * u) * w;
  }
  groundRaw(x, z, noBridge) {
    let y = 0;
    for (const b of this.bumps) { const d = Math.hypot(x - b.x, z - b.z); if (d < b.r) y += b.h * (0.5 + 0.5 * Math.cos(Math.PI * d / b.r)); }
    if (this.water) { const w = this.water, d = Math.abs(this.riverDist(x, z)); if (d < w.width) { const k = 1 - d / w.width; y -= w.depth * Math.min(1, k * 1.6); if (!noBridge) for (const f of w.fords) if (f[2] !== undefined && x > f[0] && x < f[1]) y = Math.max(y, f[2]); } }
    for (const f of this.flats) { const dx = x - f.x, dz = z - f.z, lx = dx * f.c - dz * f.s, lz = dx * f.s + dz * f.c, ex = Math.abs(lx) - f.hx, ez = Math.abs(lz) - f.hz; if (ex < 2 && ez < 2) { const k = clamp(1 - Math.max(ex, ez, 0) / 2, 0, 1); y = y * (1 - k) + f.h * k; } }
    return y;
  }
  riverDist(x, z) { const w = this.water; return z - (w.z + Math.sin(x * w.f) * w.amp); }   // signed distance-ish to the river centre line
  inWater(x, z) { if (!this.water) return false; if (this.onBridge(x, z)) return false; return Math.abs(this.riverDist(x, z)) < this.water.width * 0.55; }
  onBridge(x, z) { for (const b of this.bridges) { const dx = x - b.x, dz = z - b.z, la = dx * b.c - dz * b.s, lb = dx * b.s + dz * b.c; if (Math.abs(la) < b.len / 2 && Math.abs(lb) < b.w / 2) return true; } return false; }
  terrainMesh(size, seg, colorFn) {
    this.colorFn = colorFn;   // vista.js blends the surroundings out of the same ground colours
    const g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2);
    const P = g.attributes.position, col = new Float32Array(P.count * 3), c = new THREE.Color();
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), z = P.getZ(i); P.setY(i, this.ground(x, z, true)); colorFn(x, z, c); col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    const t = tex('ground'); t.repeat.set(size / 6, size / 6);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, map: t, roughness: 1 })); m.receiveShadow = true; this.group.add(m); return m;
  }
  // ---------- colliders (grid-indexed) ----------
  addToGrid(kind, idx, x0, z0, x1, z1) {
    for (let i = Math.floor(x0 / this.cell); i <= Math.floor(x1 / this.cell); i++) for (let j = Math.floor(z0 / this.cell); j <= Math.floor(z1 / this.cell); j++) {
      const k = i + ',' + j; let c = this.grid.get(k); if (!c) this.grid.set(k, c = { b: [], c: [], f: [] }); c[kind].push(idx);
    }
  }
  box(x, z, hx, hz, h, rot = 0, y0 = null) {   // oriented box collider, top at h above ground (or absolute when y0 given)
    const b = { x, z, hx, hz, c: Math.cos(rot), s: Math.sin(rot), y0: y0 ?? this.ground(x, z) - 1, top: (y0 ?? this.ground(x, z)) + h, on: true };
    this.boxes.push(b); const r = Math.hypot(hx, hz); this.addToGrid('b', this.boxes.length - 1, x - r, z - r, x + r, z + r); return b;
  }
  circle(x, z, r, h) { const c = { x, z, r, top: this.ground(x, z) + h, on: true }; this.circles.push(c); this.addToGrid('c', this.circles.length - 1, x - r, z - r, x + r, z + r); return c; }
  // low round bushes [x, z, s]: clusters of faceted blobs, no collision; a fighter crouching inside one can't be seen from outside
  shrubs(list) {
    if (!list.length) return;
    const R = rng(list.length * 13 + 5), per = 4, inst = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, flatShading: true }), list.length * per);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color(); let k = 0;
    for (const [x, z, s] of list) {
      const y = this.ground(x, z);
      for (let j = 0; j < per; j++) { const a = R() * 6.283, dd = j ? (0.45 + R() * 0.35) * s : 0, r = (j ? 0.55 + R() * 0.25 : 0.85) * s;
        M.compose(new V3(x + Math.cos(a) * dd, y + r * 0.5, z + Math.sin(a) * dd), q.setFromEuler(e.set(R(), R() * 6, R())), new V3(r, r * (0.72 + R() * 0.2), r)); inst.setMatrixAt(k, M);
        inst.setColorAt(k++, col.setHSL(0.24 + R() * 0.07, 0.42, 0.13 + R() * 0.07)); }
      this.bush(x, z, 1.1 * s, 1.25 * s, 1.6, 'bush');
    }
    inst.castShadow = inst.receiveShadow = true; this.group.add(inst);
  }
  // banks of ground mist [x, z, r]: soft puffs hugging the ground; how thick they are is set live (mistK, 0..1) by the time of day
  mist(list) {
    this.mists = (this.mists || []).concat(list.map(([x, z, r]) => ({ x, z, r }))); this.mistK = this.mistK ?? 1;
    const R = rng(91), P = [];
    for (const [x, z, r] of list) { const n = Math.round(r * r / 5) + 4; for (let i = 0; i < n; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * r * 0.9, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d; P.push(px, this.ground(px, pz) + 0.6 + R() * 1.6, pz); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    const m = this.mistMat = new THREE.PointsMaterial({ map: mistTex(), size: MIST.size, sizeAttenuation: true, transparent: true, opacity: MIST.opacity, depthWrite: false, color: 0xd8dde4 });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.renderOrder = 3; pts.userData.noMerge = true; this.group.add(pts);
    let tt = 0; this.updaters.push(dt => { tt += dt; m.opacity = MIST.opacity * this.mistK; pts.visible = this.mistK > 0.02; pts.position.x = Math.sin(tt * 0.05) * 1.5; return true; });
  }
  // castle keep (tenshu) on a dry-stone base: storeys stepping in, each under its own tiled roof
  keep(x, z, rot, tiers = 3, w = 9, d = 7, opt = {}) {
    const g = new THREE.Group(), y0 = this.ground(x, z), BH = opt.base ?? 2.8; this.flat(x, z, w / 2 + 2.2, d / 2 + 2.2, y0, rot);
    const M = { roof: mat('roof'), black: mat('black'), wood: mat('woodDark') };
    const base = new THREE.Mesh(new THREE.CylinderGeometry(Math.SQRT1_2, Math.SQRT1_2 * 1.14, 1, 4, 1).rotateY(Math.PI / 4).scale(w + 2.2, BH, d + 2.2), mat('lanternStone')); base.position.y = BH / 2; g.add(base);
    let y = BH;
    for (let i = 0; i < tiers; i++) {
      const k = 1 - i * 0.24, ww = w * k, dd = d * k, H = i ? 2.3 : 2.8;
      const walls = new THREE.Mesh(new THREE.BoxGeometry(ww, H, dd), [mat('plaster'), mat('plaster'), mat('timber'), mat('timber'), opt.lit ? mat('shojiLit') : mat('plaster'), mat('plaster')]); walls.position.y = y + H / 2; grime(walls, 1, 0.3); g.add(walls);
      for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.22, H, 0.22), M.wood); p.position.set(sx * ww / 2, y + H / 2, sz * dd / 2); g.add(p); }
      const band = new THREE.Mesh(new THREE.BoxGeometry(ww + 0.1, 0.5, dd + 0.1), M.black); band.position.y = y + H * 0.35; g.add(band);
      const roof = tiledRoof(M, ww + 2.2, dd + 2.2, 1.3 + i * 0.1); roof.position.y = y + H + 0.05; g.add(roof);
      y += H + 0.95;
    }
    this.add(g, x, z, rot, y0); this.box(x, z, (w + 2.2) / 2 * 1.1, (d + 2.2) / 2 * 1.1, y, rot); this.region(x, z, w / 2 + 2.5, d / 2 + 2.5, 'stone', rot);
    return g;
  }
  bush(x, z, r, h, dens, kind) { const f = { x, z, r, top: this.ground(x, z) + h, dens, kind }; this.foliage.push(f); this.addToGrid('f', this.foliage.length - 1, x - r, z - r, x + r, z + r); return f; }
  region(x, z, hx, hz, surface, rot = 0) { this.regions.push({ x, z, hx, hz, c: Math.cos(rot), s: Math.sin(rot), surface }); }
  cellAt(x, z) { return this.grid.get(Math.floor(x / this.cell) + ',' + Math.floor(z / this.cell)); }
  inBox(b, x, z, pad = 0) { const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c; return Math.abs(lx) < b.hx + pad && Math.abs(lz) < b.hz + pad; }
  bounds(p, r = 0.4) {
    const H = this.half - r; p.x = clamp(p.x, -H, H); p.z = clamp(p.z, -H, H);
    // deep water is impassable except at fords and bridges: push back to the nearer bank
    if (this.water && this.inWater(p.x, p.z) && !this.water.fords.some(f => p.x > f[0] && p.x < f[1])) { const w = this.water, d = this.riverDist(p.x, p.z), lim = w.width * 0.55 + 0.01; p.z += (d >= 0 ? lim - d : -lim - d); }
    for (let it = 0; it < 2; it++) {
      const cell = this.cellAt(p.x, p.z); if (!cell) break;
      for (const i of cell.c) { const c = this.circles[i]; if (!c.on) continue; const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; } }
      for (const i of cell.b) {
        const b = this.boxes[i]; if (!b.on) continue;
        const dx = p.x - b.x, dz = p.z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c, ox = b.hx + r - Math.abs(lx), oz = b.hz + r - Math.abs(lz);
        if (ox > 0 && oz > 0) { let nx = lx, nz = lz; if (ox < oz) nx = Math.sign(lx) * (b.hx + r); else nz = Math.sign(lz) * (b.hz + r); p.x = b.x + nx * b.c + nz * b.s; p.z = b.z - nx * b.s + nz * b.c; }
      }
    }
    return p;
  }
  // solid at a 3D point? (walls, trunks, terrain)
  solidAt(x, y, z) {
    if (y < this.ground(x, z) - 0.05) return true;
    const cell = this.cellAt(x, z); if (!cell) return false;
    for (const i of cell.b) { const b = this.boxes[i]; if (b.on && y < b.top && y > b.y0 && this.inBox(b, x, z)) return true; }
    for (const i of cell.c) { const c = this.circles[i]; if (c.on && y < c.top && (x - c.x) ** 2 + (z - c.z) ** 2 < c.r * c.r) return true; }
    return false;
  }
  // line of sight from a to b. returns { blocked, grass, bamboo } (metres of foliage crossed)
  los(a, b, step = 0.5) {
    const d = b.clone().sub(a), L = d.length(), n = Math.max(1, Math.ceil(L / step)); const out = { blocked: false, grass: 0, bamboo: 0, bush: 0, mist: 0 };
    for (let i = 1; i < n; i++) {
      const u = i / n, x = a.x + d.x * u, y = a.y + d.y * u, z = a.z + d.z * u;
      if (this.solidAt(x, y, z)) { out.blocked = true; return out; }
      const cell = this.cellAt(x, z); if (!cell) continue;
      for (const k of cell.f) { const f = this.foliage[k]; if (y < f.top && (x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r) out[f.kind] += L / n * f.dens; }
    }
    if (this.mists && this.mistK > 0) for (const m of this.mists) {   // banks of ground mist thin out what can be seen through them
      for (let i = 1; i < n; i++) { const u = i / n, x = a.x + d.x * u, y = a.y + d.y * u, z = a.z + d.z * u; if ((x - m.x) ** 2 + (z - m.z) ** 2 < m.r * m.r && y < this.ground(x, z) + MIST.h) out.mist += L / n * MIST.dens * this.mistK; }
    }
    return out;
  }
  // camera boom clip: allowed fraction of from->to
  camClip(from, to) { const d = to.clone().sub(from), L = d.length(), n = Math.ceil(L / 0.2); for (let i = 1; i <= n; i++) { const u = i / n, x = from.x + d.x * u, y = from.y + d.y * u, z = from.z + d.z * u; if (this.solidAt(x, y - 0.25, z) || this.solidAt(x, y + 0.2, z)) return Math.max(0.12, (i - 1.5) / n); } return 1; }
  surfaceAt(x, z) {
    if (this.onBridge(x, z)) return 'wood'; if (this.inWater(x, z)) return 'water';
    for (const r of this.regions) { const dx = x - r.x, dz = z - r.z, lx = dx * r.c - dz * r.s, lz = dx * r.s + dz * r.c; if (Math.abs(lx) < r.hx && Math.abs(lz) < r.hz) return r.surface; }
    const cell = this.cellAt(x, z); if (cell) for (const k of cell.f) { const f = this.foliage[k]; if ((x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r) return f.kind; }
    return 'dirt';
  }
  // foliage cover around a point at a given height (0..1) - used for "am I hidden"
  coverAt(x, z, h) { const cell = this.cellAt(x, z); let c = 0; if (cell) for (const k of cell.f) { const f = this.foliage[k]; if (h < f.top && (x - f.x) ** 2 + (z - f.z) ** 2 < f.r * f.r) c = Math.max(c, Math.min(1, f.dens * 1.4)); } return c; }
  lightAt(x, z) { let l = 0; for (const L of this.lights) if (L.on) { const d = Math.hypot(x - L.x, z - L.z); if (d < L.r) l = Math.max(l, 1 - d / L.r); } return l; }

  // ---------- props ----------
  add(o, x, z, rot = 0, y = null) { o.position.set(x, y ?? this.ground(x, z), z); o.rotation.y = rot; o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); this.group.add(o); return o; }
  house(x, z, rot, w = 7, d = 5, opt = {}) {
    const g = new THREE.Group(), H = 2.8, y0 = this.ground(x, z);
    this.flat(x, z, w / 2 + 0.6, d / 2 + 0.6, y0, rot);
    const M = { roof: mat('roof'), black: mat('black'), wood: mat('woodDark') };
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.45, d + 0.6), mat('stone')); base.position.y = 0.2; base.receiveShadow = true; g.add(base);
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, H, d, 1, 3, 1), [mat('plaster'), mat('plaster'), mat('timber'), mat('timber'), opt.lit ? mat('shojiLit') : mat('shoji'), mat('plaster')]);
    walls.position.y = 0.45 + H / 2; walls.castShadow = walls.receiveShadow = true; grime(walls, 1.1, 0.4); g.add(walls);
    // timber frame: corner + mid posts, sill and head beams
    for (const sx of [-1, -0.33, 0.33, 1]) for (const sz of [-1, 1]) { if (Math.abs(sx) < 1 && sz < 0) continue; const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, H + 0.1, 0.2), M.wood); p.position.set(sx * w / 2, 0.45 + H / 2, sz * d / 2); p.castShadow = true; g.add(p); }
    for (const y of [0.5, 0.45 + H]) { const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, y > 1 ? 0.22 : 0.12, d + 0.3), M.wood); beam.position.y = y; g.add(beam); }
    // lattice over the front shoji + veranda (engawa) with posts
    const lat = lattice(M.wood, w * 0.62, H * 0.62, Math.round(w * 4)); lat.position.set(0, 0.45 + H * 0.5, d / 2 + 0.04); g.add(lat);
    const eng = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.08, 0.9), mat('timber')); eng.position.set(0, 0.5, d / 2 + 0.5); eng.receiveShadow = true; g.add(eng);
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.45, 0.14), M.wood); p.position.set(sx * (w / 2 + 0.1), 0.25, d / 2 + 0.85); g.add(p); }
    const roof = tiledRoof(M, w + 1.8, d + 1.8, 1.6); roof.position.y = 0.45 + H + 0.1; g.add(roof);
    if (opt.ruined) {   // collapsed: roof slumped and torn open, walls broken down, lattice gone
      roof.rotation.x = -0.32; roof.rotation.z = 0.12; roof.position.y = 0.45 + H * 0.55; roof.scale.set(0.85, 0.8, 0.7); roof.children[1].visible = false;
      walls.scale.y = 0.6; walls.position.y = 0.45 + H * 0.3; lat.visible = false;
      for (const c of g.children) if (c.geometry && c.geometry.type === 'BoxGeometry' && c !== base && c !== walls && c !== eng) c.scale.y = 0.55 + Math.random() * 0.35;
    }
    this.add(g, x, z, rot, y0);
    this.box(x, z, w / 2 + 0.15, d / 2 + 0.15, opt.ruined ? 2 : 4.8, rot);
    this.region(x, z, w / 2 + 1, d / 2 + 1, 'wood', rot);
    return g;
  }
  wall(x, z, len, rot, h = 3, opt = {}) {   // dry-stone base + plaster + tiled cap (castle / temple wall)
    const g = stoneWall({ stone: mat('lanternStone'), plaster: mat('plaster'), wood: mat('woodDark'), roof: mat('roof'), black: mat('black') }, len, h, { broken: !!opt.broken, seed: Math.abs(Math.round(x * 13 + z * 7)) + 1 });
    this.add(g, x, z, rot); this.box(x, z, len / 2, 0.6, opt.broken ? h * 0.7 : h + 0.3, rot); this.region(x, z, len / 2 + 0.6, 1.4, 'stone', rot);
    return g;
  }
  rock(x, z, s) { const m = new THREE.Mesh(rockGeo(Math.abs(Math.round(x * 7 + z * 3)) % 4), mat('rock')); m.castShadow = m.receiveShadow = true; m.scale.setScalar(s); m.scale.set(s, s * rnd(0.55, 0.85), s * 1.1); m.rotation.set(0, rnd(0, 6.3), 0); this.add(m, x, z, 0, this.ground(x, z) + s * 0.25); this.circle(x, z, s * 0.85, s * 0.9); }
  torii(x, z, rot, s = 1) {
    const g = archTorii({ red: mat('red'), black: mat('black') }, s); this.add(g, x, z, rot);
    const c = Math.cos(rot), sn = Math.sin(rot); for (const sx of [-1, 1]) this.circle(x + sx * 2.2 * s * c, z - sx * 2.2 * s * sn, 0.32 * s, 5 * s);
  }
  stoneLantern(x, z) {
    const g = archLantern({ stone: mat('lanternStone'), paper: mat('paper') }, true);
    this.add(g, x, z); this.circle(x, z, 0.38, 2);
    this.addLight(x, z, 1.5, 0xffa850, 5, 8, false);
  }
  addLight(x, z, y, color, I, r, real = true) {
    const L = { x, z, y: this.ground(x, z) + y, r: r * 1.3, on: true, light: null };
    if (real && (this.realLights = (this.realLights || 0) + 1) > WQ.lights) real = false;   // light budget per quality (each real light costs every pixel)
    if (real) { L.light = new THREE.PointLight(color, I, r, 1.6); L.light.position.set(x, L.y, z); this.group.add(L.light); }
    this.lights.push(L); return L;
  }
  // destructible paper lantern on a post (cutting it kills its light) / crate / barrel
  prop(kind, x, z, rot = 0) {
    const g = new THREE.Group(), id = this.props.length; let L = null, col = null;
    if (kind === 'lantern') {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2, 6), mat('woodDark')); post.position.y = 1; g.add(post);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.05), mat('woodDark')); arm.position.set(0.22, 1.95, 0); g.add(arm);
      const lan = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), mat('paper')); lan.scale.y = 1.3; lan.position.set(0.42, 1.65, 0); lan.name = 'lamp'; g.add(lan);
      L = this.addLight(x, z, 1.65, 0xffa04a, 7, 9); col = this.circle(x, z, 0.15, 2);
    } else if (kind === 'crate') { const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat('crate')); b.position.y = 0.45; g.add(b); col = this.box(x, z, 0.5, 0.5, 0.95, rot); }
    else if (kind === 'barrel') { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 1, 12), mat('crate')); b.position.y = 0.5; g.add(b); const h = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.025, 4, 16), mat('black')); h.rotation.x = Math.PI / 2; h.position.y = 0.7; g.add(h); col = this.circle(x, z, 0.42, 1); }
    else if (kind === 'rack') { for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6), mat('woodDark')); b.position.set(i * 0.4 - 0.4, 0.9, 0); b.rotation.z = 0.15; g.add(b); } col = this.box(x, z, 0.7, 0.2, 1.6, rot); }
    this.add(g, x, z, rot);
    g.userData.dynamic = true;   // destructible: never merged
    const p = { id, kind, x, z, y: this.ground(x, z), g, L, col, broken: false };
    this.props.push(p); return p;
  }
  // blade sweep vs props. returns ids hit (caller syncs them)
  propsHitBy(base, tip) {
    const hits = [];
    for (const p of this.props) { if (p.broken) continue; for (let s = 0.3; s <= 1; s += 0.35) { const q = base.clone().lerp(tip, s); if (Math.hypot(q.x - p.x, q.z - p.z) < (p.kind === 'lantern' ? 0.6 : 0.65) && q.y - p.y < 2.1) { hits.push(p.id); break; } } }
    return hits;
  }
  breakProp(id, fx) {
    const p = this.props[id]; if (!p || p.broken) return null; p.broken = true;
    if (p.col) p.col.on = false; if (p.L) { p.L.on = false; if (p.L.light) p.L.light.visible = false; }
    // split into falling pieces
    const pieces = [];
    p.g.traverse(m => { if (m.isMesh) pieces.push(m); });
    for (const m of pieces) { m.userData.v = new V3(rnd(-2, 2), rnd(1.5, 4), rnd(-2, 2)); m.userData.w = new V3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6)); if (m.name === 'lamp') m.material = mat('paperOff'); }
    let t = 0; const upd = dt => { t += dt; for (const m of pieces) { if (t > 2.5) continue; const v = m.userData.v; v.y -= 12 * dt; m.position.addScaledVector(v, dt); if (m.position.y < 0.1) { m.position.y = 0.1; v.multiplyScalar(0.4); v.y = Math.abs(v.y) * 0.3; } m.rotation.x += m.userData.w.x * dt * (t < 1 ? 1 : 0); m.rotation.z += m.userData.w.z * dt * (t < 1 ? 1 : 0); } return t < 3; };
    this.updaters.push(upd);
    if (fx) { const pos = new V3(p.x, p.y + 1.2, p.z); if (p.kind === 'lantern') { fx.spark(pos.setY(p.y + 1.65), 50, 4, 0xffa040, 0.8); } else fx.dust(new V3(p.x, p.y, p.z), 14); }
    return p;
  }

  // ---------- vegetation (instanced) ----------
  // trees in groves: kinds = 'matsu' or [[kind, weight], ...] (foliage.js kinds). Art rule: spruce ('pine' / 'snowpine')
  // only on winter maps — Japanese pines (matsu, bonsai), zelkova, camphor, camellia elsewhere.
  pines(list, kinds = [['matsu', 0.5], ['bonsai', 0.15], ['kusu', 0.35]]) {   // list of [x,z,s]
    const n = list.length; if (!n) return; if (typeof kinds === 'string') kinds = [[kinds, 1]];
    const tot = kinds.reduce((a, k) => a + k[1], 0), by = kinds.map(() => []);
    for (const [x, z, s] of list) { let u = ((Math.sin(x * 0.11 + 1.3) * Math.cos(z * 0.09 - 0.7) + Math.sin(x * 0.031 - z * 0.027) + 2) / 4 * 0.85 + ((x * 12.9898 + z * 78.233) % 1 + 1) % 1 * 0.15) * tot, i = 0;
      for (; i < kinds.length - 1 && u > kinds[i][1]; i++) u -= kinds[i][1];
      const k = kinds[i][0], sz = k === 'bonsai' || k === 'tsubaki' ? 0.85 : 1; by[i].push([x, this.ground(x, z), z, s * sz]); this.circle(x, z, 0.35 * s, (TREE_KINDS[k].h || 6) * s); }
    kinds.forEach(([k], i) => { if (by[i].length) forest(this.group, k, by[i]); }); return;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.3, 4, 6), mat('bark'), n);
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 2.2, 7), mat('pine'), n * 3);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(); let k = 0;
    list.forEach(([x, z, s], i) => { const y = this.ground(x, z); M.compose(new V3(x, y + 2 * s, z), q, new V3(s, s, s)); trunk.setMatrixAt(i, M);
      for (let j = 0; j < 3; j++) { M.compose(new V3(x, y + (3 + j * 1.25) * s, z), q.setFromAxisAngle(new V3(0, 1, 0), j), new V3(s * (1.25 - j * 0.3), s * 0.8, s * (1.25 - j * 0.3))); crowns.setMatrixAt(k++, M); }
      this.circle(x, z, 0.35 * s, 7 * s); });
    trunk.castShadow = crowns.castShadow = true; this.group.add(trunk, crowns);
  }
  broadleaf(list, matName = 'sakura') {
    const n = list.length; if (!n) return;
    forest(this.group, TREE_KINDS[matName] ? matName : 'green', list.map(([x, z, s]) => [x, this.ground(x, z), z, s])); for (const [x, z, s] of list) this.circle(x, z, 0.4 * s, 4 * s); return;
    const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.38, 3.6, 7), mat('bark'), n), crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(matName), n * 6);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(); let k = 0; const R = rng(n * 7 + 3);
    list.forEach(([x, z, s], i) => { const y = this.ground(x, z); M.compose(new V3(x, y + 1.8 * s, z), q, new V3(s, s, s)); trunk.setMatrixAt(i, M);
      for (let j = 0; j < 6; j++) { const r = (1.2 + R() * 0.9) * s; M.compose(new V3(x + (R() - 0.5) * 3.6 * s, y + (3.8 + R() * 2) * s, z + (R() - 0.5) * 3.6 * s), q, new V3(r, r * 0.8, r)); crowns.setMatrixAt(k++, M); }
      this.circle(x, z, 0.4 * s, 4 * s); });
    trunk.castShadow = crowns.castShadow = true; this.group.add(trunk, crowns);
  }
  bambooGrove(cx, cz, r, n, seed, clear = null) {   // dense stalks: colliders on clumps, foliage volume for LOS
    const R = rng(seed), pts = [];
    for (let i = 0; i < n; i++) { const a = R() * 6.283, d = Math.sqrt(R()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (clear && clear(x, z)) continue; pts.push([x, z]); }
    const t = tex('bamboo'); t.repeat.set(1, 5);
    const inst = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1, true), mat('bamboo'), pts.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const leaves = new THREE.InstancedMesh(tuftGeo('bamboo', 22, 1.3, 1.1, 13), foliageMat('bamboo'), Math.ceil(pts.length / 3)); leaves.customDepthMaterial = foliageDepth('bamboo'); leaves.userData.noShadow = true;
    pts.forEach(([x, z], i) => { const h = 8 + R() * 7, rr = 0.05 + R() * 0.05; e.set((R() - 0.5) * 0.1, 0, (R() - 0.5) * 0.1); q.setFromEuler(e); M.compose(new V3(x, this.ground(x, z) + h / 2, z), q, new V3(rr, h, rr)); inst.setMatrixAt(i, M);
      if (i % 3 === 0) { const s = 1.4 + R() * 1.6; M.compose(new V3(x, this.ground(x, z) + h - 1, z), q.identity(), new V3(s * 0.8, s * 0.6, s * 0.8)); leaves.setMatrixAt(i / 3, M); }
      if (i % 4 === 0) this.circle(x, z, 0.16, 9); });
    inst.castShadow = true; this.group.add(inst, leaves);
    // foliage volume tiles so LOS accumulates bamboo density
    for (let x = cx - r; x <= cx + r; x += 4) for (let z = cz - r; z <= cz + r; z += 4) if ((x - cx) ** 2 + (z - cz) ** 2 < r * r && !(clear && clear(x, z))) this.bush(x, z, 2.9, 9, 0.28, 'bamboo');
    // bamboo sways in the wind
    let tt = 0; this.updaters.push(dt => { tt += dt; inst.rotation.z = Math.sin(tt * 0.8) * 0.004 * this.wind.length(); leaves.rotation.z = inst.rotation.z * 1.5; return true; });
  }
  grassField(cx, cz, hx, hz, density, seed, clear = null) {   // tall grass: crossed alpha cards, wind-animated, hides a crouching fighter
    const R = rng(seed), pts = [];
    density = Math.round(density * WQ.grass);
    for (let i = 0; i < density; i++) { const x = cx + (R() * 2 - 1) * hx, z = cz + (R() * 2 - 1) * hz; if (clear && clear(x, z)) continue; if (this.inWater(x, z)) continue; pts.push([x, z, 0.9 + R() * 0.5, R() * 6.28]); }
    const geo = new THREE.PlaneGeometry(1.3, 1.1); geo.translate(0, 0.55, 0); const g2 = geo.clone(); g2.rotateY(Math.PI / 2);
    const merged = new THREE.BufferGeometry(); const P = [...geo.attributes.position.array, ...g2.attributes.position.array], U = [...geo.attributes.uv.array, ...g2.attributes.uv.array], N = [...geo.attributes.normal.array, ...g2.attributes.normal.array];
    merged.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); merged.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); merged.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3).clone());
    for (let i = 0; i < merged.attributes.normal.count; i++) merged.attributes.normal.setXYZ(i, 0, 1, 0);
    merged.setIndex([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5]);
    const m = new THREE.MeshStandardMaterial({ map: tex('grassBlade'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1, color: 0x9ab070 });
    const uni = { uT: { value: 0 }, uW: { value: 1 } };
    m.onBeforeCompile = sh => { sh.uniforms.uT = uni.uT; sh.uniforms.uW = uni.uW; sh.vertexShader = 'uniform float uT; uniform float uW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp = instanceMatrix * vec4(0.,0.,0.,1.); float sway = sin(uT*1.7 + wp.x*0.35 + wp.z*0.27) * 0.18 * uW * uv.y; transformed.x += sway; transformed.z += sway*0.6;'); };
    const inst = new THREE.InstancedMesh(merged, m, pts.length), M = new THREE.Matrix4(), q = new THREE.Quaternion();
    pts.forEach(([x, z, s, a], i) => { M.compose(new V3(x, this.ground(x, z) - 0.05, z), q.setFromAxisAngle(new V3(0, 1, 0), a), new V3(s, s, s)); inst.setMatrixAt(i, M); });
    inst.receiveShadow = true; this.group.add(inst);
    this.updaters.push(dt => { uni.uT.value += dt; uni.uW.value = 0.5 + this.wind.length() * 0.6; return true; });
    for (let x = cx - hx; x <= cx + hx; x += 3) for (let z = cz - hz; z <= cz + hz; z += 3) if (!(clear && clear(x, z)) && !this.inWater(x, z)) this.bush(x, z, 2.2, 1.05, 0.55, 'grass');
  }
  river(z, amp, f, width, depth, half) {
    this.water = { z, amp, f, width, depth, fords: [] }; this.hc = null;
    const geo = new THREE.PlaneGeometry(half * 2, 1, 160, 1); geo.rotateX(-Math.PI / 2); const P = geo.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), side = P.getZ(i) > 0 ? 1 : -1; P.setZ(i, z + Math.sin(x * f) * amp + side * width * 0.62); P.setY(i, -depth * 0.45); }
    geo.computeVertexNormals();
    const wt = tex('water'); wt.repeat.set(30, 2);
    const m = new THREE.MeshStandardMaterial({ color: 0x4a7a8a, roughness: 0.2, metalness: 0.25, transparent: true, opacity: 0.85, map: wt, envMapIntensity: 1.1 });
    const mesh = new THREE.Mesh(geo, m); mesh.receiveShadow = true; this.group.add(mesh);
    this.updaters.push(dt => { wt.offset.x += dt * 0.05; return true; });
  }
  bridge(x, z, rot, len, w = 2.6, h = 1.2) {
    const b = { x, z, len, w, h, c: Math.cos(rot), s: Math.sin(rot) }; this.bridges.push(b);
    const g = archBridge({ timber: mat('timber'), wood: mat('woodDark'), red: mat('red') }, len, w, h);
    g.position.set(x, 0, z); g.rotation.y = rot; this.group.add(g);
  }
  flushEdges() {   // instanced kerb stones + grass clumps collected by path()
    if (this.edgeMesh) { this.group.remove(this.edgeMesh); this.edgeMesh.dispose(); } if (this.edgeGrassMesh) { this.group.remove(this.edgeGrassMesh); this.edgeGrassMesh.dispose(); }
    if (this.edge.length) { const m = new THREE.InstancedMesh(rockGeo(1, 1), mat('rock'), this.edge.length), M = new THREE.Matrix4(), q = new THREE.Quaternion();
      this.edge.forEach(([x, y, z, s2], i) => { q.setFromAxisAngle(new V3(0, 1, 0), x * 3 + z); M.compose(new V3(x, y, z), q, new V3(s2 * 1.3, s2 * 0.6, s2)); m.setMatrixAt(i, M); });
      m.receiveShadow = true; this.group.add(m); this.edgeMesh = m; }
    if (this.edgeGrass.length) this.edgeGrassMesh = grassClumps(this.group, this.edgeGrass);
  }
  path(points, width = 2.2) {   // stone path ribbon on the terrain + 'stone' surface regions
    const t = tex('path'); t.repeat.set(1, 1);
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, z0] = points[i], [x1, z1] = points[i + 1], L = Math.hypot(x1 - x0, z1 - z0), rot = Math.atan2(x1 - x0, z1 - z0), n = Math.ceil(L / 2);
      const geo = new THREE.PlaneGeometry(width, L, 1, n); geo.rotateX(-Math.PI / 2); const P = geo.attributes.position;
      const c = Math.cos(rot), s = Math.sin(rot);
      for (let k = 0; k < P.count; k++) { const lx = P.getX(k), lz = P.getZ(k), wx = (x0 + x1) / 2 + lx * c + lz * s, wz = (z0 + z1) / 2 - lx * s + lz * c; P.setXYZ(k, wx, this.ground(wx, wz) + 0.04, wz); }
      const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * L / width);
      geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat('path')); m.receiveShadow = true; this.group.add(m);
      this.region((x0 + x1) / 2, (z0 + z1) / 2, width / 2, L / 2, 'stone', rot);
      for (let d = 0.6; d < L; d += 0.9 + ((x0 * 7 + d * 13) % 1 + 1) % 1 * 0.8) for (const sd of [-1, 1]) {
        const ex = x0 + (x1 - x0) * d / L + sd * (width / 2 + 0.15) * c, ez = z0 + (z1 - z0) * d / L - sd * (width / 2 + 0.15) * s;
        if (this.inWater(ex, ez)) continue;
        if (((ex * 3.7 + ez * 1.9) % 1 + 1) % 1 < 0.45) this.edge.push([ex, this.ground(ex, ez), ez, 0.12 + ((ex + ez) % 1 + 1) % 1 * 0.1]);
        else this.edgeGrass.push([ex + sd * 0.25 * c, this.ground(ex, ez), ez - sd * 0.25 * s, 0.7 + ((ex * 5) % 1 + 1) % 1 * 0.5]);
      }
    }
    this.flushEdges();
  }
  // ---------- navigation grid + A* (for AI hunters / enemies that must walk around houses, walls and the river) ----------
  buildNav(cell = 1.5) {
    const n = Math.ceil(this.half * 2 / cell), walk = new Uint8Array(n * n), h = this.half;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -h + (i + 0.5) * cell, z = -h + (j + 0.5) * cell; let ok = 1;
      for (const [ox, oz] of [[0, 0], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) { const px = x + ox, pz = z + oz; if (this.solidAt(px, this.ground(px, pz) + 0.9, pz)) { ok = 0; break; } }
      if (ok && this.water && this.inWater(x, z) && !this.water.fords.some(f => x > f[0] && x < f[1])) ok = 0;
      walk[j * n + i] = ok;
    }
    this.nav = { cell, n, walk };
  }
  navCell(x, z) { const N = this.nav, i = Math.floor((x + this.half) / N.cell), j = Math.floor((z + this.half) / N.cell); return [Math.max(0, Math.min(N.n - 1, i)), Math.max(0, Math.min(N.n - 1, j))]; }
  findPath(from, to) {
    if (!this.nav) this.buildNav();
    const N = this.nav, n = N.n, W = N.walk, [si, sj] = this.navCell(from.x, from.z); let [ti, tj] = this.navCell(to.x, to.z);
    if (!W[tj * n + ti]) { let best = null, bd = 1e9; for (let r = 1; r < 6 && !best; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) { const i = ti + di, j = tj + dj; if (i >= 0 && j >= 0 && i < n && j < n && W[j * n + i]) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = [i, j]; } } } if (!best) return []; [ti, tj] = best; }
    const start = sj * n + si, goal = tj * n + ti, g = new Float32Array(n * n).fill(1e9), came = new Int32Array(n * n).fill(-1), closed = new Uint8Array(n * n);
    const heap = [], push = (k, f) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top[1]; };
    const hh = k => Math.hypot(k % n - ti, Math.floor(k / n) - tj);
    g[start] = 0; push(start, hh(start)); let iter = 0;
    while (heap.length && iter++ < 20000) {
      const k = pop(); if (k === goal) break; if (closed[k]) continue; closed[k] = 1; const i = k % n, j = (k / n) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= n || b >= n) continue; const q = b * n + a; if (!W[q] || closed[q]) continue;
        if (di && dj && (!W[j * n + a] || !W[b * n + i])) continue;   // no corner cutting
        const ng = g[k] + (di && dj ? 1.414 : 1); if (ng < g[q]) { g[q] = ng; came[q] = k; push(q, ng + hh(q)); }
      }
    }
    if (came[goal] < 0 && goal !== start) return [];
    const cells = []; for (let k = goal; k !== -1 && k !== start; k = came[k]) cells.push(k); cells.reverse();
    // string-pull: drop points that are in straight walkable line of sight
    const pts = cells.map(k => new V3(-this.half + (k % n + 0.5) * N.cell, 0, -this.half + (((k / n) | 0) + 0.5) * N.cell));
    const clear = (a, b) => { const d = Math.hypot(b.x - a.x, b.z - a.z), s = Math.ceil(d / (N.cell * 0.5)); for (let t = 1; t < s; t++) { const [i, j] = this.navCell(a.x + (b.x - a.x) * t / s, a.z + (b.z - a.z) * t / s); if (!W[j * n + i]) return false; } return true; };
    const out = []; let cur = from.clone();
    for (let i = 0; i < pts.length; i++) { if (i === pts.length - 1 || !clear(cur, pts[i + 1])) { out.push(pts[i]); cur = pts[i]; } }
    if (out.length) out[out.length - 1] = to.clone();
    return out;
  }
  update(dt) { this.time += dt; this.updaters = this.updaters.filter(f => f(dt) !== false); }
  dispose() { this.scene.remove(this.group); this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
}

// ===================================================================================== weather
// kinds: 'clear' | 'rain' | 'fog' | 'snow' | 'wind' ; applied on top of a map's base look
export class Weather {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera; this.kind = 'clear'; this.t = 0;
    const N = 2200; this.N = N; this.pos = new Float32Array(N * 6); this.vel = new Float32Array(N);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8c8, transparent: true, opacity: 0.45, depthWrite: false })); this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
    const sg = new THREE.BufferGeometry(); this.spos = new Float32Array(1500 * 3); sg.setAttribute('position', new THREE.BufferAttribute(this.spos, 3));
    this.snow = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, transparent: true, opacity: 0.9, depthWrite: false })); this.snow.frustumCulled = false; this.snow.visible = false; scene.add(this.snow);
    const lg = new THREE.BufferGeometry(); this.lpos = new Float32Array(260 * 3); lg.setAttribute('position', new THREE.BufferAttribute(this.lpos, 3));
    this.leaves = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xb06a2a, size: 0.12, transparent: true, opacity: 0.9, depthWrite: false })); this.leaves.frustumCulled = false; this.leaves.visible = false; scene.add(this.leaves);
    this.seed(this.pos, N, 2, true); this.seed(this.spos, 1500, 1); this.seed(this.lpos, 260, 1);
  }
  seed(a, n, stride, rain) { const c = this.camera.position; for (let i = 0; i < n; i++) { const x = c.x + rnd(-25, 25), y = rnd(0, 18), z = c.z + rnd(-25, 25); if (rain) { a.set([x, y, z, x, y - 0.5, z], i * 6); this.vel[i] = rnd(16, 22); } else a.set([x, y, z], i * 3); } }
  set(kind) { this.kind = kind; this.rain.visible = kind === 'rain'; this.snow.visible = kind === 'snow'; this.leaves.visible = kind === 'wind'; }
  // gameplay modifiers (detection range, noise) used by stealth + AI
  get visMul() { return { fog: 0.45, rain: 0.75, snow: 0.8, wind: 1, clear: 1 }[this.kind] ?? 1; }
  get noiseMul() { return { rain: 0.55, wind: 0.75, snow: 0.85, fog: 1, clear: 1 }[this.kind] ?? 1; }
  update(dt, wind) {
    this.t += dt; const c = this.camera.position, w = wind || new V3();
    if (this.rain.visible) { const a = this.pos; for (let i = 0; i < this.N; i++) { const k = i * 6; let y = a[k + 1] - this.vel[i] * dt; let x = a[k] + w.x * dt * 2, z = a[k + 2] + w.z * dt * 2; if (y < c.y - 6 || Math.abs(x - c.x) > 26 || Math.abs(z - c.z) > 26) { x = c.x + rnd(-25, 25); z = c.z + rnd(-25, 25); y = c.y + rnd(4, 16); } a[k] = x; a[k + 1] = y; a[k + 2] = z; a[k + 3] = x - w.x * 0.03; a[k + 4] = y + 0.45; a[k + 5] = z - w.z * 0.03; } this.rain.geometry.attributes.position.needsUpdate = true; }
    for (const [pts, arr, n, fall, sway] of [[this.snow, this.spos, 1500, 0.8, 0.4], [this.leaves, this.lpos, 260, 0.6, 3]]) {
      if (!pts.visible) continue;
      for (let i = 0; i < n; i++) { const k = i * 3; let x = arr[k] + (w.x * (sway > 1 ? 4 : 1) + Math.sin(this.t + i) * sway * 0.3) * dt, y = arr[k + 1] - fall * dt, z = arr[k + 2] + (w.z * (sway > 1 ? 4 : 1) + Math.cos(this.t * 0.7 + i) * sway * 0.3) * dt;
        if (y < c.y - 4 || Math.abs(x - c.x) > 26 || Math.abs(z - c.z) > 26) { x = c.x + rnd(-25, 25); z = c.z + rnd(-25, 25); y = c.y + rnd(3, 14); } arr[k] = x; arr[k + 1] = y; arr[k + 2] = z; }
      pts.geometry.attributes.position.needsUpdate = true;
    }
  }
}
