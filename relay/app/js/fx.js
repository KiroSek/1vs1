import * as THREE from 'three';

const rnd = (a, b) => a + Math.random() * (b - a);
function tex(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const glowT = () => tex(64, (x, s) => { const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, '#fff'); g.addColorStop(0.3, 'rgba(255,255,255,.75)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, s, s); });
const starT = () => tex(256, (x, s) => {
  let g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.1, 'rgba(255,245,220,.95)'); g.addColorStop(0.35, 'rgba(255,180,80,.35)'); g.addColorStop(1, 'rgba(255,120,30,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s); x.globalCompositeOperation = 'lighter';
  for (const [a, len, w] of [[0, 1, 4], [Math.PI / 2, .7, 3], [Math.PI / 4, .5, 2], [-Math.PI / 4, .5, 2], [0.35, .35, 1.5], [1.95, .4, 1.5]]) {
    x.save(); x.translate(s / 2, s / 2); x.rotate(a); const lg = x.createLinearGradient(-s / 2 * len, 0, s / 2 * len, 0);
    lg.addColorStop(0, 'rgba(255,220,150,0)'); lg.addColorStop(.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,220,150,0)'); x.fillStyle = lg; x.fillRect(-s / 2 * len, -w / 2, s * len, w); x.restore();
  }
});
const streakT = () => tex(256, (x, s) => {   // horizontal anamorphic lens streak
  const g = x.createLinearGradient(0, 0, s, 0); g.addColorStop(0, 'rgba(255,140,40,0)'); g.addColorStop(0.5, 'rgba(255,250,235,1)'); g.addColorStop(1, 'rgba(255,140,40,0)');
  x.fillStyle = g; const v = x.createLinearGradient(0, s / 2 - 6, 0, s / 2 + 6); x.fillRect(0, s / 2 - 3, s, 6);
  x.globalCompositeOperation = 'destination-in'; v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(0.5, 'rgba(0,0,0,1)'); v.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = v; x.fillRect(0, 0, s, s);
});
const kanjiT = (ch, col) => tex(256, (x, s) => {
  x.font = 'bold 190px "Yu Mincho","MS Mincho",serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = col; x.shadowBlur = 30; x.fillStyle = col; x.fillText(ch, s / 2, s / 2 + 8); x.shadowBlur = 0; x.fillStyle = '#fff2ee'; x.globalAlpha = .35; x.fillText(ch, s / 2, s / 2 + 8);
});

export class FX {
  constructor(scene) {
    this.scene = scene; this.density = 1; this.t = 0;
    const glow = glowT();
    // ---- sparks: hot points + velocity streak lines ----
    this.N = 900; this.life = new Float32Array(this.N); this.life0 = new Float32Array(this.N); this.vel = new Float32Array(this.N * 3); this.col = new Float32Array(this.N * 3); this.grav = new Float32Array(this.N); this.head = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 3).fill(-999), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.N * 3), 3));
    this.sparks = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.05, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.sparks.frustumCulled = false; scene.add(this.sparks);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.N * 6).fill(-999), 3)); lg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.N * 6), 3));
    this.streaks = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    this.streaks.frustumCulled = false; scene.add(this.streaks);
    // ---- soft particles: blood mist, dust, embers (sprites in one Points cloud) ----
    this.M = 500; this.mLife = new Float32Array(this.M); this.mLife0 = new Float32Array(this.M); this.mVel = new Float32Array(this.M * 3); this.mCol = new Float32Array(this.M * 3); this.mG = new Float32Array(this.M); this.mHead = 0;
    const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.M * 3).fill(-999), 3)); mg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.M * 3), 3));
    this.mist = new THREE.Points(mg, new THREE.PointsMaterial({ size: 0.16, map: glow, vertexColors: true, transparent: true, depthWrite: false, opacity: 0.9 }));
    this.mist.frustumCulled = false; scene.add(this.mist);
    this.mistAdd = new THREE.Points(mg, new THREE.PointsMaterial({ size: 0.09, map: glow, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.0 }));
    // ---- light flash ----
    this.flash = new THREE.PointLight(0xffd9a0, 0, 14, 1.6); scene.add(this.flash); this.flashT = 0; this.flashD = 1; this.flashI = 0;
    // ---- sprite pools ----
    const star = starT(), streak = streakT();
    const pool = (n, map) => Array.from({ length: n }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false })); s.visible = false; s.renderOrder = 10; scene.add(s); return { o: s, t: 0, d: 1, s0: 1, s1: 1, ax: 1 }; });
    this.flares = pool(8, star); this.lens = pool(4, streak);
    this.rings = [];
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 64), new THREE.MeshBasicMaterial({ color: 0xffe2a8, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.visible = false; m.renderOrder = 9; scene.add(m); this.rings.push({ o: m, t: 0, d: 1, s1: 1 }); }
    // perilous warning kanji
    this.kiken = new THREE.Sprite(new THREE.SpriteMaterial({ map: kanjiT('危', '#ff2a1a'), transparent: true, depthTest: false, depthWrite: false, fog: false })); this.kiken.visible = false; this.kiken.renderOrder = 12; scene.add(this.kiken); this.kikenT = 0;
    // ---- drifting embers / dust motes in the hall (ambient) ----
    const AN = 220; this.ambN = AN; const ap = new Float32Array(AN * 3); this.ambV = new Float32Array(AN * 3);
    for (let i = 0; i < AN; i++) { ap[i * 3] = rnd(-12, 12); ap[i * 3 + 1] = rnd(0, 7); ap[i * 3 + 2] = rnd(-9, 9); this.ambV[i * 3] = rnd(-.1, .1); this.ambV[i * 3 + 1] = rnd(.02, .12); this.ambV[i * 3 + 2] = rnd(-.1, .1); }
    const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.BufferAttribute(ap, 3));
    this.amb = new THREE.Points(ag, new THREE.PointsMaterial({ size: 0.05, color: 0xffc890, map: glow, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.amb.frustumCulled = false; scene.add(this.amb);
  }
  // sparks: dir biases the spray (e.g. away from the blade contact), spread 0..1
  spark(pos, n, speed, color, life = 0.45, dir = null, spread = 1, grav = 9) {
    n = Math.ceil(n * this.density); const P = this.sparks.geometry.attributes.position, c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.head; this.head = (this.head + 1) % this.N;
      P.setXYZ(i, pos.x, pos.y, pos.z);
      let vx = rnd(-1, 1), vy = rnd(-0.4, 1.2), vz = rnd(-1, 1); const l = Math.hypot(vx, vy, vz) || 1; vx /= l; vy /= l; vz /= l;
      if (dir) { vx = vx * spread + dir.x * (1 - spread); vy = vy * spread + dir.y * (1 - spread); vz = vz * spread + dir.z * (1 - spread); }
      const s = speed * rnd(0.3, 1.25); this.vel[i * 3] = vx * s; this.vel[i * 3 + 1] = vy * s + 1.2; this.vel[i * 3 + 2] = vz * s;
      this.life[i] = this.life0[i] = life * rnd(0.4, 1.2); this.grav[i] = grav;
      const w = Math.random() * 0.5; this.col[i * 3] = Math.min(1.6, c.r + w); this.col[i * 3 + 1] = Math.min(1.5, c.g + w * .8); this.col[i * 3 + 2] = Math.min(1.4, c.b + w * .5);
    }
  }
  puff(pos, n, speed, color, life, size = 1, up = 0.3, grav = 0, spread = 1) {
    n = Math.ceil(n * this.density); const P = this.mist.geometry.attributes.position, c = new THREE.Color(color);
    for (let k = 0; k < n; k++) {
      const i = this.mHead; this.mHead = (this.mHead + 1) % this.M;
      P.setXYZ(i, pos.x + rnd(-.1, .1) * spread, pos.y + rnd(-.1, .1) * spread, pos.z + rnd(-.1, .1) * spread);
      const a = rnd(0, 6.283), s = speed * rnd(0.2, 1); this.mVel[i * 3] = Math.cos(a) * s; this.mVel[i * 3 + 1] = rnd(-.2, 1) * s * up + up; this.mVel[i * 3 + 2] = Math.sin(a) * s;
      this.mLife[i] = this.mLife0[i] = life * rnd(0.6, 1.2); this.mG[i] = grav; this.mCol[i * 3] = c.r; this.mCol[i * 3 + 1] = c.g; this.mCol[i * 3 + 2] = c.b;
    }
  }
  light(pos, color, intensity, dur) { this.flash.position.copy(pos); this.flash.color.setHex(color); this.flashI = intensity; this.flash.intensity = intensity; this.flashT = this.flashD = dur; }
  flare(pos, size, dur, tint = 0xffffff) { const f = this.flares.find(x => !x.o.visible) || this.flares[0]; f.o.position.copy(pos); f.o.material.color.setHex(tint); f.t = 0; f.d = dur; f.s0 = size * 0.4; f.s1 = size; f.o.visible = true; f.o.material.rotation = rnd(-.3, .3); }
  lensStreak(pos, len, dur, tint = 0xffd9a0) { const f = this.lens.find(x => !x.o.visible) || this.lens[0]; f.o.position.copy(pos); f.o.material.color.setHex(tint); f.t = 0; f.d = dur; f.s0 = len * 0.6; f.s1 = len; f.o.visible = true; }
  ring(pos, size, dur, tint = 0xffe2a8) { const f = this.rings.find(x => !x.o.visible) || this.rings[0]; f.o.position.copy(pos); f.o.material.color.setHex(tint); f.t = 0; f.d = dur; f.s1 = size; f.o.visible = true; }

  // ---------- combat events ----------
  block(pos, heavy, dir) {            // guarded hit: orange sparks, short flash
    this.spark(pos, heavy ? 90 : 55, heavy ? 9 : 7, 0xff9a3a, 0.4, dir, 0.75);
    this.flare(pos, heavy ? 0.55 : 0.4, 0.1, 0xffb060); this.light(pos, 0xff9a40, heavy ? 14 : 9, 0.1);
  }
  deflect(pos, dir, heavy) {          // perfect deflect: white-gold burst, lens streak, shockwave, spark fountain
    this.spark(pos, 260, 15, 0xffd27a, 0.6, dir, 0.85); this.spark(pos, 90, 6, 0xffffff, 0.3, null, 1, 4);
    this.spark(pos, 50, 22, 0xffe7b0, 0.25, dir, 0.4, 2);
    this.flare(pos, heavy ? 0.8 : 0.65, 0.18, 0xffffff); this.flare(pos, 0.35, 0.3, 0xffd890);
    this.lensStreak(pos, heavy ? 3.6 : 3, 0.26); this.ring(pos, 1.0, 0.24, 0xfff0c8);
    this.light(pos, 0xfff0d0, 45, 0.25);
  }
  clash(pos, dir) { this.spark(pos, 160, 12, 0xffc060, 0.5, dir, 0.9); this.flare(pos, 0.9, 0.2, 0xffe0a0); this.lensStreak(pos, 2.6, 0.2); this.ring(pos, 0.9, 0.2); this.light(pos, 0xffd090, 35, 0.2); }
  hit(pos, dir, heavy) {               // flesh: dark blood spray along the cut + mist
    this.spark(pos, heavy ? 70 : 45, heavy ? 7 : 5, 0x8a0808, 0.6, dir, 0.55, 12);
    this.puff(pos, heavy ? 26 : 16, 1.6, 0x5a0606, 0.9, 1, 0.1, 3);
    this.flare(pos, heavy ? 0.5 : 0.35, 0.06, 0xff6050); this.light(pos, 0xff3020, 6, 0.08);
  }
  mikiri(pos) { this.spark(pos, 180, 10, 0xffe2a0, 0.5); this.flare(pos, 1.2, 0.3, 0xfff6e0); this.ring(pos, 1.6, 0.35, 0xffffff); this.lensStreak(pos, 3.5, 0.3, 0xffffff); this.light(pos, 0xffffff, 40, 0.3); }
  finisher(pos, dir) {
    this.spark(pos, 140, 9, 0x9a0a0a, 0.9, dir, 0.6, 12); this.puff(pos, 60, 2.6, 0x620606, 1.4, 1, 0.2, 2);
    this.flare(pos, 0.9, 0.3, 0xff2a1a); this.ring(pos, 1.8, 0.42, 0xff3020); this.lensStreak(pos, 4, 0.4, 0xff4030); this.light(pos, 0xff2a18, 25, 0.4);
  }
  broken(pos) { this.spark(pos, 70, 5, 0xff7a30, 0.6); this.ring(pos, 1.2, 0.4, 0xff8a40); this.flare(pos, 0.7, 0.25, 0xff9a50); }
  revive(pos) { this.puff(pos, 70, 0.9, 0xffc060, 1.8, 1, 1.6, -0.3, 3); this.spark(pos, 80, 3, 0xffd890, 1.2, new THREE.Vector3(0, 1, 0), 0.6, -1); this.ring(new THREE.Vector3(pos.x, 0.05, pos.z), 2, 0.8, 0xffd27a); this.light(pos, 0xffc070, 30, 0.8); }
  // leaves / petals kicked up by fast movement: slow fall, wide spread
  leaves(pos, n = 10, color = 0xb06a2a) { this.puff(new THREE.Vector3(pos.x, 0.15, pos.z), n, 2.2, color, 1.4, 0.55, 1.4, 1.2, 2.5); }
  dust(pos, n = 10) { this.puff(new THREE.Vector3(pos.x, 0.08, pos.z), n, 1.2, 0x6a5a4a, 0.7, 1, 0.25, 0, 2); }
  perilous(f) { this.kikenFighter = f; this.kikenT = 0.65; }

  update(dt, cam) {
    this.t += dt;
    const P = this.sparks.geometry.attributes.position, C = this.sparks.geometry.attributes.color, LP = this.streaks.geometry.attributes.position, LC = this.streaks.geometry.attributes.color;
    for (let i = 0; i < this.N; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { P.setXYZ(i, 0, -999, 0); LP.setXYZ(i * 2, 0, -999, 0); LP.setXYZ(i * 2 + 1, 0, -999, 0); continue; }
      const drag = Math.exp(-1.8 * dt); this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      const vx = this.vel[i * 3], vy = (this.vel[i * 3 + 1] -= this.grav[i] * dt), vz = this.vel[i * 3 + 2];
      let x = P.getX(i) + vx * dt, y = P.getY(i) + vy * dt, z = P.getZ(i) + vz * dt;
      if (y < 0.01 && vy < 0) { y = 0.01; this.vel[i * 3 + 1] *= -0.35; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
      P.setXYZ(i, x, y, z);
      const f = Math.min(1, this.life[i] / this.life0[i] * 1.8), r = this.col[i * 3] * f, g = this.col[i * 3 + 1] * f * f, b = this.col[i * 3 + 2] * f * f * f;
      C.setXYZ(i, r, g, b); const k = 0.035;
      LP.setXYZ(i * 2, x, y, z); LP.setXYZ(i * 2 + 1, x - vx * k, y - vy * k, z - vz * k); LC.setXYZ(i * 2, r, g, b); LC.setXYZ(i * 2 + 1, r * 0.2, g * 0.1, 0);
    }
    P.needsUpdate = C.needsUpdate = LP.needsUpdate = LC.needsUpdate = true;
    const MP = this.mist.geometry.attributes.position, MC = this.mist.geometry.attributes.color;
    for (let i = 0; i < this.M; i++) {
      if (this.mLife[i] <= 0) continue; this.mLife[i] -= dt;
      if (this.mLife[i] <= 0) { MP.setXYZ(i, 0, -999, 0); continue; }
      const d = Math.exp(-2.5 * dt); this.mVel[i * 3] *= d; this.mVel[i * 3 + 2] *= d; this.mVel[i * 3 + 1] = this.mVel[i * 3 + 1] * d - this.mG[i] * dt;
      MP.setXYZ(i, MP.getX(i) + this.mVel[i * 3] * dt, Math.max(0.02, MP.getY(i) + this.mVel[i * 3 + 1] * dt), MP.getZ(i) + this.mVel[i * 3 + 2] * dt);
      const f = this.mLife[i] / this.mLife0[i]; MC.setXYZ(i, this.mCol[i * 3] * f, this.mCol[i * 3 + 1] * f, this.mCol[i * 3 + 2] * f);
    }
    MP.needsUpdate = MC.needsUpdate = true;
    if (this.flashT > 0) { this.flashT -= dt; this.flash.intensity = this.flashI * Math.max(0, this.flashT / this.flashD) ** 1.5; }
    for (const f of this.flares) if (f.o.visible) { f.t += dt; const u = f.t / f.d; if (u >= 1) { f.o.visible = false; continue; } const s = f.s0 + (f.s1 - f.s0) * Math.min(1, u * 5); f.o.scale.set(s, s, 1); f.o.material.opacity = 1 - u * u; }
    for (const f of this.lens) if (f.o.visible) { f.t += dt; const u = f.t / f.d; if (u >= 1) { f.o.visible = false; continue; } const s = f.s0 + (f.s1 - f.s0) * Math.min(1, u * 3); f.o.scale.set(s, s * 0.09 * (1 - u * 0.5), 1); f.o.material.opacity = (1 - u) ** 1.5; }
    for (const f of this.rings) if (f.o.visible) { f.t += dt; const u = f.t / f.d; if (u >= 1) { f.o.visible = false; continue; } const s = 0.15 + f.s1 * (1 - Math.pow(1 - u, 3)); f.o.scale.set(s, s, 1); f.o.material.opacity = (1 - u) * 0.85; if (cam) f.o.quaternion.copy(cam.quaternion); }
    // perilous kanji over the attacker's head
    if (this.kikenT > 0 && this.kikenFighter) {
      this.kikenT -= dt; const f = this.kikenFighter, u = 1 - this.kikenT / 0.65, s = 0.9 + 0.5 * Math.max(0, 1 - u * 4);
      this.kiken.visible = true; this.kiken.position.set(f.pos.x, 2.35 * (f.scaleF || 1), f.pos.z); this.kiken.scale.set(s, s, 1); this.kiken.material.opacity = Math.min(1, this.kikenT * 4);
    } else this.kiken.visible = false;
    const ap = this.amb.geometry.attributes.position;
    for (let i = 0; i < this.ambN; i++) {
      let x = ap.getX(i) + (this.ambV[i * 3] + Math.sin(this.t * 0.6 + i) * 0.06) * dt, y = ap.getY(i) + this.ambV[i * 3 + 1] * dt, z = ap.getZ(i) + (this.ambV[i * 3 + 2] + Math.cos(this.t * 0.5 + i) * 0.06) * dt;
      if (y > 7) { y = 0.2; x = rnd(-12, 12); z = rnd(-9, 9); } ap.setXYZ(i, x, y, z);
    }
    ap.needsUpdate = true;
  }
}

// ---------- sword trail: additive ribbon, bright at the edge, fading with age ----------
export class SlashTrail {
  constructor(scene, n = 28) {
    this.n = n; this.pts = []; this.scene = scene; this.power = 1; this.red = false; this.fadeOut = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2 * 2), 2));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { power: { value: 1 }, tint: { value: new THREE.Color(0xdfe8ff) }, fade: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec2 vUv; uniform float power; uniform vec3 tint; uniform float fade;
        void main(){ float age=vUv.x; float across=vUv.y;
          float edge=smoothstep(0.35,1.0,across)*(1.0-smoothstep(0.97,1.0,across)*0.6);
          float core=pow(smoothstep(0.75,0.99,across),3.0);
          float a=(edge*0.55+core*1.2)*pow(1.0-age,1.8)*power*fade;
          gl_FragColor=vec4(mix(tint,vec3(1.0),core)*a,a); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; scene.add(this.mesh);
  }
  push(a, b) { this.pts.unshift([a.clone(), b.clone()]); if (this.pts.length > this.n) this.pts.pop(); this.fadeOut = 1; }
  clear() { this.pts.length = 0; }
  update(dt, on) {
    if (!on) { this.fadeOut = Math.max(0, this.fadeOut - dt * 7); if (this.fadeOut <= 0) this.pts.length = 0; else if (this.pts.length > 2) { this.pts.pop(); } }
    this.mat.uniforms.power.value = this.power; this.mat.uniforms.fade.value = on ? 1 : this.fadeOut; this.mat.uniforms.tint.value.setHex(this.red ? 0xff6050 : (this.baseTint ?? 0xdfe8ff));
    const P = this.mesh.geometry.attributes.position, U = this.mesh.geometry.attributes.uv, m = this.pts.length;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[Math.min(i, m - 1)];
      if (!p || m < 2) { P.setXYZ(i * 2, 0, -999, 0); P.setXYZ(i * 2 + 1, 0, -999, 0); continue; }
      P.setXYZ(i * 2, p[0].x, p[0].y, p[0].z); P.setXYZ(i * 2 + 1, p[1].x, p[1].y, p[1].z);
      const age = Math.min(1, i / Math.max(1, m - 1)); U.setXY(i * 2, age, 0); U.setXY(i * 2 + 1, age, 1);
    }
    P.needsUpdate = U.needsUpdate = true;
  }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mat.dispose(); }
}
