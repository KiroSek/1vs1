// Character dressing: katana, saya, cloth shells grown from the skinned body, armour plates, verlet cloth tails.
import * as THREE from 'three';

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

// ---------------- katana ----------------
// local frame: blade along +Z (tsuba at z=0), edge toward +Y, flats face +-X. Grip from z=-0.27 to z=-0.01.
export function makeKatana() {
  const T = textures(), g = new THREE.Group();
  const L = 0.74, N = 40, W = 0.031, TH = 0.0075, SORI = 0.022;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const s = i / N, z = 0.012 + s * L;
    const taper = 1 - 0.28 * s, tip = s > 0.93 ? Math.max(0.0, 1 - (s - 0.93) / 0.07) : 1;
    const w = W * taper, th = TH * taper * (0.4 + 0.6 * tip), curve = -SORI * s * s;     // curve bends the tip toward the spine (-Y)
    const edgeY = curve + w * 0.5 * (s > 0.93 ? 0.35 + 0.65 * tip : 1), spineY = curve - w * 0.5 * (s > 0.93 ? tip : 1), sideY = curve + w * 0.05;
    pos.push(0, spineY, z, th, sideY, z, 0, edgeY, z, -th, sideY, z);
    uv.push(0, s, 0.45, s, 1, s, 0.45, s);
  }
  for (let i = 0; i < N; i++) { const a = i * 4, b = a + 4; for (let k = 0; k < 4; k++) { const k1 = (k + 1) % 4; idx.push(a + k, b + k, a + k1, a + k1, b + k, b + k1); } }
  const tipI = pos.length / 3; pos.push(0, -SORI * 1.02 + W * 0.2, 0.012 + L + 0.008); uv.push(1, 1);
  const lb = N * 4; for (let k = 0; k < 4; k++) idx.push(lb + k, tipI, lb + (k + 1) % 4);
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); bg.setIndex(idx); bg.computeVertexNormals();
  const bladeMat = new THREE.MeshStandardMaterial({ map: T.blade, color: 0xffffff, metalness: 0.92, roughness: 0.22, envMapIntensity: 3.2, emissive: 0x1a2028, side: THREE.DoubleSide });
  const blade = new THREE.Mesh(bg, bladeMat); g.add(blade);
  // habaki (gold collar)
  const gold = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.28 });
  const hab = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.036, 0.03), gold); hab.position.set(0, 0, 0.022); g.add(hab);
  // tsuba: rounded square iron guard with two cut-outs
  const sh = new THREE.Shape(); const R = 0.042; sh.absarc(0, 0, R, 0, Math.PI * 2, false);
  const h1 = new THREE.Path(); h1.absellipse(0, 0, 0.007, 0.017, 0, Math.PI * 2, true); sh.holes.push(h1);
  for (const sx of [-1, 1]) { const h = new THREE.Path(); h.absarc(sx * 0.024, -0.004, 0.007, 0, Math.PI * 2, true); sh.holes.push(h); }
  const tg = new THREE.ExtrudeGeometry(sh, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 24 }); tg.translate(0, 0, -0.003);
  const tsuba = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0x232026, metalness: 0.85, roughness: 0.42 })); tsuba.rotation.z = Math.PI / 2; tsuba.scale.set(1, 1.18, 1); g.add(tsuba);
  // tsuka (handle): oval section with ito wrap
  const tsg = new THREE.CylinderGeometry(0.0145, 0.016, 0.255, 14, 1, true); tsg.rotateX(Math.PI / 2); tsg.scale(0.8, 1, 1); tsg.translate(0, 0, -0.135);
  const tsMat = new THREE.MeshStandardMaterial({ map: T.tsuka, roughness: 0.85 }); tsMat.map.repeat.set(1, 1);
  g.add(new THREE.Mesh(tsg, tsMat));
  const fuchi = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 14).rotateX(Math.PI / 2).scale(0.82, 1, 1), new THREE.MeshStandardMaterial({ color: 0x1b1a1e, metalness: 0.8, roughness: 0.35 })); fuchi.position.z = -0.01; g.add(fuchi);
  const kashira = new THREE.Mesh(new THREE.SphereGeometry(0.016, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2).scale(0.82, 1, 0.7), new THREE.MeshStandardMaterial({ color: 0x1b1a1e, metalness: 0.8, roughness: 0.35 })); kashira.position.z = -0.264; g.add(kashira);
  for (const sx of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.008, 0.024), gold); m.position.set(sx * 0.012, 0, -0.12); g.add(m); }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  g.userData = { blade, bladeMat, len: L };
  return g;
}
// saya (scabbard), same local frame: mouth at z=0, extends along +Z
export function makeSaya(color = 0x0c0b0e) {
  const g = new THREE.Group();
  const pts = []; for (let i = 0; i <= 12; i++) { const s = i / 12; pts.push(new V3(0, -0.022 * s * s, s * 0.8)); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 24, 0.017, 10, false); tube.scale(0.75, 1.2, 1);
  const lac = new THREE.MeshPhysicalMaterial({ color, roughness: 0.22, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.12 });
  g.add(new THREE.Mesh(tube, lac));
  const horn = new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.5 });
  const kojiri = new THREE.Mesh(new THREE.SphereGeometry(0.019, 10, 6).scale(0.75, 1.2, 1.1), horn); kojiri.position.copy(pts[12]); g.add(kojiri);
  const koi = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 12).rotateX(Math.PI / 2).scale(0.75, 1.2, 1), horn); koi.position.z = 0.01; g.add(koi);
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.005, 6, 16), new THREE.MeshStandardMaterial({ color: 0x5a2a7a, roughness: 0.9 })); cord.position.set(0, 0.02, 0.12); cord.rotation.y = Math.PI / 2; g.add(cord);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
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
  ng.setAttribute('position', P); ng.setAttribute('normal', N); if (g.attributes.uv) ng.setAttribute('uv', g.attributes.uv);
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
    this.mesh = new THREE.Mesh(geo, material); this.mesh.frustumCulled = false; this.mesh.castShadow = true; scene.add(this.mesh);
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

// attach a rigid object to a bone, given its desired transform in the model's bind/world space at dress time
function attachAt(bone, obj, pos, quat = new Q(), scl = 1) {
  const wm = new M4().compose(pos, quat, new V3(scl, scl, scl));
  const local = bone.matrixWorld.clone().invert().multiply(wm);
  local.decompose(obj.position, obj.quaternion, obj.scale); bone.add(obj);
  obj.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return obj;
}

export const OUTFITS = {
  // shinobi in the spirit of the reference: ash-grey kimono, tan hakama, tattered scarf, topknot
  player: { kimono: 0x3d3f45, hakama: 0x3e352d, under: 0x1a1a1d, hands: 0x2a2320, feet: 0xb7b2a6, skin: 0xb48a6e, hair: 0x141210, scarf: 0x8a6a4a, sash: 0x24201c, style: 'shinobi' },
  // Ashina samurai: lacquered red armour, dark hakama, kabuto with gold crest, iron menpo
  enemy: { kimono: 0x2a1c1c, hakama: 0x1c1a20, under: 0x151416, hands: 0x1d1716, feet: 0x2a2624, skin: 0xa07a62, hair: 0x101010, armor: 0x8f1c1c, lace: 0x2c2a6e, style: 'samurai' },
};

// Dress a cloned mannequin. Returns handles used by Fighter (katana, saya, ropes, materials for tinting).
export function dress(model, scene, outfit) {
  const T = textures();
  const bodies = []; model.traverse(o => { if (o.isSkinnedMesh) bodies.push(o); });
  const main = bodies.find(b => b.material.name === 'M_Main') || bodies[0];
  const joints = bodies.find(b => b !== main);
  main.skeleton.pose(); model.updateMatrixWorld(true);
  const bone = n => model.getObjectByName(n);
  const info = analyzeBody(main), H = info.maxY - info.minY;
  const hy = y => (y - info.minY) / H;                         // 0 feet .. 1 head top
  const wp = n => bone(n).getWorldPosition(new V3());
  const head = wp('Head'), neck = wp('neck_01');
  const mats = [];
  const cloth = (color, extra = {}) => { const m = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, ...extra }); delete m.bumpMap; mats.push(m); return m; };

  // base body: vertex colours by region (dark undersuit, gloves, tabi, face skin)
  const cols = new Float32Array(info.n * 3), c = new THREE.Color();
  for (let i = 0; i < info.n; i++) {
    const r = info.reg[i]; c.setHex(r === 'hand' ? outfit.hands : r === 'foot' ? outfit.feet : r === 'head' || r === 'neck' ? outfit.skin : outfit.under);
    c.convertSRGBToLinear(); cols.set([c.r, c.g, c.b], i * 3);
  }
  main.geometry = main.geometry.clone(); main.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  main.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  main.castShadow = true; main.receiveShadow = true; main.frustumCulled = false;
  if (joints) { joints.material = new THREE.MeshStandardMaterial({ color: outfit.under, roughness: 0.85 }); joints.castShadow = true; joints.frustumCulled = false; }

  const out = { mats, ropes: [], tint: [] };
  // kimono (torso + upper arms), with wide sleeves flaring toward the wrist
  const kim = cloth(outfit.kimono);
  makeShell(main, info, { regions: new Set(['torso', 'uarm', 'neck', 'pelvis']), loose: true,
    filter: (i, f, x, y) => f.reg[i] !== 'neck' || y < neck.y + 0.03,
    offset: (i, f, x, y) => f.reg[i] === 'pelvis' ? 0.012 : f.reg[i] === 'uarm' ? 0.012 : 0.008, material: kim });
  makeShell(main, info, { regions: new Set(['farm']), loose: true,
    offset: (i, f, x, y, z) => { const d = Math.abs(x) - 0.36; return 0.014 + 0.05 * Math.min(1, Math.max(0, d / 0.22)) ** 2; }, material: kim });
  // hakama: pelvis down to the ankles, flaring
  const hak = cloth(outfit.hakama);
  makeShell(main, info, { regions: new Set(['pelvis', 'thigh', 'calf']), loose: true,
    offset: (i, f, x, y) => { const h = hy(y); const s = Math.min(1, Math.max(0, (0.55 - h) / 0.5)); return 0.018 + 0.085 * s * s; }, flatten: 0.3, material: hak });
  // obi sash
  const pel = wp('pelvis'), sp1 = wp('spine_01');
  const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.17, 0.09, 24, 1, true), cloth(outfit.sash || 0x222222, { side: THREE.DoubleSide }));
  obi.scale.set(1, 1, 0.78); attachAt(bone('pelvis'), obi, new V3(pel.x, (pel.y + sp1.y) / 2 + 0.06, pel.z + 0.005));

  // katana + saya on the left hip
  out.katana = makeKatana(); scene.add(out.katana);
  out.saya = makeSaya(outfit.style === 'samurai' ? 0x170707 : 0x0c0b0e);
  const sq = new Q().setFromEuler(new THREE.Euler(-0.35, -0.25, 0, 'YXZ'));   // tip points down-back
  const sayaDir = new V3(0, 0, 1).applyQuaternion(sq);
  const back = new Q().setFromUnitVectors(new V3(0, 0, 1), new V3(-sayaDir.x, sayaDir.y, -sayaDir.z).normalize());
  attachAt(bone('pelvis'), out.saya, new V3(pel.x + 0.19, pel.y + 0.12, pel.z + 0.17), back);

  if (outfit.style === 'shinobi') {
    // hair cap + topknot + ponytail rope, cloth mask on the lower face, scarf tails
    const hairM = new THREE.MeshStandardMaterial({ color: outfit.hair, roughness: 0.55 }); mats.push(hairM);
    makeShell(main, info, { regions: new Set(['head']), filter: (i, f, x, y, z) => y > head.y + 0.085 || (z < head.z - 0.01 && y > head.y - 0.01), offset: () => 0.012, material: hairM });
    const mask = cloth(0x1d1c1f); makeShell(main, info, { regions: new Set(['head', 'neck']), filter: (i, f, x, y, z) => y < head.y + 0.065 && z > head.z - 0.025, offset: () => 0.008, material: mask });
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8).scale(1, 0.8, 1.3), hairM);
    const top = head.clone().add(new V3(0, 0.2, -0.06)); attachAt(bone('Head'), knot, top);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.009, 6, 24), cloth(0x5a1414)); band.rotation.x = Math.PI / 2 - 0.2; band.scale.set(1, 1.12, 1);
    attachAt(bone('Head'), band, head.clone().add(new V3(0, 0.12, 0.0)), new Q().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.25, 0, 0)));
    const ropeM = new THREE.MeshStandardMaterial({ color: outfit.hair, roughness: 0.7, side: THREE.DoubleSide }); mats.push(ropeM);
    const tail = new Rope(scene, 6, 0.06, 0.05, ropeM, { grav: 5, drag: 0.06, taper: 0.8 });
    const anchor = new THREE.Object3D(); attachAt(bone('Head'), anchor, top.clone().add(new V3(0, 0, -0.04)));
    out.ropes.push({ rope: tail, anchor, sideBone: bone('Head') });
    const scarfM = cloth(outfit.scarf, { side: THREE.DoubleSide }); out.tint.push(scarfM);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.03, 8, 20), scarfM); ring.scale.set(1, 1.15, 0.7);
    attachAt(bone('neck_01'), ring, neck.clone().add(new V3(0, 0.0, 0.01)), new Q().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.1, 0, 0)));
    for (const sx of [-1, 1]) {
      const r = new Rope(scene, 9, 0.085, 0.085, scarfM, { grav: 4.5, drag: 0.07, taper: 0.55 }), a = new THREE.Object3D();
      attachAt(bone('neck_01'), a, neck.clone().add(new V3(sx * 0.04, -0.03, -0.09))); out.ropes.push({ rope: r, anchor: a, sideBone: bone('spine_03') });
    }
  } else {
    // lacquered armour: cuirass shell, shoulder plates, skirt plates, kabuto with crest, iron menpo
    const lac = new THREE.MeshPhysicalMaterial({ color: outfit.armor, roughness: 0.35, metalness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.25 }); mats.push(lac); out.tint.push(lac);
    makeShell(main, info, { regions: new Set(['torso']), filter: (i, f, x, y) => y < neck.y - 0.06, offset: () => 0.05, material: lac });
    const iron = new THREE.MeshStandardMaterial({ color: 0x1c1b1f, metalness: 0.85, roughness: 0.38 }); mats.push(iron);
    const goldM = new THREE.MeshStandardMaterial({ color: 0xd2a84a, metalness: 1, roughness: 0.25 }); mats.push(goldM);
    // sode (shoulder guards): stack of curved plates hanging from each upper arm
    for (const s of ['l', 'r']) {
      const ua = wp('upperarm_' + s), la = wp('lowerarm_' + s), dir = la.clone().sub(ua).normalize(), sx = s === 'l' ? 1 : -1;
      const sode = new THREE.Group();
      for (let k = 0; k < 4; k++) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.055, 16, 1, true, -0.9, 1.8), lac); p.position.y = -k * 0.05; p.rotation.z = 0; sode.add(p); }
      const q = new Q().setFromUnitVectors(new V3(0, -1, 0), new V3(dir.x * 0.35, -1, dir.z * 0.35).normalize()).multiply(new Q().setFromAxisAngle(new V3(0, 1, 0), sx * Math.PI / 2));
      attachAt(bone('upperarm_' + s), sode, ua.clone().add(new V3(sx * 0.05, 0.03, 0)), q);
    }
    // kusazuri: skirt plates around the hips (front & sides follow the thighs, back follows the pelvis)
    for (const [b, ax, az] of [['thigh_l', 0.12, 0.1], ['thigh_r', -0.12, 0.1], ['thigh_l', 0.17, -0.04], ['thigh_r', -0.17, -0.04], ['pelvis', 0, -0.15]]) {
      const pl = new THREE.Group(); for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.05, 0.016), lac); m.position.y = -k * 0.048; m.position.z = k * 0.004; pl.add(m); }
      const pos = new V3(pel.x + ax, pel.y - 0.04, pel.z + az), yaw = Math.atan2(ax, az);
      attachAt(bone(b), pl, pos, new Q().setFromEuler(new THREE.Euler(-0.12, yaw, 0, 'YXZ')));
    }
    // kabuto (helmet bowl + neck guard + gold crescent)
    const kab = new THREE.Group();
    const blk = new THREE.MeshPhysicalMaterial({ color: 0x0b0a0c, roughness: 0.32, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 0.6 }); mats.push(blk);
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), blk); bowl.scale.set(1, 1.05, 1.1); kab.add(bowl);
    makeShell(main, info, { regions: new Set(['head']), filter: (i, f, x, y, z) => y > head.y + 0.06 || (z < head.z - 0.01 && y > head.y - 0.02), offset: () => 0.01, material: blk });
    for (let k = 0; k < 12; k++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.136, 0.004, 4, 16, Math.PI / 2), goldM); rib.rotation.set(0, k / 12 * Math.PI * 2, Math.PI / 2); rib.scale.set(1.1, 1.15, 1.21); kab.add(rib); }
    for (const sx of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.012), lac); w.position.set(sx * 0.15, -0.03, 0.07); w.rotation.set(0, sx * 0.9, sx * -0.2); kab.add(w); }
    for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.135 + k * 0.022, 0.15 + k * 0.022, 0.035, 20, 1, true, Math.PI * 0.3, Math.PI * 1.4), lac); s.position.set(0, -0.03 - k * 0.032, -0.01); s.rotation.y = Math.PI; kab.add(s); }
    const crest = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.009, 6, 28, Math.PI * 0.92), goldM); crest.position.set(0, 0.2, 0.125); crest.rotation.z = Math.PI + Math.PI * 0.04; crest.scale.set(1, 0.8, 1); kab.add(crest);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.16, 0.02, 20, 1, false, -0.9, 1.8), blk); visor.position.set(0, -0.005, 0.0); kab.add(visor);
    attachAt(bone('Head'), kab, head.clone().add(new V3(0, 0.085, -0.01)));
    // menpo (lower face mask)
    makeShell(main, info, { regions: new Set(['head']), filter: (i, f, x, y, z) => y < head.y + 0.06 && z > head.z, offset: () => 0.012, material: iron });
    const sash = cloth(outfit.lace, { side: THREE.DoubleSide }); out.tint.push(sash);
    for (const sx of [-1, 1]) { const r = new Rope(scene, 7, 0.08, 0.06, sash, { grav: 5, drag: 0.08, taper: 0.4 }), a = new THREE.Object3D(); attachAt(bone('pelvis'), a, new V3(pel.x + sx * 0.12, pel.y + 0.1, pel.z - 0.13)); out.ropes.push({ rope: r, anchor: a, sideBone: bone('pelvis') }); }
  }
  model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
  return out;
}
