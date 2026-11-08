import * as THREE from 'three';

export const ARENA_R = 11;
const rnd = (a, b) => a + Math.random() * (b - a);

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); } return t;
}
function woodTex() {
  return canvasTex(512, 512, (x, w, h) => {
    const n = 8, pw = w / n;
    for (let i = 0; i < n; i++) {
      const l = 22 + Math.random() * 10; x.fillStyle = `hsl(28,32%,${l}%)`; x.fillRect(i * pw, 0, pw, h);
      for (let k = 0; k < 60; k++) { x.strokeStyle = `hsla(25,30%,${l - 8 + Math.random() * 10}%,.35)`; x.lineWidth = 1; x.beginPath(); const px = i * pw + Math.random() * pw; x.moveTo(px, 0); x.bezierCurveTo(px + rnd(-4, 4), h / 3, px + rnd(-4, 4), h * 2 / 3, px + rnd(-3, 3), h); x.stroke(); }
      x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(i * pw, 0, 2, h);
    }
    for (let i = 0; i < 4; i++) { x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(0, i * h / 4 + rnd(0, 4), w, 2); }
  }, 1);
}
function groundTex() {
  return canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#3b3a38'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 6000; i++) { const l = rnd(15, 45); x.fillStyle = `hsl(${rnd(20, 60)},8%,${l}%)`; x.beginPath(); x.arc(rnd(0, w), rnd(0, h), rnd(1, 3.5), 0, 6.3); x.fill(); }
  }, 12);
}
function skyColors(c0, c1, c2) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { a: { value: new THREE.Color(c0) }, b: { value: new THREE.Color(c1) }, c: { value: new THREE.Color(c2) } },
    vertexShader: 'varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'varying vec3 p;uniform vec3 a,b,c;void main(){float h=clamp(p.y,-.1,1.);vec3 col=mix(a,b,smoothstep(-.05,.35,h));col=mix(col,c,smoothstep(.3,1.,h));\
      vec3 sun=normalize(vec3(-.5,.14,-.85));float s=max(dot(p,sun),0.);col+=vec3(1.,.55,.25)*pow(s,6.)*.7+vec3(1.,.8,.5)*pow(s,300.)*3.;gl_FragColor=vec4(col,1.);}'
  });
}

export function buildArena(scene, renderer, quality) {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyColors(0xf0894a, 0x6b4a72, 0x141b3a));
  scene.add(sky);
  // environment for PBR reflections (metal katana)
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyColors(0xf0894a, 0x6b4a72, 0x141b3a)));
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(envScene, 0.02).texture; scene.environmentIntensity = 0.55; pm.dispose();
  scene.fog = new THREE.FogExp2(0x7a5a68, 0.016);

  const sun = new THREE.DirectionalLight(0xffb27a, 3.2);
  sun.position.set(-18, 14, -30); sun.target.position.set(0, 0, 0);
  sun.castShadow = true; sun.shadow.camera.left = sun.shadow.camera.bottom = -16; sun.shadow.camera.right = sun.shadow.camera.top = 16;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 80; sun.shadow.bias = -0.0004; sun.shadow.intensity = 0.55; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  scene.add(new THREE.HemisphereLight(0xb0bff0, 0x6b5545, 1.5));
  const fill = new THREE.DirectionalLight(0x8aa0d0, 0.9); fill.position.set(10, 8, 20); scene.add(fill);

  // ground
  const gm = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshStandardMaterial({ map: groundTex(), roughness: 1 }));
  gm.rotation.x = -Math.PI / 2; gm.position.y = -0.02; gm.receiveShadow = true; scene.add(gm);
  // raised wooden stage
  const wt = woodTex(); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(5, 5);
  const stage = new THREE.Mesh(new THREE.CylinderGeometry(ARENA_R + 0.6, ARENA_R + 0.9, 0.5, 48), new THREE.MeshStandardMaterial({ map: wt, roughness: 0.65 }));
  stage.position.y = -0.25; stage.receiveShadow = true; stage.castShadow = false; scene.add(stage);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(ARENA_R + 0.65, 0.12, 8, 64), new THREE.MeshStandardMaterial({ color: 0x1a0f0c, roughness: 0.5 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = 0.02; scene.add(rim);
  // circle marking (inner ring)
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 5.75, 64), new THREE.MeshBasicMaterial({ color: 0x8a1a1a, transparent: true, opacity: 0.55 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.012; scene.add(ring);

  const wood = new THREE.MeshStandardMaterial({ color: 0x3a1d14, roughness: 0.7 });
  const red = new THREE.MeshStandardMaterial({ color: 0xa3181c, roughness: 0.55 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 0.95 });

  // torii gate (far, behind both sides)
  function torii(x, z, s, ry) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 7, 12), red); p.position.set(sx * 3.2, 3.5, 0); p.castShadow = true; g.add(p); }
    const k = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.4, 0.5), new THREE.MeshStandardMaterial({ color: 0x15100f })); k.position.y = 7.2; g.add(k);
    const k2 = new THREE.Mesh(new THREE.BoxGeometry(8, 0.35, 0.45), red); k2.position.y = 6.3; g.add(k2);
    g.position.set(x, 0, z); g.scale.setScalar(s); g.rotation.y = ry; scene.add(g);
  }
  torii(0, -32, 1.6, 0); torii(0, -45, 1.8, 0);

  // stone lanterns around the stage
  const lamps = [];
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + 0.2, r = ARENA_R + 3.2, g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.4, 8), stone); base.position.y = 0.2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.2, 8), stone); pole.position.y = 1;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.55, 0.62), stone); box.position.y = 1.85;
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.34, 0.42), new THREE.MeshBasicMaterial({ color: 0xffb860 })); glow.position.y = 1.85;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.45, 4), stone); roof.position.y = 2.35; roof.rotation.y = Math.PI / 4;
    g.add(base, pole, box, glow, roof); g.children.forEach(c => c.castShadow = true);
    g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); scene.add(g);
    if (quality !== 'low' && i % 2 === 0) { const l = new THREE.PointLight(0xff9a4a, 8, 12, 2); l.position.set(g.position.x, 1.9, g.position.z); scene.add(l); lamps.push(l); }
  }

  // cherry trees
  const trunkM = new THREE.MeshStandardMaterial({ color: 0x2b1b14, roughness: 1 });
  const blossom = [0xf2a7bd, 0xf7c1d0, 0xe98fab].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }));
  function tree(x, z, s) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 4.5, 8), trunkM); t.position.y = 2.2; t.rotation.z = rnd(-.15, .15); t.castShadow = true; g.add(t);
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(rnd(1.3, 2.3), 1), blossom[i % 3]);
      b.position.set(rnd(-2.6, 2.6), rnd(4.2, 6.5), rnd(-2.6, 2.6)); b.castShadow = true; g.add(b);
    }
    g.position.set(x, 0, z); g.scale.setScalar(s); scene.add(g);
  }
  for (let i = 0; i < 14; i++) { const a = rnd(0, 6.283), r = rnd(ARENA_R + 6, ARENA_R + 28); tree(Math.cos(a) * r, Math.sin(a) * r, rnd(0.9, 1.5)); }

  // distant mountains
  const mm = new THREE.MeshBasicMaterial({ color: 0x4a3a58, fog: true });
  for (let i = 0; i < 14; i++) {
    const a = -0.4 - i * 0.28 + rnd(-.1, .1) + Math.PI, r = rnd(150, 190), hgt = rnd(60, 110), m = new THREE.Mesh(new THREE.ConeGeometry(rnd(40, 70), hgt, 7), mm);
    m.position.set(Math.cos(a) * r, hgt / 2 - 8, Math.sin(a) * r); scene.add(m);
  }
  // low pavilion silhouette
  const hut = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 7), new THREE.MeshStandardMaterial({ color: 0x2a1a14, roughness: 0.9 }));
  const roofM = new THREE.Mesh(new THREE.ConeGeometry(11, 3.4, 4), new THREE.MeshStandardMaterial({ color: 0x1c1a1f, roughness: 0.8 }));
  roofM.scale.set(1, 1, 0.65); roofM.position.y = 3.6; roofM.rotation.y = Math.PI / 4; body.position.y = 2; hut.add(body, roofM); hut.position.set(-26, 0, 22); hut.rotation.y = 0.6;
  hut.traverse(o => { o.castShadow = true; }); scene.add(hut);

  return {
    sun, lamps,
    setQuality(q) {
      const size = q === 'high' ? 2048 : q === 'med' ? 1024 : 512;
      renderer.shadowMap.enabled = true;
      sun.shadow.mapSize.set(size, size); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
  };
}
