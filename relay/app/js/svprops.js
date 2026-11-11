// Survival arena props (low-poly, built from the World kit's shared materials so bakeStatic merges them):
// covered galleries, training posts, fences, Jizo statues, market stalls, carts, a well, boats, piers, net racks,
// cliff walls of piled rock, stepping stones, a polished slab floor. Each one adds its own colliders to the world.
import * as THREE from 'three';
import { mat } from './world.js';
import { tiledRoof, rockGeo } from './arch.js';

const C = {};   // extra flat colours, shared per colour so merging still works
const col = (hex, rough = 0.85, o = {}) => C[hex + ':' + rough] || (C[hex + ':' + rough] = Object.assign(new THREE.MeshStandardMaterial({ color: hex, roughness: rough, flatShading: true, ...o }), { userData: { shared: true } }));
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
const cyl = (r0, r1, h, m, x = 0, y = 0, z = 0, seg = 8) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
const roofMats = () => ({ roof: mat('roof'), black: mat('black'), wood: mat('woodDark') });

// polished stone slab floor (dojo / courtyard): soft, rough-ish gloss instead of a mirror (roughness 0.5, weak env)
export const FLOOR = { rough: 0.52, env: 0.35 };
let slabMat = null;
export function slabFloor(W, x, z, hx, hz, y = 0.02) {
  if (!slabMat) { const t = slabTex(); slabMat = new THREE.MeshStandardMaterial({ map: t, roughness: FLOOR.rough, metalness: 0, envMapIntensity: FLOOR.env }); slabMat.userData.shared = true; }
  const g = new THREE.PlaneGeometry(hx * 2, hz * 2, 1, 1); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * hx / 2, uv.getY(i) * hz / 2);   // one tile texture = 4 m
  const m = new THREE.Mesh(g, slabMat); m.receiveShadow = true; m.position.set(x, W.ground(x, z) + y, z); W.group.add(m);
  W.region(x, z, hx, hz, 'stone');
}
function slabTex() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  x.fillStyle = '#6e6a62'; x.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { const v = 96 + ((i * 7 + j * 13) % 5) * 7; x.fillStyle = `rgb(${v + 6},${v + 2},${v - 4})`; x.fillRect(i * 64 + 2, j * 64 + 2, 60, 60);
    for (let k = 0; k < 40; k++) { x.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`; x.fillRect(i * 64 + 2 + Math.random() * 58, j * 64 + 2 + Math.random() * 58, 2 + Math.random() * 4, 1 + Math.random() * 2); } }
  x.strokeStyle = 'rgba(30,26,22,.9)'; x.lineWidth = 3; for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(k * 64, 0); x.lineTo(k * 64, 256); x.stroke(); x.beginPath(); x.moveTo(0, k * 64); x.lineTo(256, k * 64); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// covered gallery (rōka): raised plank floor, posts every ~2.4 m, tiled roof. Only the posts and the outer rail block.
export function gallery(W, x, z, len, rot, { depth = 2.6, rail = true } = {}) {
  const g = new THREE.Group(), n = Math.max(2, Math.round(len / 2.4)), wood = mat('woodDark');
  const deck = box(len, 0.12, depth, mat('timber'), 0, 0.42, 0); g.add(deck);
  for (const s of [-1, 1]) for (let i = 0; i <= n; i++) { const px = -len / 2 + i * len / n; g.add(box(0.2, 2.9, 0.2, wood, px, 1.45, s * (depth / 2 - 0.15))); }
  const beam = box(len + 0.3, 0.22, depth, wood, 0, 2.95, 0); g.add(beam);
  const roof = tiledRoof(roofMats(), len + 1, depth + 1.6, 0.8); roof.position.y = 3.05; g.add(roof);
  if (rail) for (let i = 0; i < n; i++) { const px = -len / 2 + (i + 0.5) * len / n; if (i === (n >> 1)) continue; g.add(box(len / n - 0.25, 0.08, 0.08, wood, px, 1.05, depth / 2 - 0.15)); }
  W.add(g, x, z, rot); W.flat(x, z, len / 2, depth / 2, W.ground(x, z) + 0.47, rot); W.region(x, z, len / 2, depth / 2, 'wood', rot);
  const c = Math.cos(rot), sn = Math.sin(rot);
  for (const s of [-1, 1]) for (let i = 0; i <= n; i++) { const lx = -len / 2 + i * len / n, lz = s * (depth / 2 - 0.15); W.circle(x + lx * c + lz * sn, z - lx * sn + lz * c, 0.16, 3); }
  return g;
}
// makiwara: straw-wrapped training post
export function makiwara(W, x, z) {
  const g = new THREE.Group(); g.add(cyl(0.09, 0.11, 1.8, mat('woodDark'), 0, 0.9, 0, 6));
  g.add(cyl(0.16, 0.16, 0.7, mat('straw'), 0, 1.2, 0, 7)); for (const y of [0.9, 1.5]) g.add(cyl(0.17, 0.17, 0.05, col(0x2a1e14), 0, y, 0, 7));
  W.add(g, x, z); W.circle(x, z, 0.2, 1.8); return g;
}
// low wooden fence / barricade (cover you can see over)
export function fence(W, x, z, len, rot, h = 0.95) {
  const g = new THREE.Group(), wood = mat('woodDark'), n = Math.max(2, Math.round(len / 1.2));
  for (let i = 0; i <= n; i++) g.add(box(0.12, h, 0.12, wood, -len / 2 + i * len / n, h / 2, 0));
  for (const y of [h * 0.4, h * 0.85]) g.add(box(len, 0.1, 0.06, mat('timber'), 0, y, 0));
  W.add(g, x, z, rot); W.box(x, z, len / 2, 0.12, h, rot); return g;
}
// Jizo statue: rounded stone body, head, red bib and cap; stands on a small base
export function jizo(W, x, z, rot = 0, s = 1) {
  const g = new THREE.Group(), st = col(0x8c8a82, 0.95), red = col(0xb02a20, 0.9);
  g.add(box(0.5 * s, 0.18 * s, 0.45 * s, st, 0, 0.09 * s, 0));
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.16 * s, 0.32 * s, 2, 7), st); body.position.y = 0.48 * s; body.castShadow = true; g.add(body);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 * s, 1), st); head.position.y = 0.86 * s; head.castShadow = true; g.add(head);
  const bib = new THREE.Mesh(new THREE.ConeGeometry(0.2 * s, 0.24 * s, 7, 1, true), red); bib.position.set(0, 0.6 * s, 0.02 * s); bib.material.side = THREE.DoubleSide; g.add(bib);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135 * s, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), red); cap.position.y = 0.88 * s; g.add(cap);
  W.add(g, x, z, rot); W.circle(x, z, 0.28 * s, 1 * s); return g;
}
// candle cluster on a stone (little warm light, cheap: counted against the light budget like lanterns)
export function candles(W, x, z, real = false) {
  const g = new THREE.Group(); g.add(box(0.5, 0.15, 0.3, col(0x5a5650, 0.95), 0, 0.07, 0));
  for (const [cx, h] of [[-0.15, 0.16], [0, 0.22], [0.14, 0.13]]) { g.add(cyl(0.025, 0.025, h, col(0xeee4d0, 0.9), cx, 0.15 + h / 2, 0, 5)); const f = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.05, 5), mat('paper')); f.position.set(cx, 0.17 + h, 0); g.add(f); }
  W.add(g, x, z); W.addLight(x, z, 0.5, 0xffa040, 2.5, 5, real); return g;
}
// market stall (yatai): counter, four posts, a sloped cloth awning, goods on the counter
export function stall(W, x, z, rot, cloth = 0x2a4a7a) {
  const g = new THREE.Group(), wood = mat('woodDark'), cl = col(cloth, 0.95, { side: THREE.DoubleSide });
  g.add(box(2.4, 0.9, 1.0, mat('crate'), 0, 0.45, 0));
  for (const sx of [-1.15, 1.15]) for (const sz of [-0.45, 0.45]) g.add(box(0.09, sz < 0 ? 2.3 : 2.0, 0.09, wood, sx, sz < 0 ? 1.15 : 1.0, sz));
  const aw = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.6), cl); aw.rotation.x = -Math.PI / 2 + 0.35; aw.position.set(0, 2.15, 0.15); aw.castShadow = true; g.add(aw);
  for (let i = 0; i < 4; i++) g.add(box(0.36, 0.22, 0.3, col([0x8a5a2a, 0x3a5a2a, 0xb08a4a, 0x6a2a1a][i]), -0.85 + i * 0.57, 1.01, 0));   // baskets of goods
  const n = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), cl); n.position.set(0, 1.85, 0.62); g.add(n);   // noren strip
  W.add(g, x, z, rot); W.box(x, z, 1.25, 0.55, 1.0, rot); W.region(x, z, 1.4, 0.8, 'wood', rot); return g;
}
// two-wheeled hand cart (daihachi-guruma) loaded with sacks
export function cart(W, x, z, rot, tilt = 0) {
  const g = new THREE.Group(), wood = mat('timber');
  const bed = box(2.2, 0.12, 1.2, wood, 0, 0.75, 0); bed.rotation.z = tilt; g.add(bed);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 5, 12), mat('woodDark')); w.position.set(0, 0.58, s * 0.66); g.add(w); const sp = box(0.06, 1.0, 0.06, mat('woodDark'), 0, 0.58, s * 0.66); sp.rotation.z = 0.8; g.add(sp); }
  for (const s of [-1, 1]) { const h = box(1.6, 0.07, 0.07, mat('woodDark'), 1.7, 0.6, s * 0.4); h.rotation.z = 0.25; g.add(h); }
  for (let i = 0; i < 3; i++) { const sk = new THREE.Mesh(new THREE.SphereGeometry(0.3, 6, 4), col(0xb89a68)); sk.scale.set(1.2, 0.7, 0.9); sk.position.set(-0.6 + i * 0.55, 1.0, (i % 2) * 0.2 - 0.1); sk.castShadow = true; g.add(sk); }
  W.add(g, x, z, rot); W.box(x, z, 1.15, 0.7, 1.25, rot); return g;
}
// stone well with a roof
export function well(W, x, z) {
  const g = new THREE.Group(); g.add(cyl(0.75, 0.8, 0.8, mat('lanternStone'), 0, 0.4, 0, 10)); g.add(cyl(0.6, 0.6, 0.05, col(0x10181c, 0.2), 0, 0.72, 0, 10));
  for (const s of [-1, 1]) g.add(box(0.1, 2.0, 0.1, mat('woodDark'), s * 0.7, 1.0, 0));
  const r = tiledRoof(roofMats(), 1.9, 1.5, 0.45); r.position.y = 2.0; g.add(r);
  W.add(g, x, z); W.circle(x, z, 0.85, 1); return g;
}
// beached fishing boat (cover), optionally broken
export function boat(W, x, z, rot, broken = false) {
  const g = new THREE.Group(), wood = col(0x5a4632, 0.9);
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 4.2, 8, 1, true, Math.PI, Math.PI), wood); hull.material.side = THREE.DoubleSide; hull.rotation.z = Math.PI / 2; hull.scale.set(1, 1, 0.75); hull.position.y = 0.72; hull.castShadow = true; g.add(hull);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.ConeGeometry(0.56, 0.8, 4), wood); p.rotation.z = -s * Math.PI / 2; p.rotation.y = Math.PI / 4; p.position.set(s * 2.45, 0.6, 0); p.scale.set(1, 1, 1.3); g.add(p); }
  for (let i = -1; i <= 1; i++) g.add(box(0.12, 0.06, 1.1, mat('timber'), i * 1.1, 0.68, 0));
  if (!broken) { g.add(box(0.07, 2.4, 0.07, mat('woodDark'), 0.4, 1.8, 0)); }
  g.rotation.z = broken ? 0.3 : 0.08;
  W.add(g, x, z, rot); W.box(x, z, 2.3, 0.62, 1.0, rot); return g;
}
// plank pier on posts, walkable over water (uses the world's bridge deck so the ground rises onto it)
export function pier(W, x, z, rot, len, w = 2.2, broken = 0, deckY = 0.84) {
  const g = new THREE.Group(), n = Math.round(len / 0.5);
  for (let i = 0; i < n; i++) { if (broken && i > n - broken && i % 2) continue; const pl = box(w, 0.08, 0.42, mat('timber'), 0, 0.78 + ((i * 7) % 3) * 0.015, -len / 2 + (i + 0.5) * len / n); pl.rotation.z = ((i * 13) % 5 - 2) * 0.01; g.add(pl); }
  for (let i = 0; i <= Math.round(len / 2.5); i++) for (const s of [-1, 1]) g.add(cyl(0.1, 0.12, 2.4, mat('woodDark'), s * (w / 2 - 0.1), -0.2, -len / 2 + i * 2.5, 6));
  W.add(g, x, z, rot, deckY - 0.84); W.bridges.push({ x, z, len: len - broken * 0.5, w, h: deckY, c: Math.cos(rot + Math.PI / 2), s: Math.sin(rot + Math.PI / 2), flat: true });
  W.region(x, z, w / 2, len / 2, 'wood', rot); return g;
}
// drying rack for fishing nets
export function netRack(W, x, z, rot) {
  const g = new THREE.Group(), net = col(0x4a4a3a, 1, { transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  for (const s of [-1, 1]) g.add(cyl(0.05, 0.06, 2.2, mat('woodDark'), s * 1.4, 1.1, 0, 5));
  { const bar = cyl(0.04, 0.04, 3, mat('woodDark'), 0, 2.1, 0, 5); bar.rotation.z = Math.PI / 2; g.add(bar); }
  const n = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 1.6, 6, 3), net); n.position.y = 1.3; const p = n.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 2) * 0.08 + (1 - (p.getY(i) + 0.8) / 1.6) * 0.15); n.geometry.computeVertexNormals(); g.add(n);
  W.add(g, x, z, rot); const c = Math.cos(rot), sn = Math.sin(rot); for (const s of [-1, 1]) W.circle(x + s * 1.4 * c, z - s * 1.4 * sn, 0.12, 2.2); return g;
}
// driftwood / fallen log
export function log(W, x, z, rot, len = 3) {
  const m = cyl(0.22, 0.28, len, mat('bark'), 0, 0.22, 0, 7); m.rotation.z = Math.PI / 2; const g = new THREE.Group(); g.add(m);
  W.add(g, x, z, rot); W.box(x, z, len / 2, 0.3, 0.5, rot); return g;
}
// tall crag (cliff piece): stretched boulder in a darker stone, deterministic shape, collider to its full height
export const CRAG = { dark: 0x5c574e, mid: 0x7a7468 };
export function crag(W, R, x, z, s, tone = CRAG.dark) {
  const m = new THREE.Mesh(rockGeo((R() * 4) | 0), col(tone, 0.95, { vertexColors: true })); m.castShadow = m.receiveShadow = true;
  m.scale.set(s, s * (1.2 + R() * 0.5), s * (0.9 + R() * 0.3)); m.rotation.y = R() * 6.3; W.add(m, x, z, m.rotation.y, W.ground(x, z) + s * 0.2); W.circle(x, z, s * 0.85, s * 1.5); return m;
}
// cliff wall: a run of crags between two points, overlapping, with a ridge of terrain behind
export function cliff(W, R, x0, z0, x1, z1, { s = [2.6, 4.2], step = 2.2, bump = 3.2, tone = CRAG.dark } = {}) {
  const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / step));
  for (let i = 0; i <= n; i++) { const u = i / n, x = x0 + (x1 - x0) * u + (R() - 0.5) * 0.8, z = z0 + (z1 - z0) * u + (R() - 0.5) * 0.8, sc = s[0] + R() * (s[1] - s[0]);
    crag(W, R, x, z, sc, tone); if (bump) W.bump(x, z, sc * 1.25, bump * (0.7 + R() * 0.5)); }
}
// stepping stones across water (a ford the nav grid treats as walkable)
export function steppingStones(W, x, z, rot, len, n = 6) {
  const c = Math.cos(rot), sn = Math.sin(rot), st = col(0x7a766c, 0.95);
  for (let i = 0; i < n; i++) { const u = -len / 2 + (i + 0.5) * len / n, px = x + u * c, pz = z - u * sn; const m = cyl(0.5, 0.6, 0.5, st, 0, 0, 0, 7); m.scale.set(1, 1, 0.8); m.rotation.y = i; W.add(m, px, pz, 0, -0.05); }
  if (W.water) W.water.fords.push([x - Math.abs(len / 2 * c) - 0.8, x + Math.abs(len / 2 * c) + 0.8, 0.12]); W.hc = null;   // [x0, x1, walking height on the stones]
}
// wooden steps up to a raised terrace
export function steps(W, x, z, rot, w, rise, n = 4) {
  const g = new THREE.Group(), st = mat('lanternStone');
  for (let i = 0; i < n; i++) g.add(box(w, rise / n, 0.5, st, 0, rise / n * (i + 0.5), -i * 0.5));
  W.add(g, x, z, rot, W.ground(x, z) - rise / n * 0.5); return g;
}
// hanging string of paper lanterns across a street (one real light in the middle)
export function lanternString(W, x0, z0, x1, z1, y = 3.6) {
  const g = new THREE.Group(), n = 6, cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 3), mat('black'));
  const a = new THREE.Vector3(x0, W.ground(x0, z0) + y, z0), b = new THREE.Vector3(x1, W.ground(x1, z1) + y, z1);
  for (let i = 0; i < n; i++) { const u = (i + 0.5) / n, p = a.clone().lerp(b, u); p.y -= Math.sin(u * Math.PI) * 0.5; const l = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat(i % 2 ? 'paper' : 'red')); l.scale.y = 1.25; l.position.copy(p); g.add(l); }
  const c = cord.clone(); c.scale.y = a.distanceTo(b); c.position.copy(a).lerp(b, 0.5); c.position.y -= 0.25; c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); g.add(c);
  W.group.add(g); W.addLight((x0 + x1) / 2, (z0 + z1) / 2, y - 0.4, 0xffa050, 6, 9); return g;
}
// standing banner (nobori) on a pole
export function banner(W, x, z, color = 0xb02a20) {
  const g = new THREE.Group(); g.add(cyl(0.04, 0.05, 4, mat('woodDark'), 0, 2, 0, 5));
  const f = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.6), col(color, 0.95, { side: THREE.DoubleSide })); f.position.set(0.38, 2.5, 0); g.add(f);
  W.add(g, x, z, x * 0.3); W.circle(x, z, 0.08, 4); return g;
}
// iron brazier with a fire (cover + warm light)
export function brazier(W, x, z, real = true) {
  const g = new THREE.Group(); g.add(cyl(0.45, 0.3, 1, col(0x2a2624, 0.5, { metalness: 0.6 }), 0, 0.5, 0, 10));
  const f = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xff9030 })); f.position.y = 1.35; g.add(f);
  W.add(g, x, z); W.circle(x, z, 0.5, 1.2); W.addLight(x, z, 1.6, 0xff8a3a, 9, 11, real); return g;
}
// rock arch over an entrance: two pillars and a lintel high enough for the camera
export function rockArch(W, x, z, rot, span = 6) {
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const k of [-1, 1]) crag(W, Math.random, x + k * (span / 2 + 0.6) * c, z - k * (span / 2 + 0.6) * s, 1.5);
  const top = new THREE.Mesh(new THREE.BoxGeometry(span + 2.5, 1.4, 2.4, 3, 1, 1), col(CRAG.dark, 0.95, { vertexColors: true })); const p = top.geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + Math.sin(p.getX(i) * 0.9) * 0.25 - Math.abs(p.getX(i)) * 0.08);
  top.geometry.deleteAttribute('uv'); const n = p.count, cl = new Float32Array(n * 3).fill(0.55); top.geometry.setAttribute('color', new THREE.BufferAttribute(cl, 3)); top.geometry.computeVertexNormals();
  top.castShadow = true; W.add(top, x, z, rot, W.ground(x, z) + 6.2); return top;
}
