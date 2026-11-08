// Night dojo hall (Ashina-style): polished planks, candle stands, shoji walls, an open veranda onto a moonlit garden.
import * as THREE from 'three';

export const ARENA = { hx: 9.2, hz: 6.2 };               // fighting rectangle (half extents)
let ROOM = { hx: 12, hz: 9, h: 6.2 };                    // camera limits (walls / ceiling) of the current map
const PILLARS = [];
const rnd = (a, b) => a + Math.random() * (b - a);

export function bounds(p, r = 0.4) {
  p.x = Math.max(-ARENA.hx + r, Math.min(ARENA.hx - r, p.x)); p.z = Math.max(-ARENA.hz + r, Math.min(ARENA.hz - r, p.z));
  for (const c of PILLARS) { const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r; if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; } }
  return p;
}
// shorten a camera boom so it doesn't pass through walls, ceiling or pillars. returns allowed fraction 0..1 of from->to
export function camClip(from, to) {
  let k = 1; const d = to.clone().sub(from);
  const lim = (o, dd, lo, hi) => { if (dd > 0 && o + dd > hi) k = Math.min(k, (hi - o) / dd); if (dd < 0 && o + dd < lo) k = Math.min(k, (lo - o) / dd); };
  lim(from.x, d.x, -ROOM.hx + 0.35, ROOM.hx - 0.35); lim(from.z, d.z, -ROOM.hz + 0.35, ROOM.hz - 0.35); lim(from.y, d.y, 0.3, ROOM.h - 0.4);
  for (const c of PILLARS) {   // 2D ray vs circle
    const fx = from.x - c.x, fz = from.z - c.z, a = d.x * d.x + d.z * d.z, b = 2 * (fx * d.x + fz * d.z), cc = fx * fx + fz * fz - (c.r + 0.3) ** 2;
    const disc = b * b - 4 * a * cc; if (a < 1e-6 || disc < 0) continue; const t = (-b - Math.sqrt(disc)) / (2 * a); if (t > 0 && t < k) k = Math.max(0.15, t);
  }
  return Math.max(0.12, k);
}

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
  ROOM = { hx: 12, hz: 9, h: 6.2 };
  const lights = { candles: [], flames: [] };
  cfg.background = new THREE.Color(0x0a0d16);
  cfg.fog = new THREE.FogExp2(0x141a26, 0.02);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMat()); scene.add(sky); sky.frustumCulled = false;

  // ---------- materials ----------
  const floorMap = planks(false), floorRough = planks(true); floorMap.repeat.set(7, 5); floorRough.repeat.set(7, 5);
  const floorM = new THREE.MeshStandardMaterial({ map: floorMap, roughnessMap: floorRough, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.9, bumpMap: floorRough, bumpScale: 0.4 });
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
  scene.add(new THREE.HemisphereLight(0x5a6a98, 0x3a2614, 1.15));
  // moonlight through the open veranda (cool rim + long shadows)
  const moon = new THREE.DirectionalLight(0xb0c4ff, 2.6); moon.position.set(-16, 11, 4); moon.target.position.set(0, 0, 0);
  moon.castShadow = true; Object.assign(moon.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 50 }); moon.shadow.bias = -0.0003; moon.shadow.normalBias = 0.02;
  scene.add(moon, moon.target);
  // warm key from the lanterns above the floor (soft shadows under the fighters)
  const key = new THREE.SpotLight(0xffc080, 140, 24, 0.85, 0.6, 1.3); key.position.set(1.5, 5.6, -1.5); key.target.position.set(0, 0, 0.5);
  key.castShadow = true; key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02; key.shadow.camera.near = 1; key.shadow.camera.far = 14; scene.add(key, key.target);
  // glow behind the front shoji
  const fill = new THREE.PointLight(0xffa860, 9, 18, 1.2); fill.position.set(0, 3.2, -ROOM.hz + 0.5); scene.add(fill);

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
  cfg.envScene = env; cfg.envI = 0.85; cfg.exposure = 1.55; cfg.amb = 'embers';

  let t = 0;
  return {
    moon, key, lights,
    setQuality(q) {
      const size = q === 'high' ? 2048 : q === 'med' ? 1024 : 1024;
      for (const L of [moon, key]) { L.shadow.mapSize.set(L === key && q !== 'high' ? 512 : size, L === key && q !== 'high' ? 512 : size); if (L.shadow.map) { L.shadow.map.dispose(); L.shadow.map = null; } }
      key.castShadow = q !== 'low'; moon.castShadow = true;
      lights.candles.forEach((c, i) => c.l.visible = q === 'high' || i % 2 === 0);
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
const BLOOM_DEFAULT = { strength: 0.55, threshold: 1.0 };
const LOOK = {
  dojo: { bloom: { strength: 0.6, threshold: 1.0 }, camFill: 0.55 },
  sakura: { bloom: { strength: 0.4, threshold: 1.15 }, camFill: 0.2 },
  snow: { bloom: { strength: 0.3, threshold: 1.3 }, camFill: 0.15 },
  bamboo: { bloom: { strength: 0.55, threshold: 1.0 }, camFill: 0.4 },
};

// ===================================================================================
// Outdoor maps + map manager. The fighting rectangle (ARENA) is identical everywhere,
// so online opponents may pick different maps without any desync.
// ===================================================================================
function gradSky(top, mid, hor, sunDir, sunCol, sunPow = 600, glow = 0.6) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { a: { value: new THREE.Color(hor) }, b: { value: new THREE.Color(mid) }, c: { value: new THREE.Color(top) }, s: { value: new THREE.Vector3(...sunDir).normalize() }, sc: { value: new THREE.Color(sunCol) }, sp: { value: sunPow }, gl: { value: glow } },
    vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 p;uniform vec3 a,b,c,sc,s;uniform float sp,gl;void main(){float h=clamp(p.y,-.2,1.);vec3 col=mix(a,b,smoothstep(-.02,.25,h));col=mix(col,c,smoothstep(.25,.9,h));float m=max(dot(p,s),0.);col+=sc*(pow(m,sp)*3.+pow(m,8.)*gl*.5);gl_FragColor=vec4(col,1.);}',
  });
}
function skyAndEnv(g, cfg, mat) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), mat); sky.frustumCulled = false; g.add(sky);
  const env = new THREE.Scene(); env.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), mat.clone()));
  cfg.envScene = env;
  return env;
}
function sunLight(g, color, I, pos) {
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
function stoneLantern(g, x, z, lightOn, list) {
  const stone = new THREE.MeshStandardMaterial({ color: 0x8a867e, roughness: 0.95 }), t = new THREE.Group();
  const parts = [[new THREE.CylinderGeometry(0.32, 0.42, 0.35, 8), 0.17], [new THREE.CylinderGeometry(0.13, 0.17, 1.0, 8), 0.85], [new THREE.BoxGeometry(0.55, 0.45, 0.55), 1.55], [new THREE.ConeGeometry(0.58, 0.42, 4), 2.0]];
  for (const [geo, y] of parts) { const m = new THREE.Mesh(geo, stone); m.position.y = y; if (geo.type === 'ConeGeometry') m.rotation.y = Math.PI / 4; m.castShadow = true; t.add(m); }
  const glow = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.3, 0.38), new THREE.MeshStandardMaterial({ color: 0xffd090, emissive: 0xffa040, emissiveIntensity: 2.2 })); glow.position.y = 1.55; t.add(glow);
  t.position.set(x, 0, z); g.add(t);
  if (lightOn) { const l = new THREE.PointLight(0xffa850, 6, 9, 1.6); l.position.set(x, 1.6, z); g.add(l); list && list.push(l); }
}
// falling particles: 'petals' | 'snow' | 'fireflies'
function particles(g, kind, n) {
  const p = new Float32Array(n * 3), v = new Float32Array(n * 3), ph = new Float32Array(n);
  const spawn = (i, top) => { p[i * 3] = rnd(-24, 24); p[i * 3 + 1] = top ? rnd(7, 12) : rnd(0, 12); p[i * 3 + 2] = rnd(-20, 20); ph[i] = rnd(0, 9);
    if (kind === 'petals') { v[i * 3] = rnd(-1.2, -0.4); v[i * 3 + 1] = rnd(-0.9, -0.5); v[i * 3 + 2] = rnd(-0.3, 0.3); }
    else if (kind === 'snow') { v[i * 3] = rnd(-0.2, 0.2); v[i * 3 + 1] = rnd(-0.9, -0.5); v[i * 3 + 2] = rnd(-0.2, 0.2); }
    else { p[i * 3 + 1] = rnd(0.3, 3); v[i * 3] = rnd(-.3, .3); v[i * 3 + 1] = rnd(-.1, .1); v[i * 3 + 2] = rnd(-.3, .3); } };
  for (let i = 0; i < n; i++) spawn(i, false);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const col = { petals: 0xffb8cc, snow: 0xffffff, fireflies: 0xd8ff7a }[kind];
  const tex = canvasTex(64, 64, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); });
  const mat = new THREE.PointsMaterial({ size: kind === 'petals' ? 0.11 : kind === 'snow' ? 0.07 : 0.09, color: col, map: tex, transparent: true, depthWrite: false, opacity: kind === 'fireflies' ? 1 : 0.9, blending: kind === 'fireflies' ? THREE.AdditiveBlending : THREE.NormalBlending });
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
  cfg.background = new THREE.Color(0xf2a080); cfg.fog = new THREE.Fog(0xe89a8a, 55, 210); cfg.exposure = 0.95; cfg.envI = 1.0; cfg.amb = 'petals';
  const sunDir = [-0.55, 0.22, -0.8];
  skyAndEnv(g, cfg, gradSky(0x4a5ca8, 0xe07a98, 0xffb07a, sunDir, 0xffe2b0, 500, 0.7));
  g.add(new THREE.HemisphereLight(0xffe0ea, 0x6a4a3c, 1.15));
  const sun = sunLight(g, 0xffcf9a, 3.0, [sunDir[0] * 40, 22, sunDir[2] * 40]);
  const fillL = new THREE.DirectionalLight(0xa8b8ff, 0.8); fillL.position.set(20, 10, 25); g.add(fillL);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.MeshStandardMaterial({ map: noiseTex('#8c8270', () => [rnd(25, 45), rnd(8, 20), rnd(35, 62)], 7000, 512, 30), roughness: 1 }));
  ground.material.map.repeat.set(30, 30); ground.material.color.set(0x9a8c74); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.5; ground.receiveShadow = true; g.add(ground);
  woodStage(g);
  const trunk = new THREE.MeshStandardMaterial({ color: 0x3a2620, roughness: 1 });
  const bl = [0xffb3c8, 0xffc8d8, 0xf59ab5, 0xffd6e2].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }));
  for (let i = 0; i < 22; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(13, 34), x = Math.cos(a) * r, z = Math.sin(a) * r, t = new THREE.Group(), s = rnd(0.9, 1.6);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.45, 4.2, 7), trunk); tr.position.y = 2.1; tr.rotation.z = rnd(-.2, .2); tr.castShadow = true; t.add(tr);
    for (let k = 0; k < 10; k++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(1.1, 2.1), 1), bl[k % 4]); b.position.set(rnd(-2.6, 2.6), rnd(3.6, 6.4), rnd(-2.6, 2.6)); b.castShadow = true; t.add(b); }
    t.position.set(x, -0.5, z); t.scale.setScalar(s); g.add(t);
  }
  // torii gate behind the stage, lanterns around
  const red = new THREE.MeshStandardMaterial({ color: 0xc0201a, roughness: 0.5 }), blk = new THREE.MeshStandardMaterial({ color: 0x1a1414, roughness: 0.6 });
  const torii = new THREE.Group();
  for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 7.5, 14), red); p.position.set(sx * 3.4, 3.75, 0); p.castShadow = true; torii.add(p); }
  const k1 = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.45, 0.6), blk); k1.position.y = 7.7; torii.add(k1);
  const k2 = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.35, 0.45), red); k2.position.y = 6.6; torii.add(k2);
  torii.position.set(0, -0.5, 17); g.add(torii); const t2 = torii.clone(); t2.position.set(0, -0.5, 27); t2.scale.setScalar(1.15); g.add(t2);
  for (const [x, z] of [[-11.5, -8], [11.5, -8], [-11.5, 8], [11.5, 8], [-4, 10], [4, 10], [-4, -10], [4, -10]]) stoneLantern(g, x, z, false);
  mountains(g, 0xb97a8a, 14, 120, 170);
  const upd = particles(g, 'petals', 420);
  return { setQuality(q) { sun.shadow.mapSize.setScalar(q === 'high' ? 2048 : 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }, update: upd };
}

// ---------- Snow temple at dawn ----------
function buildSnow(g, renderer, cfg) {
  ROOM = { hx: 60, hz: 60, h: 40 };
  cfg.background = new THREE.Color(0xb8c4d2); cfg.fog = new THREE.FogExp2(0xbcc8d6, 0.0075); cfg.exposure = 0.7; cfg.envI = 0.55; cfg.amb = 'snow';
  const sunDir = [0.4, 0.35, -0.85];
  skyAndEnv(g, cfg, gradSky(0x6a8cbc, 0xb4c6dc, 0xe6dcd4, sunDir, 0xfff0d8, 300, 0.4));
  g.add(new THREE.HemisphereLight(0xdfe8ff, 0x6a707c, 0.7));
  const sun = sunLight(g, 0xfff0dc, 2.0, [sunDir[0] * 40, 28, sunDir[2] * 40]);
  const snowM = new THREE.MeshStandardMaterial({ map: noiseTex('#c6ccd4', () => [210, rnd(6, 18), rnd(65, 80)], 7000, 512, 20), roughness: 1.0 });
  snowM.map.repeat.set(24, 24);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 48), snowM); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; g.add(ground);
  const tiles = tilesTex('#7d7f86', '#4e5058'); tiles.repeat.set(6, 4);
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.hx * 2 + 1, ARENA.hz * 2 + 1), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.75 })); pave.rotation.x = -Math.PI / 2; pave.position.y = 0.005; pave.receiveShadow = true; g.add(pave);
  for (let i = 0; i < 40; i++) { const d = new THREE.Mesh(new THREE.SphereGeometry(rnd(0.3, 0.9), 8, 6), snowM); d.scale.y = 0.3; const side = Math.random() < .5 ? 1 : -1; if (Math.random() < .5) d.position.set(side * (ARENA.hx + rnd(0.6, 1.4)), 0, rnd(-ARENA.hz, ARENA.hz)); else d.position.set(rnd(-ARENA.hx, ARENA.hx), 0, side * (ARENA.hz + rnd(0.6, 1.4))); d.receiveShadow = true; g.add(d); }
  // pagoda
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a2a1c, roughness: 0.7 }), roofM = new THREE.MeshStandardMaterial({ color: 0x2a2e36, roughness: 0.6 }), capM = new THREE.MeshStandardMaterial({ color: 0xf6f9fc, roughness: 0.9 });
  const pag = new THREE.Group();
  for (let k = 0; k < 5; k++) { const w = 6 - k * 0.9, y = k * 2.6; const b = new THREE.Mesh(new THREE.BoxGeometry(w, 2.1, w), wood); b.position.y = y + 1.05; b.castShadow = true; pag.add(b);
    const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.95, 1.1, 4), roofM); r.position.y = y + 2.5; r.rotation.y = Math.PI / 4; r.scale.set(1, 1, 1); pag.add(r);
    const c = new THREE.Mesh(new THREE.ConeGeometry(w * 0.9, 0.7, 4), capM); c.position.y = y + 2.75; c.rotation.y = Math.PI / 4; pag.add(c); }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 3, 8), new THREE.MeshStandardMaterial({ color: 0xb08a40, metalness: 0.8, roughness: 0.35 })); spire.position.y = 14.5; pag.add(spire);
  pag.position.set(0, 0, 22); g.add(pag);
  // snowy pines
  const pine = new THREE.MeshStandardMaterial({ color: 0x1f3a2c, roughness: 1 }); capM.color.set(0xc8ced6); capM.roughness = 1;
  for (let i = 0; i < 40; i++) { const a = rnd(0, Math.PI * 2), r = rnd(14, 45), t = new THREE.Group(), s = rnd(0.8, 1.7);
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.25, 2, 6), wood); tr.position.y = 1; t.add(tr);
    for (let k = 0; k < 4; k++) { const c = new THREE.Mesh(new THREE.ConeGeometry(1.8 - k * 0.38, 1.6, 8), pine); c.position.y = 2 + k * 1.05; c.castShadow = true; t.add(c); const sc = new THREE.Mesh(new THREE.ConeGeometry(1.5 - k * 0.33, 0.5, 8), capM); sc.position.y = 2.55 + k * 1.05; t.add(sc); }
    t.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); t.scale.setScalar(s); g.add(t); }
  for (const [x, z] of [[-11, -7.5], [11, -7.5], [-11, 7.5], [11, 7.5]]) stoneLantern(g, x, z, true);
  mountains(g, 0xb8c4d6, 14, 120, 170);
  const upd = particles(g, 'snow', 900);
  return { setQuality(q) { sun.shadow.mapSize.setScalar(q === 'high' ? 2048 : 1024); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }, update: upd };
}

// ---------- Bamboo grove under a big moon ----------
function buildBamboo(g, renderer, cfg) {
  ROOM = { hx: 60, hz: 60, h: 40 };
  cfg.background = new THREE.Color(0x1c3a3a); cfg.fog = new THREE.FogExp2(0x2a4a40, 0.028); cfg.exposure = 1.35; cfg.envI = 0.9; cfg.amb = 'fireflies';
  const moonDir = [-0.3, 0.45, 0.85];
  skyAndEnv(g, cfg, gradSky(0x0c1a34, 0x24506a, 0x4a8070, moonDir, 0xe8f2ff, 900, 0.9));
  g.add(new THREE.HemisphereLight(0x9fd8c0, 0x223018, 1.5));
  const moon = sunLight(g, 0xd4e6ff, 2.6, [moonDir[0] * 40, 26, moonDir[2] * 40]);
  const moss = new THREE.MeshStandardMaterial({ map: noiseTex('#3a5a32', () => [rnd(80, 110), rnd(25, 45), rnd(18, 38)], 7000, 512, 20), roughness: 1 }); moss.map.repeat.set(26, 26);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(150, 48), moss); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; g.add(ground);
  const tiles = tilesTex('#8a8a80', '#3e443a'); tiles.repeat.set(5, 3.5);
  const pave = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.hx * 2 + 1, ARENA.hz * 2 + 1), new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.8 })); pave.rotation.x = -Math.PI / 2; pave.position.y = 0.005; pave.receiveShadow = true; g.add(pave);
  // bamboo stalks: one instanced mesh, nodes painted on a canvas texture
  const bt = canvasTex(32, 256, (x, w, h) => { const gr = x.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#2f5a28'); gr.addColorStop(0.5, '#7fb050'); gr.addColorStop(1, '#2f5a28'); x.fillStyle = gr; x.fillRect(0, 0, w, h); x.fillStyle = 'rgba(20,40,10,.8)'; for (let y = 0; y < h; y += 64) x.fillRect(0, y, w, 4); x.fillStyle = 'rgba(200,230,150,.5)'; for (let y = 4; y < h; y += 64) x.fillRect(0, y, w, 2); });
  bt.repeat.set(1, 6);
  const N = 520, geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ map: bt, roughness: 0.6 }), N);
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  for (let i = 0; i < N; i++) { let x, z; do { x = rnd(-40, 40); z = rnd(-40, 40); } while (Math.abs(x) < ARENA.hx + 2.5 && Math.abs(z) < ARENA.hz + 2.5);
    const r = rnd(0.05, 0.1), h = rnd(9, 16); e.set(rnd(-.06, .06), 0, rnd(-.06, .06)); q.setFromEuler(e); M.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(r, h, r)); inst.setMatrixAt(i, M); }
  inst.castShadow = true; g.add(inst);
  // leaf canopies (flattened instanced cones)
  const leafM = new THREE.MeshStandardMaterial({ color: 0x4a7a34, roughness: 0.9, flatShading: true }), LN = 220, leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), leafM, LN);
  for (let i = 0; i < LN; i++) { let x, z; do { x = rnd(-40, 40); z = rnd(-40, 40); } while (Math.abs(x) < ARENA.hx + 3 && Math.abs(z) < ARENA.hz + 3); const s = rnd(1.5, 3); M.compose(new THREE.Vector3(x, rnd(8, 14), z), q.identity(), new THREE.Vector3(s, s * 0.35, s)); leaves.setMatrixAt(i, M); }
  g.add(leaves);
  // paper lanterns on posts along the clearing
  const post = new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.8 }), lan = new THREE.MeshStandardMaterial({ color: 0xffe0b0, emissive: 0xff9a40, emissiveIntensity: 2.2 });
  for (const [x, z] of [[-10.5, -7], [10.5, -7], [-10.5, 7], [10.5, 7], [0, -8.2], [0, 8.2]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), post); p.position.set(x, 1.1, z); g.add(p);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), lan); l.scale.y = 1.3; l.position.set(x, 2.3, z); g.add(l);
    const pl = new THREE.PointLight(0xffa850, 7, 10, 1.6); pl.position.set(x, 2.3, z); g.add(pl);
  }
  const big = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xf2f6ff, fog: false })); big.position.set(moonDir[0] * 180, moonDir[1] * 180, moonDir[2] * 180); big.lookAt(0, 0, 0); g.add(big);
  const upd = particles(g, 'fireflies', 160);
  return { setQuality(q) { moon.shadow.mapSize.setScalar(q === 'high' ? 2048 : 1024); if (moon.shadow.map) { moon.shadow.map.dispose(); moon.shadow.map = null; } }, update: upd };
}

export const MAPS = { dojo: 'Night Dojo', sakura: 'Sakura Garden', snow: 'Snow Temple', bamboo: 'Bamboo Grove' };
const BUILDERS = { dojo: buildDojo, sakura: buildSakura, snow: buildSnow, bamboo: buildBamboo };

export function buildArena(scene, renderer) {
  const pm = new THREE.PMREMGenerator(renderer);
  let cur = null, q = 'high';
  const dispose = o => o.traverse(c => { if (c.geometry) c.geometry.dispose(); if (c.material) for (const m of [].concat(c.material)) { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); } });
  return {
    get name() { return cur && cur.name; }, get cfg() { return cur ? cur.cfg : {}; }, get amb() { return cur && cur.cfg.amb; },
    setMap(name) {
      if (!BUILDERS[name]) name = 'dojo';
      if (cur && cur.name === name) return;
      if (cur) { scene.remove(cur.group); dispose(cur.group); cur.envTex.dispose(); }
      PILLARS.length = 0;
      const g = new THREE.Group(), cfg = {}, api = BUILDERS[name](g, renderer, cfg);
      scene.add(g); scene.background = cfg.background; scene.fog = cfg.fog;
      const envTex = pm.fromScene(cfg.envScene, 0.03).texture; scene.environment = envTex; scene.environmentIntensity = cfg.envI;
      renderer.toneMappingExposure = cfg.exposure;
      Object.assign(cfg, { bloom: BLOOM_DEFAULT, camFill: 0.55 }, LOOK[name]);
      cur = { name, group: g, api, envTex, cfg }; api.setQuality(q);
    },
    setQuality(qq) { q = qq; if (cur) cur.api.setQuality(q); },
    update(dt) { if (cur) (cur.api.update)(dt); },
  };
}