// Soratien pinta: nauha, joka seuraa tien keskilinjaa hieman maanpinnan yläpuolella.
// Pelkkää grafiikkaa, sillä fysiikka tulee maastoon muotoillusta tienpohjasta.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';

const LIFT = 0.05; // kuinka paljon nauha on maanpinnan yläpuolella

/**
 * palette = 7 kaistan väriä vasemmalta oikealle (teemasta); oletuksena metsätien sora.
 * alt = { from, to, palette } tai lista niitä: eri pinta näytevälille (esim. kylän kivetty katu, sillan kansi).
 */
export function createRoadMesh(scene, road, palette = null, alt = null) {
  const hw = road.halfWidth;
  // Poikkileikkaus vasemmalta oikealle: reuna, ajoura, keskiosa, keskikaista, …
  const offsets = [-hw, -hw * 0.66, -hw * 0.43, -hw * 0.12, hw * 0.12, hw * 0.43, hw * 0.66, hw];
  const stripColors = [
    ['#b3a184', 0.06], // reuna
    ['#8c7b62', 0.05], // ajoura (tummempi)
    ['#ad9b7d', 0.06],
    ['#a39a74', 0.07], // keskikaista (ripaus ruohoa)
    ['#ad9b7d', 0.06],
    ['#8c7b62', 0.05],
    ['#b3a184', 0.06],
  ].map(([c, j], i) => ({ color: new THREE.Color(palette?.[i] ?? c), jitter: j }));
  const alts = (Array.isArray(alt) ? alt : alt ? [alt] : []).map((a) => ({
    from: a.from, to: a.to,
    colors: stripColors.map((sc, i) => ({ color: new THREE.Color(a.palette[i]), jitter: sc.jitter })),
  }));

  const { xs, zs, hs, tx, tz, count } = road;
  const strips = offsets.length - 1;
  const segs = road.segCount;
  const positions = new Float32Array(segs * strips * 18);
  const colors = new Float32Array(segs * strips * 18);
  const rand = mulberry32(7);
  const col = new THREE.Color();

  const point = (s, o, out, k) => {
    // Oikea kylki = suunta × ylös = (-tz, tx)
    out[k] = xs[s] - tz[s] * o;
    out[k + 1] = hs[s] + LIFT;
    out[k + 2] = zs[s] + tx[s] * o;
  };

  let p = 0;
  for (let s = 0; s < segs; s++) {
    const s1 = (s + 1) % count;
    for (let k = 0; k < strips; k++) {
      const o0 = offsets[k], o1 = offsets[k + 1];
      // Kaksi kolmiota: (a, c, b) ja (c, d, b), normaalit ylöspäin
      point(s, o0, positions, p);        // a
      point(s, o1, positions, p + 3);    // c
      point(s1, o0, positions, p + 6);   // b
      point(s, o1, positions, p + 9);    // c
      point(s1, o1, positions, p + 12);  // d
      point(s1, o0, positions, p + 15);  // b

      const a = alts.find((x) => s >= x.from && s < x.to);
      const sc = (a ? a.colors : stripColors)[k];
      for (let tri = 0; tri < 2; tri++) {
        col.copy(sc.color).multiplyScalar(1 - sc.jitter + rand() * sc.jitter * 2);
        for (let v = 0; v < 3; v++) {
          const q = p + tri * 9 + v * 3;
          colors[q] = col.r; colors[q + 1] = col.g; colors[q + 2] = col.b;
        }
      }
      p += 18;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,       // estää välkkymisen maanpinnan kanssa
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/** Lähin tien näytepiste annettuun kohtaan. */
export function nearestRoadSample(road, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let s = 0; s < road.count; s++) {
    const d = (road.xs[s] - x) ** 2 + (road.zs[s] - z) ** 2;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}
