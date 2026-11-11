import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

const Grade = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.55 }, aberr: { value: 0 }, sat: { value: 1 }, tint: { value: 0 },
    radial: { value: 0 }, center: { value: new THREE.Vector2(0.5, 0.5) }, flash: { value: 0 }, flashCol: { value: new THREE.Color(1, 1, 1) }, grain: { value: 0.035 }, mono: { value: 0 },
    sunUV: { value: new THREE.Vector2(0.5, 0.8) }, sunAmt: { value: 0 }, sunCol: { value: new THREE.Color(1, 0.9, 0.75) }, rays: { value: 0 }, aspect: { value: 1.78 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, vignette, aberr, sat, tint, radial, flash, grain, mono, sunAmt, rays, aspect; uniform vec2 center, sunUV; uniform vec3 flashCol, sunCol; varying vec2 vUv;
    float rand(vec2 c){ return fract(sin(dot(c, vec2(12.9898,78.233))) * 43758.5453); }
    vec3 samp(vec2 uv){
      vec2 d = uv - 0.5; float a = aberr * dot(d,d) * 2.0;
      if (a < 0.00002) return texture2D(tDiffuse, uv).rgb;   // at rest: one tap, no fringe
      return vec3(texture2D(tDiffuse, uv - d*a).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv + d*a).b);
    }
    void main(){
      vec2 uv = vUv; vec3 col;
      if (radial > 0.001) { vec2 d = uv - center; col = vec3(0.); for (int i = 0; i < 10; i++) { col += samp(uv - d * radial * float(i) / 10.0); } col /= 10.0; }
      else col = samp(uv);
      // key-light haze (Valheim-like hazy sun): a soft screen-space halo toward the sun, plus god rays = the bright gaps
      // between trunks and leaves smeared toward it (9 taps, high quality only, only while the camera faces the light)
      if (sunAmt > 0.001) {
        vec2 sd = (uv - sunUV) * vec2(aspect, 1.0); float halo = pow(clamp(1.0 - length(sd) / 1.25, 0.0, 1.0), 2.6);
        vec3 sh = vec3(0.0);
        if (rays > 0.001) {   // 12 finer taps, start jittered per pixel (interleaved gradient noise): no ghost copies of bright windows / sky printed on the ground
          vec2 st = (sunUV - uv) * 0.038; float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); vec2 p = uv + st * ign; float dec = 1.0;
          for (int i = 0; i < 12; i++) { vec3 s = texture2D(tDiffuse, clamp(p, 0.001, 0.999)).rgb; sh += max(s - 0.6, 0.0) * dec; dec *= 0.87; p += st; } sh *= rays * 0.24; }
        col += sunCol * sunAmt * (halo * 0.22 * (1.0 - dot(col, vec3(0.33)))) + sh * sunCol * sunAmt;
      }
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, sat);
      col *= mix(vec3(0.9, 0.97, 1.07), vec3(1.07, 1.0, 0.9), smoothstep(0.15, 0.75, l));          // teal shadows, warm highlights
      col = (col - 0.5) * 1.06 + 0.5;
      col = mix(col, vec3(l) * vec3(1.25, 0.32, 0.26), tint);                                       // near death: drained red
      col = mix(col, vec3(pow(l, 0.9)) * vec3(1.0, 0.96, 0.9), mono);                                // deathblow monochrome beat
      vec2 v = (uv - 0.5) * vec2(1.15, 1.0); col *= 1.0 - vignette * smoothstep(0.3, 0.95, length(v));
      col += flashCol * flash;
      col += (rand(uv * (time + 1.0)) - 0.5) * grain;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.r = renderer; this.scene = scene; this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.render = new RenderPass(scene, camera); this.composer.addPass(this.render);
    this.bokeh = new BokehPass(scene, camera, { focus: 3.5, aperture: 0.004, maxblur: 0.008 }); this.bokeh.enabled = false; this.composer.addPass(this.bokeh);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.55, 0.5, 1.0); this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(Grade); this.composer.addPass(this.grade);
    this.U = this.grade.uniforms; this.q = 'high'; this.dof = 0;
    this.fx = { aberr: 0, radial: 0, flash: 0, mono: 0 };
  }
  setQuality(q) { this.q = q; this.bloom.enabled = q !== 'low'; this.applyBloom(); this.U.grain.value = q === 'low' ? 0 : 0.02; }
  // key light on screen (uv) and strength; null = off. God rays only on high
  sun(u, v, amt, col) { const U = this.U; if (u === null) { U.sunAmt.value += (0 - U.sunAmt.value) * 0.1; if (U.sunAmt.value < 0.002) U.sunAmt.value = 0; return; } U.sunUV.value.set(u, v); U.sunAmt.value += (amt - U.sunAmt.value) * 0.1; if (col) U.sunCol.value.copy(col).multiplyScalar(0.8); U.rays.value = this.q === 'high' ? 1 : 0; }
  setBloom(b) { this.bloomCfg = b || { strength: 0.55, threshold: 1.0 }; this.applyBloom(); }
  applyBloom() { const b = this.bloomCfg || { strength: 0.55, threshold: 1.0 }; this.bloom.strength = b.strength * (this.q === 'low' ? 0.8 : 1); this.bloom.threshold = b.threshold; }
  setSize(w, h, pr) { this.U.aspect.value = w / h; this.composer.setPixelRatio(pr); this.composer.setSize(w, h); const k = this.q === 'high' ? 0.45 : 0.33; this.bloom.resolution.set(w * pr * k, h * pr * k); }
  impact(o) { for (const k in o) this.fx[k] = Math.max(this.fx[k] || 0, o[k]); if (o.center) this.U.center.value.copy(o.center); if (o.flashCol) this.U.flashCol.value.setHex(o.flashCol); }
  frame(dt, state) {
    const f = this.fx;
    f.aberr = Math.max(0, f.aberr - dt * 0.12); f.radial = Math.max(0, f.radial - dt * 0.35); f.flash = Math.max(0, f.flash - dt * 2.8); f.mono += ((state.mono || 0) - f.mono) * Math.min(1, dt * 6);
    this.U.time.value = (this.U.time.value + dt) % 100; this.U.aberr.value = f.aberr; const run = (state.speed || 0) * 0.014; if (run > f.radial) { this.U.center.value.set(0.5, 0.52); } this.U.radial.value = Math.max(f.radial, run);   // sprint: a faint zoom blur at the edges this.U.flash.value = f.flash; this.U.mono.value = f.mono;
    const hpK = state.hp !== undefined ? Math.max(0, 1 - state.hp / 0.3) : 0;
    this.U.tint.value += (hpK * 0.35 - this.U.tint.value) * Math.min(1, dt * 3);
    this.U.sat.value += ((state.sat ?? 1) - this.U.sat.value) * Math.min(1, dt * 4);
    this.U.vignette.value = 0.55 + hpK * 0.25;
    const wantDof = state.dof && this.q === 'high'; this.bokeh.enabled = !!wantDof;
    if (wantDof) this.bokeh.uniforms.focus.value = state.dof;
    this.composer.render(dt);
  }
}
