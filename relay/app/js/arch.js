// Detailed Japanese architecture pieces shared by the duel arenas (arena.js) and the open maps (world.js).
// Everything is built from merged, real geometry (no new textures needed): curved kasagi, tile corrugation, rafters,
// lattice slats, carved lanterns. Each builder returns a THREE.Group whose base sits at y = 0.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
const merge = list => { const g = mergeGeometries(list.map(x => x.index ? x.toNonIndexed() : x)); g.computeVertexNormals(); return g; };
const at = (geo, x, y, z, rx = 0, ry = 0, rz = 0) => { geo.rotateX(rx); geo.rotateY(ry); geo.rotateZ(rz); geo.translate(x, y, z); return geo; };

// box whose long (x) axis bends upward toward both ends (kasagi / eave beams): lift = rise at the tips (m)
export function curvedBeam(len, h, d, lift, seg = 24) {
  const g = new THREE.BoxGeometry(len, h, d, seg, 1, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const u = p.getX(i) / (len / 2); p.setY(i, p.getY(i) + lift * Math.pow(Math.abs(u), 2.4)); }
  g.computeVertexNormals(); return g;
}
// ---------------------------------------------------------------- torii (myojin style)
export function torii(mats, s = 1) {
  const { red, black } = mats, g = new THREE.Group(), H = 5, span = 2.2;
  const reds = [], blacks = [];
  for (const sx of [-1, 1]) {
    const p = new THREE.CylinderGeometry(0.2, 0.25, H, 16); p.rotateZ(sx * 0.035); reds.push(at(p, sx * span, H / 2, 0));   // pillars lean in a touch
    blacks.push(at(new THREE.CylinderGeometry(0.32, 0.36, 0.42, 16), sx * (span + 0.02), 0.21, 0));                          // kamebara (base sleeves)
    blacks.push(at(new THREE.CylinderGeometry(0.27, 0.27, 0.08, 16), sx * span * 0.995, 0.47, 0));
  }
  reds.push(at(new THREE.BoxGeometry(span * 2 + 1.5, 0.24, 0.26), 0, H * 0.82, 0));     // nuki through the pillars, ends sticking out
  for (const sx of [-1, 1]) reds.push(at(new THREE.BoxGeometry(0.1, 0.3, 0.32), sx * (span + 0.55), H * 0.82, 0));   // kusabi wedges
  reds.push(at(new THREE.BoxGeometry(0.28, H * 0.12, 0.2), 0, H * 0.82 + H * 0.06 + 0.12, 0));   // gakuzuka (centre strut)
  reds.push(at(curvedBeam(span * 2 + 1.7, 0.26, 0.42, 0.18), 0, H + 0.05, 0));             // shimaki
  blacks.push(at(curvedBeam(span * 2 + 2.6, 0.3, 0.56, 0.42), 0, H + 0.34, 0));            // kasagi, sweeping up at the tips
  const plaque = new THREE.BoxGeometry(0.62, 0.8, 0.08); blacks.push(at(plaque, 0, H * 0.82 + H * 0.06 + 0.12, 0.13));   // gaku (name plate)
  const r = new THREE.Mesh(merge(reds), red), b = new THREE.Mesh(merge(blacks), black);
  r.castShadow = b.castShadow = true; r.receiveShadow = b.receiveShadow = true; g.add(r, b); g.scale.setScalar(s); return g;
}
// ---------------------------------------------------------------- stone lantern (kasuga style)
export function lantern(mats, lit) {
  const { stone, paper } = mats, g = new THREE.Group(), parts = [];
  parts.push(at(new THREE.CylinderGeometry(0.36, 0.42, 0.16, 6), 0, 0.08, 0));            // kiso
  parts.push(at(new THREE.CylinderGeometry(0.26, 0.34, 0.14, 6), 0, 0.23, 0));
  parts.push(at(new THREE.CylinderGeometry(0.12, 0.14, 0.86, 12), 0, 0.73, 0));            // sao
  for (const y of [0.52, 0.96]) parts.push(at(new THREE.TorusGeometry(0.135, 0.022, 6, 16), 0, y, 0, Math.PI / 2));   // rings
  parts.push(at(new THREE.CylinderGeometry(0.32, 0.18, 0.18, 6), 0, 1.25, 0));            // chudai
  // hibukuro: four corner posts around the light box
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; parts.push(at(new THREE.BoxGeometry(0.06, 0.34, 0.06), Math.cos(a) * 0.22, 1.51, Math.sin(a) * 0.22, 0, -a)); }
  parts.push(at(new THREE.CylinderGeometry(0.27, 0.27, 0.05, 6), 0, 1.36, 0));
  // kasa: hexagonal roof with up-curled corners (warabite) and the hoju jewel
  const kasa = new THREE.ConeGeometry(0.56, 0.3, 6, 3), kp = kasa.attributes.position;
  for (let i = 0; i < kp.count; i++) { const y = kp.getY(i); if (y < -0.1) { const x = kp.getX(i), z = kp.getZ(i), rr = Math.hypot(x, z); kp.setY(i, y + Math.max(0, rr - 0.42) * 0.9); } }
  parts.push(at(kasa, 0, 1.86, 0));
  parts.push(at(new THREE.CylinderGeometry(0.1, 0.13, 0.08, 10), 0, 2.03, 0));
  parts.push(at(new THREE.SphereGeometry(0.09, 12, 8), 0, 2.12, 0)); parts.push(at(new THREE.ConeGeometry(0.06, 0.1, 10), 0, 2.22, 0));
  const m = new THREE.Mesh(merge(parts), stone); m.castShadow = true; m.receiveShadow = true; g.add(m);
  const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.28, 6), lit ? paper : stone); glow.position.y = 1.51; g.add(glow);
  return g;
}
// ---------------------------------------------------------------- tiled hip-and-gable roof
// w x d footprint (eaves included), rh = ridge height. Tiles: corrugated rows (kawara) along the slope, eaves curve up.
export function tiledRoof(mats, w, d, rh, { rows = 0, ridgeCol = null } = {}) {
  const { roof, black, wood } = mats, g = new THREE.Group(), nr = rows || Math.max(8, Math.round(w * 3.2));
  const slopeL = Math.hypot(d / 2, rh), tiles = [];
  for (const s of [-1, 1]) {
    const pl = new THREE.PlaneGeometry(w, slopeL, nr * 2, 10), p = pl.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), u = x / (w / 2), v = (y + slopeL / 2) / slopeL;   // v: 0 eave .. 1 ridge
      const corr = Math.abs(Math.sin((x / w) * nr * Math.PI)) * 0.07;                            // round tiles
      const eave = (1 - v) * (1 - v) * 0.28 + Math.pow(Math.abs(u), 3) * (1 - v) * 0.35;           // eave + corner sweep
      p.setZ(i, corr + eave);
    }
    pl.computeVertexNormals();
    const tilt = Math.PI / 2 - Math.atan2(d / 2, rh);
    pl.rotateX(-tilt); if (s < 0) pl.rotateY(Math.PI); pl.translate(0, rh / 2, s * d / 4); tiles.push(pl);
  }
  const rm = new THREE.Mesh(merge(tiles), roof); rm.castShadow = true; rm.receiveShadow = true; g.add(rm);
  // ridge + onigawara end blocks
  const ridge = [at(new THREE.BoxGeometry(w + 0.1, 0.24, 0.34), 0, rh + 0.1, 0)];
  for (const sx of [-1, 1]) ridge.push(at(new THREE.BoxGeometry(0.3, 0.5, 0.42), sx * (w / 2 + 0.05), rh + 0.28, 0));
  const rg = new THREE.Mesh(merge(ridge), ridgeCol || black); rg.castShadow = true; g.add(rg);
  // gable triangles + exposed rafters (taruki) under both eaves
  const wd = [];
  for (const sx of [-1, 1]) { const tri = new THREE.Shape(); tri.moveTo(-d / 2 + 0.35, 0); tri.lineTo(d / 2 - 0.35, 0); tri.lineTo(0, rh - 0.05); tri.closePath();
    wd.push(at(new THREE.ShapeGeometry(tri), sx * (w / 2 - 0.5), 0.02, 0, 0, Math.PI / 2)); }
  const nRaf = Math.round(w / 0.42);
  for (const s of [-1, 1]) for (let i = 0; i <= nRaf; i++) { const x = -w / 2 + 0.25 + i * (w - 0.5) / nRaf;
    const r = new THREE.BoxGeometry(0.07, 0.08, 0.9); r.rotateX(s * (Math.PI / 2 - Math.atan2(d / 2, rh)) * 0.35); wd.push(at(r, x, 0.02, s * (d / 2 - 0.45))); }
  const wm = new THREE.Mesh(merge(wd), wood); wm.castShadow = true; g.add(wm);
  return g;
}
// vertical lattice (koshi) panel: n slats across width w, height h
export function lattice(mat, w, h, n) {
  const list = []; for (let i = 0; i < n; i++) list.push(at(new THREE.BoxGeometry(0.035, h, 0.05), -w / 2 + (i + 0.5) * w / n, 0, 0));
  list.push(at(new THREE.BoxGeometry(w, 0.05, 0.06), 0, h / 2, 0), at(new THREE.BoxGeometry(w, 0.05, 0.06), 0, -h / 2, 0));
  const m = new THREE.Mesh(merge(list), mat); m.castShadow = true; return m;
}
// darken a box toward its base (rain splash / dirt); returns a vertex-coloured clone material
export function grime(mesh, height, amount = 0.45) {
  const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone(), p = g.attributes.position, c = [];
  g.computeBoundingBox(); const y0 = g.boundingBox.min.y;
  for (let i = 0; i < p.count; i++) { const k = 1 - amount * Math.max(0, 1 - (p.getY(i) - y0) / height) * (0.85 + 0.3 * Math.sin(p.getX(i) * 7.1 + p.getZ(i) * 5.3)); c.push(k, k * 0.98, k * 0.95); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); mesh.geometry = g;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const cl = mats.map(m => { const n = m.clone(); n.vertexColors = true; return n; }); mesh.material = Array.isArray(mesh.material) ? cl : cl[0];
}
// ---------------------------------------------------------------- natural rock with moss on top (smooth, noise-displaced)
const ROCKS = {};
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
export function rockGeo(variant = 0) {
  if (ROCKS[variant]) return ROCKS[variant];
  const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position, c = [], v = new V3(), k = variant * 3.7 + 1.3;
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i);
    const n = 0.55 * Math.sin(v.x * 2.1 + k) * Math.cos(v.z * 1.7 - k) + 0.25 * Math.sin(v.y * 4.3 + v.x * 3.1 + k * 2) + 0.12 * (hash3(Math.round(v.x * 6), Math.round(v.y * 6), Math.round(v.z * 6)) - 0.5);
    v.multiplyScalar(1 + n * 0.28); if (v.y < -0.35) v.y = -0.35 + (v.y + 0.35) * 0.3; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); const nr = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const up = nr.getY(i), moss = Math.max(0, (up - 0.55) / 0.45) * (0.6 + 0.4 * hash3(p.getX(i) * 3, p.getY(i) * 3, p.getZ(i) * 3));
    const base = 0.82 + 0.18 * hash3(p.getX(i) * 9, p.getY(i) * 9, p.getZ(i) * 9);   // speckle
    c.push(base * (1 - moss) + 0.42 * moss, base * (1 - moss) + 0.55 * moss, base * (1 - moss) + 0.3 * moss); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return ROCKS[variant] = g;
}
// ---------------------------------------------------------------- dry-stone base (ishigaki) + plaster wall + tile cap
export function stoneWall(mats, len, h, { broken = false, seed = 1 } = {}) {
  const g = new THREE.Group(); let s = seed;
  const R = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const blocks = [], baseH = h * 0.45;
  for (let y = 0.0, row = 0; y < baseH - 0.05; row++) {
    const bh = 0.28 + R() * 0.14; let x = -len / 2 + (row % 2) * 0.25;
    while (x < len / 2) { const bw = 0.45 + R() * 0.45, w = Math.min(bw, len / 2 - x); if (w > 0.12 && !(broken && R() < 0.12 && y > 0.4)) {
      const b = new THREE.BoxGeometry(w - 0.04, Math.min(bh, baseH - y) - 0.03, 1.1 - row * 0.03 - R() * 0.05, 1, 1, 1); b.rotateY((R() - 0.5) * 0.04); blocks.push(at(b, x + w / 2, y + Math.min(bh, baseH - y) / 2, (R() - 0.5) * 0.04)); }
      x += bw; }
    y += bh;
  }
  const bm = new THREE.Mesh(merge(blocks), mats.stone); bm.castShadow = bm.receiveShadow = true; g.add(bm);
  const ph = h * 0.55, pl = new THREE.Mesh(new THREE.BoxGeometry(len, ph, 0.8, Math.max(1, Math.round(len)), 3, 1), mats.plaster); pl.position.y = baseH + ph / 2; pl.castShadow = pl.receiveShadow = true; grime(pl, ph * 0.6, 0.35); g.add(pl);
  const posts = []; for (let x = -len / 2 + 0.3; x <= len / 2 - 0.2; x += 2) for (const z of [-0.41, 0.41]) posts.push(at(new THREE.BoxGeometry(0.14, ph, 0.05), x, baseH + ph / 2, z));
  if (posts.length) { const pm = new THREE.Mesh(merge(posts), mats.wood); g.add(pm); }
  const cap = tiledRoof({ roof: mats.roof, black: mats.black, wood: mats.wood }, len + 0.4, 1.5, 0.32, { rows: Math.round(len * 3) }); cap.position.y = h - 0.02; g.add(cap);
  if (broken) { pl.scale.y = 0.4 + R() * 0.4; pl.position.y = baseH + ph * pl.scale.y / 2; cap.visible = false; g.children[2] && (g.children[2].visible = false); }
  return g;
}
// ---------------------------------------------------------------- arched wooden bridge (taikobashi)
export function archBridge(mats, len, w, h) {
  const g = new THREE.Group(), seg = 22, y = u => h * Math.cos(Math.PI * u) * 0.9 + 0.35;   // u in -0.5..0.5
  const planks = [], frame = [], red = [];
  for (let i = 0; i < seg; i++) { const u0 = i / seg - 0.5, u1 = (i + 1) / seg - 0.5, y0 = y(u0), y1 = y(u1), L = Math.hypot(len / seg, y1 - y0);
    planks.push(at(new THREE.BoxGeometry(L - 0.03, 0.09, w), (u0 + u1) / 2 * len, (y0 + y1) / 2 - 0.045, 0, 0, 0, Math.atan2(y1 - y0, len / seg)));
    for (const s of [-1, 1]) frame.push(at(new THREE.BoxGeometry(L + 0.02, 0.22, 0.16), (u0 + u1) / 2 * len, (y0 + y1) / 2 - 0.2, s * (w / 2 - 0.15), 0, 0, Math.atan2(y1 - y0, len / seg)));   // stringers
    for (const s of [-1, 1]) red.push(at(new THREE.BoxGeometry(L + 0.02, 0.08, 0.1), (u0 + u1) / 2 * len, (y0 + y1) / 2 + 0.85, s * w / 2, 0, 0, Math.atan2(y1 - y0, len / seg)));   // hand rail follows the arch
    if (i % 3 === 0 || i === seg - 1) for (const s of [-1, 1]) { const uu = i === seg - 1 ? u1 : u0; red.push(at(new THREE.BoxGeometry(0.12, 0.95, 0.12), uu * len, y(uu) + 0.42, s * w / 2)); }
  }
  // giboshi finials on the four end posts, piers with cross braces under the deck
  for (const ux of [-0.5, 0.5]) for (const s of [-1, 1]) { red.push(at(new THREE.CylinderGeometry(0.1, 0.1, 1.15, 10), ux * len, y(ux) + 0.55, s * w / 2)); frame.push(at(new THREE.SphereGeometry(0.11, 10, 8), ux * len, y(ux) + 1.2, s * w / 2)); frame.push(at(new THREE.ConeGeometry(0.06, 0.16, 10), ux * len, y(ux) + 1.36, s * w / 2)); }
  for (const ux of [-0.25, 0, 0.25]) { const top = y(ux) - 0.3; for (const s of [-1, 1]) frame.push(at(new THREE.CylinderGeometry(0.11, 0.13, top + 2, 10), ux * len, (top - 2) / 2, s * (w / 2 - 0.2)));
    const br = new THREE.BoxGeometry(0.08, 0.08, Math.hypot(w - 0.4, 1.2)); br.rotateX(Math.atan2(1.2, w - 0.4)); frame.push(at(br, ux * len, top - 0.7, 0)); }
  const pm = new THREE.Mesh(merge(planks), mats.timber), fm = new THREE.Mesh(merge(frame), mats.wood), rm = new THREE.Mesh(merge(red), mats.red);
  for (const m of [pm, fm, rm]) { m.castShadow = m.receiveShadow = true; g.add(m); }
  return g;
}
