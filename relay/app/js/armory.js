// Armory showroom: a dark dojo hall with a row of podiums. The chosen blade / character stands on the lit centre podium
// inside a column of warm light; the neighbours wait in the dusk to either side. Rendered by the main renderer instead of
// the game view while the Armory screen is open (main.js). Characters are real Fighters, so every skin shows as in game.
import * as THREE from 'three';
import { WEAPONS, OUTFITS, makeKatana } from './gear.js';

const V3 = THREE.Vector3;
export const ARM = {
  gap: { weapons: 1.9, chars: 1.9 }, back: 0.45, side: 2, rate: 7, spin: 0.35,           // podium spacing (m: a lying blade never reaches the next one), how far neighbours step back, slots each side, carousel speed, idle turn (rad/s)
  bladeH: 0.62, idleAfter: 2.5, dragK: 0.008, pitchMax: 0.9,                                // blade height over the podium (m); idle turning resumes after s without dragging; drag rad/px; max tilt
  cam: { weapons: [0.55, 1.25, 4.9, 0.55], chars: [0.6, 1.35, 5.4, 0.95] },               // camera x,y,z and look-at height (x: the row sits left of the info card)
  column: { weapons: 0.3, chars: 0.75 },                                                     // brightness of the light column
  exposure: 1.25,
};

function glowTex() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 128; const x = c.getContext('2d'), g = x.createLinearGradient(0, 128, 0, 0);
  g.addColorStop(0, 'rgba(255,190,110,0.85)'); g.addColorStop(0.35, 'rgba(255,150,70,0.28)'); g.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = g; x.fillRect(0, 0, 4, 128);
  return new THREE.CanvasTexture(c);
}

export class Armory {
  // makeFighter(scene, style, weapon) -> Fighter (built in our scene)
  constructor(renderer, envFrom, makeFighter) {
    this.R = renderer; this.makeFighter = makeFighter; this.user = { yaw: 0, pitch: 0, last: -99 }; this.active = false; this.tab = 'weapons'; this.sel = 0; this.pos = 0; this.items = []; this.t = 0;
    const S = this.scene = new THREE.Scene(); S.background = new THREE.Color(0x0b0807); S.fog = new THREE.FogExp2(0x0e0908, 0.07); this.envFrom = envFrom;
    this.camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.05, 60);
    // hall: dark plank floor, wall of vertical slats behind, two paper lanterns glowing far back
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b1e17, roughness: 0.55, metalness: 0.05 })); floor.position.y = -0.32; floor.receiveShadow = true; S.add(floor);
    const slats = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 6, 0.12), new THREE.MeshStandardMaterial({ color: 0x24170f, roughness: 0.8 }), 60), M = new THREE.Matrix4();
    for (let i = 0; i < 60; i++) slats.setMatrixAt(i, M.makeTranslation(-15 + i * 0.5, 2.6, -4.2)); S.add(slats);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(30, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a100b, roughness: 0.8 })); beam.position.set(0, 3.2, -4); S.add(beam);
    for (const x of [-4.5, 4.5]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10), new THREE.MeshBasicMaterial({ color: 0xffa860 })); l.position.set(x, 2.2, -3.8); S.add(l); const pl = new THREE.PointLight(0xff9050, 6, 7, 2); pl.position.set(x, 2.1, -3.4); S.add(pl); }
    S.add(new THREE.HemisphereLight(0x8a6a58, 0x120808, 0.55));
    const key = this.key = new THREE.SpotLight(0xffd6a8, 60, 12, 0.42, 0.55, 1.6); key.position.set(0, 5, 1.6); key.target.position.set(0, 0.6, 0); key.castShadow = true; key.shadow.mapSize.setScalar(1024); key.shadow.bias = -0.0005; S.add(key, key.target);
    const rim = new THREE.DirectionalLight(0xff6a40, 1.2); rim.position.set(-2, 3, -5); S.add(rim);
    const fill = this.fill = new THREE.DirectionalLight(0x9aa8c8, 0.35); fill.position.set(3, 2, 4); S.add(fill);
    // podiums (fixed slots; the items slide over them)
    const stone = new THREE.MeshStandardMaterial({ color: 0x2c2522, roughness: 0.7, metalness: 0.1 }), gold = new THREE.MeshStandardMaterial({ color: 0xb08040, roughness: 0.35, metalness: 1 });
    this.podiums = new THREE.Group(); S.add(this.podiums);
    // light column over the centre podium: the "glass case" of the references
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 2.4, 24, 1, true), new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    col.position.y = 1.2; this.column = col; S.add(col);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.68, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa860, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })); disc.position.y = 0.005; this.disc = disc; S.add(disc);
    this.podGeo = { top: new THREE.CylinderGeometry(0.7, 0.78, 0.32, 32), rim: new THREE.TorusGeometry(0.72, 0.022, 6, 40).rotateX(Math.PI / 2) }; this.podMat = { stone, gold };
    // embers drifting up in the light
    const P = new Float32Array(90 * 3); for (let i = 0; i < 90; i++) P.set([(Math.random() - 0.5) * 1.4, Math.random() * 2.4, (Math.random() - 0.5) * 1.4], i * 3);
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(P, 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: 0xffb070, size: 0.025, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })); S.add(this.embers);
  }
  layoutPodiums() {
    for (const c of [...this.podiums.children]) this.podiums.remove(c);
    const gap = ARM.gap[this.tab];
    for (let o = -ARM.side - 1; o <= ARM.side + 1; o++) {
      const p = new THREE.Group(), top = new THREE.Mesh(this.podGeo.top, this.podMat.stone), rim = new THREE.Mesh(this.podGeo.rim, this.podMat.gold);
      top.position.y = -0.16; top.receiveShadow = top.castShadow = true; rim.position.y = 0.0; p.add(top, rim); p.position.set(o * gap, 0, -Math.abs(o) * ARM.back); this.podiums.add(p);
    }
  }
  // list of entries for the tab: { key, it, have, eq }
  list(REC) {
    const W = this.tab === 'weapons', DB = W ? WEAPONS : OUTFITS, owned = W ? REC.weapons : REC.skins, eq = W ? REC.weapon : REC.skin;
    const rank = it => it.unlock ? 2 : !(it.price > 0) && it.gems > 0 ? 1 : 0;   // coin items first, then gem-only, then the Survival reward
    return Object.entries(DB).filter(([k, it]) => !it.hidden).sort((a, b) => rank(a[1]) - rank(b[1])).map(([key, it]) => ({ key, it, have: owned.includes(key), eq: eq === key }));
  }
  open(REC, tab = this.tab) {
    this.active = true; this.REC = REC; this.setTab(tab);
    this.scene.environment = this.envFrom.environment; this.scene.environmentIntensity = 0.6;
  }
  setTab(tab) {
    this.clearItems(); this.tab = tab; this.layoutPodiums();
    this.entries = this.list(this.REC); this.sel = Math.max(0, this.entries.findIndex(e => e.eq)); this.pos = this.sel;
    this.items = this.entries.map(() => null);
  }
  close() { this.active = false; this.clearItems(); }
  clearItems() {
    for (const it of this.items) if (it) this.disposeItem(it);
    this.items = [];
  }
  disposeItem(it) { if (it.f) it.f.dispose(); else { this.scene.remove(it.g); it.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) for (const m of [].concat(o.material)) m.dispose(); }); } }   // textures are shared (gear.js cache): left alone
  step(d) { if (!this.entries.length) return; this.sel = (this.sel + d + this.entries.length) % this.entries.length; this.user.yaw = 0; this.user.pitch = 0; }
  // turn the item on the centre podium by hand (mouse drag); idle turning comes back after a pause
  drag(dx, dy) { const u = this.user; u.yaw += dx * ARM.dragK; if (this.tab === 'weapons') u.pitch = Math.max(-ARM.pitchMax, Math.min(ARM.pitchMax, u.pitch + dy * ARM.dragK)); u.last = this.t; }
  get current() { return this.entries[this.sel]; }
  refresh() { const s = this.sel; this.entries = this.list(this.REC); this.sel = s; }
  build(i) {
    const e = this.entries[i];
    if (this.tab === 'weapons') {
      const g = new THREE.Group(), k = makeKatana(e.key); k.scale.setScalar(1.1);   // lying flat: a horizontal line from the pommel to the tip, edge up, turned about its middle
      const box = new THREE.Box3().setFromObject(k), mid = box.getCenter(new V3()); k.position.sub(mid);
      const lay = new THREE.Group(); lay.rotation.y = Math.PI / 2; lay.add(k); const hold = new THREE.Group(); hold.add(lay); g.add(hold); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
      this.scene.add(g); return { g, hold };
    }
    const f = this.makeFighter(this.scene, e.key, this.REC.weapon); f.remote = false; f.onStrike = null; f.spawn(0, 0, 0); return { f };
  }
  update(dt) {
    if (!this.active) return; this.t += dt;
    const n = this.entries.length; if (!n) return;
    // shortest way round the ring
    let d = this.sel - this.pos; if (d > n / 2) d -= n; if (d < -n / 2) d += n;
    this.pos += d * (1 - Math.exp(-ARM.rate * dt)); this.pos = (this.pos + n) % n;
    const gap = ARM.gap[this.tab];
    for (let i = 0; i < n; i++) {
      let o = i - this.pos; if (o > n / 2) o -= n; if (o < -n / 2) o += n;
      const show = Math.abs(o) <= ARM.side + 0.6;
      if (!show) { if (this.items[i]) { this.disposeItem(this.items[i]); this.items[i] = null; } continue; }
      const it = this.items[i] || (this.items[i] = this.build(i)), x = o * gap, z = -Math.abs(o) * ARM.back;
      const ctr = Math.abs(o) < 0.5, u = this.user;
      if (it.f) { const f = it.f; f.pos.x = x; f.pos.z = z; f.yaw = ctr ? u.yaw : -o * 0.18; f.update(dt, null, null); }
      else { it.g.position.set(x, ARM.bladeH, z); if (ctr) it.hold.rotation.set(u.pitch, u.yaw, 0); else it.hold.rotation.set(0, -o * 0.12, 0); it.g.scale.setScalar(ctr ? 1 : 0.86); }
    }
    this.fill.intensity = this.tab === 'weapons' ? 1.4 : 0.35;
    const u = this.user; if (this.t - u.last > ARM.idleAfter) { u.yaw += dt * ARM.spin; u.pitch *= Math.exp(-2 * dt); }   // idle: the centre piece turns slowly
    const k = ARM.column[this.tab]; this.column.material.opacity = k + 0.15 * k * Math.sin(this.t * 2.2); this.disc.material.opacity = 0.45 * k / 0.75;
    const p = this.embers.geometry.attributes.position; for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * (0.15 + (i % 7) * 0.03); if (y > 2.4) y = 0; p.setY(i, y); } p.needsUpdate = true;
  }
  render() {
    const R = this.R, c = this.camera, C = ARM.cam[this.tab], sz = R.getSize(new THREE.Vector2());
    c.aspect = sz.x / sz.y; c.updateProjectionMatrix(); c.position.set(C[0], C[1], C[2]); c.lookAt(C[0], C[3], 0);
    const e = R.toneMappingExposure; R.toneMappingExposure = ARM.exposure; R.setRenderTarget(null); R.render(this.scene, c); R.toneMappingExposure = e;
  }
  // screen position (px) above slot offset o, for the lock badges
  screenAt(o, h) { const v = new V3(o * ARM.gap[this.tab], h, -Math.abs(o) * ARM.back).project(this.camera); return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight, v.z < 1]; }
}
