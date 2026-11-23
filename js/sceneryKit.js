// Yhteiset apuvälineet maisemaelementeille (puut, rakennukset, kivet…).

import * as THREE from 'three';

export const UP = new THREE.Vector3(0, 1, 0);

/** Maaston kaltevuus (nousu per metri) kohdassa (x, z). */
export function slopeAt(terrain, x, z) {
  const dx = terrain.heightAt(x + 1, z) - terrain.heightAt(x - 1, z);
  const dz = terrain.heightAt(x, z + 1) - terrain.heightAt(x, z - 1);
  return Math.hypot(dx, dz) / 2;
}

export function flatMaterial(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 1, metalness: 0, ...extra });
}

/** Instanssipalan koko (m): kappaleet ryhmitellään tämän kokoisiin ruutuihin. */
export const INSTANCE_CELL = 96;

/**
 * Kokoaa monta samanlaista kappaletta InstancedMesh-olioiksi.
 * Kerää ensin add(matrix, color?) -kutsuilla, sitten build(scene).
 * Kappaleet jaetaan 96 m ruutuihin, ja jokainen ruutu on oma InstancedMesh, jotta
 * näkymän (ja varjokartan) ulkopuoliset ruudut jätetään piirtämättä.
 */
export class InstanceBatch {
  constructor(geometry, material, { castShadow = true, receiveShadow = true } = {}) {
    this.geometry = geometry;
    this.material = material;
    this.matrices = [];
    this.colors = [];
    this.castShadow = castShadow;
    this.receiveShadow = receiveShadow;
  }

  add(matrix, color = null) {
    this.matrices.push(matrix.clone());
    this.colors.push(color ? color.clone() : null);
  }

  build(scene) {
    const n = this.matrices.length;
    if (!n) return null;
    const cells = new Map();
    for (let i = 0; i < n; i++) {
      const e = this.matrices[i].elements;
      const key = `${Math.floor(e[12] / INSTANCE_CELL)},${Math.floor(e[14] / INSTANCE_CELL)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(i);
    }
    const white = new THREE.Color(1, 1, 1);
    const hasColor = this.colors.some(Boolean);
    const group = new THREE.Group();
    for (const list of cells.values()) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, list.length);
      list.forEach((i, k) => {
        mesh.setMatrixAt(k, this.matrices[i]);
        if (hasColor) mesh.setColorAt(k, this.colors[i] ?? white);
      });
      mesh.castShadow = this.castShadow;
      mesh.receiveShadow = this.receiveShadow;
      mesh.computeBoundingSphere();   // rajaus: ruudun kappaleiden yhteinen pallo
      group.add(mesh);
    }
    scene.add(group);
    return group;
  }
}

/** Pystysuora sylinteri-törmäysmuoto (pohja kohdassa y). */
export function addCylinderCollider(world, RAPIER, body, x, y, z, height, radius) {
  world.createCollider(
    RAPIER.ColliderDesc.cylinder(height / 2, radius).setTranslation(x, y + height / 2, z),
    body,
  );
}

/** Laatikko-törmäysmuoto, keskipiste (x, y, z), kierto pystyakselin ympäri. */
export function addBoxCollider(world, RAPIER, body, x, y, z, hx, hy, hz, rotY = 0) {
  const q = new THREE.Quaternion().setFromAxisAngle(UP, rotY);
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    body,
  );
}

/** Laatikko, jonka yläosa kavennetaan harjakatoksi (harja x-suunnassa). */
export function gableRoofGeometry(w, h, d, overhang = 0.4) {
  const geo = new THREE.BoxGeometry(w + overhang * 2, h, d + overhang * 2);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0) pos.setZ(i, 0);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Kiviä maastoon. colorFn(rand) palauttaa värin. Kuperan kuoren törmäysmuoto.
 * clear = etäisyys tiehen, jonka sisälle ei sijoiteta.
 */
export function scatterRocks(scene, world, RAPIER, body, terrain, rand, { count, clear, limit, colorFn, sizeMax = 2.2, skip = null }) {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const batch = new InstanceBatch(geo, flatMaterial('#ffffff'));
  const pos = geo.getAttribute('position');
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let placed = 0;
  for (let attempt = 0; attempt < count * 30 && placed < count; attempt++) {
    const x = (rand() * 2 - 1) * limit;
    const z = (rand() * 2 - 1) * limit;
    const size = 0.5 + Math.pow(rand(), 2) * sizeMax;
    if (terrain.roadDistanceAt(x, z) < clear + size * 1.5) continue;
    if (skip && skip(x, z)) continue;
    s.set(size * (0.8 + rand() * 0.6), size * (0.5 + rand() * 0.4), size * (0.8 + rand() * 0.6));
    p.set(x, terrain.heightAt(x, z) - s.y * 0.3, z);
    q.setFromEuler(e.set(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6));
    m.compose(p, q, s);
    batch.add(m, colorFn(rand));
    const pts = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      tmp.fromBufferAttribute(pos, k).applyMatrix4(m);
      pts[k * 3] = tmp.x; pts[k * 3 + 1] = tmp.y; pts[k * 3 + 2] = tmp.z;
    }
    const desc = RAPIER.ColliderDesc.convexHull(pts);
    if (desc) world.createCollider(desc.setFriction(0.7), body);
    placed++;
  }
  batch.build(scene);
}
