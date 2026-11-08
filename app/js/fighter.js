import * as THREE from 'three';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { ARENA_R } from './arena.js';
import { Trail } from './fx.js';
import { sfx } from './audio.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion, UP = new V3(0, 1, 0);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// ---------- full-body pose data ----------
// layout: 0-2 right-hand (fwd,right,up) | 3-5 blade dir | 6 lean | 7 torso yaw | 8 roll | 9 hip yaw | 10 hips fwd | 11 hips right | 12 hips down | 13-15 R foot (fwd,right,lift) | 16-18 L foot
const BASE = { h: [.42, .1, 1.12], b: [.88, 0, .5], lean: .06, yaw: 0, roll: 0, hy: 0, hf: 0, hr: 0, hd: .07, rf: [.3, .14, 0], lf: [-.24, -.17, 0] };
const SC = ['lean', 'yaw', 'roll', 'hy', 'hf', 'hr', 'hd'];
const mk = (o = {}) => [...(o.h || BASE.h), ...(o.b || BASE.b), ...SC.map(k => o[k] !== undefined ? o[k] : BASE[k]), ...(o.rf || BASE.rf), ...(o.lf || BASE.lf)];
const GUARD = mk();
const RUN = mk({ h: [.28, .12, 1.0], b: [.85, 0, .45], lean: .2, hd: 0 });
const BLOCK = mk({ h: [.45, 0, 1.15], b: [.3, -.28, .9], lean: .12, hd: .13, hf: -.05, rf: [.25, .16, 0], lf: [-.32, -.2, 0] });
const BROKEN = mk({ h: [.3, .15, .55], b: [.2, .1, -.95], lean: .62, hd: .45, hf: .1, rf: [.32, .2, 0], lf: [-.2, -.3, 0] });
const VICTORY = mk({ h: [.4, .1, 1.0], b: [.2, 0, -.97], lean: .02, hd: .03, rf: [.25, .14, 0], lf: [-.25, -.17, 0] });
const FALLBACK = mk({ h: [.2, .4, 1.2], b: [.3, .7, .2], lean: -.5, hf: -.4, hd: .2 });

const KF = {
  light1: [[0, GUARD],
  [.2, mk({ h: [.2, .3, 1.7], b: [-.3, .3, .9], lean: -.1, yaw: -.45, hy: -.35, hf: -.1, hd: .12, lf: [-.3, -.16, 0] })],
  [.36, mk({ h: [.1, .35, 1.95], b: [-.55, .25, .8], lean: -.18, yaw: -.6, hy: -.5, hf: -.18, hd: .1 })],
  [.5, mk({ h: [.65, -.05, 1.2], b: [.85, -.35, -.1], lean: .22, yaw: .35, hy: .35, hf: .3, hd: .2, rf: [.55, .15, 0], lf: [-.18, -.18, 0] })],
  [.62, mk({ h: [.55, -.4, .8], b: [.5, -.8, -.4], lean: .3, yaw: .55, hy: .5, hf: .42, hd: .22, rf: [.62, .15, 0], lf: [-.12, -.2, 0] })],
  [.8, mk({ h: [.5, -.3, .8], b: [.55, -.6, -.3], lean: .22, yaw: .4, hy: .3, hf: .3, hd: .18, rf: [.62, .15, 0], lf: [-.12, -.2, 0] })], [1, GUARD]],
  light2: [[0, GUARD],
  [.2, mk({ h: [.35, -.45, 1.3], b: [.3, -.9, .1], yaw: .5, hy: .4, hf: -.05, hd: .12 })],
  [.36, mk({ h: [.25, -.55, 1.3], b: [.1, -.95, .15], yaw: .65, hy: .55, hf: -.12, hd: .15 })],
  [.5, mk({ h: [.85, 0, 1.3], b: [1, 0, .05], lean: .12, hf: .3, hd: .18, rf: [.5, .15, 0] })],
  [.62, mk({ h: [.45, .55, 1.25], b: [.35, .9, .1], lean: .15, yaw: -.65, hy: -.55, hf: .35, hd: .2, rf: [.52, .2, 0], lf: [-.2, -.2, 0] })],
  [.8, mk({ h: [.4, .5, 1.2], b: [.3, .85, .1], yaw: -.5, hy: -.4, hf: .25, hd: .15, rf: [.52, .2, 0] })], [1, GUARD]],
  light3: [[0, GUARD],
  [.2, mk({ h: [.4, -.3, .65], b: [.6, -.5, -.6], lean: .2, yaw: .35, hy: .3, hd: .3 })],
  [.36, mk({ h: [.5, -.4, .5], b: [.5, -.6, -.65], lean: .24, yaw: .5, hy: .45, hd: .36, hf: .05 })],
  [.5, mk({ h: [.8, 0, 1.2], b: [.9, .2, .3], lean: .1, yaw: -.1, hd: .24, hf: .35, rf: [.65, .14, 0], lf: [-.15, -.2, 0] })],
  [.63, mk({ h: [.45, .4, 1.95], b: [.1, .5, .85], lean: -.12, yaw: -.55, hy: -.5, hd: .12, hf: .3, rf: [.68, .14, 0], lf: [-.1, -.2, .05] })],
  [.82, mk({ h: [.4, .35, 1.8], b: [.1, .5, .8], lean: -.08, yaw: -.4, hy: -.3, hd: .1, hf: .22, rf: [.68, .14, 0] })], [1, GUARD]],
  heavy: [[0, GUARD],
  [.12, mk({ h: [.2, .15, 1.4], b: [0, .1, 1], lean: -.1, hd: .1 })],
  [.3, mk({ h: [-.05, .2, 2.1], b: [-.5, .15, .85], lean: -.3, yaw: -.2, hy: -.2, hf: -.3, hd: .05, rf: [.2, .14, 0], lf: [-.35, -.16, 0] })],
  [.46, mk({ h: [-.08, .2, 2.15], b: [-.55, .15, .8], lean: -.34, yaw: -.25, hy: -.25, hf: -.34, hd: .04, rf: [.2, .14, 0], lf: [-.35, -.16, 0] })],
  [.5, mk({ h: [.2, .1, 1.9], b: [.2, .1, 1], lean: -.05, hf: -.1, hd: .15 })],
  [.6, mk({ h: [.9, 0, 1.05], b: [.9, 0, -.45], lean: .5, hf: .55, hd: .36, rf: [.88, .14, 0], lf: [-.1, -.18, 0] })],
  [.72, mk({ h: [.85, 0, .75], b: [.8, 0, -.6], lean: .55, hf: .6, hd: .4, rf: [.88, .14, 0], lf: [-.1, -.18, 0] })],
  [.88, mk({ h: [.7, 0, .8], b: [.8, 0, -.5], lean: .35, hf: .4, hd: .3, rf: [.8, .14, 0] })], [1, GUARD]],
  deathblow: [[0, GUARD],
  [.15, mk({ h: [.2, .15, 1.1], b: [.85, 0, .15], lean: -.1, yaw: -.4, hy: -.35, hf: -.1, hd: .15 })],
  [.3, mk({ h: [.15, .25, 1.0], b: [.9, .1, .1], lean: -.14, yaw: -.5, hy: -.45, hf: -.15, hd: .2 })],
  [.37, mk({ h: [1.15, 0, 1.15], b: [1, 0, .05], lean: .45, hf: .55, hd: .36, rf: [.9, .14, 0], lf: [-.05, -.18, 0] })],
  [.62, mk({ h: [1.15, 0, 1.15], b: [1, 0, .05], lean: .45, hf: .55, hd: .38, rf: [.9, .14, 0], lf: [-.05, -.18, 0] })],
  [.75, mk({ h: [1.1, .12, 1.15], b: [1, .15, .1], lean: .4, yaw: .25, hf: .5, hd: .36, rf: [.9, .14, 0], lf: [-.05, -.18, 0] })],
  [.9, mk({ h: [.5, .15, 1.0], b: [.8, 0, .2], lean: .15, hf: .2, hd: .15, rf: [.5, .14, 0] })], [1, GUARD]],
  stagger: [[0, GUARD],
  [.15, mk({ h: [.05, .3, 1.0], b: [.4, .4, -.5], lean: -.4, roll: .3, hf: -.4, hd: .1, rf: [.15, .15, .05], lf: [-.4, -.17, 0] })],
  [.55, mk({ h: [.1, .3, 1.0], b: [.5, .3, -.3], lean: -.3, roll: .2, hf: -.28, hd: .12, lf: [-.35, -.17, 0] })], [1, GUARD]],
  parried: [[0, mk({ h: [.6, -.35, .9], b: [.5, -.8, -.3], hf: .3, lean: .3, hd: .2 })],
  [.2, mk({ h: [-.1, .3, 1.95], b: [-.35, .4, .8], lean: -.5, roll: .2, yaw: .4, hy: .3, hf: -.45, hd: .22, rf: [-.1, .14, .12], lf: [-.5, -.17, 0] })],
  [.55, mk({ h: [.0, .3, 1.7], b: [-.2, .4, .8], lean: -.3, hf: -.3, hd: .18, rf: [.1, .14, 0], lf: [-.45, -.17, 0] })], [1, GUARD]],
  flick: [[0, BLOCK],
  [.25, mk({ h: [.35, -.35, 1.5], b: [.2, -.8, .6], yaw: .5, hy: .4, hf: .1, hd: .12, lean: .05 })],
  [.55, mk({ h: [.65, .25, 1.3], b: [.55, .8, .45], yaw: -.6, hy: -.5, hf: .3, hd: .15, lean: .1, rf: [.4, .16, 0] })], [1, BLOCK]],
};

export const ACT = {
  light1: { dur: .55, hit: [.2, .34], dmg: 9, pd: 16, range: 2.15, lunge: 3 },
  light2: { dur: .55, hit: [.2, .34], dmg: 9, pd: 16, range: 2.15, lunge: 3 },
  light3: { dur: .72, hit: [.26, .4], dmg: 11, pd: 20, range: 2.25, lunge: 3.4 },
  heavy: { dur: 1.15, hit: [.58, .72], dmg: 24, pd: 36, range: 2.5, lunge: 4.2 },
  dodge: { dur: .5 }, stagger: { dur: .38 }, parried: { dur: .8 }, broken: { dur: 4.2 },
  deathblow: { dur: 1.5, hit: [.52, .62], range: 3 }, dying: { dur: 1.7 }, victory: { dur: 99 },
};
const isAttack = a => a === 'light1' || a === 'light2' || a === 'light3' || a === 'heavy' || a === 'deathblow';
export const PARRY_WINDOW = 0.24;

// ---------- katana ----------
function makeKatana() {
  const g = new THREE.Group();
  const L = 0.72, w = 0.032, th = 0.007;
  const s = new THREE.Shape(); s.moveTo(0, -w / 2); s.lineTo(L - 0.06, -w / 2); s.lineTo(L, w / 2 - 0.005); s.lineTo(0, w / 2); s.closePath();
  const bg = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false }); bg.translate(0, 0, -th / 2); bg.rotateY(-Math.PI / 2);
  const pos = bg.attributes.position; for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i); pos.setY(i, pos.getY(i) + 0.03 * (z / L) * (z / L)); } bg.computeVertexNormals();
  const blade = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: 0xeef2f6, metalness: 1, roughness: 0.16 })); blade.position.z = 0.07; g.add(blade);
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#151a2e'; x.fillRect(0, 0, 32, 32); x.strokeStyle = '#59607d'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, 0); x.lineTo(32, 32); x.moveTo(32, 0); x.lineTo(0, 32); x.stroke();
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 6); tex.colorSpace = THREE.SRGBColorSpace;
  const hg = new THREE.CylinderGeometry(0.017, 0.015, 0.32, 10); hg.rotateX(Math.PI / 2); hg.translate(0, 0, -0.1);
  g.add(new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 })));
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3 });
  const tg = new THREE.CylinderGeometry(0.052, 0.052, 0.009, 20); tg.rotateX(Math.PI / 2); const tsuba = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.8, roughness: 0.35 })); tsuba.position.z = 0.066; g.add(tsuba);
  const hb = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.038, 0.02), gold); hb.position.z = 0.08; g.add(hb);
  const kg = new THREE.CylinderGeometry(0.019, 0.019, 0.02, 10); kg.rotateX(Math.PI / 2); const ka = new THREE.Mesh(kg, gold); ka.position.z = -0.27; g.add(ka);
  g.traverse(o => { o.castShadow = true; });
  return g;
}
function makeSheath() {
  const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0x0d0d10, roughness: 0.25, metalness: 0.2 });
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.06, 0.8), m); b.position.z = -0.4; g.add(b);
  const k = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.04), new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: .9, roughness: .3 })); k.position.z = -0.02; g.add(k);
  const co = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.1), m); co.position.z = -0.1; co.rotation.x = 0.2; g.add(co);
  return g;
}
const STYLES = {
  player: { cloth: 0x4a68a8, hakama: 0x14182a, accent: 0xc9a24a, hat: 'kasa' },
  enemy: { cloth: 0x9a3436, hakama: 0x1a0d0d, accent: 0xd8c27a, hat: 'kabuto' },
};

export class Fighter {
  constructor(scene, gltf, style, name) {
    this.scene = scene; this.name = name;
    this.group = new THREE.Group(); this.body = new THREE.Group();
    this.model = clone(gltf.scene); this.body.add(this.model); this.group.add(this.body); scene.add(this.group);
    this.group.updateMatrixWorld(true);
    const ht = this.model.getObjectByName('mixamorigHeadTop_End').getWorldPosition(new V3()).y, ft = this.model.getObjectByName('mixamorigLeftToe_End').getWorldPosition(new V3()).y;
    this.model.scale.multiplyScalar(1.8 / (ht - ft + 0.02));
    this.model.updateMatrixWorld(true);
    const st = STYLES[style];
    this.model.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.castShadow = true; o.frustumCulled = false;
        if (o.material) { o.material = o.material.clone(); o.material.color.set(st.cloth); if (o.name.includes('visor')) o.material.color.set(0x050505); o.material.roughness = 0.85; o.material.metalness = 0; }
      }
    });
    const B = n => this.model.getObjectByName('mixamorig' + n);
    this.b = { hips: B('Hips'), sp: [B('Spine'), B('Spine1'), B('Spine2')], head: B('Head'), rs: B('RightArm'), rf: B('RightForeArm'), rh: B('RightHand'), ls: B('LeftArm'), lf: B('LeftForeArm'), lh: B('LeftHand') };
    const wp = o => o.getWorldPosition(new V3());
    this.len = { r1: wp(this.b.rs).distanceTo(wp(this.b.rf)), r2: wp(this.b.rf).distanceTo(wp(this.b.rh)), l1: wp(this.b.ls).distanceTo(wp(this.b.lf)), l2: wp(this.b.lf).distanceTo(wp(this.b.lh)) };
    // animation mixer (locomotion legs)
    this.mixer = new THREE.AnimationMixer(this.model);
    this.an = {}; for (const n of ['Idle', 'Walk', 'Run']) { const a = this.mixer.clipAction(gltf.animations.find(c => c.name === n)); a.play(); a.setEffectiveWeight(n === 'Idle' ? 1 : 0); this.an[n] = a; }
    this.mixer.update(0); this.model.updateMatrixWorld(true);
    // legs for foot IK
    this.leg = {};
    for (const [k, s] of [['r', 'Right'], ['l', 'Left']]) {
      const u = B(s + 'UpLeg'), kn = B(s + 'Leg'), f = B(s + 'Foot');
      this.leg[k] = { u, k: kn, f, l1: wp(u).distanceTo(wp(kn)), l2: wp(kn).distanceTo(wp(f)), bind: f.getWorldQuaternion(new Q()) };
    }
    this.ankleH = wp(this.leg.r.f).y;
    this.attach(st);
    this.katana = makeKatana(); scene.add(this.katana);
    this.trail = new Trail(scene);
    // state
    this.pos = new V3(); this.yaw = 0; this.speed = 0; this.vel = new V3(); this.locoV = new V3();
    this.hp = 100; this.posture = 0; this.act = 'idle'; this.t = 0; this.dur = 1; this.seq = 0; this.cur = GUARD.slice();
    this.blockStart = -9; this.time = 0; this.lastPost = 0; this.flick = 0; this.flickN = 0; this.dead = false; this.remote = false;
    this.swung = false; this.hitDone = false; this.queued = false; this.fall = 0; this.target = { x: 0, z: 0, yaw: 0 };
    this.combo = 0; this.jolt = 0; this.ikW = 1; this.rollSign = 1; this.dieKind = 'back'; this.dodgeDir = new V3(0, 0, -1); this.opp = null; this.lives = 2; this.invuln = false; this.maxHp = 100; this.tempo = 1; this.dmgMul = 1; this.fMul = 1; this.parryWin = PARRY_WINDOW; this.iExtra = 0; this.postRegen = 1;
    this.spX = new Float32Array(6); this.spV = new Float32Array(6); this.spInit = false;
  }

  attach(st) {
    const inv = 1 / this.model.getObjectByName('mixamorigHips').getWorldScale(new V3()).x;
    const add = (bone, obj, x = 0, y = 0, z = 0) => {
      const h = new THREE.Group(); const q = bone.getWorldQuaternion(new Q()).invert(); h.quaternion.copy(q); h.scale.setScalar(inv);
      obj.position.set(x, y, z); h.add(obj); bone.add(h); obj.traverse(o => { o.castShadow = true; });
    };
    const cloth = new THREE.MeshStandardMaterial({ color: st.hakama, roughness: 0.95, side: THREE.DoubleSide });
    const pts = [[0.19, 0.14], [0.21, 0.0], [0.24, -0.3], [0.27, -0.6], [0.3, -0.8]].map(p => new THREE.Vector2(p[0], p[1]));
    add(this.b.hips, new THREE.Mesh(new THREE.LatheGeometry(pts, 20), cloth));
    const obi = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.032, 8, 20), new THREE.MeshStandardMaterial({ color: st.accent, roughness: 0.6 })); obi.rotation.x = Math.PI / 2; add(this.b.hips, obi, 0, 0.14, 0);
    const sh = makeSheath(); sh.rotation.x = -0.45; sh.rotation.y = 0.12; add(this.b.hips, sh, 0.22, 0.12, 0.12);
    for (const [bone, sx] of [[this.b.rs, -1], [this.b.ls, 1]]) {
      const pl = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.2), new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 0.5, metalness: 0.4 })); pl.rotation.z = sx * -0.25; add(bone, pl, sx * 0.1, 0.07, 0);
    }
    if (st.hat === 'kasa') {
      add(this.b.head, new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.15, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xc9b07a, roughness: 1, side: THREE.DoubleSide })), 0, 0.3, 0.02);
    } else {
      add(this.b.head, new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 6, 20, Math.PI), new THREE.MeshStandardMaterial({ color: st.accent, metalness: .9, roughness: .3 })), 0, 0.2, 0.2);
      add(this.b.head, new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0x1a0d0d, roughness: .5, metalness: .4 })), 0, 0.14, 0);
    }
  }

  restyle(color, scale = 1) {
    this.model.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && o.material && !o.name.includes('visor')) o.material.color.set(color); });
    this.group.scale.setScalar(scale); this.katana.scale.setScalar(scale); this.scaleF = scale;
  }
  get hitPoint() { return new V3(this.pos.x, 1.3, this.pos.z); }
  get brokenLeft() { return this.act === 'broken' ? this.dur - this.t : 0; }

  setAct(name, dur) {
    this.act = name; this.t = 0; this.dur = dur || (ACT[name] || {}).dur || 1; this.seq++; this.swung = false; this.hitDone = false; this.queued = false;
    if (name === 'block') this.blockStart = this.time;
    if (name === 'stagger') { this.rollSign = Math.random() < .5 ? 1 : -1; this.jolt = 1; }
    if (name === 'parried' || name === 'broken') this.jolt = 1;
  }
  spawn(x, z, yaw) {
    this.pos.set(x, 0, z); this.yaw = yaw; this.target = { x, z, yaw }; this.hp = this.maxHp; this.posture = 0; this.dead = false; this.fall = 0; this.speed = 0;
    this.vel.set(0, 0, 0); this.locoV.set(0, 0, 0); this.dieKind = 'back'; this.setAct('idle'); this.cur = GUARD.slice(); this.jolt = 0; this.invuln = false; this.spInit = false; this.flick = 0; this.queued = false;
  }

  // ----- combat resolution (on the defender) -----
  resolveStrike(kind, fromPos, mul = 1, fmul = 1) {
    if (this.dead || this.act === 'dying' || this.invuln) return { res: 'miss' };
    const heavy = kind === 'heavy', a = ACT[kind] || ACT.light1;
    const toAtt = new V3(fromPos.x - this.pos.x, 0, fromPos.z - this.pos.z).normalize();
    if (kind === 'deathblow') {   // critical hit: 38% of max health, not an instant kill
      if (this.act !== 'broken') return { res: 'miss' };
      this.yaw = Math.atan2(toAtt.x, toAtt.z); this.hp -= this.maxHp * 0.38 * fmul; this.posture = 0; this.lastPost = this.time;
      if (this.hp <= 0) { this.hp = 0; this.dieKind = 'fwd'; this.die(); return { res: 'finisher', killed: true }; }
      this.setAct('stagger', 1.2); this.vel.addScaledVector(toAtt, -4); return { res: 'finisher', killed: false };
    }
    if (this.act === 'dodge' && this.t > 0.04 && this.t < 0.34 + this.iExtra) return { res: 'dodge' };
    const facing = new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).dot(toAtt) > 0.15;
    if (this.act === 'block' && facing) {
      if (this.time - this.blockStart <= this.parryWin) {
        this.posture = Math.max(0, this.posture - 10); this.flick = 0.32; this.flickN++;
        return { res: 'parry', heavy, apost: heavy ? 34 : 24 };
      }
      this.hp = Math.max(1, this.hp - a.dmg * mul * 0.06); this.posture += a.pd; this.lastPost = this.time;
      this.vel.addScaledVector(toAtt, -3.6);
      const broke = this.checkBreak(); return { res: 'block', heavy, broke };
    }
    const dmg = a.dmg * mul * (this.act === 'broken' ? 1.6 : 1);
    this.hp -= dmg; this.posture += a.pd * 0.5; this.lastPost = this.time;
    this.vel.addScaledVector(toAtt, -(heavy ? 5 : 3));
    if (this.hp <= 0) { this.hp = 0; this.die(); return { res: 'hit', heavy, killed: true }; }
    let broke = false;
    if (this.act !== 'broken') { broke = this.checkBreak(); if (!broke) this.setAct('stagger', heavy ? 0.65 : 0.38); }
    return { res: 'hit', heavy, broke };
  }
  checkBreak() { if (this.posture >= 100 && this.act !== 'broken') { this.posture = 100; this.setAct('broken'); return true; } return false; }
  applyOutcome(r) { if (r.res === 'parry') { this.posture += r.apost; this.lastPost = this.time; if (!this.checkBreak()) this.setAct('parried'); } }
  die() { this.dead = true; this.lives = Math.max(0, this.lives - 1); this.setAct('dying'); }

  // ----- update -----
  update(dt, inp, opp) {
    this.opp = opp; this.time += dt; this.t += dt * (isAttack(this.act) && this.act !== 'deathblow' ? this.tempo : 1); if (this.flick > 0) this.flick -= dt; this.jolt = Math.max(0, this.jolt - dt * 4.5);
    if (this.remote) this.updateRemote(dt); else this.updateLocal(dt, inp || { move: null, light: 0, heavy: 0, dodge: 0, finisher: 0, block: false }, opp);
    if (!isFinite(this.pos.x + this.pos.z + this.yaw)) { console.error('NaN fighter state', this.act); this.pos.set(0, 0, this.name === 'You' ? -4 : 4); this.yaw = 0; this.vel.set(0, 0, 0); this.locoV.set(0, 0, 0); }
    this.group.position.copy(this.pos); this.group.rotation.y = this.yaw;
    // falling when dying
    if (this.act === 'dying') {
      const fwd = this.dieKind === 'fwd', t0 = fwd ? 0.75 : 0.35;
      this.fall = clamp((this.t - t0) / 0.8, 0, 1); const e = this.fall * this.fall * (3 - 2 * this.fall);
      this.body.rotation.x = (fwd ? 1.45 : -1.5) * e; this.fallY = e * 0.12;
    } else { this.fall = 0; this.fallY = 0; this.body.rotation.x = 0; }
    const c = this.cur;
    this.body.position.set(-c[11], this.fallY - c[12] + Math.sin(this.time * 1.9) * 0.004, c[10]);
    // locomotion anim weights (used when legs are not foot-IK'd)
    const s = this.speed, wW = s < 3 ? Math.min(1, s / 1.4) : Math.max(0, 1 - (s - 3) / 1.5), wR = clamp((s - 3) / 1.5, 0, 1);
    this.an.Idle.setEffectiveWeight(Math.max(0, 1 - wW - wR)); this.an.Walk.setEffectiveWeight(wW); this.an.Run.setEffectiveWeight(wR);
    this.an.Walk.timeScale = clamp(s / 2.2, .5, 1.3); this.an.Run.timeScale = this.act === 'dodge' ? 1.5 : clamp(s / 4.8, .6, 1.3);
    this.mixer.update(dt);
    this.group.updateMatrixWorld(true);
    this.pose(dt);
  }

  updateRemote(dt) {
    const k = 1 - Math.exp(-14 * dt), ox = this.pos.x, oz = this.pos.z;
    this.pos.x += (this.target.x - this.pos.x) * k; this.pos.z += (this.target.z - this.pos.z) * k;
    this.yaw += angDiff(this.yaw, this.target.yaw) * k;
    this.speed += (Math.hypot(this.pos.x - ox, this.pos.z - oz) / Math.max(dt, 1e-3) - this.speed) * 0.3;
    if (this.act === 'broken' && this.opp && this.opp.act === 'deathblow') this.yaw += angDiff(this.yaw, Math.atan2(this.opp.pos.x - this.pos.x, this.opp.pos.z - this.pos.z)) * k;
    this.events();
  }
  setRemote(s) {
    this.target.x = s.x; this.target.z = s.z; this.target.yaw = s.yaw; this.hp = s.hp; this.posture = s.po; this.lives = s.lv === undefined ? this.lives : s.lv;
    if (s.seq !== this.seq || s.act !== this.act) { if (s.act === 'dying' && this.act === 'broken') this.dieKind = 'fwd'; this.setAct(s.act, s.dur); this.seq = s.seq; }
    if (s.fl !== this.flickN) { this.flickN = s.fl; this.flick = 0.32; }
    this.dead = s.act === 'dying';
  }
  snapshot() { return { x: this.pos.x, z: this.pos.z, yaw: this.yaw, act: this.act, dur: this.dur, seq: this.seq, hp: this.hp, po: this.posture, fl: this.flickN, lv: this.lives }; }

  events() {
    if (isAttack(this.act) && !this.swung && this.t >= ACT[this.act].hit[0] - 0.05) {
      this.swung = true; this.act === 'deathblow' ? sfx.deathblow() : sfx.swing(this.act === 'heavy');
    }
  }

  updateLocal(dt, inp, opp) {
    const A = this.act, def = ACT[A];
    if (this.dead) { this.speed = 0; return; }
    const oppAlive = opp && !opp.dead && opp.act !== 'dying';
    const toOpp = oppAlive ? new V3(opp.pos.x - this.pos.x, 0, opp.pos.z - this.pos.z) : null;
    const dist = toOpp ? toOpp.length() : 99; if (toOpp && dist > 0.001) toOpp.divideScalar(dist);
    if (A !== 'broken' && this.time - this.lastPost > 1.6) this.posture = Math.max(0, this.posture - (A === 'block' ? 18 : 11) * this.postRegen * (0.45 + 0.55 * this.hp / this.maxHp) * dt);
    const aimDir = () => (toOpp && (inp.lock || dist < 4.5)) ? toOpp : (inp.aim || new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)));
    const faceTo = d => { this.yaw = Math.atan2(d.x, d.z); };
    let moveSpeed = 0, moveDir = null;
    const startAct = name => { faceTo(aimDir()); this.setAct(name); };

    const free = A === 'idle' || A === 'block';
    const recov = isAttack(A) && A !== 'deathblow' && this.t >= def.hit[1] + 0.08;

    if (free || recov) {
      if (inp.dodge > 0) {
        inp.dodge = 0;
        const m = inp.move && inp.move.lengthSq() > 0.01 ? inp.move.clone().normalize() : aimDir().clone().multiplyScalar(-1);
        this.dodgeDir = m; if (inp.lock && toOpp) faceTo(toOpp); else if (inp.move && inp.move.lengthSq() > 0.01) this.yaw = Math.atan2(m.x, m.z);
        this.setAct('dodge'); sfx.dodge(); return;
      }
      if (inp.finisher > 0 && oppAlive && opp.act === 'broken' && dist < 3.4 && free) {
        inp.finisher = 0; const d = toOpp.clone();
        this.pos.x = opp.pos.x - d.x * 1.15; this.pos.z = opp.pos.z - d.z * 1.15; faceTo(d); opp.yaw = Math.atan2(-d.x, -d.z); this.vel.set(0, 0, 0); this.locoV.set(0, 0, 0);
        this.setAct('deathblow'); return;
      }
      if (inp.heavy > 0) { inp.heavy = 0; startAct('heavy'); return; }
      if (inp.light > 0 && free) { inp.light = 0; startAct('light1'); return; }
    }
    if (isAttack(A)) {
      if (inp.light > 0 && A !== 'deathblow' && this.t > def.hit[0]) { inp.light = 0; this.queued = true; }
      if (this.queued && A.startsWith('light') && this.t >= def.hit[1] + 0.06) { startAct(A === 'light1' ? 'light2' : A === 'light2' ? 'light3' : 'light1'); return; }
      if (recov && inp.block) { this.setAct('block'); return; }
    }

    switch (A) {
      case 'idle': case 'block': {
        const want = inp.block ? 'block' : 'idle';
        if (want !== A) this.setAct(want);
        const mv = inp.move && inp.move.lengthSq() > 0.01 ? inp.move.clone().normalize() : null;
        const top = inp.block ? 2.0 : inp.walk ? 2.2 : 4.8;
        moveSpeed = mv ? top : 0; moveDir = mv;
        if (inp.block && toOpp) this.yaw += angDiff(this.yaw, Math.atan2(toOpp.x, toOpp.z)) * Math.min(1, 14 * dt);
        else if (mv) this.yaw += angDiff(this.yaw, Math.atan2(mv.x, mv.z)) * Math.min(1, 14 * dt);
        else if (toOpp && inp.lock) this.yaw += angDiff(this.yaw, Math.atan2(toOpp.x, toOpp.z)) * Math.min(1, 6 * dt);
        break;
      }
      case 'dodge': {
        const u = clamp(this.t / this.dur, 0, 1), sp = 9 * Math.pow(1 - u, 1.5);
        this.vel.set(this.dodgeDir.x * sp, 0, this.dodgeDir.z * sp);
        if (this.t >= this.dur) { this.setAct('idle'); this.vel.set(0, 0, 0); }
        break;
      }
      case 'stagger': case 'parried': if (this.t >= this.dur) this.setAct('idle'); break;
      case 'broken':
        if (this.t >= this.dur) { this.posture = 35; this.setAct('idle'); }
        this.vel.multiplyScalar(0.8);
        if (opp && opp.act === 'deathblow') this.yaw += angDiff(this.yaw, Math.atan2(opp.pos.x - this.pos.x, opp.pos.z - this.pos.z)) * Math.min(1, 12 * dt);
        break;
      case 'dying': case 'victory': break;
      default:
        if (this.t < def.hit[1] + 0.05 && A !== 'deathblow' && dist > 1.05) { const k = Math.max(0, 1 - this.t / (def.hit[1] + .05)); this.vel.set(Math.sin(this.yaw) * def.lunge * k, 0, Math.cos(this.yaw) * def.lunge * k); }
        if (!this.hitDone && this.t >= def.hit[0] && this.t <= def.hit[1] && toOpp) {
          const fw = new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
          if ((dist < def.range && fw.dot(toOpp) > 0.35) || A === 'deathblow') { this.hitDone = true; this.onStrike && this.onStrike(this, A); }
        }
        if (this.t >= this.dur) this.setAct('idle');
    }
    this.events();
    const target = moveDir ? moveDir.clone().multiplyScalar(moveSpeed) : new V3();
    const cv = new V3(this.vel.x, 0, this.vel.z), loco = this.locoV;
    loco.lerp(target, 1 - Math.exp(-14 * dt));
    this.pos.x += (loco.x + cv.x) * dt; this.pos.z += (loco.z + cv.z) * dt;
    this.vel.multiplyScalar(A === 'dodge' ? 1 : Math.exp(-7 * dt));
    this.speed = A === 'dodge' ? 6 : Math.hypot(loco.x, loco.z) + Math.hypot(cv.x, cv.z) * 0.3;
    if (opp && !opp.dead && A !== 'deathblow') {
      const dx = this.pos.x - opp.pos.x, dz = this.pos.z - opp.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.95 && d > 0.0001) { this.pos.x += dx / d * (0.95 - d); this.pos.z += dz / d * (0.95 - d); }
    }
    const rr = Math.hypot(this.pos.x, this.pos.z), lim = ARENA_R - 0.5;
    if (rr > lim) { this.pos.x *= lim / rr; this.pos.z *= lim / rr; }
  }

  // ----- procedural full-body animation -----
  targetPose() {
    const A = this.act, F = new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const kf = (k, u) => {
      let i = 0; while (i < k.length - 2 && u > k[i + 1][0]) i++;
      const [t0, p0] = k[i], [t1, p1] = k[i + 1]; let s = clamp((u - t0) / (t1 - t0), 0, 1); s = s * s * (3 - 2 * s);
      return p0.map((v, j) => v + (p1[j] - v) * s);
    };
    const u = clamp(this.t / this.dur, 0, 1);
    if (KF[A]) { const p = kf(KF[A], u); if (A === 'stagger') p[8] *= this.rollSign; return p; }
    if (A === 'block') return this.flick > 0 ? kf(KF.flick, 1 - this.flick / 0.32) : BLOCK;
    if (A === 'dodge') {
      const R = new V3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)), df = this.dodgeDir.dot(F), dr = this.dodgeDir.dot(R), e = Math.sin(Math.PI * Math.min(1, u * 1.2));
      return mk({ h: [.3, .1, .95], b: [.8, 0, .3], lean: .1 + .3 * df * e, roll: -dr * .32 * e, hf: .3 * df * e, hr: .3 * dr * e, hd: .08 + .26 * e });
    }
    if (A === 'dying') return this.dieKind === 'fwd' ? BROKEN : FALLBACK;
    if (A === 'broken') { const p = BROKEN.slice(); p[6] += Math.sin(this.time * 1.7) * .07; p[8] += Math.sin(this.time * 2.6) * .12; p[12] += Math.sin(this.time * 2.2) * .02; return p; }
    if (A === 'victory') return VICTORY;
    return this.ikW < 0.5 ? RUN : GUARD;
  }
  aim(bone, child, target) {
    const bp = bone.getWorldPosition(new V3()), cp = child.getWorldPosition(new V3());
    const q = new Q().setFromUnitVectors(cp.sub(bp).normalize(), target.clone().sub(bp).normalize());
    const bw = bone.getWorldQuaternion(new Q()); const pw = bone.parent.getWorldQuaternion(new Q());
    bone.quaternion.copy(pw.invert().multiply(q.multiply(bw))); bone.updateMatrixWorld(true);
  }
  rotW(bone, qw) {
    const bw = bone.getWorldQuaternion(new Q()), pw = bone.parent.getWorldQuaternion(new Q());
    bone.quaternion.copy(pw.invert().multiply(qw.clone().multiply(bw))); bone.updateMatrixWorld(true);
  }
  setWorldQ(bone, qw) { const pw = bone.parent.getWorldQuaternion(new Q()); bone.quaternion.copy(pw.invert().multiply(qw)); bone.updateMatrixWorld(true); }
  ik2(a, f, h, l1, l2, T, pole) {
    const S = a.getWorldPosition(new V3()), d = T.clone().sub(S); let dist = d.length(); d.divideScalar(Math.max(dist, 1e-4));
    dist = clamp(dist, Math.abs(l1 - l2) + 0.02, l1 + l2 - 0.01); const Tc = S.clone().addScaledVector(d, dist);
    const aa = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist), hh = Math.sqrt(Math.max(0, l1 * l1 - aa * aa));
    const p = pole.clone().addScaledVector(d, -pole.dot(d)).normalize();
    const E = S.clone().addScaledVector(d, aa).addScaledVector(p, hh);
    this.aim(a, f, E); this.aim(f, h, Tc);
  }
  pose(dt) {
    const A = this.act, attack = isAttack(A);
    // blend weight for foot-IK stance vs. locomotion clip legs
    const ikT = (A === 'dodge' || A === 'dying' || (this.speed > 1.7 && (A === 'idle' || A === 'block'))) ? 0 : 1;
    this.ikW += (ikT - this.ikW) * (1 - Math.exp(-10 * dt));
    const tp = this.targetPose(), k = 1 - Math.exp(-(attack ? 38 : A === 'parried' || A === 'stagger' ? 30 : 13) * dt);
    for (let i = 0; i < 19; i++) this.cur[i] += (tp[i] - this.cur[i]) * k;
    const c = this.cur.slice(), j = this.jolt;     // hit/block jolt: shove the body back
    c[10] -= .3 * j; c[6] -= .28 * j; c[0] -= .22 * j; c[5] += .25 * j; c[12] += .06 * j;
    // katana inertia: hand/blade targets go through a lightly under-damped spring (overshoot on swing end = follow-through)
    if (!this.spInit) { for (let i = 0; i < 6; i++) { this.spX[i] = c[i]; this.spV[i] = 0; } this.spInit = true; }
    for (let s = 0, h = Math.min(dt, 0.05) / 3; s < 3; s++) for (let i = 0; i < 6; i++) { this.spV[i] += (c[i] - this.spX[i]) * 1500 * h; this.spV[i] *= Math.exp(-46 * h); this.spX[i] += this.spV[i] * h; }
    for (let i = 0; i < 6; i++) c[i] = this.spX[i];
    const F = new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), R = new V3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const sf = this.scaleF || 1, toW = (f, r, u) => new V3().addScaledVector(F, f * sf).addScaledVector(R, r * sf).addScaledVector(UP, u * sf);
    const dead = this.act === 'dying' && this.fall > 0.3;
    if (dead) { this.katanaDrop(); return; }
    // hips twist then legs (foot IK planted in world space)
    this.rotW(this.b.hips, new Q().setFromAxisAngle(UP, c[9]));
    const w = this.ikW;
    if (w > 0.02) for (const side of ['r', 'l']) {
      const L = this.leg[side], bones = [L.u, L.k, L.f], orig = bones.map(b => b.quaternion.clone());
      const ft = side === 'r' ? [c[13], c[14], c[15]] : [c[16], c[17], c[18]];
      const T = this.pos.clone().addScaledVector(F, ft[0] * sf).addScaledVector(R, ft[1] * sf); T.y = (this.ankleH + ft[2]) * sf;
      this.ik2(L.u, L.k, L.f, L.l1 * sf, L.l2 * sf, T, F.clone().addScaledVector(R, side === 'r' ? .3 : -.3));
      this.setWorldQ(L.f, new Q().setFromAxisAngle(UP, this.yaw).multiply(L.bind));
      if (w < 0.99) { bones.forEach((b, i) => { const q = b.quaternion.clone(); b.quaternion.slerpQuaternions(orig[i], q, w); }); L.u.updateMatrixWorld(true); }
    }
    // torso: lean (pitch), twist (yaw), side bend (roll) spread over the spine
    this.b.sp.forEach((s, i) => {
      const sh = [0.3, 0.35, 0.35][i];
      const q = new Q().setFromAxisAngle(UP, c[7] * sh).multiply(new Q().setFromAxisAngle(R.clone().negate(), c[6] * sh)).multiply(new Q().setFromAxisAngle(F, c[8] * sh));
      this.rotW(s, q);
    });
    // head keeps looking at the opponent
    if (this.opp && !this.opp.dead && this.act !== 'dying') {
      const want = Math.atan2(this.opp.pos.x - this.pos.x, this.opp.pos.z - this.pos.z), cur = this.yaw + c[9] * 0.6 + c[7];
      this.rotW(this.b.head, new Q().setFromAxisAngle(UP, clamp(angDiff(cur, want), -0.8, 0.8) * 0.8));
    }
    // arms (two-bone IK) holding the katana
    const Rp = this.pos.clone().add(toW(c[0], c[1], c[2])).add(toW(c[10], c[11], -c[12]));
    const blade = toW(c[3], c[4], c[5]).normalize();
    const Lp = Rp.clone().addScaledVector(blade, -0.19 * sf).addScaledVector(R, -0.02);
    this.ik2(this.b.rs, this.b.rf, this.b.rh, this.len.r1 * sf, this.len.r2 * sf, Rp, R.clone().multiplyScalar(0.7).addScaledVector(UP, -0.8));
    this.ik2(this.b.ls, this.b.lf, this.b.lh, this.len.l1 * sf, this.len.l2 * sf, Lp, R.clone().multiplyScalar(-0.7).addScaledVector(UP, -0.8));
    const hint = Math.abs(blade.y) > 0.9 ? F : UP, m = new THREE.Matrix4().lookAt(new V3(), blade.clone().negate(), hint);
    this.katana.quaternion.setFromRotationMatrix(m); this.katana.position.copy(Rp);
    this.katana.updateMatrixWorld(true);
    const swinging = attack && this.t >= ACT[A].hit[0] - 0.08 && this.t <= ACT[A].hit[1] + 0.16;
    this.trail.power = A === 'heavy' ? 1.5 : 1;
    if (swinging || this.trail.pts.length) {
      if (swinging) this.trail.push(this.katana.localToWorld(new V3(0, 0, 0.8)), this.katana.localToWorld(new V3(0, 0, 0.45)));
      this.trail.update(swinging);
    }
  }
  katanaDrop() {
    const F = new V3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.katana.position.set(this.pos.x + F.x * 0.5 + F.z * 0.4, 0.03, this.pos.z + F.z * 0.5 - F.x * 0.4);
    this.katana.quaternion.setFromAxisAngle(UP, this.yaw + 1.3);
    this.trail.update(false);
  }
  dispose() { this.scene.remove(this.group, this.katana); this.trail.dispose(); }
}
