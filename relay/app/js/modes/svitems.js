// Survival items: healing flasks dropped by fallen enemies, and the player's shuriken.
// Low-poly props built from the references (bronze pear flask with a spout; four-point star with a centre hole).
import * as THREE from 'three';

export const ITEMS = {
  flaskChance: 0.5, flaskMax: 3, flaskLife: 40, flaskHeal: 0.35, flaskReach: 1.1,   // drop chance per kill, max on the map, s on the ground, share of max HP, pick-up radius (m)
  shuriCd: 40, shuriSpeed: 24, shuriTurn: 7, shuriLife: 1.6, shuriHit: 0.7,          // cooldown (s), m/s, homing rate, s of flight, hit radius around the chest (m)
};

let flaskGeo = null, shuriGeo = null;
const bronze = () => new THREE.MeshStandardMaterial({ color: 0x80603a, metalness: 0.75, roughness: 0.42, flatShading: true });
function flaskMesh() {
  if (!flaskGeo) {   // pear body (lathe) + collar + spout, one merged-free group of three small meshes
    const pr = [[0, 0], [0.07, 0.01], [0.11, 0.06], [0.12, 0.12], [0.1, 0.19], [0.06, 0.25], [0.035, 0.29], [0.03, 0.3]].map(([x, y]) => new THREE.Vector2(x, y));
    flaskGeo = { body: new THREE.LatheGeometry(pr, 9), collar: new THREE.CylinderGeometry(0.04, 0.042, 0.03, 9).translate(0, 0.315, 0), spout: new THREE.CylinderGeometry(0.012, 0.018, 0.08, 6).translate(0, 0.37, 0) };
  }
  const g = new THREE.Group(), m = bronze(), m2 = new THREE.MeshStandardMaterial({ color: 0xb08a50, metalness: 0.85, roughness: 0.3, flatShading: true });
  g.add(new THREE.Mesh(flaskGeo.body, m), new THREE.Mesh(flaskGeo.collar, m2), new THREE.Mesh(flaskGeo.spout, m2));
  // a warm halo on the ground so it reads from across the field
  const halo = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffb860, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.y = -0.33; g.add(halo); g.userData.halo = halo;
  g.traverse(o => { if (o.isMesh && o !== halo) o.castShadow = true; });
  return g;
}
function shuriMesh() {
  if (!shuriGeo) {
    const s = new THREE.Shape(), R = 0.1, r = 0.028;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, k = i % 2 ? r : R; i ? s.lineTo(Math.cos(a) * k, Math.sin(a) * k) : s.moveTo(Math.cos(a) * k, Math.sin(a) * k); }
    const hole = new THREE.Path(); hole.absarc(0, 0, 0.014, 0, Math.PI * 2, true); s.holes.push(hole);
    shuriGeo = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1, curveSegments: 6 }).rotateX(Math.PI / 2).translate(0, 0, 0);
  }
  return new THREE.Mesh(shuriGeo, new THREE.MeshStandardMaterial({ color: 0x2c2c32, metalness: 0.9, roughness: 0.32 }));
}

export class Flasks {
  constructor(scene) { this.scene = scene; this.list = new Map(); this.nextId = 1; }
  add(id, x, y, z) {
    if (this.list.has(id)) return; const m = flaskMesh(); m.position.set(x, y + 0.36, z); this.scene.add(m);
    this.list.set(id, { id, m, x, z, y, t: 0 }); this.nextId = Math.max(this.nextId, id + 1);
  }
  remove(id) { const f = this.list.get(id); if (!f) return; this.scene.remove(f.m); f.m.traverse(o => { if (o.material) o.material.dispose(); }); this.list.delete(id); }
  clear() { for (const id of [...this.list.keys()]) this.remove(id); }
  // returns the id of a flask the player is standing on (or null); ages and animates the rest
  update(dt, p) {
    let got = null;
    for (const f of this.list.values()) {
      f.t += dt; f.m.rotation.y += dt * 1.6; f.m.position.y = f.y + 0.36 + Math.sin(f.t * 2.4) * 0.05;
      const blink = ITEMS.flaskLife - f.t < 6 ? (Math.sin(f.t * 12) > 0 ? 1 : 0.25) : 1; f.m.userData.halo.material.opacity = 0.35 * blink; f.m.visible = blink > 0.3 || f.t % 0.2 < 0.12;
      if (f.t > ITEMS.flaskLife) { this.remove(f.id); continue; }
      if (p && Math.hypot(p.x - f.x, p.z - f.z) < ITEMS.flaskReach) got = f.id;
    }
    return got;
  }
}

// a thrown shuriken: homes onto the locked target's chest, stops on walls (line of sight), spins
export class Shuriken {
  constructor(scene, from, target, los, visualOnly = false) {
    this.scene = scene; this.target = target; this.los = los; this.visual = visualOnly; this.t = 0; this.done = false;
    this.m = shuriMesh(); this.m.position.copy(from); scene.add(this.m);
    const aim = target.hitPoint.clone().sub(from).normalize(); this.v = aim.multiplyScalar(ITEMS.shuriSpeed);
  }
  // returns 'hit' when it reaches the target, 'wall' when it struck an obstacle, null while flying
  update(dt) {
    if (this.done) return null; this.t += dt;
    const p = this.m.position, tgt = this.target && !this.target.dead ? this.target.hitPoint : null;
    if (tgt) { const want = tgt.clone().sub(p).normalize().multiplyScalar(ITEMS.shuriSpeed); this.v.lerp(want, 1 - Math.exp(-ITEMS.shuriTurn * dt)).setLength(ITEMS.shuriSpeed); }
    const next = p.clone().addScaledVector(this.v, dt);
    if (this.los && !this.los(p, next)) { this.finish(); return 'wall'; }
    p.copy(next); this.m.rotation.y += dt * 40;
    if (tgt && p.distanceTo(tgt) < ITEMS.shuriHit) { this.finish(); return 'hit'; }
    if (this.t > ITEMS.shuriLife) { this.finish(); return 'miss'; }
    return null;
  }
  finish() { this.done = true; this.scene.remove(this.m); this.m.material.dispose(); }
}
