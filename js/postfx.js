// Jälkikäsittely: kevyt bloom (vain kirkkaimmat kohdat: aurinko, takavalot), värisävy, vinjetti ja
// ACES-sävytys. Kuva piirretään ensin reunanpehmennettyyn (MSAA) HDR-puskuriin.
//
// Pois päältä osoitteella ?fx=0 (vertailuun tai heikoille laitteille) tai lennossa
// suorituskykymittareista (E, sitten 1): silloin piirretään suoraan ruudulle ja sävytys
// tehdään piirron yhteydessä.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// Värisävy ja vinjetti lisätään OutputPassin shaderiin (ennen ACES-sävytystä), jolloin
// koko jälkikäsittely on vain kaksi koko ruudun vaihetta: bloom ja lopputulos ruudulle.
const GRADE_UNIFORMS = /* glsl */ `
  uniform float vignetteOffset, vignetteDarkness, saturation;
  uniform vec3 tint;
`;
const GRADE_CODE = /* glsl */ `
  float lum = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor.rgb = max(mix(vec3(lum), gl_FragColor.rgb, saturation), 0.0) * tint;
  vec2 vp = (vUv - 0.5) * vec2(vignetteOffset * 1.15, vignetteOffset);
  gl_FragColor.rgb *= 1.0 - vignetteDarkness * smoothstep(0.25, 0.85, dot(vp, vp) * 2.0);
`;

/** OutputPass (ACES + sRGB), johon on lisätty värisävy ja vinjetti. */
function createGradeOutputPass() {
  const pass = new OutputPass();
  Object.assign(pass.uniforms, {
    vignetteOffset: { value: 1 },
    vignetteDarkness: { value: 0.4 },
    saturation: { value: 1 },
    tint: { value: new THREE.Color(1, 1, 1) },
  });
  const fs = pass.material.fragmentShader;
  const anchor = 'gl_FragColor = texture2D( tDiffuse, vUv );';
  if (!fs.includes(anchor)) throw new Error('postfx: OutputShader on muuttunut');
  pass.material.fragmentShader = fs
    .replace('uniform sampler2D tDiffuse;', 'uniform sampler2D tDiffuse;\n' + GRADE_UNIFORMS)
    .replace(anchor, anchor + GRADE_CODE);
  return pass;
}

export class PostFX {
  constructor(renderer) {
    this.renderer = renderer;
    this.enabled = new URLSearchParams(location.search).get('fx') !== '0';
    this.onSceneRendered = null;   // suorituskykymittarit (perfHud.js) lukevat näkymän piirtokutsut tästä
    const mobile = matchMedia('(pointer: coarse)').matches;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: mobile ? 2 : 4,
    });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    const pass = this.renderPass;
    pass.render = (...args) => {
      RenderPass.prototype.render.apply(pass, args);
      this.onSceneRendered?.();
    };
    // Bloom pienemmällä resoluutiolla: halpa ja pehmeä
    const scale = mobile ? 0.35 : 0.5;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * scale, innerHeight * scale), 0.25, 0.4, 1.0);
    this.bloomScale = scale;
    this.output = createGradeOutputPass();
    this.composer.addPass(this.renderPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.output);
    this.setSize(innerWidth, innerHeight);
  }

  /** Radan tunnelma-asetukset (atmosphere.js): valotus, bloom ja vinjetti. */
  configure(atmo) {
    this.renderer.toneMappingExposure = atmo.exposure ?? 1;
    const b = atmo.bloom ?? {};
    this.bloom.strength = b.strength ?? 0.25;
    this.bloom.radius = b.radius ?? 0.4;
    this.bloom.threshold = b.threshold ?? 1.0;
    this.bloom.enabled = this.bloom.strength > 0;
    const v = atmo.vignette ?? {}, g = atmo.grade ?? {}, u = this.output.uniforms;
    u.vignetteOffset.value = v.offset ?? 1;
    u.vignetteDarkness.value = v.darkness ?? 0.4;
    u.saturation.value = g.saturation ?? 1;
    u.tint.value.set(g.tint ?? '#ffffff');
  }

  render(scene, camera, dt) {
    if (!this.enabled) {
      this.renderer.render(scene, camera);
      this.onSceneRendered?.();
      return;
    }
    this.renderPass.scene = scene;
    this.renderPass.camera = camera;
    this.composer.render(dt);
  }

  setSize(w, h) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom.setSize(w * this.bloomScale, h * this.bloomScale);
  }
}
