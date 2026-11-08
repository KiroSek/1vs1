// Night dojo hall (Ashina-style): polished planks, candle stands, shoji walls, an open veranda onto a moonlit garden.
import * as THREE from 'three';

export const ARENA = { hx: 9.2, hz: 6.2 };               // fighting rectangle (half extents)
const ROOM = { hx: 12, hz: 9, h: 6.2 };                  // walls / ceiling
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

export function buildArena(scene, renderer) {
  const lights = { candles: [], flames: [] };
  scene.background = new THREE.Color(0x05070c);
  scene.fog = new THREE.FogExp2(0x0b0f18, 0.035);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), skyMat()); scene.add(sky);

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
    const l = new THREE.PointLight(0xff9a48, 5, 9, 1.8); l.position.set(x, 1.65 + (z > 7 ? 0.35 : 0), z); scene.add(l);
    lights.candles.push({ l, base: 5, ph: rnd(0, 9) }); lights.flames.push({ s: fl, ph: rnd(0, 9) });
  }
  const lanternM = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xff9a40, emissiveIntensity: 1.6, roughness: 0.8 });
  for (const [x, z] of [[-4.5, -3], [4.5, -3], [-4.5, 3], [4.5, 3]]) {
    const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 14), lanternM); lan.position.set(x, 4.2, z);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.08, 14), woodDark); cap.position.set(x, 4.49, z);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, ROOM.h - 4.5, 4), woodDark); cord.position.set(x, 4.5 + (ROOM.h - 4.5) / 2, z);
    scene.add(lan, cap, cord);
  }

  // ---------- lighting ----------
  scene.add(new THREE.HemisphereLight(0x3a4a70, 0x1a120a, 0.55));
  // moonlight through the open veranda (cool rim + long shadows)
  const moon = new THREE.DirectionalLight(0x9fb6ff, 1.6); moon.position.set(-16, 11, 4); moon.target.position.set(0, 0, 0);
  moon.castShadow = true; Object.assign(moon.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 50 }); moon.shadow.bias = -0.0003; moon.shadow.normalBias = 0.02;
  scene.add(moon, moon.target);
  // warm key from the lanterns above the floor (soft shadows under the fighters)
  const key = new THREE.SpotLight(0xffb070, 70, 22, 0.75, 0.6, 1.4); key.position.set(1.5, 5.6, -1.5); key.target.position.set(0, 0, 0.5);
  key.castShadow = true; key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02; key.shadow.camera.near = 1; key.shadow.camera.far = 14; scene.add(key, key.target);
  // glow behind the front shoji
  const fill = new THREE.PointLight(0xffa860, 10, 14, 1.6); fill.position.set(0, 2, -ROOM.hz + 0.8); scene.add(fill);

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
  const box = new THREE.Mesh(new THREE.BoxGeometry(24, 7, 18), em(0x120d0a)); box.position.y = 3; env.add(box);
  const glowP = (c, w, h, x, y, z, ry) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); p.position.set(x, y, z); p.rotation.y = ry; env.add(p); };
  glowP(0xc89058, 20, 3.4, 0, 1.7, -8.9, 0); glowP(0x5a6c9a, 16, 3.5, -11.9, 1.9, 0, Math.PI / 2);
  for (const [x, z] of candleSpots) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd090 })); s.position.set(x, 1.6, z); env.add(s); }
  for (const [x, z] of [[-4.5, -3], [4.5, -3], [-4.5, 3], [4.5, 3]]) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070 })); s.position.set(x, 4.2, z); env.add(s); }
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(env, 0.03).texture; scene.environmentIntensity = 0.7; pm.dispose();

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
