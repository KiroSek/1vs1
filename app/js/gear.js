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
  kuro: { name: 'Kuro-gane', desc: 'Blackened blade, oxblood wrap.', price: 400, blade: 'black', fit: 0x0d0d10, fitMetal: 0.7, wrap: '#4a0e10', same: '#1c1c20', saya: 0x050506, trail: 0xc0c8d8, tsuba: 'square' },
  crimson: { name: 'Crimson Moon', desc: 'Blood-red steel with a glowing temper line.', price: 900, blade: 'red', glow: 0xff2a14, fit: 0x120b0b, fitMetal: 0.7, wrap: '#7a0c10', same: '#1a1214', saya: 0x4a0505, trail: 0xff5040, tsuba: 'flower' },
  gilded: { name: 'Gilded Lotus', desc: 'Gold fittings and a gold-leaf scabbard.', price: 1200, blade: 'steel', fit: 0xd0a248, fitMetal: 1, wrap: '#f0e2c0', same: '#2a1e10', saya: 0x8a6420, trail: 0xffd27a, tsuba: 'flower' },
  frost: { name: 'Frostbite', desc: 'Ice-pale blade that glows cold.', price: 1800, blade: 'ice', glow: 0x6ad0ff, fit: 0xc0c6cc, fitMetal: 1, wrap: '#1c3a5a', same: '#dfe8f0', saya: 0xd8e2ea, trail: 0x8ae0ff, tsuba: 'round' },
  yari: { name: 'Yari', desc: 'Spear (enemy only).', price: 0, hidden: true, blade: 'steel', fit: 0x1c1c20, fitMetal: 0.6, wrap: '#3a1a10', same: '#2a1a10', saya: 0x0c0b0e, trail: 0xdfe8ff, tsuba: 'round' },
  mortal: { name: 'Mortal Edge', desc: 'A cursed blade bleeding red light.', price: 3000, blade: 'mortal', glow: 0xff1010, fit: 0x0b0607, fitMetal: 0.6, wrap: '#1a0606', same: '#2a0a0a', saya: 0x120404, trail: 0xff2020, tsuba: 'square' },
};
const BLADES = {   // gradient spine->edge, hamon colour, shinogi line
  steel: [['#5e646c', '#9aa2ac', '#b8bfc8', '#d9dee4'], 'rgba(245,248,252,.9)'],
  black: [['#141518', '#26282d', '#34373d', '#4a4e55'], 'rgba(150,156,166,.75)'],
  red: [['#2a0606', '#5a0c0c', '#7a1414', '#a02020'], 'rgba(255,120,100,.9)'],
  ice: [['#7f9cb8', '#b8d4ea', '#d6ecfa', '#f2fbff'], 'rgba(255,255,255,.95)'],
  mortal: [['#0b0606', '#1e0a0a', '#2c0c0c', '#400e0e'], 'rgba(255,40,30,.95)'],
};
const texCache = {};
function bladeTex(kind) {
  if (texCache['b' + kind]) return texCache['b' + kind];
  const [g4, ham] = BLADES[kind] || BLADES.steel;
  return texCache['b' + kind] = canvasTex(128, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, g4[0]); g.addColorStop(0.45, g4[1]); g.addColorStop(0.62, g4[2]); g.addColorStop(1, g4[3]);
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.beginPath(); x.moveTo(w, 0);
    for (let y = 0; y <= h; y += 4) x.lineTo(w * (0.7 + 0.06 * Math.sin(y * 0.09) + 0.03 * Math.sin(y * 0.31 + 1)), y);
    x.lineTo(w, h); x.closePath(); x.fillStyle = ham; x.fill();
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(255,255,255,${rnd(.05, .2)})`; x.fillRect(w * rnd(.62, .8), rnd(0, h), 1, 1); }
    if (kind === 'mortal') for (let i = 0; i < 26; i++) { x.strokeStyle = `rgba(255,30,20,${rnd(.3, .7)})`; x.lineWidth = rnd(1, 2); x.beginPath(); let px = rnd(0, w * 0.6), py = rnd(0, h); x.moveTo(px, py); for (let k = 0; k < 6; k++) { px += rnd(-8, 12); py += rnd(4, 16); x.lineTo(px, py); } x.stroke(); }
    x.fillStyle = 'rgba(40,44,50,.5)'; x.fillRect(w * 0.44, 0, 1.5, h);
  });
}
function edgeMask() {
  return texCache.edge || (texCache.edge = canvasTex(64, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, w, 0); g.addColorStop(0, '#000'); g.addColorStop(0.62, '#000'); g.addColorStop(0.78, '#fff'); g.addColorStop(1, '#fff'); x.fillStyle = g; x.fillRect(0, 0, w, h); }, false));
}
function tsukaTex(wrap, same) {
  const k = 't' + wrap + same; if (texCache[k]) return texCache[k];
  return texCache[k] = canvasTex(64, 256, (x, w, h) => {
    x.fillStyle = same; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(128,128,128,${rnd(.15, .35)})`; x.beginPath(); x.arc(rnd(0, w), rnd(0, h), rnd(0.6, 1.6), 0, 6.3); x.fill(); }
    x.fillStyle = wrap; const n = 8, p = h / n;
    for (let i = 0; i < n; i++) { const y = i * p;
      x.beginPath(); x.moveTo(0, y); x.lineTo(w / 2, y + p * .42); x.lineTo(0, y + p * .84); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(w, y + p * .16); x.lineTo(w / 2, y + p * .58); x.lineTo(w, y + p); x.closePath(); x.fill();
      x.beginPath(); x.moveTo(0, y); x.lineTo(w, y); x.lineTo(w / 2, y + p * .42); x.closePath(); x.fill(); }
  });
}
function tsubaShape(kind) {
  const sh = new THREE.Shape(), R = 0.042;
  if (kind === 'square') { const s = 0.038, r = 0.01; sh.moveTo(-s + r, -s); sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r); sh.lineTo(s, s - r); sh.quadraticCurveTo(s, s, s - r, s); sh.lineTo(-s + r, s); sh.quadraticCurveTo(-s, s, -s, s - r); sh.lineTo(-s, -s + r); sh.quadraticCurveTo(-s, -s, -s + r, -s); }
  else if (kind === 'flower') { for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, r = R * (0.86 + 0.14 * Math.abs(Math.cos(a * 2))); i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } }
  else sh.absarc(0, 0, R, 0, Math.PI * 2, false);
  const h1 = new THREE.Path(); h1.absellipse(0, 0, 0.007, 0.017, 0, Math.PI * 2, true); sh.holes.push(h1);
  for (const sx of [-1, 1]) { const h = new THREE.Path(); h.absarc(sx * 0.024, -0.004, 0.006, 0, Math.PI * 2, true); sh.holes.push(h); }
  return sh;
}

// local frame: blade along +Z (tsuba at z=0), edge toward +Y, flats face +-X. Grip from z=-0.27 to z=-0.01.
export function makeKatana(key = 'standard') {
  if (key === 'yari') return makeYari();
  const W0 = WEAPONS[key] || WEAPONS.standard, g = new THREE.Group();
  const L = 0.74, N = 40, W = 0.031, TH = 0.0075, SORI = 0.022;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, z = 0.012 + s * L;
    const taper = 1 - 0.28 * s, tip = s > 0.93 ? Math.max(0.0, 1 - (s - 0.93) / 0.07) : 1;
    const w = W * taper, th = TH * taper * (0.4 + 0.6 * tip), curve = -SORI * s * s;
    const edgeY = curve + w * 0.5 * (s > 0.93 ? 0.35 + 0.65 * tip : 1), spineY = curve - w * 0.5 * (s > 0.93 ? tip : 1), sideY = curve + w * 0.05;
    pos.push(0, spineY, z, th, sideY, z, 0, edgeY, z, -th, sideY, z);
    uv.push(0, s, 0.45, s, 1, s, 0.45, s);
  }
  for (let i = 0; i < N; i++) { const a = i * 4, b = a + 4; for (let k = 0; k < 4; k++) { const k1 = (k + 1) % 4; idx.push(a + k, b + k, a + k1, a + k1, b + k, b + k1); } }
  const tipI = pos.length / 3; pos.push(0, -SORI * 1.02 + W * 0.2, 0.012 + L + 0.008); uv.push(1, 1);
  const lb = N * 4; for (let k = 0; k < 4; k++) idx.push(lb + k, tipI, lb + (k + 1) % 4);
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.setIndex(idx); bg.computeVertexNormals();
  const glow = W0.glow !== undefined;
  const bladeMat = new THREE.MeshStandardMaterial({ map: bladeTex(W0.blade), color: 0xffffff, metalness: W0.blade === 'ice' ? 0.7 : 0.92, roughness: 0.22, envMapIntensity: 3.2,
    emissive: glow ? W0.glow : 0x1a2028, emissiveMap: glow ? edgeMask() : null, emissiveIntensity: glow ? 2.2 : 1, side: THREE.DoubleSide });
  const blade = new THREE.Mesh(bg, bladeMat); g.add(blade);
  const fit = new THREE.MeshStandardMaterial({ color: W0.fit, metalness: W0.fitMetal, roughness: 0.32 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.28 });
  const hab = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.036, 0.03), gold); hab.position.set(0, 0, 0.022); g.add(hab);
  const tg = new THREE.ExtrudeGeometry(tsubaShape(W0.tsuba), { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 24 }); tg.translate(0, 0, -0.003);
  const tsuba = new THREE.Mesh(tg, fit); tsuba.rotation.z = Math.PI / 2; tsuba.scale.set(1, 1.18, 1); g.add(tsuba);
  const tsg = new THREE.CylinderGeometry(0.0145, 0.016, 0.255, 14, 1, true); tsg.rotateX(Math.PI / 2); tsg.scale(0.8, 1, 1); tsg.translate(0, 0, -0.135);
  g.add(new THREE.Mesh(tsg, new THREE.MeshStandardMaterial({ map: tsukaTex(W0.wrap, W0.same), roughness: 0.85 })));
  const fuchi = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 14).rotateX(Math.PI / 2).scale(0.82, 1, 1), fit); fuchi.position.z = -0.01; g.add(fuchi);
  const kashira = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(0.82, 1, 0.7), fit); kashira.position.z = -0.264; g.add(kashira);
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.024), gold); m.position.set(sx * 0.012, 0, -0.12); g.add(m); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  blade.userData.keep = true; mergeRigid(g);
  g.userData = { blade, bladeMat, len: L, trail: W0.trail, baseZ: 0.12, tipZ: 0.76 };
  return g;
}
// spear: long lacquered shaft held near its middle, leaf blade at the front (same local frame as the katana)
function makeYari() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.019, 2.4, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a1a10, roughness: 0.4 })); shaft.position.z = 0.35; g.add(shaft);
  const ferr = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.08, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 })); ferr.position.z = 1.55; g.add(ferr);
  const bl = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.42, 4).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.95, roughness: 0.2, envMapIntensity: 2.5 })); bl.scale.set(1, 0.35, 1); bl.position.z = 1.78; g.add(bl);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { len: 2.0, trail: 0xdfe8ff, baseZ: 1.1, tipZ: 1.98, spear: true };
  return g;
}
// saya (scabbard), same local frame: mouth at z=0, extends along +Z
export function makeSaya(key = 'standard', len = 0.8) {
  const W0 = WEAPONS[key] || WEAPONS.standard, g = new THREE.Group();
  const pts = []; for (let i = 0; i <= 12; i++) { const s = i / 12; pts.push(new V3(0, -0.022 * s * s * len / 0.8, s * len)); }
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.017, 10, false); tube.scale(0.75, 1.2, 1);
  const gilt = key === 'gilded';
  g.add(new THREE.Mesh(tube, new THREE.MeshPhysicalMaterial({ color: W0.saya, roughness: gilt ? 0.3 : 0.22, metalness: gilt ? 0.8 : 0.1, clearcoat: 1, clearcoatRoughness: 0.12 })));
  const fit = new THREE.MeshStandardMaterial({ color: W0.fit, metalness: W0.fitMetal, roughness: 0.35 });
  const kojiri = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 6).scale(0.75, 1.2, 1.1), fit); kojiri.position.copy(pts[12]); g.add(kojiri);
  const koi = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12).rotateX(Math.PI / 2).scale(0.75, 1.2, 1), fit); koi.position.z = 0.01; g.add(koi);
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16), new THREE.MeshStandardMaterial({ color: 0x5a2a7a, roughness: 0.9 })); cord.position.set(0, 0.02, 0.12 * len / 0.8); cord.rotation.y = Math.PI / 2; g.add(cord);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return mergeRigid(g);
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
    P.needsUpdate = true; this.mesh.geometry.computeVertexNormals(); this.mesh.geometry.computeBoundingSphere();
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
}// attach a rigid object to a bone, given its desired transform in the model's bind/world space at dress time
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

// Skins. All share the same skeleton, hit-box and animations; they only change the look.
export const OUTFITS = {
  shinobi: { name: 'Shinobi', desc: 'Ash-grey kimono, tattered scarf.', price: 0, kimono: 0x3d3f45, hakama: 0x3e352d, under: 0x1a1a1d, hands: 0x2a2320, feet: 0xb7b2a6, skin: 0xb48a6e, hair: 0x141210, scarf: 0x8a6a4a, sash: 0x24201c, style: 'shinobi' },
  ashina: { name: 'Ashina Samurai', desc: 'Red lacquer armour, crescent kabuto.', price: 0, kimono: 0x2a1c1c, hakama: 0x1c1a20, under: 0x151416, hands: 0x1d1716, feet: 0x2a2624, skin: 0xa07a62, hair: 0x101010, armor: 0x8f1c1c, lace: 0x2c2a6e, sash: 0x241a1a, style: 'samurai' },
  ronin: { name: 'Wandering Ronin', desc: 'Pale kimono, indigo hakama, straw kasa.', price: 600, kimono: 0xcfc6b2, hakama: 0x24304a, under: 0x1c1c22, hands: 0x3a2c22, feet: 0xd8d2c6, skin: 0xb48a6e, hair: 0x15120f, scarf: 0x8a1a1a, sash: 0x1a1a2a, style: 'ronin' },
  oni: { name: 'Crimson Oni', desc: 'Horned kabuto, red-laced lamellar, bone-white menpo.', price: 1500, kimono: 0x2e2e33, hakama: 0x55565c, under: 0x18181b, hands: 0x2c221c, feet: 0x5a4636, skin: 0xa07a62, hair: 0x0e0d0d, armor: 0x3a2c24, lace: 0xa81818, sash: 0xb01c1c, style: 'oni' },
  kage: { name: 'Shadow Gold', desc: 'Black lacquer and gold, jingasa, red-eyed mask.', price: 3000, kimono: 0x0e0e12, hakama: 0x101014, under: 0x0c0c0e, hands: 0x101012, feet: 0xb08a3a, skin: 0x8a6a56, hair: 0x0a0a0a, armor: 0x0c0b0e, lace: 0xc9a14a, sash: 0xd9c9a0, style: 'kage' },
};

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
  const cloth = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...extra }); mats.push(m); return m; };
  const lacq = (color, map, extra = {}) => { const m = new THREE.MeshPhysicalMaterial({ color, map: map || null, roughness: 0.35, metalness: 0.25, clearcoat: 0.8, clearcoatRoughness: 0.25, ...extra }); mats.push(m); return m; };
  const metal = (color, r = 0.3) => { const m = new THREE.MeshStandardMaterial({ color, metalness: 1, roughness: r }); mats.push(m); return m; };
  const shell = o => makeShell(main, info, o);
  const planar = k => (x, y) => [x * k + 0.5, y * k];
  const armUV = (x, y, z) => [Math.atan2(z, y) / Math.PI + 0.5, Math.abs(x) * 3];
  const legUV = (x, y, z) => [Math.atan2(x - Math.sign(x) * 0.1, z) / Math.PI + 0.5, y * 3];

  // base body: vertex colours by region (dark undersuit, gloves, tabi/sandals, face skin)
  const cols = new Float32Array(info.n * 3), c = new THREE.Color();
  for (let i = 0; i < info.n; i++) {
    const r = info.reg[i]; c.setHex(r === 'hand' ? outfit.hands : r === 'foot' ? outfit.feet : r === 'head' || r === 'neck' ? outfit.skin : outfit.under);
    c.convertSRGBToLinear(); cols.set([c.r, c.g, c.b], i * 3);
  }
  main.geometry = main.geometry.clone(); main.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  main.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: S === 'kage' ? 0.3 : 0 });
  main.castShadow = true; main.receiveShadow = true; main.frustumCulled = false;
  if (joints) { joints.userData.sharedGeo = true; joints.material = new THREE.MeshStandardMaterial({ color: outfit.under, roughness: 0.85 }); joints.castShadow = true; joints.frustumCulled = false; }

  const out = { mats, ropes: [], tint: [], extra: [] };
  const armoured = S === 'samurai' || S === 'oni' || S === 'kage', tucked = S === 'oni' || S === 'kage';
  // kimono (torso + upper arms) and sleeves
  const kim = cloth(outfit.kimono);
  shell({ regions: new Set(['torso', 'uarm', 'neck', 'pelvis']), loose: true, filter: (i, f, x, y) => f.reg[i] !== 'neck' || y < neck.y + 0.03,
    offset: (i, f) => f.reg[i] === 'pelvis' ? 0.012 : f.reg[i] === 'uarm' ? 0.012 : 0.008, material: kim });
  if (!(S === 'oni' || S === 'kage')) shell({ regions: new Set(['farm']), loose: true, offset: (i, f, x) => { const d = Math.abs(x) - 0.36; return 0.014 + 0.05 * Math.min(1, Math.max(0, d / 0.22)) ** 2; }, material: kim });
  // hakama: flared to the ankle, or bloused and tucked into shin guards
  const hak = cloth(outfit.hakama);
  shell({ regions: new Set(['pelvis', 'thigh', 'calf']), loose: true, flatten: 0.3, material: hak,
    offset: (i, f, x, y) => { const h = hy(y); if (tucked) { const puff = Math.max(0, Math.min(1, (h - 0.2) / 0.12)) * Math.max(0, Math.min(1, (0.56 - h) / 0.1)); return 0.014 + 0.06 * puff; } const s = Math.min(1, Math.max(0, (0.55 - h) / 0.5)); return 0.018 + 0.085 * s * s; } });
  // obi
  const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.17, 0.09, 24, 1, true), cloth(outfit.sash || 0x222222, { side: THREE.DoubleSide }));
  obi.scale.set(1, 1, 0.78); attachAt(bone('pelvis'), obi, new V3(pel.x, (pel.y + sp1.y) / 2 + 0.06, pel.z + 0.005));

  // katana + saya(s) on the left hip
  out.katana = makeKatana(weaponKey); scene.add(out.katana); out.trail = out.katana.userData.trail;
  out.saya = makeSaya(weaponKey === 'yari' ? 'standard' : weaponKey); if (weaponKey === 'yari') out.saya.visible = false;
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
  const hairCap = mat => shell({ regions: new Set(['head']), filter: (i, f, x, y, z) => y > head.y + 0.06 || (z < head.z - 0.01 && y > head.y - 0.02), offset: () => 0.011, material: mat });
  const menpo = (mat, full) => shell({ regions: new Set(['head', 'neck']), filter: (i, f, x, y, z) => z > head.z - (full ? 0.02 : 0) && y < head.y + (full ? 0.11 : 0.06), offset: () => 0.012, material: mat });
  const ropeTails = (mat, list, n = 7, seg = 0.08, w = 0.05, parent = 'pelvis') => { for (const p of list) { const r = new Rope(scene, n, seg, w, mat, { grav: 5, drag: 0.08, taper: 0.4 }), a = new THREE.Object3D(); attachAt(bone(parent), a, p); out.ropes.push({ rope: r, anchor: a, sideBone: bone(parent) }); } };
  const kabuto = (bowlMat, trimMat, shikoroMat, crest) => {
    const kab = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), bowlMat); bowl.scale.set(1, 1.05, 1.1); kab.add(bowl);
    for (let k = 0; k < 12; k++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.136, 0.004, 4, 16, Math.PI / 2), trimMat); rib.rotation.set(0, k / 12 * Math.PI * 2, Math.PI / 2); rib.scale.set(1.1, 1.15, 1.21); kab.add(rib); }
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.012), shikoroMat); w.position.set(sx * 0.155, -0.03, 0.075); w.rotation.set(0, sx * 0.9, sx * -0.2); kab.add(w); const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.008, 0.016), trimMat); e.position.set(sx * 0.157, 0.005, 0.077); e.rotation.copy(w.rotation); kab.add(e); }
    for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.14 + k * 0.022, 0.155 + k * 0.022, 0.035, 20, 1, true, Math.PI * 0.3, Math.PI * 1.4), shikoroMat); s.material.side = THREE.DoubleSide; s.position.set(0, -0.03 - k * 0.032, -0.01); s.rotation.y = Math.PI; kab.add(s); }
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.165, 0.02, 20, 1, false, -0.9, 1.8), bowlMat); kab.add(visor);
    if (crest === 'crescent') { const cr = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.009, 6, 28, Math.PI * 0.92), trimMat); cr.position.set(0, 0.2, 0.125); cr.rotation.z = Math.PI + Math.PI * 0.04; cr.scale.set(1, 0.8, 1); kab.add(cr); }
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

  if (S === 'shinobi' || S === 'ronin') {
    const hairM = new THREE.MeshStandardMaterial({ color: outfit.hair, roughness: 0.55 }); mats.push(hairM);
    shell({ regions: new Set(['head']), filter: (i, f, x, y, z) => y > head.y + 0.085 || (z < head.z - 0.01 && y > head.y - 0.01), offset: () => 0.012, material: hairM });
    const top = head.clone().add(new V3(0, 0.2, -0.06));
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8).scale(1, 0.8, 1.3), hairM); attachAt(bone('Head'), knot, top);
    const ropeM = new THREE.MeshStandardMaterial({ color: outfit.hair, roughness: 0.7, side: THREE.DoubleSide }); mats.push(ropeM);
    const tail = new Rope(scene, 6, 0.06, 0.05, ropeM, { grav: 5, drag: 0.06, taper: 0.8 }), anchor = new THREE.Object3D();
    attachAt(bone('Head'), anchor, top.clone().add(new V3(0, 0, -0.04))); out.ropes.push({ rope: tail, anchor, sideBone: bone('Head') });
    const scarfM = cloth(outfit.scarf, { side: THREE.DoubleSide }); out.tint.push(scarfM);
    if (S === 'shinobi') {
      const mask = cloth(0x1d1c1f); shell({ regions: new Set(['head', 'neck']), filter: (i, f, x, y, z) => y < head.y + 0.065 && z > head.z - 0.025, offset: () => 0.008, material: mask });
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.009, 6, 24), cloth(0x5a1414)); band.scale.set(1, 1.12, 1);
      attachAt(bone('Head'), band, head.clone().add(new V3(0, 0.12, 0.0)), new Q().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.25, 0, 0)));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.03, 8, 20), scarfM); ring.scale.set(1, 1.15, 0.7);
      attachAt(bone('neck_01'), ring, neck.clone().add(new V3(0, 0.0, 0.01)), new Q().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.1, 0, 0)));
      for (const sx of [-1, 1]) { const r = new Rope(scene, 9, 0.085, 0.085, scarfM, { grav: 4.5, drag: 0.07, taper: 0.55 }), a = new THREE.Object3D(); attachAt(bone('neck_01'), a, neck.clone().add(new V3(sx * 0.04, -0.03, -0.09))); out.ropes.push({ rope: r, anchor: a, sideBone: bone('spine_03') }); }
    } else {
      // straw kasa
      const straw = texCache.straw || canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#c9a868'; x.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { x.strokeStyle = `rgba(90,60,20,${rnd(.15, .4)})`; x.beginPath(); const a = rnd(0, 6.3); x.moveTo(w / 2, h / 2); x.lineTo(w / 2 + Math.cos(a) * w, h / 2 + Math.sin(a) * h); x.stroke(); } });
      texCache.straw = straw;
      const kasa = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.17, 32, 1, true), new THREE.MeshStandardMaterial({ map: straw, roughness: 1, side: THREE.DoubleSide })); mats.push(kasa.material);
      attachAt(bone('Head'), kasa, head.clone().add(new V3(0, 0.2, 0.0)));
      ropeTails(scarfM, [neck.clone().add(new V3(0.05, -0.02, -0.08))], 8, 0.08, 0.07, 'neck_01');
    }
  } else if (S === 'samurai') {
    const lac = lacq(outfit.armor, lamellar('#ffffff', '#3a3a7a', '#d0b070', 7)); out.tint.push(lac);
    cuirass(lac); sode(lac, 4, 0.13, 0.055); kusazuri(lac, 4, 0.17);
    const blk = lacq(0x0b0a0c, null, { envMapIntensity: 0.6 }), gold = metal(0xd2a84a, 0.25);
    hairCap(blk); kabuto(blk, gold, lac, 'crescent'); menpo(metal(0x1c1b1f, 0.38), false);
    ropeTails(cloth(outfit.lace, { side: THREE.DoubleSide }), [new V3(pel.x + 0.12, pel.y + 0.1, pel.z - 0.13), new V3(pel.x - 0.12, pel.y + 0.1, pel.z - 0.13)]);
  } else if (S === 'oni') {
    // red-laced dark lamellar, horned kabuto with gold dragon, bone-white menpo, red rope belt with tassels
    const plates = lacq(0xffffff, lamellar('#3a2c24', '#b01818', '#c09040', 6)); out.tint.push(plates);
    const chest = lacq(0xffffff, oniChest());
    cuirass(chest, 0.055); sode(plates, 6, 0.15, 0.05); kusazuri(plates, 5, 0.19);
    kote(lacq(0xffffff, lamellar('#1c1a1a', '#8a1a14', '#a88848', 5, 4)));
    suneate(cloth(0xffffff, { map: leather('#4a3424'), roughness: 0.75 }));
    const blk = lacq(0x121012, null, { envMapIntensity: 0.6 }), gold = metal(0xd8a63a, 0.22);
    hairCap(blk); kabuto(blk, gold, plates, 'oni');
    menpo(new THREE.MeshStandardMaterial({ color: 0xd8d0c0, roughness: 0.45, metalness: 0.2 }), true);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.008, 0.01), cloth(0x8a1010)); attachAt(bone('Head'), mouth, head.clone().add(new V3(0, 0.035, 0.112)));
    const beard = cloth(0x141210, { side: THREE.DoubleSide });
    ropeTails(beard, [head.clone().add(new V3(-0.025, 0.02, 0.1)), head.clone().add(new V3(0.025, 0.02, 0.1))], 4, 0.035, 0.03, 'Head');
    ropeTails(beard, [head.clone().add(new V3(0, 0.08, -0.11))], 6, 0.07, 0.09, 'Head');                    // long hair from under the kabuto
    const red = cloth(outfit.sash, { side: THREE.DoubleSide });
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.03, 8, 28), red); belt.scale.set(1, 0.78, 1);
    attachAt(bone('pelvis'), belt, new V3(pel.x, (pel.y + sp1.y) / 2 + 0.07, pel.z), new Q().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)));
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), red); attachAt(bone('pelvis'), knot, new V3(pel.x - 0.06, (pel.y + sp1.y) / 2 + 0.06, pel.z + 0.15));
    ropeTails(red, [new V3(pel.x - 0.07, pel.y + 0.08, pel.z + 0.16), new V3(pel.x - 0.02, pel.y + 0.08, pel.z + 0.17), new V3(pel.x + 0.17, pel.y + 0.1, pel.z + 0.08)], 8, 0.075, 0.035);
  } else if (S === 'kage') {
    // black lacquer and gold: lattice panels, jingasa with horns, black mask with glowing red eyes, rope belt, daisho
    const blkGold = lacq(0xffffff, goldTrim('#0c0b0e', '#c9a14a'), { metalness: 0.4 }); out.tint.push(blkGold);
    const plates = lacq(0xffffff, lamellar('#0e0d10', '#c9a14a', '#d8b860', 6));
    cuirass(blkGold, 0.055); sode(plates, 6, 0.15, 0.05); kusazuri(blkGold, 4, 0.2);
    kote(plates); suneate(blkGold);
    const blk = lacq(0x0b0a0c, null, { envMapIntensity: 0.7 }), gold = metal(0xcfa042, 0.2);
    hairCap(blk); menpo(lacq(0x0e0d10, null), true);
    for (const sx of [-1, 1]) { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2010 })); eye.scale.set(1.6, 0.7, 1); attachAt(bone('Head'), eye, head.clone().add(new V3(sx * 0.034, 0.088, 0.112))); }
    const hat = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.14, 40, 1, true), blk); cone.material.side = THREE.DoubleSide; hat.add(cone);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.008, 6, 40), gold); rim.rotation.x = Math.PI / 2; rim.position.y = -0.07; hat.add(rim);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.025, 10, 8), gold); knob.position.y = 0.075; hat.add(knob);
    for (const sx of [-1, 1]) hat.add(taperTube([new V3(sx * 0.07, 0.0, 0.13), new V3(sx * 0.11, 0.1, 0.16), new V3(sx * 0.13, 0.2, 0.13)], 0.018, 0.003, gold));
    attachAt(bone('Head'), hat, head.clone().add(new V3(0, 0.2, 0)));
    const rope = cloth(outfit.sash, { roughness: 0.95, side: THREE.DoubleSide });
    for (const [dy, r] of [[0.06, 0.19], [0.1, 0.185]]) { const b = new THREE.Mesh(new THREE.TorusGeometry(r, 0.016, 8, 28), rope); b.scale.set(1, 0.78, 1); attachAt(bone('pelvis'), b, new V3(pel.x, (pel.y + sp1.y) / 2 + dy, pel.z), new Q().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))); }
    ropeTails(rope, [new V3(pel.x - 0.05, pel.y + 0.1, pel.z + 0.16), new V3(pel.x + 0.05, pel.y + 0.1, pel.z + 0.16)], 6, 0.07, 0.03);
  }
  model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return out;
}
