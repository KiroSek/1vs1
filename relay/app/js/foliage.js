// Procedural vegetation shared by the duel arenas and the open maps.
// Trees = curved tube trunk + branches (one merged geometry) and a canopy of alpha-tested leaf cards whose normals point
// out of the crown (soft, rounded shading instead of faceted blobs). A few seeded prototypes per kind are drawn with
// InstancedMesh (2 draw calls per prototype). Wind is a vertex-shader sway (whole tree by height + leaf flutter), driven by
// the shared FOLIAGE uniforms that main.js ticks once per frame.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
export const FOLIAGE = { time: { value: 0 }, wind: { value: 1 } };
const FOREST_CELL = 48;   // m, spatial bucket size for forest instancing (frustum culling granularity)
// quality: share of leaf cards drawn per crown, share of grass clumps, whether leaves cast shadows
export const FOLIAGE_Q = { low: { cards: 0.6, grass: 0, shadows: false, near: 22, far: 55 }, med: { cards: 0.8, grass: 0.5, shadows: false, near: 32, far: 75 }, high: { cards: 1, grass: 1, shadows: true, near: 45, far: 100 }, ultra: { cards: 1, grass: 1, shadows: true, near: 75, far: 170 } };
const REG = { leaves: new Set(), grass: new Set() }; let QL = 'high';
function applyQ(m, kind) { const Q = FOLIAGE_Q[QL] || FOLIAGE_Q.high;
  if (kind === 'leaves') { const n = m.geometry.index.count; m.geometry.setDrawRange(0, Math.floor(n * Q.cards / 6) * 6); m.castShadow = Q.shadows && !m.userData.noShadow || (QL === 'ultra'); }
  else { m.count = Math.floor(m.userData.full * Q.grass); m.visible = m.count > 0; } }
export function setFoliageQuality(q) { QL = q; for (const m of REG.leaves) applyQ(m, 'leaves'); for (const m of REG.grass) applyQ(m, 'grass'); }
function track(m, kind) { REG[kind].add(m); m.addEventListener('removed', () => REG[kind].delete(m)); applyQ(m, kind); }
const CELLS = new Set();   // forest InstancedMeshes, culled by distance per preset
export function foliageCull(cam) {
  const Q = FOLIAGE_Q[QL] || FOLIAGE_Q.high, P = cam.position;
  for (const m of CELLS) { if (!m.parent) { CELLS.delete(m); continue; }
    if (!m.userData.c) { m.computeBoundingSphere(); m.userData.c = m.boundingSphere.center.clone().applyMatrix4(m.matrixWorld); m.userData.r = m.boundingSphere.radius; }
    const d = m.userData.c.distanceTo(P) - m.userData.r * 0.5;   // distance to the cell (roughly its near half)
    m.visible = m.userData.lod === 'far' ? d >= Q.near && d < Q.far : d < Q.near; }
}
export function foliageTick(dt, wind = 1) { FOLIAGE.time.value += dt; FOLIAGE.wind.value += (wind - FOLIAGE.wind.value) * Math.min(1, dt * 0.5); }

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
// ---------------------------------------------------------------- kinds
// leaf: atlas palette · shape: petal | leaf | needle | blade · cards: leaf cards per tree · crown: [radius, height] (m)
export const TREE_KINDS = {
  sakura: { leaf: ['#ffc6d7', '#f6a5bf', '#ffdbe6', '#ec90ae', '#fff0f4'], shape: 'petal', bark: ['#3a2822', '#4a342b'], cards: 170, card: 1.45, crown: [3.0, 1.7], h: 4.4, branches: 6, spread: 1.0, droop: 0.12 },
  maple: { leaf: ['#d24a26', '#e8702c', '#b5341c', '#f3953c', '#c95a20'], shape: 'leaf', bark: ['#3a2c26', '#4c3a30'], cards: 150, card: 1.4, crown: [2.8, 1.8], h: 4.6, branches: 6, spread: 0.95, droop: 0.05 },
  green: { leaf: ['#4d7a35', '#5f8c40', '#3e6a2e', '#6f9a48', '#557f3a'], shape: 'leaf', bark: ['#3b3128', '#4a3d31'], cards: 160, card: 1.45, crown: [3.0, 2.0], h: 5.0, branches: 6, spread: 0.9, droop: 0.04 },
  snowpine: { leaf: ['#1f3d2a', '#e9eef4', '#29492f', '#dfe7ee', '#f4f7fa'], shape: 'needle', bark: ['#3a2a22', '#47342a'], cards: 140, card: 1.55, crown: [2.2, 3.2], h: 6.2, branches: 7, spread: 0.6, droop: 0.3, conifer: true },
  momiji: { leaf: ['#7a1418', '#9a1c1e', '#5e1014', '#b02a24', '#6a1418'], shape: 'leaf', bark: ['#2a2024', '#3a2c2c'], cards: 160, card: 1.5, crown: [3.4, 1.8], h: 5.0, branches: 7, spread: 1.2, droop: 0.1 },
  bare: { leaf: ['#3a3030', '#3a3030', '#3a3030', '#3a3030'], shape: 'leaf', bark: ['#2c2626', '#3a3232'], cards: 0, card: 1, crown: [3.0, 1.6], h: 5.2, branches: 8, spread: 1.15, droop: 0.06 },
  pine: { leaf: ['#1f3d2a', '#29492f', '#1a3424', '#335a39'], shape: 'needle', bark: ['#3a2a22', '#47342a'], cards: 140, card: 1.55, crown: [2.4, 3.6], h: 7.0, branches: 7, spread: 0.6, droop: 0.25, conifer: true },
};
// ---------------------------------------------------------------- textures (cached)
const TEX = {};
const LEAF_UP = 0.5, LEAF_GLOW = 0.14;   // leaf normals bent toward the sky; fake translucency
function leafAtlas(kind) {
  if (TEX[kind]) return TEX[kind];
  const K = TREE_KINDS[kind] || TREE_KINDS[kind.replace(/^bamboo$/, 'green')] || { leaf: ['#5d8a3c', '#4f7c34', '#6e9a46'], shape: 'blade' };
  const shape = kind === 'bamboo' ? 'blade' : K.shape, pal = kind === 'bamboo' ? ['#5d8a3c', '#4f7c34', '#6e9a46', '#7aa14e'] : K.leaf;
  const R = rng(kind.length * 977);
  return TEX[kind] = canvasTex(256, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    const n = shape === 'needle' ? 260 : shape === 'blade' ? 130 : 70;
    for (let i = 0; i < n; i++) {
      // keep the cluster roughly round so the card edges never show
      const a = R() * Math.PI * 2, r = Math.sqrt(R()) * w * 0.42, px = w / 2 + Math.cos(a) * r, py = h / 2 + Math.sin(a) * r;
      const col = pal[(R() * pal.length) | 0]; x.save(); x.translate(px, py); x.rotate(R() * Math.PI * 2);
      const sh = 0.75 + R() * 0.35; x.fillStyle = col; x.globalAlpha = 1;
      if (shape === 'petal') {           // five-petal blossom
        const s = 7 + R() * 6; for (let k = 0; k < 5; k++) { x.rotate(Math.PI * 2 / 5); x.beginPath(); x.ellipse(0, -s * 0.55, s * 0.36, s * 0.6, 0, 0, Math.PI * 2); x.fill(); }
        x.fillStyle = '#c0506e'; x.beginPath(); x.arc(0, 0, s * 0.16, 0, 6.3); x.fill();
      } else if (shape === 'leaf') {     // pointed leaf with a darker midrib
        const s = 9 + R() * 8; x.beginPath(); x.moveTo(0, -s); x.quadraticCurveTo(s * 0.6, 0, 0, s); x.quadraticCurveTo(-s * 0.6, 0, 0, -s); x.fill();
        x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -s); x.lineTo(0, s); x.stroke();
      } else if (shape === 'needle') {   // pine needle tufts
        x.strokeStyle = col; x.lineWidth = 1.6; const s = 10 + R() * 8; for (let k = 0; k < 6; k++) { x.rotate(0.35); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -s); x.stroke(); }
      } else {                           // bamboo blades: long narrow leaves
        const s = 24 + R() * 16; x.beginPath(); x.moveTo(0, -s); x.quadraticCurveTo(s * 0.22, 0, 0, s * 0.25); x.quadraticCurveTo(-s * 0.22, 0, 0, -s); x.fill();
      }
      // a touch of shading per leaf
      x.globalCompositeOperation = 'source-atop'; x.fillStyle = `rgba(0,0,0,${(1 - sh) * 0.6})`; x.fillRect(-30, -30, 60, 60); x.globalCompositeOperation = 'source-over';
      x.restore();
    }
  });
}
function barkTex(K) {
  const k = 'bark' + K.bark.join(); if (TEX[k]) return TEX[k]; const R = rng(91);
  const t = TEX[k] = canvasTex(64, 256, (x, w, h) => {
    x.fillStyle = K.bark[0]; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) { x.fillStyle = R() < 0.5 ? K.bark[1] : 'rgba(0,0,0,.35)'; x.fillRect(R() * w, R() * h, 1 + R() * 3, 8 + R() * 40); }
    for (let i = 0; i < 25; i++) { x.fillStyle = 'rgba(120,130,90,.25)'; x.beginPath(); x.ellipse(R() * w, R() * h, 2 + R() * 5, 3 + R() * 9, 0, 0, 6.3); x.fill(); }   // lichen
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
// ---------------------------------------------------------------- wind shader
function windify(mat, leaf) {
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = FOLIAGE.time; sh.uniforms.uWind = FOLIAGE.wind;
    sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 wp0v = vec4(0.0, 0.0, 0.0, 1.0);
#ifdef USE_INSTANCING
        wp0v = instanceMatrix * wp0v;
#endif
        vec3 wp0 = (modelMatrix * wp0v).xyz;
        float ph = wp0.x * 0.37 + wp0.z * 0.29, hk = max(0.0, transformed.y - 0.8);
        float sway = (sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.25) * uWind * 0.018 * hk * hk;
        transformed.x += sway; transformed.z += sway * 0.6;
        ${leaf ? 'transformed += normal * sin(uTime * 4.2 + ph * 3.0 + transformed.x * 2.1 + transformed.y * 1.7) * 0.035 * uWind;' : ''}
      }`);
  };
  mat.customProgramCacheKey = () => leaf ? 'kd-leaf' : 'kd-bark';
  return mat;
}
const MATS = {};
function leafMat(kind) {
  if (MATS['l' + kind]) return MATS['l' + kind];
  const m = windify(new THREE.MeshStandardMaterial({ map: leafAtlas(kind), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0, emissive: 0xffffff, emissiveMap: leafAtlas(kind), emissiveIntensity: LEAF_GLOW }), true);   // emissive = cheap light-through-leaves so backlit crowns don't go black
  return MATS['l' + kind] = m;
}
function leafDepth(kind) { return MATS['d' + kind] || (MATS['d' + kind] = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafAtlas(kind), alphaTest: 0.45 })); }
function barkMat(K) { const k = 'b' + K.bark.join(); return MATS[k] || (MATS[k] = windify(new THREE.MeshStandardMaterial({ map: barkTex(K), roughness: 0.95 }), false)); }
// ---------------------------------------------------------------- geometry builders
function tube(points, r0, r1, seg, rad = 6) {
  const curve = new THREE.CatmullRomCurve3(points), g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  // taper: scale every ring from r0 to r1 around the curve
  const pos = g.attributes.position, uv = g.attributes.uv, P = new V3(), C = new V3();
  for (let i = 0; i <= seg; i++) { const u = i / seg, r = r0 + (r1 - r0) * u; curve.getPointAt(u, C);
    for (let j = 0; j <= rad; j++) { const k = i * (rad + 1) + j; P.fromBufferAttribute(pos, k).sub(C).multiplyScalar(r).add(C); pos.setXYZ(k, P.x, P.y, P.z); uv.setXY(k, uv.getX(k), u * curve.getLength() * 0.6); } }
  g.computeVertexNormals(); return g;
}
// one quad leaf card at p, random orientation, normal pushed outwards from the crown centre for soft lighting
function card(out, p, size, center, R, atlasQ) {
  const n = new V3(R() - 0.5, R() * 0.8 - 0.2, R() - 0.5).normalize(), t = new V3(0, 1, 0).cross(n); if (t.lengthSq() < 1e-4) t.set(1, 0, 0); t.normalize();
  const b = n.clone().cross(t).normalize(), s = size * (0.7 + R() * 0.6), h = s / 2;
  const sn = p.clone().sub(center).normalize().lerp(new V3(0, 1, 0), LEAF_UP).normalize();
  const corners = [[-h, -h], [h, -h], [h, h], [-h, h]], u0 = (atlasQ & 1) * 0.5, v0 = (atlasQ >> 1) * 0.5;
  const base = out.pos.length / 3;
  for (const [a, c] of corners) { const q = p.clone().addScaledVector(t, a).addScaledVector(b, c); out.pos.push(q.x, q.y, q.z); out.nrm.push(sn.x, sn.y, sn.z); }
  out.uv.push(u0, v0, u0 + 0.5, v0, u0 + 0.5, v0 + 0.5, u0, v0 + 0.5);
  out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
}
function cardsGeo(out) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2)); g.setIndex(out.idx); return g;
}
// a full tree prototype: { wood, leaves } geometries in tree space (base at origin)
const PROTO = {};
export function treeProto(kind, variant = 0) {
  const key = kind + variant; if (PROTO[key]) return PROTO[key];
  const K = TREE_KINDS[kind], R = rng(kind.length * 131 + variant * 7919 + 17), wood = [], tips = [];
  const H = K.h * (0.9 + R() * 0.2), lean = new V3(R() - 0.5, 0, R() - 0.5).multiplyScalar(0.5);
  const trunkPts = [0, 0.33, 0.66, 1].map(u => new V3(lean.x * u * u + (R() - 0.5) * 0.15 * u, H * u, lean.z * u * u + (R() - 0.5) * 0.15 * u));
  wood.push(tube(trunkPts, 0.36 * (K.conifer ? 0.8 : 1), 0.12, 5, 5));
  // root flare
  for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + R(); wood.push(tube([new V3(0, 0.5, 0), new V3(Math.cos(a) * 0.45, 0.12, Math.sin(a) * 0.45), new V3(Math.cos(a) * 0.8, -0.05, Math.sin(a) * 0.8)], 0.16, 0.05, 3, 4)); }
  const top = trunkPts[3], nb = K.branches;
  for (let i = 0; i < nb; i++) {
    const u = K.conifer ? 0.3 + 0.65 * i / nb : 0.55 + R() * 0.35, a = i * 2.39996 + R() * 0.5;
    const o = new THREE.CatmullRomCurve3(trunkPts).getPointAt(u);
    const len = (K.conifer ? (1 - u) * 2.6 + 0.4 : 1.6 + R() * 1.4) * K.spread;
    const dir = new V3(Math.cos(a), K.conifer ? -K.droop : 0.55 + R() * 0.4, Math.sin(a)).normalize();
    const mid = o.clone().addScaledVector(dir, len * 0.55), end = o.clone().addScaledVector(dir, len); end.y -= len * K.droop;
    wood.push(tube([o, mid, end], 0.12 * (1 - u * 0.5), 0.03, 4, 4));
    tips.push(end);
    if (!K.conifer) for (let j = 0; j < 1; j++) { const d2 = dir.clone().add(new V3(R() - 0.5, R() * 0.6, R() - 0.5)).normalize(); const e2 = mid.clone().addScaledVector(d2, len * 0.5); wood.push(tube([mid, mid.clone().lerp(e2, 0.5), e2], 0.05, 0.015, 3, 3)); tips.push(e2); }
  }
  tips.push(top.clone());
  // canopy: leaf cards clustered around branch tips (cone of tiers for conifers)
  const out = { pos: [], nrm: [], uv: [], idx: [] }, center = new V3(top.x, K.conifer ? H * 0.55 : H - K.crown[1] * 0.2, top.z);
  for (let i = 0; i < K.cards; i++) {
    let p;
    if (K.conifer) { const u = R(), y = H * (0.25 + 0.8 * u), rr = K.crown[0] * (1 - u) * Math.sqrt(R()) + 0.2, a = R() * Math.PI * 2; p = new V3(top.x * u + Math.cos(a) * rr, y, top.z * u + Math.sin(a) * rr); }
    else { const tp = tips[(R() * tips.length) | 0], r = K.crown[0] * 0.55; p = tp.clone().add(new V3((R() - 0.5) * r * 2, (R() - 0.35) * K.crown[1], (R() - 0.5) * r * 2)); }
    card(out, p, K.card, center, R, (R() * 4) | 0);
  }
  const woodG = mergeGeometries(wood.map(g => g.index ? g.toNonIndexed() : g)); woodG.computeVertexNormals();
  return PROTO[key] = { wood: woodG, leaves: cardsGeo(out), height: H, crown: K.crown };
}
// far LOD: bare trunk + a few large cards in the same crown volume (~1/7 of the triangles)
const LOW = {};
function treeLow(kind, v) {
  const key = kind + v; if (LOW[key]) return LOW[key];
  const K = TREE_KINDS[kind], P = treeProto(kind, v), R = rng(kind.length * 17 + v * 31 + 5), out = { pos: [], nrm: [], uv: [], idx: [] };
  const H = P.height, center = new V3(0, K.conifer ? H * 0.55 : H - K.crown[1] * 0.2, 0);
  for (let i = 0; i < Math.round(K.cards * 0.25); i++) {
    let p; if (K.conifer) { const u = R(), rr = K.crown[0] * (1 - u) * 0.8 + 0.2, a = R() * 6.283; p = new V3(Math.cos(a) * rr, H * (0.3 + 0.75 * u), Math.sin(a) * rr); }
    else { const a = R() * 6.283, rr = Math.sqrt(R()) * K.crown[0] * 0.95; p = center.clone().add(new V3(Math.cos(a) * rr, (R() - 0.4) * K.crown[1] * 1.3, Math.sin(a) * rr)); }
    card(out, p, K.card * 2.1, center, R, (R() * 4) | 0);
  }
  const wood = tube([new V3(0, 0, 0), new V3(0, H * 0.5, 0), new V3(0, H * 0.85, 0)], 0.34, 0.1, 3, 5);
  return LOW[key] = { wood, leaves: cardsGeo(out) };
}
// ---------------------------------------------------------------- placement
// list: [[x, y, z, scale, rotY?], ...]. Returns the meshes (already added to group).
export function forest(group, kind, list, { variants = 3, shadows = true } = {}) {
  if (!list.length) return [];
  const K = TREE_KINDS[kind], meshes = [];
  // bucket by variant AND by a coarse spatial cell, so each InstancedMesh has a tight bounding sphere and whole
  // patches of forest behind the camera are frustum-culled (one mesh per variant for the whole map never is)
  const cells = new Map(); list.forEach((t, i) => { const key = (i % variants) + ':' + Math.floor(t[0] / FOREST_CELL) + ':' + Math.floor(t[2] / FOREST_CELL); if (!cells.has(key)) cells.set(key, []); cells.get(key).push(t); });
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new V3(0, 1, 0);
  cells.forEach((items, key) => {
    const v = +key.split(':')[0]; if (!items.length) return; const P = treeProto(kind, v);
    const wood = new THREE.InstancedMesh(P.wood, barkMat(K), items.length), leaves = new THREE.InstancedMesh(P.leaves, leafMat(kind), items.length);
    leaves.customDepthMaterial = leafDepth(kind);
    items.forEach(([x, y, z, s = 1, ry], i) => { q.setFromAxisAngle(Y, ry ?? (x * 12.9898 + z * 78.233) % (Math.PI * 2)); M.compose(new V3(x, y, z), q, new V3(s, s, s)); wood.setMatrixAt(i, M); leaves.setMatrixAt(i, M); });
    wood.castShadow = leaves.castShadow = shadows; wood.receiveShadow = leaves.receiveShadow = true;
    wood.computeBoundingSphere(); leaves.computeBoundingSphere();
    group.add(wood, leaves); meshes.push(wood, leaves); track(leaves, 'leaves'); CELLS.add(wood); CELLS.add(leaves);
    // far LOD twin of this cell (same instance matrices)
    const LP = treeLow(kind, v), w2 = new THREE.InstancedMesh(LP.wood, barkMat(K), items.length), l2 = new THREE.InstancedMesh(LP.leaves, leafMat(kind), items.length);
    for (let i = 0; i < items.length; i++) { wood.getMatrixAt(i, M); w2.setMatrixAt(i, M); l2.setMatrixAt(i, M); }
    w2.castShadow = l2.castShadow = false; w2.receiveShadow = l2.receiveShadow = true; w2.userData.lod = l2.userData.lod = 'far'; w2.visible = l2.visible = false;
    w2.computeBoundingSphere(); l2.computeBoundingSphere(); group.add(w2, l2); meshes.push(w2, l2); CELLS.add(w2); CELLS.add(l2);
  });
  return meshes;
}
// bamboo crown tuft (used per stalk top) and grass clumps
export function tuftGeo(kind = 'bamboo', cards = 26, r = 1.1, h = 1.2, seed = 5) {
  const R = rng(seed), out = { pos: [], nrm: [], uv: [], idx: [] }, c = new V3(0, 0, 0);
  for (let i = 0; i < cards; i++) card(out, new V3((R() - 0.5) * r * 2, (R() - 0.3) * h, (R() - 0.5) * r * 2), 1.3, c, R, (R() * 4) | 0);
  return cardsGeo(out);
}
export function foliageMat(kind) { return leafMat(kind); }
export function foliageDepth(kind) { return leafDepth(kind); }
// grass: clumps of crossed blade cards. pts: [[x, y, z, s], ...]
function grassTex(cols) {
  const k = 'g' + cols.join(); if (TEX[k]) return TEX[k]; const R = rng(33);
  return TEX[k] = canvasTex(128, 128, (x, w, h) => {
    for (let i = 0; i < 70; i++) { const bx = 8 + R() * (w - 16), bh = h * (0.35 + R() * 0.6), lean = (R() - 0.5) * 22; x.strokeStyle = cols[(R() * cols.length) | 0]; x.lineWidth = 1.5 + R() * 2;
      x.beginPath(); x.moveTo(bx, h); x.quadraticCurveTo(bx + lean * 0.3, h - bh * 0.6, bx + lean, h - bh); x.stroke(); }
  });
}
// susuki / pampas: tall stems with silvery feathered plumes bowing one way (Ashina reed fields). Two crossed cards per clump,
// instanced, swayed by the same wind as the grass; the plumes catch the moonlight
function pampasTex() {
  const k = 'pampas2'; if (TEX[k]) return TEX[k]; const R = rng(71);
  return TEX[k] = canvasTex(128, 256, (x, w, h) => {
    for (let i = 0; i < 34; i++) { const bx = 4 + R() * (w - 8), bh = h * (0.18 + R() * 0.38), lean = (R() - 0.5) * 40; x.strokeStyle = ['#3c5628', '#4c6630', '#5a7236', '#6a7a3a', '#304a22'][(R() * 5) | 0]; x.lineWidth = 1.6 + R() * 2.2;   // green blades
      x.beginPath(); x.moveTo(bx, h); x.quadraticCurveTo(bx + lean * 0.3, h - bh * 0.6, bx + lean, h - bh); x.stroke(); }
    for (let i = 0; i < 5; i++) {   // stems ending in a bowed silver feather (susuki plume)
      const bx = 12 + (i + R() * 0.8) * (w - 24) / 5, ty = h * (0.14 + R() * 0.22), bend = 22 + R() * 20, sx = bx + bend * 0.25;
      x.strokeStyle = '#a49a74'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(bx, h); x.quadraticCurveTo(bx + 1, h * 0.55, sx, ty + 4); x.stroke();
      const L = 46 + R() * 22;   // the plume: a spine bowing over to one side, fine barbs both sides, tapering to the tip
      for (let j = 0; j <= 30; j++) { const t = j / 30, ang = -1.45 + t * 1.75, px = sx + Math.cos(ang) * L * t * 0.75 + t * bend * 0.4, py = ty - Math.sin(-ang) * L * t * 0.55 + t * t * 26, wd = (1 - t * 0.85) * (7 + R() * 3);
        for (const sd of [-1, 1]) { x.strokeStyle = `rgba(${232 - R() * 22},${228 - R() * 20},${214 - R() * 24},${0.55 + R() * 0.4})`; x.lineWidth = 1 + R() * 1.2;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + sd * wd * 0.5 + 3, py + wd * 0.9); x.stroke(); } }
    }
  });
}
export function pampas(group, pts, { size = 1.2 } = {}) {
  if (!pts.length) return null;
  const out = { pos: [], nrm: [], uv: [], idx: [] };
  for (let a = 0; a < 2; a++) { const t = new V3(Math.cos(a * Math.PI / 2 + 0.4), 0, Math.sin(a * Math.PI / 2 + 0.4)), base = out.pos.length / 3, h = size * 0.38;
    for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { out.pos.push(t.x * u * h, v * size, t.z * u * h); out.nrm.push(0, 1, 0); }
    out.uv.push(0, 0, 1, 0, 1, 1, 0, 1); out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); }
  const g = cardsGeo(out), m = windify(new THREE.MeshStandardMaterial({ map: pampasTex(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.85 }), true);
  const mesh = new THREE.InstancedMesh(g, m, pts.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new V3(0, 1, 0);
  pts.forEach(([x, y, z, s = 1], i) => { q.setFromAxisAngle(Y, (x * 3.1 + z * 7.7) % 6.28); M.compose(new V3(x, y, z), q, new V3(s, s * (0.6 + ((x * 13.1 + z) % 1 + 1) % 1 * 0.75), s)); mesh.setMatrixAt(i, M); });
  mesh.receiveShadow = true; mesh.userData.full = pts.length; group.add(mesh); track(mesh, 'grass'); return mesh;
}
export function grass(group, pts, cols = ['#5d7a3a', '#6e8a42', '#4c6a30', '#879a4e', '#6a7a3a'], { size = 0.7 } = {}) {
  if (!pts.length) return null;
  const out = { pos: [], nrm: [], uv: [], idx: [] };
  for (let a = 0; a < 3; a++) {   // three crossed vertical cards per clump
    const t = new V3(Math.cos(a * Math.PI / 3), 0, Math.sin(a * Math.PI / 3)), base = out.pos.length / 3, h = size / 2;
    for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { out.pos.push(t.x * u * h, v * size * 0.8, t.z * u * h); out.nrm.push(0, 1, 0); }
    out.uv.push(0, 0, 1, 0, 1, 1, 0, 1); out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = cardsGeo(out), m = windify(new THREE.MeshStandardMaterial({ map: grassTex(cols), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1 }), true);
  const mesh = new THREE.InstancedMesh(g, m, pts.length), M = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new V3(0, 1, 0);
  pts.forEach(([x, y, z, s = 1], i) => { q.setFromAxisAngle(Y, (x * 3.1 + z * 7.7) % 6.28); M.compose(new V3(x, y, z), q, new V3(s, s * (0.8 + ((x * 13.1 + z) % 1 + 1) % 1 * 0.5), s)); mesh.setMatrixAt(i, M); });
  mesh.receiveShadow = true; mesh.userData.full = pts.length; group.add(mesh); track(mesh, 'grass'); return mesh;
}
