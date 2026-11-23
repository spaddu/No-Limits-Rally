// Jälkikäsittely: kevyt bloom (vain kirkkaimmat kohdat: aurinko, takavalot), värisävy, vinjetti ja
// ACES-sävytys. Kuva piirretään ensin reunanpehmennettyyn (MSAA) HDR-puskuriin.
//
// Pois päältä osoitteella ?fx=0 (vertailuun tai heikoille laitteille): silloin piirretään
// suoraan ruudulle ja sävytys tehdään piirron yhteydessä.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Värisävy ja vinjetti samassa passissa (lineaarisessa HDR-värissä ennen ACES-sävytystä)
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.0 },
    darkness: { value: 0.4 },
    saturation: { value: 1.0 },
    tint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float offset, darkness, saturation;
    uniform vec3 tint;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(mix(vec3(l), c.rgb, saturation), 0.0) * tint;
      vec2 p = (vUv - 0.5) * vec2(offset * 1.15, offset);
      float v = 1.0 - darkness * smoothstep(0.25, 0.85, dot(p, p) * 2.0);
      gl_FragColor = vec4(c.rgb * v, c.a);
    }
  `,
};

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = new URLSearchParams(location.search).get('fx') !== '0';
    if (!this.enabled) return;
    const mobile = matchMedia('(pointer: coarse)').matches;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: mobile ? 2 : 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    // Bloom pienemmällä resoluutiolla: halpa ja pehmeä
    const scale = mobile ? 0.35 : 0.5;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * scale, innerHeight * scale), 0.25, 0.4, 1.0);
    this.bloomScale = scale;
    this.vignette = new ShaderPass(GradeShader);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.vignette);
    this.composer.addPass(new OutputPass());
    this.setSize(innerWidth, innerHeight);
  }

  /** Radan tunnelma-asetukset (atmosphere.js): valotus, bloom ja vinjetti. */
  configure(atmo) {
    this.renderer.toneMappingExposure = atmo.exposure ?? 1;
    if (!this.enabled) return;
    const b = atmo.bloom ?? {};
    this.bloom.strength = b.strength ?? 0.25;
    this.bloom.radius = b.radius ?? 0.4;
    this.bloom.threshold = b.threshold ?? 1.0;
    this.bloom.enabled = this.bloom.strength > 0;
    const v = atmo.vignette ?? {};
    this.vignette.uniforms.offset.value = v.offset ?? 1;
    this.vignette.uniforms.darkness.value = v.darkness ?? 0.4;
    const g = atmo.grade ?? {};
    this.vignette.uniforms.saturation.value = g.saturation ?? 1;
    this.vignette.uniforms.tint.value.set(g.tint ?? '#ffffff');
  }

  render(scene, camera, dt) {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render(dt);
  }

  setSize(w, h) {
    if (!this.enabled) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.setSize(w * this.bloomScale, h * this.bloomScale);
  }
}
