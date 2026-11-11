// Night dojo hall (Ashina-style): polished planks, candle stands, shoji walls, an open veranda onto a moonlit garden.
import * as THREE from 'three';

export const ARENA = { hx: 9.2, hz: 6.2 };               // fighting rectangle (half extents)
let ROOM = { hx: 12, hz: 9, h: 6.2 };                    // camera limits (walls / ceiling) of the current map
const PILLARS = [];
const rnd = (a, b) => a + Math.random() * (b - a);

import { bakeStatic } from './world.js';
import { vista } from './vista.js';
// open-world maps (Hunt / Survival) register a World here; bounds/camClip/ground then use its colliders and terrain
export const WORLD = { active: null };
export const groundAt = (x, z) => WORLD.active ? WORLD.active.ground(x, z) : 0;
export function bounds(p, r = 0.4) {
  if (WORLD.active) return WORLD.active.bounds(p, r);
  p.x = Math.max(-ARENA.hx + r, Math.min(ARENA.hx - r, p.x)); p.z = Math.max(-ARENA.hz + r, Math.min(ARENA.hz - r, p.z));
  for (const c of PILLARS) { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; } }
  return p;
}
// shorten a camera boom so it doesn't pass through walls, ceiling or pillars. returns allowed fraction 0..1 of from->to
export function camClip(from, to) {
  if (WORLD.active) return WORLD.active.camClip(from, to);
  let k = 1; const d = to.clone().sub(from);
  const lim = (o, dd, lo, hi) => { if (dd > 0 && o + dd > hi) k = Math.min(k, (hi - o) / dd); if (dd < 0 && o + dd < lo) k = Math.min(k, (lo - o) / dd); };
  lim(from.x, d.x, -ROOM.hx + 0.35, ROOM.hx - 0.35); lim(from.z, d.z, -ROOM.hz + 0.35, ROOM.hz - 0.35); lim(from.y, d.y, 0.3, ROOM.h - 0.4);
  for (const c of PILLARS) {   // 2D ray vs circle
    const fx = from.x - c.x, fz = from.z - c.z, a = d.x * d.x + d.z * d.z, b = 2 * (fx * d.x + fz * d.z), cc = fx * fx + fz * fz - (c.r + 0.3) ** 2;
    const disc = b * b - 4 * a * cc; if (a < 1e-6 || disc < 0) continue; const t = (-b - Math.sqrt(disc)) / (2 * a); if (t > 0 && t < k) k = Math.max(0.15, t);
  }
  return Math.max(0.12, k);
}

import { forest, grass, pampas, tuftGeo, foliageMat, foliageDepth } from './foliage.js';
import { torii as archTorii, lantern as archLantern, rockGeo, tiledRoof } from './arch.js';
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function planks(rough) {
  return canvasTex(1024, 1024, (x, w, h) => {
    const n = 10, pw = w / n;
    for (let i = 0; i < n; i++) {
      let y = -rnd(0, 300);
      while (y < h) {
        const len = rnd(260, 520), l = rough ? rnd(40, 70) : rnd(15, 24), hue = rnd(18, 30);
        x.fillStyle = rough ? `hsl(0,0%,${l}%)` : `hsl(${hue},${rnd(28, 40)}%,${l}%)`; x.fillRect(i * pw, y, pw, len);
        for (let k = 0; k < 40; k++) { x.strokeStyle = rough ? `rgba(255,255,255,${rnd(.05, .2)})` : `hsla(${hue},35%,${l + rnd(-6, 8)}%,.45)`; x.lineWidth = rnd(0.5, 1.6); x.beginPath(); const px = i * pw + rnd(2, pw - 2); x.moveTo(px, y); x.bezierCurveTo(px + rnd(-5, 5), y + len / 3, px + rnd(-5, 5), y + len * 2 / 3, px + rnd(-3, 3), y + len); x.stroke(); }
        x.fillStyle = rough ? 'rgba(255,255,255,.7)' : 'rgba(0,0,0,.7)'; x.fillRect(i * pw, y, pw, 2);
        y += len;
      }
      x.fillStyle = rough ? 'rgba(255,255,255,.8)' : 'rgba(0,0,0,.75)'; x.fillRect(i * pw, 0, 2.5, h);
    }
    if (!rough) for (let k = 0; k < 30; k++) { const g = x.createRadialGradient(rnd(0, w), rnd(0, h), 0, rnd(0, w), rnd(0, h), rnd(40, 160)); g.addColorStop(0, 'rgba(0,0,0,.18)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
  }, !rough);
}
function shojiTex(glow) {
  return canvasTex(256, 512, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, glow ? '#f2d6a0' : '#4a4436'); g.addColorStop(1, glow ? '#c99a5a' : '#2e2a22');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#1a120c'; for (let i = 0; i <= 4; i++) x.fillRect(i * w / 4 - 3, 0, 6, h); for (let j = 0; j <= 8; j++) x.fillRect(0, j * h / 8 - 3, w, 6);
    x.fillRect(0, 0, w, 14); x.fillRect(0, h - 14, w, 14); x.fillRect(0, 0, 14, h); x.fillRect(w - 14, 0, 14, h);
  });
}
function byobuTex() {   // ink pine painting on gold-leaf folding screen
  return canvasTex(512, 256, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#6b5a34'); g.addColorStop(1, '#3d331d'); x.fillStyle = g; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,220,140,${rnd(.02, .07)})`; x.fillRect(rnd(0, w), rnd(0, h), rnd(10, 40), rnd(10, 40)); }
    x.strokeStyle = 'rgba(15,12,10,.85)'; x.lineCap = 'round';
    const branch = (px, py, a, len, wd) => { if (wd < 1 || len < 6) return; const ex = px + Math.cos(a) * len, ey = py + Math.sin(a) * len; x.lineWidth = wd; x.beginPath(); x.moveTo(px, py); x.lineTo(ex, ey); x.stroke();
      if (wd < 4) { x.fillStyle = 'rgba(20,35,25,.55)'; x.beginPath(); x.ellipse(ex, ey, len * .8, len * .3, a, 0, 6.3); x.fill(); }
      branch(ex, ey, a + rnd(-.6, -.1), len * .72, wd * .68); branch(ex, ey, a + rnd(.1, .6), len * .7, wd * .66); };
    branch(w * .3, h, -1.4, 70, 14); branch(w * .75, h, -1.7, 60, 11);
    x.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 1; i < 6; i++) x.fillRect(i * w / 6 - 1, 0, 2, h);
  });
}
function skyMat() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec3 p;void main(){float h=clamp(p.y,-.2,1.);vec3 col=mix(vec3(.05,.07,.12),vec3(.012,.018,.04),smoothstep(0.,.6,h));
      col=mix(col,vec3(.09,.1,.14),1.-smoothstep(-.05,.12,h));
      vec3 moon=normalize(vec3(-.9,.42,.2));float m=max(dot(p,moon),0.);col+=vec3(.75,.82,1.)*pow(m,900.)*3.+vec3(.25,.32,.5)*pow(m,18.)*.5;
      gl_FragColor=vec4(col,1.);}`,
  });
}

function buildDojo(scene, renderer, cfg) {
  scene.userData.dojoStep = true;
  ROOM = { hx: 12, hz: 9, h: 6.2 };
  const lights = { candles: [], flames: [] };
  cfg.background = new THREE.Color(0x0a0d16);
  cfg.fog = new THREE.FogExp2(0x141a26, 0.02);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMat()); scene.add(sky); sky.frustumCulled = false;

  // ---------- materials ----------
  const floorMap = planks(false), floorRough = planks(true); floorMap.repeat.set(7, 5); floorRough.repeat.set(7, 5);
  const floorM = new THREE.MeshStandardMaterial({ map: floorMap, roughnessMap: floorRough, roughness: 0.94, metalness: 0.0, envMapIntensity: 0.22, bumpMap: floorRough, bumpScale: 0.4 }); cfg.floors = [floorM];
  const woodDark = new THREE.MeshStandardMaterial({ color: 0x24160f, roughness: 0.6 });
  const woodMid = new THREE.MeshStandardMaterial({ color: 0x3a2416, roughness: 0.55 });
  const lacquer = new THREE.MeshStandardMaterial({ color: 0x3a0c0a, roughness: 0.35 });
  const shojiGlow = new THREE.MeshStandardMaterial({ map: shojiTex(true), emissive: 0xffb060, emissiveMap: shojiTex(true), emissiveIntensity: 0.55, roughness: 0.9 });
  const shojiDark = new THREE.MeshStandardMaterial({ map: shojiTex(false), roughness: 0.95 });
  const byobu = new THREE.MeshStandardMaterial({ map: byobuTex(), roughness: 0.5, metalness: 0.35 });

  // ---------- floor, ceiling, walls ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.hx * 2, ROOM.hz * 2), floorM); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  // fighting area: a slightly darker tatami-free square marked by a thin rope border
  const edge = new THREE.MeshStandardMaterial({ color: 0x0f0a07, roughness: 0.8 });
  for (const [w, d, x, z] of [[ARENA.hx * 2 + 0.3, 0.12, 0, ARENA.hz + 0.15], [ARENA.hx * 2 + 0.3, 0.12, 0, -ARENA.hz - 0.15], [0.12, ARENA.hz * 2 + 0.3, ARENA.hx + 0.15, 0], [0.12, ARENA.hz * 2 + 0.3, -ARENA.hx - 0.15, 0]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.03, d), edge); m.position.set(x, 0.015, z); m.receiveShadow = true; scene.add(m);
  }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.hx * 2, ROOM.hz * 2), new THREE.MeshStandardMaterial({ color: 0x120c08, roughness: 0.9 })); ceil.rotation.x = Math.PI / 2; ceil.position.y = ROOM.h; scene.add(ceil);
  for (let i = -5; i <= 5; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, ROOM.hz * 2), woodDark); b.position.set(i * 2.2, ROOM.h - 0.15, 0); scene.add(b); }
  for (const z of [-ROOM.hz + 0.2, ROOM.hz - 0.2, 0]) { const b = new THREE.Mesh(new THREE.BoxGeometry(ROOM.hx * 2, 0.36, 0.3), woodDark); b.position.set(0, ROOM.h - 0.5, z); scene.add(b); }

  const wall = (w, h, mat, x, y, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; scene.add(m); return m; };
  // back wall (+z): dais with altar scroll, flanked by gold folding screens
  wall(ROOM.hx * 2, ROOM.h, new THREE.MeshStandardMaterial({ color: 0x1e140e, roughness: 0.85 }), 0, ROOM.h / 2, ROOM.hz, Math.PI);
  for (const sx of [-1, 1]) { const s = wall(5.2, 2.6, byobu, sx * 5.4, 1.35, ROOM.hz - 0.08, Math.PI); s.position.y = 1.4; }
  const dais = new THREE.Mesh(new THREE.BoxGeometry(5, 0.35, 1.8), woodMid); dais.position.set(0, 0.175, ROOM.hz - 0.95); dais.castShadow = dais.receiveShadow = true; scene.add(dais);
  const scroll = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4), new THREE.MeshStandardMaterial({ map: canvasTex(128, 256, (x, w, h) => { x.fillStyle = '#d9cfb4'; x.fillRect(0, 0, w, h); x.fillStyle = '#2a2420'; x.fillRect(0, 0, w, 14); x.fillRect(0, h - 14, w, 14); x.font = 'bold 54px serif'; x.textAlign = 'center'; x.fillStyle = '#111'; ['剣', '心', '一', '如'].forEach((c, i) => x.fillText(c, w / 2, 70 + i * 52)); }), roughness: 0.9 }));
  scroll.position.set(0, 2.5, ROOM.hz - 0.06); scroll.rotation.y = Math.PI; scene.add(scroll);
  // front wall (-z): glowing shoji (warm lamplight behind the paper)
  for (let i = -5; i < 5; i++) wall(2.2, 3.4, i % 3 === 0 ? shojiDark : shojiGlow, i * 2.2 + 1.1, 1.7, -ROOM.hz, 0);
  wall(ROOM.hx * 2, ROOM.h - 3.4, new THREE.MeshStandardMaterial({ color: 0x1a110b, roughness: 0.9 }), 0, 3.4 + (ROOM.h - 3.4) / 2, -ROOM.hz, 0);
  // right wall (+x): dark shoji
  for (let i = -4; i < 4; i++) wall(2.25, 3.4, shojiDark, ROOM.hx, 1.7, i * 2.25 + 1.125, -Math.PI / 2);
  wall(ROOM.hz * 2, ROOM.h - 3.4, new THREE.MeshStandardMaterial({ color: 0x1a110b, roughness: 0.9 }), ROOM.hx, 3.4 + (ROOM.h - 3.4) / 2, 0, -Math.PI / 2);
  // left side (-x): open veranda to the moonlit garden — just a lintel, railing and the night beyond
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(0.4, ROOM.h - 3.6, ROOM.hz * 2), woodDark); lintel.position.set(-ROOM.hx, 3.6 + (ROOM.h - 3.6) / 2, 0); scene.add(lintel);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, ROOM.hz * 2), woodMid); rail.position.set(-ROOM.hx - 1.2, 0.8, 0); scene.add(rail);
  const veranda = new THREE.Mesh(new THREE.PlaneGeometry(2.6, ROOM.hz * 2), floorM); veranda.rotation.x = -Math.PI / 2; veranda.position.set(-ROOM.hx - 1.3, -0.05, 0); veranda.receiveShadow = true; scene.add(veranda);
  // garden beyond: misty ground, pine silhouettes, distant mountains
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x0e1218, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.6; scene.add(ground);
  const pineM = new THREE.MeshStandardMaterial({ color: 0x0a120e, roughness: 1 });
  for (let i = 0; i < 18; i++) { const g = new THREE.Group(), x = -ROOM.hx - rnd(6, 40), z = rnd(-40, 40), s = rnd(0.8, 1.8);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 5, 6), pineM); tr.position.y = 2.5; g.add(tr);
    for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(rnd(1.4, 2.4), rnd(1, 1.6), 7), pineM); c.position.set(rnd(-.6, .6), 3 + k * 1.1, rnd(-.6, .6)); c.scale.y = 0.5; g.add(c); }
    g.position.set(x, -0.6, z); g.scale.setScalar(s); scene.add(g); }
  const mtM = new THREE.MeshBasicMaterial({ color: 0x141a28, fog: false });
  for (let i = 0; i < 9; i++) { const h = rnd(25, 55), m = new THREE.Mesh(new THREE.ConeGeometry(rnd(30, 55), h, 6), mtM); m.position.set(-rnd(110, 150), h / 2 - 10, rnd(-120, 120)); scene.add(m); }

  // ---------- pillars ----------
  const pillarG = new THREE.BoxGeometry(0.42, ROOM.h, 0.42);
  for (const x of [-10.6, -6.6, -2.2, 2.2, 6.6, 10.6]) for (const z of [-7.6, 7.6]) {
    const p = new THREE.Mesh(pillarG, woodDark); p.position.set(x, ROOM.h / 2, z); p.castShadow = p.receiveShadow = true; scene.add(p); PILLARS.push({ x, z, r: 0.32 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.56), new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.9 })); base.position.set(x, 0.07, z); scene.add(base);
  }
  for (const z of [-5.3, 0, 5.3]) { const p = new THREE.Mesh(pillarG, woodDark); p.position.set(-10.9, ROOM.h / 2, z); p.castShadow = true; scene.add(p); PILLARS.push({ x: -10.9, z, r: 0.32 }); }

  // ---------- candle stands (shokudai) + hanging lanterns ----------
  const flameTex = canvasTex(64, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h * 0.62, 2, w / 2, h * 0.55, w * 0.5); g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.3, 'rgba(255,200,90,.9)'); g.addColorStop(1, 'rgba(255,90,20,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(w / 2, h * 0.6, w * 0.3, h * 0.38, 0, 0, 6.3); x.fill(); });
  const candleSpots = [[-7.8, -5.4], [7.8, -5.4], [-7.8, 5.4], [7.8, 5.4], [-2.2, 7.9], [2.2, 7.9], [0, -7.6]];
  const brass = new THREE.MeshStandardMaterial({ color: 0x6a5226, metalness: 0.8, roughness: 0.35 });
  for (const [x, z] of candleSpots) {
    const g = new THREE.Group();
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.06, 12), brass); foot.position.y = 0.03;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 1.3, 8), brass); pole.position.y = 0.68;
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.03, 12), brass); dish.position.y = 1.34;
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 10), new THREE.MeshStandardMaterial({ color: 0xe8dcc4, emissive: 0x6a3a10, emissiveIntensity: 0.4, roughness: 0.6 })); wax.position.y = 1.43;
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); fl.position.y = 1.58; fl.scale.set(0.09, 0.18, 1);
    g.add(foot, pole, dish, wax, fl); g.traverse(o => { if (o.isMesh) o.castShadow = true; }); g.position.set(x, z > 7 ? 0.35 : 0, z); scene.add(g);
    const l = new THREE.PointLight(0xffa458, 9, 10, 1.7); l.position.set(x, 1.65 + (z > 7 ? 0.35 : 0), z); scene.add(l);
    lights.candles.push({ l, base: 9, ph: rnd(0, 9) }); lights.flames.push({ s: fl, ph: rnd(0, 9) });
  }
  const lanternM = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xff9a40, emissiveIntensity: 1.6, roughness: 0.8 });
  for (const [x, z] of [[-4.5, -3], [4.5, -3], [-4.5, 3], [4.5, 3]]) {
    const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 14), lanternM); lan.position.set(x, 4.2, z);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.08, 14), woodDark); cap.position.set(x, 4.49, z);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, ROOM.h - 4.5, 4), woodDark); cord.position.set(x, 4.5 + (ROOM.h - 4.5) / 2, z);
    scene.add(lan, cap, cord);
  }

  // ---------- lighting ----------
  scene.add(new THREE.HemisphereLight(0x6a6a88, 0x4a3018, 1.0));
  // moonlight through the open veranda (cool rim + long shadows)
  const moon = new THREE.DirectionalLight(0xb0c4ff, 2.6); moon.position.set(-16, 11, 4); moon.target.position.set(0, 0, 0);
  moon.castShadow = true; Object.assign(moon.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 50 }); moon.shadow.bias = -0.0003; moon.shadow.normalBias = 0.02;
  scene.add(moon, moon.target);
  // warm key from the lanterns above the floor (soft shadows under the fighters)
  const key = new THREE.SpotLight(0xffc080, 140, 24, 0.85, 0.6, 1.3); key.position.set(1.5, 5.6, -1.5); key.target.position.set(0, 0, 0.5);
  key.castShadow = true; key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02; key.shadow.camera.near = 1; key.shadow.camera.far = 14; scene.add(key, key.target);
  // glow behind the front shoji
  const fill = new THREE.PointLight(0xffa860, 9, 18, 1.2); fill.position.set(0, 3.2, -ROOM.hz + 0.5); fill.userData.noPool = true; scene.add(fill);

  // ---------- volumetric light shafts from the veranda (cheap additive planes) ----------
  const shaftTex = canvasTex(64, 256, (x, w, h) => { const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(160,190,255,0)'); g.addColorStop(0.3, 'rgba(160,190,255,.35)'); g.addColorStop(1, 'rgba(160,190,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); const g2 = x.createLinearGradient(0, 0, w, 0); g2.addColorStop(0, 'rgba(0,0,0,1)'); g2.addColorStop(.5, 'rgba(0,0,0,0)'); g2.addColorStop(1, 'rgba(0,0,0,1)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = g2; x.fillRect(0, 0, w, h); });
  const shaftM = new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const shafts = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 13), shaftM); s.position.set(-8.5 + rnd(-.5, .5), 3.4, -6 + i * 2.4); s.rotation.set(0, Math.PI / 2 + rnd(-.2, .2), -1.0 + rnd(-.08, .08)); scene.add(s); shafts.push(s);
  }

  // ---------- environment for PBR reflections (blades, lacquer, floor) ----------
  const env = new THREE.Scene(); env.background = new THREE.Color(0x0a0c12);
  const em = c => new THREE.MeshBasicMaterial({ color: c, side: THREE.BackSide });
  const box = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 18), em(0x2a1d14)); box.position.y = 3; env.add(box);
  const glowP = (c, w, h, x, y, z, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); p.position.set(x, y, z); p.rotation.y = ry; env.add(p); };
  glowP(0xc89058, 20, 3.4, 0, 1.7, -8.9, 0); glowP(0x5a6c9a, 16, 3.5, -11.9, 1.9, 0, Math.PI / 2);
  for (const [x, z] of candleSpots) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd090 })); s.position.set(x, 1.6, z); env.add(s); }
  for (const [x, z] of [[-4.5, -3], [4.5, -3], [-4.5, 3], [4.5, 3]]) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070 })); s.position.set(x, 4.2, z); env.add(s); }
  cfg.envScene = env; cfg.envI = 0.6; cfg.exposure = 1.55; cfg.amb = 'embers'; cfg.poolK = 0.45;   // floor glow under the candles: soft, no hot spots

  let t = 0;
  return {
    moon, key, lights,
    setQuality(q) {
      const size = q === 'high' ? 2048 : q === 'med' ? 1024 : 1024;
      for (const L of [moon, key]) { L.shadow.mapSize.set(L === key && q !== 'high' ? 512 : size, L === key && q !== 'high' ? 512 : size); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } }
      key.castShadow = q === 'high'; moon.castShadow = true;
      shafts.forEach(s => s.visible = q !== 'low');
    },
    update(dt) {
      t += dt;
      for (const c of lights.candles) c.l.intensity = c.base * (0.85 + 0.1 * Math.sin(t * 9 + c.ph) + 0.06 * Math.sin(t * 23 + c.ph * 2));
      for (const f of lights.flames) { const k = 1 + 0.12 * Math.sin(t * 11 + f.ph); f.s.scale.set(0.09 * (2 - k), 0.18 * k, 1); }
      for (const s of shafts) s.material.opacity = 0.18 + 0.04 * Math.sin(t * 0.4);
    },
  };
}

// ---- per-map look tuning (bloom works on linear HDR before tone mapping; threshold > 1 = only true highlights) ----
const BLOOM_DEFAULT = { strength: 0.45, threshold: 1.25 };
// exp: tone-mapping exposure (lower = no washed-out floors), haze: screen-space sun glow / god rays toward the key light,
// weathers: what a duel on this map may roll (clear weighted double)
const LOOK = {
  dojo: { bloom: { strength: 0.45, threshold: 1.25 }, camFill: 0.5, exp: 1.32, haze: 0, weathers: ['clear'] },
  sakura: { bloom: { strength: 0.5, threshold: 1.1 }, camFill: 0.45, exp: 1.25, haze: 0.7, weathers: ['clear', 'clear', 'wind', 'fog'] },
  snow: { bloom: { strength: 0.25, threshold: 1.5 }, camFill: 0.15, exp: 0.6, haze: 0.55, weathers: ['snow', 'snow', 'clear', 'fog'] },
  bamboo: { bloom: { strength: 0.45, threshold: 1.25 }, camFill: 0.35, exp: 1.05, haze: 0.5, weathers: ['clear', 'clear', 'rain', 'fog'] },
};
// ---- horizon backdrops (assets/bg/*.svg): tileable silhouette strips on open cylinders round the map, layered for parallax.
// They melt into the fog colour by distance and toward their base, so 3D bamboo / trees / ground hand over to them invisibly.
// [svg, radius, height, base y, repeats round the circle, base haze, brightness ('auto' = follows the fog colour), turn, solid]
// solid: the strip stays opaque down to its base (ranges, hills: no see-through gap under them); otherwise it fades out (tree lines)
const BACKDROPS = {
  dojo: [['night_far', 95, 44, -8, 3, 0.08, 1.15, 0, true], ['night_near', 72, 20, -4, 4, 0.04, 1.1, 0, true]],
  // Fuji and a ring of far ranges stand behind the 2D sakura forest, whose crowns overlap their feet
  sakura: [['mtn_cold', 190, 64, -16, 3, 0.38, 0.6, 0.6, true], ['fuji_night', 170, 70, -16, 1, 0.3, 0.72, Math.PI, true], ['momiji_far', 56, 17, -3.8, 4, 0.55, 0.45, 0.4, true], ['momiji_near', 40, 15, -3.6, 5, 0.42, 0.42, 0, true], ['mist', 48, 9, -2.5, 4, 0.55, 0.42], ['mist', 33, 6, -2, 5, 0.55, 0.38, 1.1]],   // night: Fuji right under the moon, everything far sinks into the cold haze
  snow: [['snow_far', 160, 70, -10, 3, 0.3, 1, 0, true], ['snow_near', 100, 24, -5, 5, 0.18, 1, 0, true]],
  bamboo: [['bamboo_far', 64, 30, -2, 6, 0.42, 0.9], ['bamboo_near', 47, 26, -1, 7, 0.22, 0.85]],
  sv_fortress: [['snow_far', 170, 70, -12, 3, 0.3, 'auto', 0, true], ['snow_near', 112, 26, -8, 4, 0.2, 'auto', 0, true]],
  _world: [['mtn_far', 175, 64, -12, 3, 0.32, 'auto', 0, true], ['mtn_near', 118, 30, -9, 4, 0.18, 'auto', 0, true]],
  _worldNight: [['night_far', 175, 70, -12, 3, 0.12, 1.2, 0, true], ['night_near', 118, 30, -9, 4, 0.06, 1.1, 0, true]],   // purple ranges, teal glow, stars
};
const BG_TEX = {};
function backdropTex(name) {
  if (BG_TEX[name]) return BG_TEX[name];
  const t = new THREE.TextureLoader().load('assets/bg/' + name + '.svg'); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; t.userData.shared = true;
  return BG_TEX[name] = t;
}
function addBackdrops(g, list, cfg) {
  const out = []; if (!list) return out;
  for (const [name, R, H, y0, rep, haze, bright, rotY, solid] of list) {
    const tex = backdropTex(name), geo = new THREE.CylinderGeometry(R, R, H, 64, 1, true); geo.translate(0, y0 + H / 2, 0);
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      uniforms: { map: { value: tex }, rep: { value: rep }, fogCol: { value: new THREE.Color() }, haze: { value: haze }, bright: { value: 1 }, solid: { value: solid ? 1 : 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map; uniform float rep, haze, bright, solid; uniform vec3 fogCol; varying vec2 vUv; void main(){ vec4 t = texture2D(map, vec2(vUv.x * rep, vUv.y)); if (t.a < 0.03) discard; float low = 1.0 - smoothstep(0.0, 0.4, vUv.y); float f = clamp(haze + low * (solid > 0.5 ? 0.3 : 0.5), 0.0, 1.0); gl_FragColor = vec4(mix(t.rgb * bright, fogCol, f), t.a * (1.0 - low * 0.85 * (1.0 - solid))); }' });
    const mesh = new THREE.Mesh(geo, m); if (rotY) mesh.rotation.y = rotY; mesh.renderOrder = -10 - Math.round(R);   /* painter's order: farther rings first (same centre -> depth sort can't tell them apart) */ mesh.frustumCulled = false; mesh.userData.dynamic = true; g.add(mesh);
    out.push({ m, R, haze, bright, solid });
  }
  return out;
}
// per frame: haze follows the live fog (weather, time of day); 'auto' brightness dims the silhouettes at night
function updateBackdrops(cfg, scene) {
  const F = scene.fog, bg = scene.background && scene.background.isColor ? scene.background : null;
  for (const B of cfg.backdrop || []) { const c = B.m.uniforms;
    if (bg) c.fogCol.value.copy(bg); else if (F) c.fogCol.value.copy(F.color);   // the sky colour at the horizon is what they fade into
    let f = 0; const d = B.R * 0.3; if (F) f = F.isFogExp2 ? 1 - Math.exp(-((F.density * d) ** 2)) : Math.min(1, Math.max(0, (d - F.near) / Math.max(1, F.far - F.near)));
    c.haze.value = Math.min(B.solid ? 0.62 : 0.97, B.haze + f * 0.75);
    c.bright.value = B.bright === 'auto' ? Math.min(1.1, Math.max(0.18, (c.fogCol.value.r * 0.3 + c.fogCol.value.g * 0.59 + c.fogCol.value.b * 0.11) * 1.6)) : B.bright;
  }
}
// floor glow under every lamp: an additive radial decal, so most point lights can be switched off for free
let POOL_TEX = null;
function poolTex() { return POOL_TEX || (POOL_TEX = canvasTex(128, 128, (x, w, h) => { const g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(0.35, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); })); }
function lightPools(g) {
  const out = [];
  g.updateMatrixWorld(true);
  g.traverse(o => { if (!o.isPointLight || o.userData.noPool) return; const p = o.getWorldPosition(new THREE.Vector3()); if (p.y > 3.6) return;
    const r = Math.min(3.2, (o.distance || 8) * 0.32), m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: poolTex(), color: o.color.clone().multiplyScalar(0.55), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.rotation.x = -Math.PI / 2; m.position.set(p.x, (p.z > 7 && g.userData.dojoStep ? 0.36 : 0.012), p.z); m.userData.dynamic = true; m.renderOrder = 1; out.push({ l: o, m, d: Math.hypot(p.x, p.z) }); });
  for (const P of out) P.m.parent || g.add(P.m);
  return out.sort((a, b) => a.d - b.d);
}
// each visible point light costs every lit pixel: keep the few closest to the fight, the rest live on as glow decals
const LIGHT_CAP = { high: 4, med: 2, low: 0 };
function applyLightBudget(pools, q, k = 1) { pools.forEach((P, i) => { const on = i < LIGHT_CAP[q]; P.l.visible = on; P.m.material.opacity = (on ? 0.35 : 0.85) * k; }); }

// ===================================================================================
// Outdoor maps + map manager. The fighting rectangle (ARENA) is identical everywhere,
// so online opponents may pick different maps without any desync.
// ===================================================================================
const DUEL_GROUND = { bamboo: 62 };   // ground disc radius under a duel arena's vista (the vista relief takes over past it)
// duel arenas have no World: give vista.js the little it needs (flat ground at 0 inside, the ground colour)
function duelVista(g, cfg, half, col, P) { const W = { half, ground: () => 0, colorFn: (x, z, c) => c.setRGB(...col).convertSRGBToLinear(), water: null }; vista(g, W, cfg, { inner: half, ...P }); }
export function gradSky(top, mid, hor, sunDir, sunCol, sunPow = 600, glow = 0.6) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { a: { value: new THREE.Color(hor) }, b: { value: new THREE.Color(mid) }, c: { value: new THREE.Color(top) }, s: { value: new THREE.Vector3(...sunDir).normalize() }, sc: { value: new THREE.Color(sunCol) }, sp: { value: sunPow }, gl: { value: glow }, fc: { value: new THREE.Color(hor) }, fk: { value: 0 } },
    vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 p;uniform vec3 a,b,c,sc,s,fc;uniform float sp,gl,fk;void main(){float h=clamp(p.y,-.2,1.);vec3 col=mix(a,b,smoothstep(-.02,.25,h));col=mix(col,c,smoothstep(.25,.9,h));col=mix(col,fc,fk*(1.-smoothstep(-.01,.16,h)));float m=max(dot(p,s),0.);col+=sc*(pow(m,sp)*3.+pow(m,8.)*gl*.5);gl_FragColor=vec4(col,1.);}',
  });
}
export const SKY_R = 780;   // sky sphere radius: inside the camera far plane (main.js) with room for the camera's offset on big maps
export function skyAndEnv(g, cfg, mat) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_R, 32, 16), mat); sky.frustumCulled = false; g.add(sky); cfg.skyMat = cfg.skyMat || mat;
  const env = new THREE.Scene(); env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat.clone()));
  cfg.envScene = env;
  return env;
}
export function sunLight(g, color, I, pos) {
  const s = new THREE.DirectionalLight(color, I); s.position.set(...pos); s.target.position.set(0, 0, 0);
  s.castShadow = true; Object.assign(s.shadow.camera, { left: -13, right: 13, top: 11, bottom: -11, near: 1, far: 90 }); s.shadow.bias = -0.0003; s.shadow.normalBias = 0.025;
  g.add(s, s.target); return s;
}
function noiseTex(base, spread, n = 6000, size = 512, rep = 10) {
  return canvasTex(size, size, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) { const [hh, ss, ll] = spread(); x.fillStyle = `hsl(${hh},${ss}%,${ll}%)`; x.beginPath(); x.arc(rnd(0, w), rnd(0, h), rnd(1, 3.5), 0, 6.3); x.fill(); }
  });
}
function tilesTex(c1, c2) {
  return canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = c2; x.fillRect(0, 0, w, h); const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const o = j % 2 ? s / 2 : 0; x.fillStyle = c1; x.globalAlpha = rnd(0.75, 1); x.fillRect(i * s + o + 3, j * s + 3, s - 6, s - 6); x.globalAlpha = 1;
      for (let k = 0; k < 60; k++) { x.fillStyle = `rgba(0,0,0,${rnd(.02, .08)})`; x.fillRect(i * s + o + rnd(0, s), j * s + rnd(0, s), rnd(2, 9), rnd(2, 9)); } }
  });
}
// wooden fight stage flush with y=0 (used by the garden map)
function woodStage(g) {
  const m = planks(false); m.repeat.set(6, 4); const r = planks(true); r.repeat.set(6, 4);
  const top = new THREE.Mesh(new THREE.BoxGeometry(ARENA.hx * 2 + 1.2, 0.5, ARENA.hz * 2 + 1.2), new THREE.MeshStandardMaterial({ map: m, roughness: 0.9, envMapIntensity: 0.4 }));
  top.position.y = -0.25; top.receiveShadow = true; g.add(top);
  const rim = new THREE.MeshStandardMaterial({ color: 0x6a1410, roughness: 0.45 });
  for (const [w, d, x, z] of [[ARENA.hx * 2 + 1.3, 0.16, 0, ARENA.hz + 0.62], [ARENA.hx * 2 + 1.3, 0.16, 0, -ARENA.hz - 0.62], [0.16, ARENA.hz * 2 + 1.3, ARENA.hx + 0.62, 0], [0.16, ARENA.hz * 2 + 1.3, -ARENA.hx - 0.62, 0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.56, d), rim); b.position.set(x, -0.22, z); g.add(b); }
}
// round duelling stage (Momiji map): planked disc with a lacquered rim; the fighting rectangle (ARENA) fits inside it
function roundStage(g, R) {
  const m = planks(false); m.repeat.set(7, 7); const top = new THREE.Mesh(new THREE.CylinderGeometry(R, R + 0.15, 0.5, 48), new THREE.MeshStandardMaterial({ map: m, roughness: 0.8, envMapIntensity: 0.5 }));
  top.position.y = -0.25; top.receiveShadow = true; g.add(top);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R + 0.05, 0.09, 6, 64), new THREE.MeshStandardMaterial({ color: 0x5a1210, roughness: 0.45 })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; g.add(rim);
  return top.material;
}
// ---- shared set pieces for the outdoor arenas ----
// multi-tier pagoda: dark timber, a balcony rail and glowing windows on every tier, wide hipped roofs (optionally snow-capped)
function jpPagoda(g, x, z, { tiers = 5, s = 1, snow = false, ry = 0 } = {}) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x2c1a14, roughness: 0.8 }), roofM = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.6, flatShading: true }),
    win = new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xff9a40, emissiveIntensity: 1.7 }), snowM = new THREE.MeshStandardMaterial({ color: 0xe8edf4, roughness: 1, flatShading: true }), p = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.8, 7.2), new THREE.MeshStandardMaterial({ color: 0x5a5a5c, roughness: 1 })); base.position.y = 0.4; p.add(base);
  let y = 0.8;
  for (let k = 0; k < tiers; k++) {
    const w = 5.4 - k * 0.72, hh = k ? 1.7 : 2.4;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, hh, w), wood); b.position.y = y + hh / 2; p.add(b);
    for (let q = 0; q < 4; q++) { const a = q * Math.PI / 2, wm = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.5, hh * 0.42), win); wm.position.set(Math.sin(a) * (w / 2 + 0.01), y + hh * 0.5, Math.cos(a) * (w / 2 + 0.01)); wm.rotation.y = a; p.add(wm); }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.12, w + 0.5), wood); rail.position.y = y + 0.06; p.add(rail);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(w * 1.12, 1.05, 4, 1), roofM); roof.rotation.y = Math.PI / 4; roof.position.y = y + hh + 0.4; p.add(roof);
    const eave = new THREE.Mesh(new THREE.BoxGeometry(w * 1.55, 0.14, w * 1.55), roofM); eave.position.y = y + hh - 0.05; p.add(eave);
    if (snow) { const c = new THREE.Mesh(new THREE.ConeGeometry(w * 1.02, 0.8, 4, 1), snowM); c.rotation.y = Math.PI / 4; c.position.y = y + hh + 0.58; p.add(c); }
    y += hh + 0.75;
  }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.12, 3, 6), new THREE.MeshStandardMaterial({ color: 0x8a6a30, metalness: 0.7, roughness: 0.4 })); spire.position.y = y + 1.2; p.add(spire);
  p.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  p.position.set(x, 0, z); p.rotation.y = ry; p.scale.setScalar(s); g.add(p); return p;
}
// small hall with warm lit shoji and a tiled gable roof (shrine / tea house)
function jpHall(g, x, z, { w = 6, d = 4.5, h = 2.6, ry = 0, snow = false } = {}) {
  const wood = new THREE.MeshStandardMaterial({ color: 0x2e1e16, roughness: 0.85 }), shoji = new THREE.MeshStandardMaterial({ color: 0xffd6a0, emissive: 0xffa050, emissiveIntensity: 1.2, roughness: 0.9 }), p = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.5, d + 1), wood); floor.position.y = 0.25; p.add(floor);
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood); body.position.y = 0.5 + h / 2; p.add(body);
  for (const [sx, sz, ww, ry2] of [[0, d / 2 + 0.01, w * 0.7, 0], [0, -d / 2 - 0.01, w * 0.5, Math.PI], [w / 2 + 0.01, 0, d * 0.6, Math.PI / 2], [-w / 2 - 0.01, 0, d * 0.6, -Math.PI / 2]]) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(ww, h * 0.62), shoji); pane.position.set(sx, 0.5 + h * 0.5, sz); pane.rotation.y = ry2; p.add(pane);
    for (let k = 1; k < 4; k++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.05, h * 0.62, 0.04), wood); bar.position.set(sx + Math.cos(ry2) * (k / 4 - 0.5) * ww, 0.5 + h * 0.5, sz - Math.sin(ry2) * (k / 4 - 0.5) * ww); bar.rotation.y = ry2; p.add(bar); } }
  const roofM = new THREE.MeshStandardMaterial({ color: snow ? 0xdfe5ee : 0x22262e, roughness: 0.8 }), black = new THREE.MeshStandardMaterial({ color: 0x141418, roughness: 0.7 });
  const roof = tiledRoof({ roof: roofM, black, wood }, w + 1.6, d + 1.8, 1.5); roof.position.y = 0.5 + h; p.add(roof);
  p.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  p.position.set(x, 0, z); p.rotation.y = ry; g.add(p); return p;
}
// boulder whose upward faces carry a cap of snow or moss (vertex colours from the face normals)
function capRock(g, x, z, sc, cap, base = 0x4a4c50, y = -0.3) {
  const geo = rockGeo(((x * 7 + z * 3) | 0) & 3, 2).toNonIndexed(); geo.computeVertexNormals(); const N = geo.attributes.normal, col = new Float32Array(N.count * 3), cb = new THREE.Color(base), cc = new THREE.Color(cap), c = new THREE.Color();
  for (let i = 0; i < N.count; i++) { c.copy(cb).lerp(cc, THREE.MathUtils.smoothstep(N.getY(i), 0.35, 0.7)); col.set([c.r, c.g, c.b], i * 3); }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true })); m.position.set(x, y, z); m.scale.set(sc, sc * 0.7, sc); m.rotation.y = x * 1.7; m.castShadow = m.receiveShadow = true; g.add(m); return m;
}
const LANTERN_M = {};
function stoneLantern(g, x, z, lightOn, list) {
  if (!LANTERN_M.stone) { LANTERN_M.stone = new THREE.MeshStandardMaterial({ color: 0x8a867e, roughness: 0.95 }); LANTERN_M.paper = new THREE.MeshStandardMaterial({ color: 0xffd090, emissive: 0xffa040, emissiveIntensity: 2.2 }); }
  const t = archLantern(LANTERN_M, true); t.position.set(x, 0, z); g.add(t);
  if (lightOn) { const l = new THREE.PointLight(0xffa850, 6, 9, 1.6); l.position.set(x, 1.6, z); g.add(l); list && list.push(l); }
}
// falling particles: 'petals' | 'snow' | 'fireflies'
export function particles(g, kind, n) {
  const p = new Float32Array(n * 3), v = new Float32Array(n * 3), ph = new Float32Array(n);
  const spawn = (i, top) => { p[i * 3] = rnd(-24, 24); p[i * 3 + 1] = top ? rnd(7, 12) : rnd(0, 12); p[i * 3 + 2] = rnd(-20, 20); ph[i] = rnd(0, 9);
    if (kind === 'petals' || kind === 'momiji') { v[i * 3] = rnd(-1.2, -0.4); v[i * 3 + 1] = rnd(-0.9, -0.5); v[i * 3 + 2] = rnd(-0.3, 0.3); }
    else if (kind === 'snow') { v[i * 3] = rnd(-0.2, 0.2); v[i * 3 + 1] = rnd(-0.9, -0.5); v[i * 3 + 2] = rnd(-0.2, 0.2); }
    else { p[i * 3 + 1] = rnd(0.3, 3); v[i * 3] = rnd(-.3, .3); v[i * 3 + 1] = rnd(-.1, .1); v[i * 3 + 2] = rnd(-.3, .3); } };
  for (let i = 0; i < n; i++) spawn(i, false);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const col = { petals: 0xffb8cc, momiji: 0xb0242a, snow: 0xffffff, fireflies: 0xd8ff7a }[kind];
  const tex = canvasTex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
  const mat = new THREE.PointsMaterial({ size: kind === 'petals' || kind === 'momiji' ? 0.12 : kind === 'snow' ? 0.07 : 0.09, color: col, map: tex, transparent: true, depthWrite: false, opacity: kind === 'fireflies' ? 1 : 0.9, blending: kind === 'fireflies' ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; g.add(pts);
  let t = 0;
  return dt => {
    t += dt;
    for (let i = 0; i < n; i++) {
      const s = Math.sin(t * 1.3 + ph[i]);
      p[i * 3] += (v[i * 3] + s * (kind === 'snow' ? 0.15 : 0.5)) * dt; p[i * 3 + 1] += v[i * 3 + 1] * dt; p[i * 3 + 2] += (v[i * 3 + 2] + Math.cos(t + ph[i]) * 0.3) * dt;
      if (kind === 'fireflies') { if (Math.abs(p[i * 3]) > 24 || p[i * 3 + 1] < 0.2 || p[i * 3 + 1] > 3.5) spawn(i, false); }
      else if (p[i * 3 + 1] < 0) spawn(i, true);
    }
    if (kind === 'fireflies') mat.opacity = 0.65 + 0.35 * Math.sin(t * 3);
    geo.attributes.position.needsUpdate = true;
  };
}
function mountains(g, color, n, rMin, rMax, side) {
  const m = new THREE.MeshBasicMaterial({ color, fog: true });
  for (let i = 0; i < n; i++) { const a = side !== undefined ? side + rnd(-0.9, 0.9) : rnd(0, Math.PI * 2), r = rnd(rMin, rMax), h = rnd(30, 70), c = new THREE.Mesh(new THREE.ConeGeometry(rnd(35, 60), h, 6), m); c.position.set(Math.cos(a) * r, h / 2 - 12, Math.sin(a) * r); g.add(c); }
}

// ---------- Sakura garden at sunset ----------
function buildSakura(g, renderer, cfg) {
  ROOM = { hx: 60, hz: 60, h: 40 };
  // bright moonlit night: cold moon key from behind the torii, blue sky glow fill so both fighters and every swing stay readable
  cfg.background = new THREE.Color(0x222b42); cfg.fog = new THREE.Fog(0x283248, 34, 180); cfg.exposure = 1.25; cfg.envI = 0.8; cfg.amb = 'petals';
  const moonDir = [0.04, 0.4, 0.92];   // right above Fuji
  skyAndEnv(g, cfg, gradSky(0x070c18, 0x1a2440, 0x3c4862, moonDir, 0xeef2ff, 2200, 0.55));
  g.add(new THREE.HemisphereLight(0xb8c8ff, 0x3a3044, 1.25));
  const sun = sunLight(g, 0xd8e4ff, 2.8, [moonDir[0] * 40, moonDir[1] * 40 + 8, moonDir[2] * 40]);
  const fillL = new THREE.DirectionalLight(0x9fb2ff, 0.7); fillL.position.set(-20, 12, -25); g.add(fillL);   // cool rim from the camera side
  // the moon: a bright cratered disc (HDR, blooms) with a soft halo, far out along the key light
  const moonT = canvasTex(256, 256, (x, w, h) => { const gr = x.createRadialGradient(w * 0.45, h * 0.42, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.85, '#e6ebf4'); gr.addColorStop(1, '#c8d0e0'); x.fillStyle = gr; x.beginPath(); x.arc(w / 2, h / 2, w / 2 - 2, 0, 6.3); x.fill();
    for (let k = 0; k < 26; k++) { x.fillStyle = `rgba(120,130,150,${rnd(0.12, 0.3)})`; x.beginPath(); x.arc(rnd(40, 216), rnd(40, 216), rnd(5, 26), 0, 6.3); x.fill(); } });
  const mv = new THREE.Vector3(...moonDir).normalize().multiplyScalar(195);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(10, 32), new THREE.MeshBasicMaterial({ map: moonT, color: new THREE.Color(1, 1, 1).multiplyScalar(2.4), fog: false, transparent: true }));
  moon.position.copy(mv); moon.lookAt(0, 0, 0); moon.renderOrder = -300; moon.userData.dynamic = true; g.add(moon);
  const haloT = canvasTex(128, 128, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(220,230,255,.55)'); gr.addColorStop(0.3, 'rgba(200,215,255,.18)'); gr.addColorStop(1, 'rgba(200,215,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshBasicMaterial({ map: haloT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.position.copy(mv).multiplyScalar(1.01); halo.lookAt(0, 0, 0); halo.renderOrder = -301; halo.userData.dynamic = true; g.add(halo);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.MeshStandardMaterial({ map: noiseTex('#3c4436', () => [rnd(70, 110), rnd(8, 22), rnd(16, 30)], 7000, 512, 30), roughness: 1 }));
  ground.material.map.repeat.set(30, 30); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.5; ground.receiveShadow = true; g.add(ground);
  cfg.floors = [roundStage(g, 12.2)];
  // layers: round stage -> susuki field -> 3D trees (a few dark-red momiji, dark pines, bare trees), rocks, lanterns, torii, pagoda
  // -> painted dark forest + mist -> cold Fuji and ranges -> night sky with the moon
  const ring = (n, r0, r1, s0, s1, avoid) => { const out = []; let k = 0; while (out.length < n && k++ < 500) { const a = rnd(0, Math.PI * 2), r = rnd(r0, r1), x = Math.cos(a) * r, z = Math.sin(a) * r; if (avoid && avoid(x, z)) continue; out.push([x, -0.5, z, rnd(s0, s1)]); } return out; };
  const clearView = (x, z) => z > 10 && Math.abs(x) < 7;   // keep the line to Fuji open behind the far edge of the stage
  forest(g, 'momiji', ring(7, 14, 24, 1.05, 1.5, clearView));
  forest(g, 'momijiLow', ring(6, 15, 27, 0.9, 1.2, clearView), { variants: 3 });   // low, crooked, wide
  forest(g, 'momijiTall', ring(5, 18, 28, 0.9, 1.15, clearView), { variants: 2 });
  forest(g, 'bare', ring(5, 15, 27, 0.9, 1.2, clearView));
  const rockM = new THREE.MeshStandardMaterial({ color: 0x4a4e52, roughness: 0.95, flatShading: true });
  for (const [x, z, sc] of [[-15, 12, 2.4], [16, 13, 2.0], [-19, -6, 2.6], [19, -9, 2.2], [-9, -16, 1.6], [11, -17, 1.8], [-22, 20, 3.0], [23, 18, 2.6]]) {
    const r = new THREE.Mesh(rockGeo((x * 7 + z) & 3, 2), rockM); r.position.set(x, -0.6, z); r.scale.set(sc, sc * 0.75, sc); r.rotation.y = x; r.castShadow = r.receiveShadow = true; g.add(r); }
  // susuki field round the stage, thinning toward the trees
  const pp = []; let guard = 0;
  while (pp.length < 2600 && guard++ < 20000) { const a = rnd(0, Math.PI * 2), r = 12.5 + Math.pow(Math.random(), 1.3) * 18; pp.push([Math.cos(a) * r, -0.5, Math.sin(a) * r, rnd(0.8, 1.25)]); }
  pampas(g, pp);
  // torii flanking the view, a pagoda glowing in the mist beyond the trees, lanterns at the edge of the field
  const red = new THREE.MeshStandardMaterial({ color: 0x8a1814, roughness: 0.55 }), blk = new THREE.MeshStandardMaterial({ color: 0x141214, roughness: 0.6 });
  for (const [x, z, ry] of [[-13.5, 16, 0.55], [13.5, 16, -0.55]]) { const t = archTorii({ red, black: blk }, 1.35); t.position.set(x, -0.5, z); t.rotation.y = ry; g.add(t); }
  { const wood = new THREE.MeshStandardMaterial({ color: 0x3a1c16, roughness: 0.75 }), roofM = new THREE.MeshStandardMaterial({ color: 0x1c2028, roughness: 0.6 }), win = new THREE.MeshStandardMaterial({ color: 0xffc070, emissive: 0xff9a40, emissiveIntensity: 1.6 });
    const pag = new THREE.Group();
    for (let k = 0; k < 4; k++) { const w = 4.6 - k * 0.8, y = k * 2.3; const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, w), wood); b.position.y = y + 0.9; pag.add(b);
      for (let q = 0; q < 4; q++) { const wm = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.4, 0.7), win); const a = q * Math.PI / 2; wm.position.set(Math.sin(a) * (w / 2 + 0.01), y + 0.9, Math.cos(a) * (w / 2 + 0.01)); wm.rotation.y = a; pag.add(wm); }
      const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.98, 1.0, 4), roofM); r.position.y = y + 2.2; r.rotation.y = Math.PI / 4; pag.add(r); }
    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 2.4, 6), roofM); spire.position.y = 10.4; pag.add(spire);
    pag.position.set(17, -0.5, 33); pag.rotation.y = 0.3; g.add(pag); }
  for (const [x, z, lit] of [[-12.6, 6.5, 1], [12.6, 6.5, 1], [-5.5, 13.2, 1], [5.5, 13.2, 1], [-12.6, -6.5, 0], [12.6, -6.5, 0]]) stoneLantern(g, x, z, !!lit);
  const upd = particles(g, 'momiji', 260);
  // around the field: open moonlit land rising slowly to far snowy ranges; only momiji on it (the map's own tree), no
  // other kinds; the relief starts past the pagoda so the field, susuki, torii and trees stay exactly as they were
  duelVista(g, cfg, 46, [0.22, 0.25, 0.19], { seed: 42, tod: 'night', far: 'snow', keepBackdrop: ['fuji_night'], clouds: 0, treeK: 0.14, nearK: 0.4, rockK: 0.5,
    sides: [[0, 'hills'], [100, 'hills'], [200, 'hills'], [290, 'hills']], near: [['momiji', 0.4], ['momijiLow', 0.35], ['momijiTall', 0.25]],
    trees: [['autumn', 0.6, 'broad'], ['autumn', 0.4, 'spread']], palette: { grass: [0.22, 0.25, 0.19], rock: [0.3, 0.3, 0.33] } });
  return { setQuality(q) { sun.shadow.mapSize.setScalar(q === 'high' ? 2048 : 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }, update: upd };
}

// ---------- Snow temple at dawn ----------
function buildSnow(g, renderer, cfg) {
  ROOM = { hx: 60, hz: 60, h: 40 };
  cfg.background = new THREE.Color(0x8c98ae); cfg.fog = new THREE.FogExp2(0x96a2b6, 0.0095); cfg.exposure = 0.7; cfg.envI = 0.55; cfg.amb = 'snow';
  const sunDir = [0.4, 0.35, -0.85];
  skyAndEnv(g, cfg, gradSky(0x3a4a6a, 0x7a88a4, 0xb8bec8, sunDir, 0xffe6cc, 300, 0.3));
  g.add(new THREE.HemisphereLight(0xdfe8ff, 0x6a707c, 0.6));
  const sun = sunLight(g, 0xfff0dc, 2.3, [sunDir[0] * 40, 28, sunDir[2] * 40]);
  const snowM = new THREE.MeshStandardMaterial({ map: noiseTex('#b4bac4', () => [210, rnd(6, 18), rnd(58, 74)], 7000, 512, 20), roughness: 1.0 });
  snowM.map.repeat.set(24, 24);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 48), snowM); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; g.add(ground);
  const tiles = tilesTex('#7d7f86', '#4e5058'); tiles.repeat.set(6, 4);
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.hx * 2 + 1, ARENA.hz * 2 + 1), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.75 })); cfg.floors = [pave.material]; pave.rotation.x = -Math.PI / 2; pave.position.y = 0.005; pave.receiveShadow = true; g.add(pave);
  for (let i = 0; i < 40; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.3, 0.9), 8, 6), snowM); d.scale.y = 0.3; const side = Math.random() < .5 ? 1 : -1; if (Math.random() < .5) d.position.set(side * (ARENA.hx + rnd(0.6, 1.4)), 0, rnd(-ARENA.hz, ARENA.hz)); else d.position.set(rnd(-ARENA.hx, ARENA.hx), 0, side * (ARENA.hz + rnd(0.6, 1.4))); d.receiveShadow = true; g.add(d); }
  // set pieces (ref: a cold dusk temple yard): pagoda straight ahead, torii either side, a small hall, snow-capped boulders
  jpPagoda(g, 2, 26, { tiers: 5, s: 1.15, snow: true });
  { const red = new THREE.MeshStandardMaterial({ color: 0x7a1a14, roughness: 0.6 }), blk = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.6 });
    for (const [x, z, ry] of [[-13, 14, 0.5], [13, 14, -0.5]]) { const t = archTorii({ red, black: blk }, 1.3); t.position.set(x, 0, z); t.rotation.y = ry; g.add(t); } }
  jpHall(g, -15, 24, { w: 6, d: 4.5, ry: 0.5, snow: true });
  for (const [x, z, sc] of [[-12, -10, 1.6], [13, -11, 1.9], [-17, 6, 2.2], [17, 7, 2.0], [9, 19, 1.4], [-7, 18, 1.2], [21, 22, 2.6], [-23, 15, 2.4]]) capRock(g, x, z, sc, 0xeef2f8, 0x3e4248, -0.2);
  // snowy pines
  { const pts = []; let k = 0; while (pts.length < 40 && k++ < 400) { const a = rnd(0, Math.PI * 2), r = rnd(14, 45), x = Math.cos(a) * r, z = Math.sin(a) * r; if (Math.abs(x - 2) < 7 && z > 16 && z < 34) continue; if (Math.hypot(x + 15, z - 24) < 6) continue; pts.push([x, 0, z, rnd(0.7, 1.4)]); } forest(g, 'snowpine', pts); }   // pines kept off the pagoda and the hall
  for (const [x, z] of [[-11, -7.5], [11, -7.5], [-11, 7.5], [11, 7.5], [-4.5, 11], [4.5, 11]]) stoneLantern(g, x, z, true);
  const upd = particles(g, 'snow', 1200);
  // the temple yard sits in a snowed-in mountain basin: peaks behind the pagoda, a pine slope, a cliff, rolling drifts
  duelVista(g, cfg, 48, [0.86, 0.89, 0.93], { seed: 41, tod: 'fog', sides: [[0, 'hills'], [95, 'cliff'], [180, 'mountain'], [270, 'forest']], near: 'snowpine', far: 'snow', clouds: 10,
    trees: [['snow', 1, 'snow']], palette: { grass: [0.86, 0.89, 0.93], rock: [0.42, 0.43, 0.46], forestFloor: [0.78, 0.81, 0.86], snowLine: 3 },
    landmarks: [['castle', 200, 120, 1.3], ['shrine', 300, 30, 1], ['tower', 60, 70, 1]] });
  return { setQuality(q) { sun.shadow.mapSize.setScalar(q === 'high' ? 2048 : 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }, update: upd };
}

// ---------- Bamboo grove under a big moon ----------
function buildBamboo(g, renderer, cfg) {
  ROOM = { hx: 60, hz: 60, h: 40 };
  cfg.background = new THREE.Color(0x1a2a30); cfg.fog = new THREE.FogExp2(0x24343a, 0.03); cfg.exposure = 1.35; cfg.envI = 0.9; cfg.amb = 'fireflies';
  const moonDir = [-0.3, 0.45, 0.85];
  skyAndEnv(g, cfg, gradSky(0x0c1a34, 0x24506a, 0x4a8070, moonDir, 0xe8f2ff, 900, 0.9));
  g.add(new THREE.HemisphereLight(0x9cbcc8, 0x1e2a1c, 1.0));
  const moon = sunLight(g, 0xd4e6ff, 2.6, [moonDir[0] * 40, 26, moonDir[2] * 40]);
  const moss = new THREE.MeshStandardMaterial({ map: noiseTex('#3a5a32', () => [rnd(80, 110), rnd(25, 45), rnd(18, 38)], 7000, 512, 20), roughness: 1 }); moss.map.repeat.set(26, 26);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(DUEL_GROUND.bamboo, 48), moss); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; g.add(ground);
  const tiles = tilesTex('#5c5e58', '#2c302a'); tiles.repeat.set(5, 3.5);
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.hx * 2 + 1, ARENA.hz * 2 + 1), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.8 })); cfg.floors = [pave.material, moss]; pave.rotation.x = -Math.PI / 2; pave.position.y = 0.005; pave.receiveShadow = true; g.add(pave);
  // bamboo stalks: one instanced mesh, nodes painted on a canvas texture
  const bt = canvasTex(32, 256, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#2f5a28'); gr.addColorStop(0.5, '#7fb050'); gr.addColorStop(1, '#2f5a28'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(20,40,10,.8)'; for (let y = 0; y < h; y += 64) x.fillRect(0, y, w, 4); x.fillStyle = 'rgba(200,230,150,.5)'; for (let y = 4; y < h; y += 64) x.fillRect(0, y, w, 2); });
  bt.repeat.set(1, 6);
  const N = 520, geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6 }), N);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const keepOut = (x, z, m) => (Math.abs(x) < ARENA.hx + m && Math.abs(z) < ARENA.hz + m) || (Math.abs(x) < 2.6 && z > 0 && z < 26) || (Math.hypot(x + 14, z - 15) < 6.5);   // clearing, path to the torii, the hall
  for (let i = 0; i < N; i++) { let x, z; do { x = rnd(-40, 40); z = rnd(-40, 40); } while (keepOut(x, z, 2.5));
    const r = rnd(0.05, 0.1), h = rnd(9, 16); e.set(rnd(-.06, .06), 0, rnd(-.06, .06)); q.setFromEuler(e); M.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(r, h, r)); inst.setMatrixAt(i, M); }
  inst.castShadow = true; g.add(inst);
  // leaf canopies (flattened instanced cones)
  const LN = 220, leaves = new THREE.InstancedMesh(tuftGeo('bamboo', 22, 1.3, 1.1, 11), foliageMat('bamboo'), LN); leaves.customDepthMaterial = foliageDepth('bamboo'); leaves.castShadow = false;
  for (let i = 0; i < LN; i++) { let x, z; do { x = rnd(-40, 40); z = rnd(-40, 40); } while (keepOut(x, z, 3)); const s = rnd(1.5, 3); M.compose(new THREE.Vector3(x, rnd(8, 14), z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(0, 6.3)), new THREE.Vector3(s * 0.8, s * 0.6, s * 0.8)); leaves.setMatrixAt(i, M); }
  g.add(leaves);
  // stone path from the clearing to a torii deep in the grove, a hall glowing on the right, mossy boulders, stone lanterns
  { const pt = tilesTex('#7a7c72', '#3a4036'); pt.repeat.set(1, 6); const path = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 19), new THREE.MeshStandardMaterial({ map: pt, roughness: 0.9 })); path.rotation.x = -Math.PI / 2; path.position.set(0, 0.004, ARENA.hz + 0.5 + 9.5); path.receiveShadow = true; g.add(path); cfg.floors.push(path.material);
    const red = new THREE.MeshStandardMaterial({ color: 0x8a1c16, roughness: 0.55 }), blk = new THREE.MeshStandardMaterial({ color: 0x141214, roughness: 0.6 }); const t = archTorii({ red, black: blk }, 1.25); t.position.set(0, 0, 25); g.add(t); }
  jpHall(g, -14, 15, { w: 6.5, d: 5, ry: 0.6 });   // on the right as seen from the stage
  for (const [x, z, sc] of [[-12.5, -9, 1.7], [12.5, -9.5, 1.5], [-13.5, 5, 2.1], [-6, 13, 1.3], [7.5, 9.5, 1.1], [-17, 16, 2.6], [20, 4, 2.2]]) capRock(g, x, z, sc, 0x4a6a34, 0x3a3e40, -0.25);
  for (const [x, z] of [[-10.5, -7], [10.5, -7], [-10.5, 7], [10.5, 7], [-2.6, 13], [2.6, 13]]) stoneLantern(g, x, z, true);
  const big = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xf2f6ff, fog: false })); big.position.set(moonDir[0] * 180, moonDir[1] * 180, moonDir[2] * 180); big.lookAt(0, 0, 0); g.add(big);
  // the grove fills a hollow between wooded hills: a mountain shoulder behind the torii, a cliff with a fall of water
  // behind the stage, a temple on the far slope; night ranges beyond (bamboo itself stays the near plane)
  duelVista(g, cfg, 42, [0.2, 0.3, 0.17], { seed: 43, tod: 'night', far: 'night', clouds: 6, sides: [[0, 'cliff'], [95, 'hills'], [180, 'mountain'], [270, 'forest']], near: [['kusu', 0.45], ['matsu', 0.35], ['tsubaki', 0.2]],
    trees: [['bamboo', 0.35, 'bamboo'], ['green', 0.25, 'spread'], ['matsu', 0.25, 'pad'], ['green', 0.15, 'vase']], palette: { grass: [0.2, 0.3, 0.17], rock: [0.3, 0.32, 0.31], forestFloor: [0.14, 0.2, 0.12] },
    landmarks: [['temple', 185, 60, 1], ['pagoda', 120, 70, 1], ['shrine', 300, 34, 0.9]], waterfall: 0 });
  const upd = particles(g, 'fireflies', 160);
  return { setQuality(q) { moon.shadow.mapSize.setScalar(q === 'high' ? 2048 : 1024); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } }, update: upd };
}

export const MAPS = { dojo: 'Night Dojo', sakura: 'Momiji Field', snow: 'Snow Temple', bamboo: 'Bamboo Grove' };
const BUILDERS = { dojo: buildDojo, sakura: buildSakura, snow: buildSnow, bamboo: buildBamboo };
export const EXTRA_MAPS = {};
// maps.js registers the open-world maps (not shown in the duel arena picker)
export function registerMap(name, label, builder) { BUILDERS[name] = builder; EXTRA_MAPS[name] = label; }

export function buildArena(scene, renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  let cur = null, q = 'high';
  // frees everything a map created; materials/textures flagged userData.shared (world-kit caches) are kept for the next build
  const dispose = o => o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) for (const m of [].concat(c.material)) { if (m.userData.shared) continue; for (const k in m) if (m[k] && m[k].isTexture && !m[k].userData.shared) m[k].dispose(); m.dispose(); } if (c.shadow && c.shadow.map) { c.shadow.map.dispose(); c.shadow.map = null; } });
  return {
    get name() { return cur && cur.name; }, get cfg() { return cur ? cur.cfg : {}; }, get amb() { return cur && cur.cfg.amb; },
    get world() { return WORLD.active; },
    setMap(name, opts = {}) {
      if (!BUILDERS[name]) name = 'dojo';
      const key = name + JSON.stringify(opts);
      if (cur && cur.key === key) return;
      if (cur) { scene.remove(cur.group); dispose(cur.group); if (cur.cfg.envScene) dispose(cur.cfg.envScene); cur.envRT.dispose(); }
      PILLARS.length = 0; WORLD.active = null;
      const g = new THREE.Group(), cfg = {}, api = BUILDERS[name](g, renderer, cfg, opts);
      WORLD.active = cfg.world || null;
      cfg.merged = bakeStatic(g);   // static scenery -> few draw calls
      scene.add(g); scene.background = cfg.background; scene.fog = cfg.fog;
      const envRT = pm.fromScene(cfg.envScene, 0.03), envTex = envRT.texture; scene.environment = envTex; scene.environmentIntensity = cfg.envI;
      renderer.toneMappingExposure = cfg.exposure;
      const LK = LOOK[name] || {};
      cfg.bloom = cfg.bloom || LK.bloom || BLOOM_DEFAULT; cfg.camFill = cfg.camFill ?? LK.camFill ?? 0.55;
      if (LK.exp) cfg.exposure = LK.exp; renderer.toneMappingExposure = cfg.baseExposure = cfg.exposure; cfg.haze = cfg.haze ?? LK.haze ?? 0.5; cfg.weathers = cfg.weathers || LK.weathers || ['clear'];
      g.traverse(o => { if (!cfg.sunL && o.isDirectionalLight && o.castShadow) cfg.sunL = o; if (!cfg.hemi && o.isHemisphereLight) cfg.hemi = o; });
      if (cfg.fog) cfg.fog0 = cfg.fog.isFogExp2 ? cfg.fog.density : cfg.fog.far;
      cfg.pools = cfg.world ? [] : lightPools(g); { const bd = BACKDROPS[name] || (cfg.world ? (cfg.night ? BACKDROPS._worldNight : BACKDROPS._world) : null); cfg.backdrop = addBackdrops(g, cfg.noBackdrop ? (cfg.keepBackdrop && bd ? bd.filter(b => cfg.keepBackdrop.includes(b[0])) : null) : bd, cfg); }   // a vista (vista.js) replaces the flat strips (a few far ones may stay)
      cur = { name, key, group: g, api, envTex, envRT, cfg }; api.setQuality(q); applyLightBudget(cfg.pools, q, cfg.poolK ?? 1);
    },
    setQuality(qq) { q = qq; if (cur) { cur.api.setQuality(q); applyLightBudget(cur.cfg.pools, q, cur.cfg.poolK ?? 1); } },
    update(dt) {
      if (cur) { (cur.api.update)(dt); const c = cur.cfg; updateBackdrops(c, scene); if (c.vistaTick) c.vistaTick(dt);
        if (c.lightning > 0 && (c.lightning -= dt) <= 0) { c.lightning = 5 + Math.random() * 9; c.flashT = 1; c.flashNow = true; }   // rain: a lightning strike now and then
        if (c.flashT > 0 && c.hemi) { c.flashT = Math.max(0, c.flashT - dt * 3.2); if (c.hemi0 === undefined) c.hemi0 = c.hemi.intensity; const f = c.flashT; c.hemi.intensity = c.hemi0 * (1 + 3.5 * f * (0.6 + 0.4 * Math.sin(f * 40))); }
      }
      if (WORLD.active) WORLD.active.update(dt);
    },
    // duel weather: denser fog, darker exposure, wet floors that mirror the lamps, lightning in the rain
    setWeather(kind) {
      const c = cur && cur.cfg; if (!c) return; c.wx = kind;
      const fogK = { fog: 2.6, rain: 1.7, snow: 1.3 }[kind] || 1, expK = { rain: 0.78, fog: 0.92 }[kind] || 1;
      if (c.fog) { if (c.fog.isFogExp2) c.fog.density = c.fog0 * fogK; else c.fog.far = c.fog0 / fogK; }
      renderer.toneMappingExposure = c.baseExposure * expK;
      for (const m of c.floors || []) { const u = m.userData; if (u.r0 === undefined) { u.r0 = m.roughness; u.e0 = m.envMapIntensity; u.c0 = m.color.clone(); } const wet = kind === 'rain';
        m.roughness = wet ? 0.66 : u.r0; m.envMapIntensity = wet ? 0.45 : u.e0; m.color.copy(u.c0).multiplyScalar(wet ? 0.68 : 1); }   // wet sheen, not a mirror: a sharp low-res environment shows its seams
      c.lightning = kind === 'rain' ? 3 + Math.random() * 5 : 0;
    },
    // large maps: the shadow-casting sun follows the local player
    follow(p) { const s = cur && cur.cfg.sun; if (!s) return; s.target.position.set(p.x, p.y, p.z); s.position.set(p.x + cur.cfg.sunOff.x, p.y + cur.cfg.sunOff.y, p.z + cur.cfg.sunOff.z); },
  };
}