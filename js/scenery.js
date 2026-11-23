// Metsäteeman puut ja kivet. Piirretään InstancedMesh-olioina (yksi piirtokutsu per tyyppi)
// ja niille luodaan staattiset törmäysmuodot. Tien varteen tulee tiheämpää metsää.
// layout (sceneryFinland.js) = hakkuuaukeat ja pellot, joille ei tule puita, sekä pihat.
// Pihat (layout.clearAt) poistetaan vasta arvonnan jälkeen ja sijoittelupäätökset tehdään
// maastolla ilman pihojen tasanteita, joten muu metsä pysyy täsmälleen samana.

import * as THREE from 'three';
import { createNoise2D, mulberry32 } from './noise.js';
import { InstanceBatch } from './sceneryKit.js';

export function createScenery(scene, world, RAPIER, terrain, road, options = {}, layout = null) {
  const rand = mulberry32(options.seed ?? 99);
  const forest = createNoise2D(31);
  const roadside = createNoise2D(57);   // vaihtelee tienvarren metsän ja aukeiden välillä
  const fixedBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const limit = terrain.half * 0.8;                        // reunavuorten alkuun asti
  const roadClear = road.halfWidth + road.shoulder + 3.5;  // tien vapaa käytävä (tilaa sladeille)
  const cover = options.forestCover ?? 0;                  // > 0 = tiheämpi metsä

  const baseH = terrain.baseHeightAt ?? terrain.heightAt;
  const clearAt = layout?.clearAt ?? null;
  const slopeAt = (x, z) => {
    const dx = baseH(x + 1, z) - baseH(x - 1, z);
    const dz = baseH(x, z + 1) - baseH(x, z - 1);
    return Math.hypot(dx, dz) / 2;
  };

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const col = new THREE.Color();

  // --- Puut ------------------------------------------------------------------
  const TREE_COUNT = options.trees ?? 2600;
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 1.6, 6).translate(0, 0.8, 0);
  const leafGeoA = new THREE.ConeGeometry(1.5, 2.6, 7).translate(0, 2.6, 0);
  const leafGeoB = new THREE.ConeGeometry(1.05, 2.0, 7).translate(0, 3.8, 0);

  const trunkMat = new THREE.MeshStandardMaterial({ color: '#7a5233', flatShading: true, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 });

  const trunks = new InstanceBatch(trunkGeo, trunkMat);
  const leavesA = new InstanceBatch(leafGeoA, leafMat);
  const leavesB = new InstanceBatch(leafGeoB, leafMat);
  const leafColors = ['#2f7d3b', '#3b8f45', '#2a6e3a', '#4a9a3f'].map((c) => new THREE.Color(c));

  let placed = 0;
  let generated = 0;   // arvotut puut (myös pihoilta pois jätetyt), jotta arvontajärjestys pysyy samana
  for (let attempt = 0; attempt < 120000 && generated < TREE_COUNT; attempt++) {
    const x = (rand() * 2 - 1) * limit;
    const z = (rand() * 2 - 1) * limit;
    const rd = terrain.roadDistanceAt(x, z);
    if (rd < roadClear) continue;
    if (layout && layout.zoneAt(x, z) > 0) continue;   // hakkuuaukea tai pelto

    // Metsiköt ryhmiin
    const f = forest(x * 0.012, z * 0.012) + cover;
    let chance = f > 0.15 ? 0.6 : f > -0.1 ? 0.3 : 0.015;
    // Tien varressa vuorottelevat tiheä metsä ja aukeat kohdat
    if (rd < 40) {
      const dense = roadside(x * 0.018, z * 0.018) > -0.25;
      if (dense) chance = Math.max(chance, 1 - (rd - roadClear) * 0.012);
    }
    if (rand() > chance) continue;

    if (slopeAt(x, z) > 0.5) continue;
    if (baseH(x, z) > 22) continue;

    const s = 0.8 + rand() * 0.7;
    const sy = s * (0.85 + rand() * 0.35);
    const yaw = rand() * Math.PI * 2;
    col.copy(leafColors[Math.floor(rand() * leafColors.length)]).multiplyScalar(0.9 + rand() * 0.2);
    generated++;
    if (clearAt && clearAt(x, z)) continue;   // piha

    const h = terrain.heightAt(x, z);
    pos.set(x, h - 0.15, z);
    q.setFromAxisAngle(up, yaw);
    scl.set(s, sy, s);
    m.compose(pos, q, scl);
    trunks.add(m);
    leavesA.add(m, col);
    leavesB.add(m, col);

    world.createCollider(
      RAPIER.ColliderDesc.cylinder(1.6 * sy, 0.35 * s).setTranslation(x, h + 1.6 * sy, z),
      fixedBody,
    );
    placed++;
  }
  for (const batch of [trunks, leavesA, leavesB]) batch.build(scene);

  // --- Kivet -----------------------------------------------------------------
  const ROCK_COUNT = options.rocks ?? 240;
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 });
  const rocks = new InstanceBatch(rockGeo, rockMat);
  const rockPos = rockGeo.getAttribute('position');
  const tmp = new THREE.Vector3();
  const euler = new THREE.Euler();

  let rockCount = 0;
  let rocksGenerated = 0;
  for (let attempt = 0; attempt < 6000 && rocksGenerated < ROCK_COUNT; attempt++) {
    const x = (rand() * 2 - 1) * limit;
    const z = (rand() * 2 - 1) * limit;
    const size = 0.5 + Math.pow(rand(), 2) * 2.2;
    if (terrain.roadDistanceAt(x, z) < roadClear + size * 1.5) continue;
    if (layout && layout.fieldAt(x, z) > 0) continue;  // ei kiviä pelloille
    scl.set(size * (0.8 + rand() * 0.6), size * (0.5 + rand() * 0.4), size * (0.8 + rand() * 0.6));
    pos.set(x, terrain.heightAt(x, z) - scl.y * 0.3, z);
    q.setFromEuler(euler.set(rand() * 0.6, rand() * Math.PI * 2, rand() * 0.6));
    col.setHSL(0.08, 0.05 + rand() * 0.06, 0.42 + rand() * 0.14);
    rocksGenerated++;
    if (clearAt && clearAt(x, z)) continue;   // piha
    m.compose(pos, q, scl);
    rocks.add(m, col);

    // Kuperan kuoren törmäysmuoto täsmälleen kiven muodosta
    const pts = new Float32Array(rockPos.count * 3);
    for (let k = 0; k < rockPos.count; k++) {
      tmp.fromBufferAttribute(rockPos, k).applyMatrix4(m);
      pts[k * 3] = tmp.x; pts[k * 3 + 1] = tmp.y; pts[k * 3 + 2] = tmp.z;
    }
    const desc = RAPIER.ColliderDesc.convexHull(pts);
    if (desc) world.createCollider(desc.setFriction(0.7), fixedBody);
    rockCount++;
  }
  rocks.build(scene);
}
