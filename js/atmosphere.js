// =============================================================================
//  TUNNELMA – taivas, pilvet, valaistus, utu ja jälkikäsittely teemoittain
// =============================================================================
//  Kaikki ratojen "sää" on koottu ATMOSPHERES-asetuksiin. Teema valitsee
//  asetuksensa themes.js:ssä (atmosphere: 'finnishEvening'), ja rata voi muuttaa
//  yksittäisiä arvoja tracks.js:ssä (env.atmosphere = { … }, env.sky, env.fog).
//
//  Kaikki on proseduraalista: taivas ja pilvet lasketaan shaderissa, ei kuvia.
//
//  Asetukset:
//    sun:      { color, intensity, elevation (°), azimuth (°) }   aurinko ja varjojen suunta
//    hemi:     { sky, ground, intensity }                       täyttövalo varjopuolille
//    sky:      { zenith, horizon, glow, glowWide, glowTight, sunSize, sunBright }
//              zenith = taivaan lakipiste, horizon = horisontti ja utu (sama väri!),
//              glow = auringon hehku (laaja + kapea) taivaalla ja udussa
//    clouds:   { cover, softness, opacity, scale, lit, shade, wind: [x, z] }
//              cover 0 = selkeää … 1 = umpipilvistä
//    fog:      { visibility }   m: tätä kauempana kaikki on utua (FogExp2)
//    exposure: ACES-sävytyksen valotus
//    bloom:    { strength, radius, threshold }   vain kirkkaimmat kohdat hehkuvat
//    vignette: { offset, darkness }
//    grade:    { saturation, tint }   värisävy: kylläisyys ja lämpö (tint kerrotaan kuvaan)
// =============================================================================

import * as THREE from 'three';

export const ATMOSPHERES = {
  // --- Suomi: kesäilta, matala lämmin aurinko ja vaaleanpunertava horisontti ---------
  finnishEvening: {
    sun: { color: '#ffc58e', intensity: 3.0, elevation: 14, azimuth: 205 },
    hemi: { sky: '#c4d2ee', ground: '#5f6640', intensity: 1.15 },
    sky: { zenith: '#6f9bd3', horizon: '#f0c9b6', glow: '#ffbf7a', glowWide: 0.55, glowTight: 0.9, sunSize: 1.4, sunBright: 9 },
    clouds: { cover: 0.42, softness: 0.28, opacity: 0.85, scale: 1.1, lit: '#fff0e2', shade: '#b79aa6', wind: [0.006, 0.002] },
    fog: { visibility: 430 },
    exposure: 1.05,
    bloom: { strength: 0.28, radius: 0.45, threshold: 0.95 },
    vignette: { offset: 1.0, darkness: 0.42 },
    grade: { saturation: 1.14, tint: '#fff3e8' },
  },

  // --- Italia: golden hour, kultainen valo ja lämmin utu --------------------------------
  tuscanGoldenHour: {
    sun: { color: '#ffcf8f', intensity: 3.3, elevation: 19, azimuth: 150 },
    hemi: { sky: '#cfdcf0', ground: '#7d7448', intensity: 1.15 },
    sky: { zenith: '#5590d6', horizon: '#f3dcb8', glow: '#ffb85a', glowWide: 0.24, glowTight: 0.6, sunSize: 1.4, sunBright: 9 },
    clouds: { cover: 0.28, softness: 0.3, opacity: 0.8, scale: 0.9, lit: '#fff4e2', shade: '#c9a98e', wind: [0.005, -0.002] },
    fog: { visibility: 540 },
    exposure: 1.05,
    bloom: { strength: 0.28, radius: 0.45, threshold: 0.95 },
    vignette: { offset: 1.0, darkness: 0.4 },
    grade: { saturation: 1.12, tint: '#fff1df' },
  },

  // --- Egypti: kuuma iltapäivä, vaalea pölyinen utu ---------------------------------------
  desertHaze: {
    sun: { color: '#fff0d4', intensity: 3.6, elevation: 48, azimuth: 120 },
    hemi: { sky: '#e6eef6', ground: '#b8925a', intensity: 1.2 },
    sky: { zenith: '#5a9ddb', horizon: '#ecdcc0', glow: '#fff0d0', glowWide: 0.35, glowTight: 0.6, sunSize: 1.3, sunBright: 10 },
    clouds: { cover: 0.1, softness: 0.35, opacity: 0.6, scale: 0.7, lit: '#ffffff', shade: '#e2d6c0', wind: [0.008, 0.0] },
    fog: { visibility: 500 },
    exposure: 1.0,
    bloom: { strength: 0.22, radius: 0.4, threshold: 1.0 },
    vignette: { offset: 1.0, darkness: 0.35 },
    grade: { saturation: 1.08, tint: '#fff6ea' },
  },

  // --- Arizona: myöhäinen iltapäivä, syvänsininen taivas ja kumpupilvet -------------------
  arizonaAfternoon: {
    sun: { color: '#ffdcae', intensity: 3.4, elevation: 30, azimuth: 235 },
    hemi: { sky: '#cfe0f4', ground: '#9a5a3a', intensity: 1.15 },
    sky: { zenith: '#3f84d2', horizon: '#eed6bd', glow: '#ffcf96', glowWide: 0.4, glowTight: 0.7, sunSize: 1.3, sunBright: 9 },
    clouds: { cover: 0.34, softness: 0.2, opacity: 0.92, scale: 0.8, lit: '#ffffff', shade: '#a9b4c6', wind: [0.007, 0.003] },
    fog: { visibility: 500 },
    exposure: 1.0,
    bloom: { strength: 0.24, radius: 0.4, threshold: 1.0 },
    vignette: { offset: 1.0, darkness: 0.38 },
    grade: { saturation: 1.12, tint: '#fff4ea' },
  },

  // --- Bahama: kirkas keskipäivä, korkea aurinko ja lähes pilvetön taivas -----------------
  bahamasNoon: {
    sun: { color: '#fffaf0', intensity: 3.7, elevation: 66, azimuth: 160 },
    hemi: { sky: '#d8eeff', ground: '#6a8f4a', intensity: 1.25 },
    sky: { zenith: '#2f8be0', horizon: '#bfe5f4', glow: '#fff6e0', glowWide: 0.25, glowTight: 0.5, sunSize: 1.3, sunBright: 10 },
    clouds: { cover: 0.16, softness: 0.18, opacity: 0.95, scale: 0.75, lit: '#ffffff', shade: '#c4d6e6', wind: [0.01, 0.004] },
    fog: { visibility: 560 },
    exposure: 0.92,
    bloom: { strength: 0.22, radius: 0.4, threshold: 1.05 },
    vignette: { offset: 1.05, darkness: 0.32 },
    grade: { saturation: 1.15, tint: '#f8fcff' },
  },

  // --- Skotlanti: pilvinen ja usvainen, hajavalo, pehmeät varjot --------------------------
  highlandOvercast: {
    sun: { color: '#e9e6de', intensity: 1.5, elevation: 34, azimuth: 200 },
    hemi: { sky: '#dfe4ea', ground: '#5f604a', intensity: 1.75 },
    sky: { zenith: '#8a96a3', horizon: '#c2c8cc', glow: '#e8e4da', glowWide: 0.18, glowTight: 0.25, sunSize: 1.6, sunBright: 0 },   // aurinko pilvien takana
    clouds: { cover: 0.88, softness: 0.4, opacity: 0.95, scale: 1.3, lit: '#d9dde0', shade: '#7e8892', wind: [0.012, 0.004] },
    fog: { visibility: 360 },
    exposure: 1.08,
    bloom: { strength: 0.18, radius: 0.4, threshold: 1.1 },
    vignette: { offset: 0.95, darkness: 0.45 },
    grade: { saturation: 1.02, tint: '#f4f7f8' },
  },
};

/** Yhdistää teeman asetukset ja radan muutokset (track.env). Palauttaa uuden olion. */
export function resolveAtmosphere(name, track) {
  const base = ATMOSPHERES[name] ?? ATMOSPHERES.finnishEvening;
  const env = track?.env ?? {};
  const a = structuredClone(base);
  // Vanhat rata-asetukset: env.sky = horisontin väri, env.fog = [lähellä, kaukana] näkyvyys
  if (env.sky) a.sky.horizon = env.sky;
  if (env.fog) a.fog.visibility = env.fog[1];
  for (const [k, v] of Object.entries(env.atmosphere ?? {})) {
    a[k] = typeof v === 'object' && !Array.isArray(v) ? { ...a[k], ...v } : v;
  }
  return a;
}

/** Auringon suunta (yksikkövektori kohti aurinkoa) korkeudesta ja atsimuutista. */
export function sunDirection(sun) {
  const el = THREE.MathUtils.degToRad(sun.elevation);
  const az = THREE.MathUtils.degToRad(sun.azimuth);
  return new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
}

/** FogExp2:n tiheys näkyvyydestä: näkyvyyden kohdalla utua ~96 %. */
export const fogDensity = (visibility) => 1.8 / visibility;

// --- Utu, joka hehkuu auringon suunnassa ----------------------------------------------
// Three.js:n sumupalaa laajennetaan: utu saa auringon puolella saman hehkun kuin taivas
// horisontissa, joten kaukaiset vuoret sulautuvat taivaaseen saumatta. Arvot tulevat
// jaetuista uniformeista, jotka liitetään materiaaleihin (applyFogGlow).
const FOG_GLOW = {
  fogSunView: { value: new THREE.Vector3(0, 1, 0) },   // aurinko kameran koordinaatistossa
  fogGlowColor: { value: new THREE.Color(0, 0, 0) },
  fogGlow: { value: new THREE.Vector2(0, 0) },           // (laaja, kapea) hehku
};

// Sama hehkufunktio taivaalle ja udulle (GLSL)
const GLOW_GLSL = /* glsl */ `
  vec3 atmoGlow(float mu, vec3 color, vec2 k) {
    float m = max(mu, 0.0);
    return color * (k.x * pow(m, 3.0) + k.y * pow(m, 14.0));
  }
`;

let chunksPatched = false;
function patchFogChunks() {
  if (chunksPatched) return;
  chunksPatched = true;
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogView;');
  C.fog_vertex = C.fog_vertex.replace('vFogDepth = - mvPosition.z;', 'vFogDepth = - mvPosition.z;\n\tvFogView = mvPosition.xyz;');
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;',
    'varying float vFogDepth;\n\tvarying vec3 vFogView;\n\tuniform vec3 fogSunView;\n\tuniform vec3 fogGlowColor;\n\tuniform vec2 fogGlow;' + GLOW_GLSL);
  C.fog_fragment = C.fog_fragment.replace('gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );',
    'vec3 fogTint = fogColor + atmoGlow( dot( normalize( vFogView ), fogSunView ), fogGlowColor, fogGlow );\n\tgl_FragColor.rgb = mix( gl_FragColor.rgb, fogTint, fogFactor );');
}
patchFogChunks();

/** Liittää hehkuvan udun uniformit kaikkiin näkymän materiaaleihin (kerran ennen ensimmäistä piirtoa). */
export function applyFogGlow(scene) {
  const seen = new Set();
  scene.traverse((obj) => {
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      if (seen.has(m) || m.isShaderMaterial || m.userData.fogGlow) continue;
      seen.add(m);
      m.userData.fogGlow = true;
      const prev = m.onBeforeCompile;
      const prevKey = m.customProgramCacheKey.call(m);
      m.onBeforeCompile = function (shader, renderer) {
        prev.call(this, shader, renderer);
        Object.assign(shader.uniforms, FOG_GLOW);
      };
      // Ohjelmien välimuistiavain säilyy erillisenä materiaaleille, joilla on oma shader-muutos
      m.customProgramCacheKey = () => prevKey + '|fogglow';
    }
  });
}

// --- Taivaskupu -----------------------------------------------------------------------
const SKY_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;            // aina taustalla
    gl_Position.z *= 0.99999;
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uZenith, uHorizon, uGlowColor, uSunDir, uSunColor, uCloudLit, uCloudShade;
  uniform vec2 uGlow, uWind;
  uniform float uSunCos, uSunBright, uCover, uSoft, uCloudOpacity, uCloudScale, uTime;
  varying vec3 vDir;
  ${GLOW_GLSL}

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0, a = 0.5;
    mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = r * p; a *= 0.5; }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    float mu = dot(d, uSunDir);
    // Pystysuuntainen liukuväri ja auringon hehku (horisontissa sama kuin udussa)
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
    sky += atmoGlow(mu, uGlowColor, uGlow) * (1.0 - 0.55 * smoothstep(0.0, 0.6, h));
    if (h < 0.0) sky = uHorizon + atmoGlow(mu, uGlowColor, uGlow);
    // Aurinko
    float sunDisc = smoothstep(uSunCos - 0.00012, uSunCos + 0.00004, mu);
    // Pilvet: tasoon projisoitu fBm-kohina, joka liikkuu tuulen mukana
    if (h > 0.0) {
      vec2 uv = d.xz / (h + 0.18) * uCloudScale * 2.4 + uWind * uTime;
      float n = fbm(uv);
      float detail = fbm(uv * 2.7 + vec2(5.2, 1.3) + uWind * uTime * 1.5);
      float shape = clamp((n * 0.75 + detail * 0.25 - 0.5) * 2.2 + 0.5, 0.0, 1.0);   // kontrasti: peittävyys 0–1 toimii koko alueella
      float cov = smoothstep(1.0 - uCover, 1.0 - uCover + uSoft, shape);
      cov *= smoothstep(0.0, 0.07, h);   // ohenee aivan horisontissa
      // Pilven paksuus tummentaa alapintaa; auringon puoli reunoilla kirkastuu
      float thick = smoothstep(1.0 - uCover, 1.0 - uCover + uSoft * 2.5, shape);
      vec3 cloud = mix(uCloudLit, uCloudShade, thick * 0.85);
      cloud += atmoGlow(mu, uGlowColor, uGlow) * (1.2 - thick);
      sky = mix(sky, cloud, cov * uCloudOpacity);
      sunDisc *= 1.0 - cov;
    }
    gl_FragColor = vec4(sky + uSunColor * sunDisc * uSunBright, 1.0);
  }
`;

/**
 * Luo taivaskuvun (BackSide-pallo), joka seuraa kameraa. update(dt, camera) liikuttaa
 * pilviä ja päivittää udun hehkun suunnan kameran mukaan.
 */
export class Sky {
  constructor(scene, atmo, radius) {
    const S = atmo.sky, Cl = atmo.clouds;
    this.sunDir = sunDirection(atmo.sun);
    const col = (c) => new THREE.Color(c);
    this.uniforms = {
      uZenith: { value: col(S.zenith) },
      uHorizon: { value: col(S.horizon) },
      uGlowColor: { value: col(S.glow) },
      uGlow: { value: new THREE.Vector2(S.glowWide, S.glowTight) },
      uSunDir: { value: this.sunDir.clone() },
      uSunColor: { value: col(atmo.sun.color) },
      uSunCos: { value: Math.cos(THREE.MathUtils.degToRad(S.sunSize ?? 1.4)) },
      uSunBright: { value: S.sunBright ?? 8 },
      uCover: { value: Cl.cover },
      uSoft: { value: Cl.softness },
      uCloudOpacity: { value: Cl.opacity },
      uCloudScale: { value: Cl.scale },
      uCloudLit: { value: col(Cl.lit) },
      uCloudShade: { value: col(Cl.shade) },
      uWind: { value: new THREE.Vector2(...Cl.wind) },
      uTime: { value: Math.random() * 200 },
    };
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
        side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      }),
    );
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    // Utu: täsmälleen horisontin väri + sama hehku
    FOG_GLOW.fogGlowColor.value.copy(this.uniforms.uGlowColor.value);
    FOG_GLOW.fogGlow.value.copy(this.uniforms.uGlow.value);
    this.fogColor = this.uniforms.uHorizon.value.clone();
  }

  update(dt, camera) {
    this.uniforms.uTime.value += dt;
    this.mesh.position.copy(camera.position);
    camera.updateMatrixWorld();
    FOG_GLOW.fogSunView.value.copy(this.sunDir).transformDirection(camera.matrixWorldInverse);
  }
}
