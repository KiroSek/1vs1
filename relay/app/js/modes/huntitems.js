// Shadow Hunt props: the thrown stone (a faceted low-poly rock, as in the references). It flies on a real arc from the
// hand along the camera, stops on walls, bounces once off the ground and makes its noise where it lands.
import * as THREE from 'three';

export const STONE = { speed: 13, lift: 0.5, pitchK: 0.65, minA: 0.05, maxA: 0.95, g: 14, bounce: 0.3, life: 3, loud: 0.9 };   // m/s, rad, gravity m/s^2

let geo = null, mat = null;
function stoneMesh() {
  if (!geo) {   // an irregular 8-facet nugget: icosahedron, vertices pushed in/out, flat shaded
    const g = new THREE.IcosahedronGeometry(0.055, 0), p = g.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!seen.has(k)) seen.set(k, 0.75 + Math.random() * 0.45); const s = seen.get(k); p.setXYZ(i, p.getX(i) * s * 1.25, p.getY(i) * s * 0.8, p.getZ(i) * s); }
    g.computeVertexNormals(); geo = g;
    mat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, roughness: 0.8, flatShading: true });
  }
  const m = new THREE.Mesh(geo, mat); m.castShadow = true; return m;
}

export class Stone {
  // from: hand position, yaw/pitch: camera aim. W: world (ground / los / bounds). Returns a noise position once it lands.
  constructor(scene, W, from, yaw, pitch, vel = null) {
    this.scene = scene; this.W = W; this.t = 0; this.done = false; this.bounced = false;
    this.m = stoneMesh(); this.m.position.copy(from); scene.add(this.m);
    if (vel) this.v = vel.clone();
    else { const a = Math.min(STONE.maxA, Math.max(STONE.minA, STONE.lift - pitch * STONE.pitchK)); this.v = new THREE.Vector3(Math.sin(yaw) * Math.cos(a), Math.sin(a), Math.cos(yaw) * Math.cos(a)).multiplyScalar(STONE.speed); }
    this.v0 = this.v.clone();
  }
  // 'land' (first ground contact), 'wall', or null
  update(dt) {
    if (this.done) return null; this.t += dt;
    const p = this.m.position, n = p.clone().addScaledVector(this.v, dt); this.v.y -= STONE.g * dt;
    this.m.rotation.x += dt * 14; this.m.rotation.z += dt * 9;
    if (!this.W.los(p, n, 0.25)) { this.v.multiplyScalar(-0.25); this.v.y = 0; this.land = p.clone(); if (!this.bounced) { this.bounced = true; return 'wall'; } this.finish(); return null; }
    const gy = this.W.ground(n.x, n.z);
    if (n.y <= gy + 0.04) {
      n.y = gy + 0.04; this.land = n.clone(); p.copy(n);
      if (!this.bounced) { this.bounced = true; this.v.set(this.v.x * STONE.bounce, Math.abs(this.v.y) * STONE.bounce, this.v.z * STONE.bounce); return 'land'; }
      this.v.set(0, 0, 0); if (this.t > STONE.life) this.finish(); return null;
    }
    p.copy(n); this.W.bounds(p, 0.1);
    if (this.t > STONE.life + 2) this.finish();
    return null;
  }
  finish() { if (this.done) return; this.done = true; this.scene.remove(this.m); }
}
