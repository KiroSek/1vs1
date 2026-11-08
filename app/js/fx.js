import * as THREE from 'three';

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(0.35, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}
function starTexture() {   // bright flash with spikes
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s; const x = c.getContext('2d');
  let g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.12, 'rgba(255,240,200,.95)'); g.addColorStop(0.4, 'rgba(255,170,70,.35)'); g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  x.globalCompositeOperation = 'lighter';
  for (const [a, len, w] of [[0, 1, 5], [Math.PI / 2, .85, 4], [Math.PI / 4, .6, 3], [-Math.PI / 4, .6, 3], [0.3, .45, 2], [1.9, .5, 2]]) {
    x.save(); x.translate(s / 2, s / 2); x.rotate(a);
    const lg = x.createLinearGradient(-s / 2 * len, 0, s / 2 * len, 0); lg.addColorStop(0, 'rgba(255,220,150,0)'); lg.addColorStop(.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,220,150,0)');
    x.fillStyle = lg; x.fillRect(-s / 2 * len, -w / 2, s * len, w); x.restore();
  }
  return new THREE.CanvasTexture(c);
}

export class FX {
  constructor(scene, density = 1) {
    this.scene = scene; this.density = density; this.cam = null;
    const glow = glowTexture();
    // spark pool: glowing points + velocity streaks
    this.N = 700; this.life = new Float32Array(this.N); this.vel = new Float32Array(this.N * 3); this.col = new Float32Array(this.N * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3).fill(-999), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.16, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.frustumCulled = false; scene.add(this.sparks);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 6).fill(-999), 3));
    lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.N * 6), 3));
    this.streaks = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.streaks.frustumCulled = false; scene.add(this.streaks); this.head = 0;
    // flash light
    this.flash = new THREE.PointLight(0xffd9a0, 0, 12); scene.add(this.flash); this.flashT = 0; this.flashI = 0;
    // flash sprites + shockwave rings
    const star = starTexture(); this.flares = [];
    for (let i = 0; i < 6; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: star, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); s.visible = false; scene.add(s); this.flares.push({ o: s, t: 0, d: 1, s0: 1, s1: 1 }); }
    this.rings = [];
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.visible = false; scene.add(m); this.rings.push({ o: m, t: 0, d: 1, s1: 1 }); }
    this.screenFlash = null;
    // petals
    const PN = 160; this.petalN = PN;
    const pg = new THREE.BufferGeometry(); const pp = new Float32Array(PN * 3);
    this.petalV = new Float32Array(PN * 3);
    for (let i = 0; i < PN; i++) { pp[i * 3] = (Math.random() - .5) * 40; pp[i * 3 + 1] = Math.random() * 9; pp[i * 3 + 2] = (Math.random() - .5) * 40; this.petalV[i * 3] = -0.4 - Math.random() * .6; this.petalV[i * 3 + 1] = -0.4 - Math.random() * .4; this.petalV[i * 3 + 2] = (Math.random() - .5) * .5; }
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    this.petals = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.13, color: 0xffc0d0, map: glow, transparent: true, depthWrite: false }));
    this.petals.frustumCulled = false; scene.add(this.petals);
    this.t = 0;
  }
  spawn(pos, n, speed, r, g, b, up = 1, life = 0.5) {
    n = Math.ceil(n * this.density);
    const P = this.sparks.geometry.attributes.position;
    for (let k = 0; k < n; k++) {
      const i = this.head; this.head = (this.head + 1) % this.N;
      P.setXYZ(i, pos.x, pos.y, pos.z);
      const a = Math.random() * 6.283, e = (Math.random() - 0.35) * 1.8, s = speed * (0.25 + Math.random() * 0.95);
      this.vel[i * 3] = Math.cos(a) * s; this.vel[i * 3 + 1] = Math.abs(e) * s * up + 1.5; this.vel[i * 3 + 2] = Math.sin(a) * s;
      this.life[i] = life * (0.45 + Math.random() * 0.8);
      const w = Math.random() * 0.4; this.col[i * 3] = Math.min(1, r + w); this.col[i * 3 + 1] = Math.min(1, g + w * .7); this.col[i * 3 + 2] = Math.min(1, b + w * .4);
    }
  }
  light(pos, color, intensity, dur) { this.flash.position.copy(pos); this.flash.color.setHex(color); this.flashI = intensity; this.flash.intensity = intensity; this.flashT = dur; this.flashD = dur; }
  flare(pos, size, dur, tint = 0xffffff) {
    const f = this.flares.find(x => !x.o.visible) || this.flares[0];
    f.o.position.copy(pos); f.o.material.color.setHex(tint); f.t = 0; f.d = dur; f.s0 = size * 0.35; f.s1 = size; f.o.visible = true;
  }
  ring(pos, size, dur, tint = 0xffe2a8) {
    const f = this.rings.find(x => !x.o.visible) || this.rings[0];
    f.o.position.copy(pos); f.o.material.color.setHex(tint); f.t = 0; f.d = dur; f.s1 = size; f.o.visible = true;
  }
  clash(pos, big) {          // normal block / blade contact
    this.spawn(pos, big ? 110 : 70, big ? 11 : 8, 1, .62, .2, 1, .45);
    this.flare(pos, big ? 2.2 : 1.6, 0.14, 0xffc070); this.light(pos, 0xffa850, big ? 90 : 60, 0.14);
  }
  parry(pos) {               // perfect parry: huge white-gold flash + shockwave + dense sparks
    this.spawn(pos, 220, 17, 1, .85, .45, 1, .65); this.spawn(pos, 70, 7, 1, 1, .9, 1.3, .35);
    this.flare(pos, 4.4, 0.28, 0xffffff); this.flare(pos, 2.2, 0.4, 0xffe9a0); this.ring(pos, 1.9, 0.28);
    this.light(pos, 0xfff0c8, 320, 0.28);
  }
  hit(pos, dir) {            // flesh hit: dark red burst along slash direction
    this.spawn(pos, 55, 6, .75, .02, .02, .8, .55); this.spawn(pos, 25, 3, .5, 0, 0, .4, .8);
    this.flare(pos, 1.2, 0.1, 0xff5040); this.light(pos, 0xff3020, 40, 0.12);
  }
  finisher(pos) {
    this.spawn(pos, 160, 9, .9, .02, .02, 1.2, .9); this.spawn(pos, 90, 14, 1, .7, .4, 1, .5);
    this.flare(pos, 4, 0.35, 0xff3a2a); this.ring(pos, 3.4, 0.4, 0xff4030); this.light(pos, 0xff2a18, 200, 0.35);
  }
  update(dt, cam) {
    const P = this.sparks.geometry.attributes.position, C = this.sparks.geometry.attributes.color;
    const LP = this.streaks.geometry.attributes.position, LC = this.streaks.geometry.attributes.color;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { P.setXYZ(i, 0, -999, 0); LP.setXYZ(i * 2, 0, -999, 0); LP.setXYZ(i * 2 + 1, 0, -999, 0); continue; }
      const vx = this.vel[i * 3], vy = (this.vel[i * 3 + 1] -= 16 * dt), vz = this.vel[i * 3 + 2];
      const x = P.getX(i) + vx * dt, y = P.getY(i) + vy * dt, z = P.getZ(i) + vz * dt;
      P.setXYZ(i, x, y, z);
      const f = Math.min(1, this.life[i] * 2.5);
      C.setXYZ(i, this.col[i * 3] * f, this.col[i * 3 + 1] * f, this.col[i * 3 + 2] * f);
      LP.setXYZ(i * 2, x, y, z); LP.setXYZ(i * 2 + 1, x - vx * 0.045, y - vy * 0.045, z - vz * 0.045);
      LC.setXYZ(i * 2, this.col[i * 3] * f, this.col[i * 3 + 1] * f, this.col[i * 3 + 2] * f); LC.setXYZ(i * 2 + 1, this.col[i * 3] * f * .25, this.col[i * 3 + 1] * f * .1, 0);
    }
    P.needsUpdate = C.needsUpdate = LP.needsUpdate = LC.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; this.flash.intensity = this.flashI * Math.max(0, this.flashT / this.flashD); if (this.flashT <= 0) this.flash.intensity = 0; }
    for (const f of this.flares) if (f.o.visible) {
      f.t += dt; const u = f.t / f.d; if (u >= 1) { f.o.visible = false; continue; }
      const s = f.s0 + (f.s1 - f.s0) * Math.min(1, u * 4); f.o.scale.set(s, s, 1); f.o.material.opacity = 1 - u * u;
    }
    for (const f of this.rings) if (f.o.visible) {
      f.t += dt; const u = f.t / f.d; if (u >= 1) { f.o.visible = false; continue; }
      const s = 0.15 + f.s1 * (1 - Math.pow(1 - u, 3)); f.o.scale.set(s, s, 1); f.o.material.opacity = (1 - u) * 0.9; if (cam) f.o.quaternion.copy(cam.quaternion);
    }
    this.t += dt;
    const pp = this.petals.geometry.attributes.position;
    for (let i = 0; i < this.petalN; i++) {
      let x = pp.getX(i) + (this.petalV[i * 3] + Math.sin(this.t + i) * 0.4) * dt, y = pp.getY(i) + this.petalV[i * 3 + 1] * dt, z = pp.getZ(i) + (this.petalV[i * 3 + 2] + Math.cos(this.t * .7 + i) * .3) * dt;
      if (y < 0) { y = 8 + Math.random() * 2; x = (Math.random() - .5) * 40; z = (Math.random() - .5) * 40; }
      pp.setXYZ(i, x, y, z);
    }
    pp.needsUpdate = true;
  }
}

// Sword slash trail ribbon
export class Trail {
  constructor(scene, n = 16) {
    this.n = n; this.pts = []; this.scene = scene; this.power = 1;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  push(a, b) { this.pts.unshift([a.clone(), b.clone()]); if (this.pts.length > this.n) this.pts.pop(); }
  update(on) {
    if (!on) { this.pts.pop(); this.pts.pop(); }
    const P = this.mesh.geometry.attributes.position, C = this.mesh.geometry.attributes.color, k = this.power;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[Math.min(i, this.pts.length - 1)];
      if (!p) { P.setXYZ(i * 2, 0, -999, 0); P.setXYZ(i * 2 + 1, 0, -999, 0); continue; }
      P.setXYZ(i * 2, p[0].x, p[0].y, p[0].z); P.setXYZ(i * 2 + 1, p[1].x, p[1].y, p[1].z);
      const f = i < this.pts.length ? Math.pow(1 - i / this.n, 1.6) * 0.8 * k : 0;
      C.setXYZ(i * 2, f * 0.95, f * 0.9, f * 0.8); C.setXYZ(i * 2 + 1, f * 0.12, f * 0.15, f * 0.25);
    }
    P.needsUpdate = C.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}
