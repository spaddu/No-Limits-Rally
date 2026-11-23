// Maaston grafiikka ja fysiikka valmiista korkeusdatasta (heightmap.js).
// Jokaisella kolmiolla on oma väri: flat-shaded polygonityyli ilman tekstuureita.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { RENDER_CHUNK } from './heightmap.js';

/**
 * colorFn(col, info) asettaa kolmion värin (THREE.Color) teeman mukaan.
 * info = { x, z, h, slope, rd, flat, rand }: keskipiste, korkeus, normaalin y (1 = tasainen),
 * etäisyys tiehen, tien tasaisen osan leveys ja satunnaislukufunktio.
 */
export function createTerrain(scene, world, RAPIER, field, road, colorFn) {
  const { heights, roadDist } = field;
  const { size: TERRAIN_SIZE, half: HALF, cell: CELL, n: N } = field.grid;

  // --- Fysiikka: kolmioverkko ----------------------------------------------
  const verts = new Float32Array(N * N * 3);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const k = (i * N + j) * 3;
      verts[k] = -HALF + j * CELL;
      verts[k + 1] = heights[i * N + j];
      verts[k + 2] = -HALF + i * CELL;
    }
  }
  // Kolmiot paloittain: jokaisella 32 m palalla oma tarkkuus (heightmap.js: LOD_LEVELS),
  // ja piirtoa varten 2 × 2 palaa yhdistetään yhdeksi 64 m meshiksi
  const { chunk: CH, count: NC, steps } = field.lod;
  const RC = RENDER_CHUNK;
  const chunkTris = [];      // piirtopalan kolmioiden kärkipisteiden indeksit
  let triTotal = 0;
  for (let ri = 0; ri < NC; ri += RC) {
    for (let rj = 0; rj < NC; rj += RC) {
      const cells = [];
      for (let ci = ri; ci < ri + RC; ci++) for (let cj = rj; cj < rj + RC; cj++) cells.push([ci, cj, steps[ci * NC + cj]]);
      const idx = new Uint32Array(cells.reduce((sum, [, , st]) => sum + (CH / st) ** 2 * 6, 0));
      let t = 0;
      for (const [ci, cj, st] of cells) {
        const n = CH / st;
        for (let a = 0; a < n; a++) {
          for (let b = 0; b < n; b++) {
            const i = ci * CH + a * st, j = cj * CH + b * st;
            const v00 = i * N + j;             // (i, j)
            const v10 = (i + st) * N + j;      // (i+1, j)
            const v01 = i * N + j + st;        // (i, j+1)
            const v11 = (i + st) * N + j + st;
            idx[t++] = v00; idx[t++] = v10; idx[t++] = v01;
            idx[t++] = v01; idx[t++] = v10; idx[t++] = v11;
          }
        }
      }
      chunkTris.push(idx);
      triTotal += idx.length / 3;
    }
  }
  const indices = new Uint32Array(triTotal * 3);
  let off = 0;
  for (const idx of chunkTris) { indices.set(idx, off); off += idx.length; }

  const groundBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.trimesh(verts, indices).setFriction(0.8), groundBody);

  // Näkymättömät seinät reunoille varmuuden vuoksi
  const wallPos = HALF - 3;
  for (const [wx, wz, hx, hz] of [
    [wallPos, 0, 1, HALF], [-wallPos, 0, 1, HALF],
    [0, wallPos, HALF, 1], [0, -wallPos, HALF, 1],
  ]) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 150, hz).setTranslation(wx, 0, wz), groundBody);
  }

  // --- Grafiikka: oma mesh jokaiselle palalle, jotta näkymän ulkopuoliset jätetään piirtämättä ---
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Group();
  const col = new THREE.Color();
  const rand = mulberry32(55);
  const info = { x: 0, z: 0, h: 0, slope: 1, rd: 0, flat: road.halfWidth + road.shoulder, rand };

  for (const idx of chunkTris) {
    const triCount = idx.length / 3;
    const positions = new Float32Array(triCount * 9);
    const colors = new Float32Array(triCount * 9);
    let p = 0;
    for (let tri = 0; tri < triCount; tri++) {
      const ia = idx[tri * 3], ib = idx[tri * 3 + 1], ic = idx[tri * 3 + 2];
      const ax = verts[ia * 3], ay = verts[ia * 3 + 1], az = verts[ia * 3 + 2];
      const bx = verts[ib * 3], by = verts[ib * 3 + 1], bz = verts[ib * 3 + 2];
      const cx = verts[ic * 3], cy = verts[ic * 3 + 1], cz = verts[ic * 3 + 2];

      // Normaalin y-komponentti: 1 = tasainen, 0 = pystysuora
      const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
      const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
      const nx = e1y * e2z - e1z * e2y;
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * e2y - e1y * e2x;

      info.x = (ax + bx + cx) / 3;
      info.z = (az + bz + cz) / 3;
      info.h = (ay + by + cy) / 3;
      info.slope = ny / Math.hypot(nx, ny, nz);
      info.rd = (roadDist[ia] + roadDist[ib] + roadDist[ic]) / 3;
      // Sillan alla kanjonin pohja ei ole tienreunaa
      if (field.bridgeGap && Math.max(field.bridgeGap(ia), field.bridgeGap(ib), field.bridgeGap(ic)) > 1.5) info.rd = 1e3;
      colorFn(col, info);

      positions[p] = ax; positions[p + 1] = ay; positions[p + 2] = az;
      positions[p + 3] = bx; positions[p + 4] = by; positions[p + 5] = bz;
      positions[p + 6] = cx; positions[p + 7] = cy; positions[p + 8] = cz;
      for (let v = 0; v < 9; v += 3) {
        colors[p + v] = col.r; colors[p + v + 1] = col.g; colors[p + v + 2] = col.b;
      }
      p += 9;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    const part = new THREE.Mesh(geometry, material);
    part.receiveShadow = true;
    part.castShadow = false;   // maasto ei heitä varjoja: varjokarttaan piirretään vain autot, puut ja rakennukset
    mesh.add(part);
  }
  scene.add(mesh);

  return {
    mesh,
    heightAt: field.heightAt,
    baseHeightAt: field.baseHeightAt,
    roadDistanceAt: field.roadDistanceAt,
    roadDistanceNearAt: field.roadDistanceNearAt,
    size: TERRAIN_SIZE,
    half: HALF,
  };
}
