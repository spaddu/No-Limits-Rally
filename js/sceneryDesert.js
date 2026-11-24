// Egyptin aavikko: hiekkadyynit, punaista kiveä, kaktuksia ja pensaita,
// keitailla vihreää, palmuja ja vaatimattomat savitiilimajat (Bawiti).
// Lisäksi Niilin suiston pellot ja talot (Ghamrin) sekä pyramidit (Giza).

import * as THREE from 'three';
import { createNoise2D, smoothstep } from './noise.js';
import {
  UP, slopeAt, flatMaterial, InstanceBatch, addCylinderCollider, addBoxCollider, scatterRocks,
} from './sceneryKit.js';

const hash2 = (i, j) => {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Suiston peltojen värit: apila, vehnä, maissi, kypsä vehnä, muokattu maa
const DELTA_COLORS = ['#5f9a3a', '#7aad44', '#93b84e', '#c9b65f', '#6e5a40'].map((c) => new THREE.Color(c));

/**
 * Keitaat tulevat radan maastoasetusten painanteista (basins) ja suisto alangosta (lowland).
 * options.pyramids = [[x, z, kanta, korkeus], …], options.houses = talojen määrä suistossa.
 */
export function planDesert(terrain, road, options, rand, track) {
  const oases = (track.terrain.basins ?? []).map(([x, z, r]) => ({ x, z, r }));
  const low = track.terrain.lowland;
  /** 0…1: kuinka "suistoa" kohta on (1 = tasainen peltomaa). */
  const deltaAt = low
    ? (x, z) => smoothstep(low[2] - low[3] / 2, low[2] + low[3] / 2, x * low[0] + z * low[1])
    : () => 0;
  /** Suiston peltolohko: värin indeksi ja onko kohdalla kastelukanava. */
  const plotAt = (x, z) => {
    const A = 0.12;
    const u = (x * Math.cos(A) + z * Math.sin(A)) / 28;
    const v = (-x * Math.sin(A) + z * Math.cos(A)) / 16;
    const iu = Math.floor(u), iv = Math.floor(v);
    return { type: Math.floor(hash2(iu, iv) * 5), canal: u - iu < 0.05 || v - iv < 0.06 };
  };
  /** 0…1: kuinka "keidasta" kohta on (1 = keskellä). */
  const oasisAt = (x, z) => {
    let best = 0;
    for (const o of oases) {
      const d = Math.hypot(x - o.x, z - o.z) / o.r;
      if (d < 1) best = Math.max(best, 1 - d);
    }
    return best;
  };
  return { oases, oasisAt, deltaAt, plotAt, pyramids: options.pyramids ?? [] };
}

export function desertColorFn(layout) {
  const patchNoise = createNoise2D(4041);
  const cSandA = new THREE.Color('#e3c38b');
  const cSandB = new THREE.Color('#d6b178');
  const cCrest = new THREE.Color('#eed5a2');
  const cLow = new THREE.Color('#cfa56c');
  const cStone = new THREE.Color('#c99761');
  const cRedRock = new THREE.Color('#a9714b');
  const cScrub = new THREE.Color('#b7a663');
  const cGrass = new THREE.Color('#6f9c3f');
  const cGrass2 = new THREE.Color('#5f8f37');
  const cVerge = new THREE.Color('#d4b27c');
  const cCanal = new THREE.Color('#3f6a2c');
  const cDeltaEdge = new THREE.Color('#9fa25a');
  return (col, t) => {
    const p = patchNoise(t.x * 0.025, t.z * 0.025) * 0.5 + 0.5;
    col.copy(cSandA).lerp(cSandB, p);
    col.lerp(cCrest, smoothstep(4, 10, t.h) * 0.6);
    col.lerp(cLow, smoothstep(-3, -10, t.h) * 0.5);
    col.lerp(cStone, smoothstep(0.9, 0.8, t.slope));
    col.lerp(cRedRock, smoothstep(0.78, 0.6, t.slope));
    const o = layout.oasisAt(t.x, t.z);
    if (o > 0) {
      col.lerp(cScrub, smoothstep(0.0, 0.14, o));
      col.lerp(p > 0.5 ? cGrass : cGrass2, smoothstep(0.14, 0.3, o));
    }
    const dl = layout.deltaAt(t.x, t.z);
    if (dl > 0.45) {
      col.lerp(cDeltaEdge, smoothstep(0.45, 0.6, dl));
      if (dl > 0.62 && t.slope > 0.9) {
        const plot = layout.plotAt(t.x, t.z);
        col.copy(plot.canal ? cCanal : DELTA_COLORS[plot.type]).multiplyScalar(0.95 + p * 0.1);
      }
    }
    col.lerp(cVerge, smoothstep(t.flat + 0.8, t.flat - 0.4, t.rd));
    col.multiplyScalar(0.96 + t.rand() * 0.08);
  };
}

/** Palmunlehden geometria: litistetty kartio, tyvi origossa, kärki +Z-suuntaan. */
function frondGeometry() {
  return new THREE.ConeGeometry(0.55, 3.6, 4, 1)
    .rotateX(Math.PI / 2)
    .translate(0, 0, 1.8)
    .scale(1, 0.22, 1);
}

export function buildDesert({ scene, world, RAPIER, terrain, road, layout, rand, options = {} }) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const flat = road.halfWidth + road.shoulder;
  const limit = terrain.half * 0.8;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  const H = (x, z) => terrain.heightAt(x, z);
  const taken = [];
  const free = (x, z, r) => !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r);

  // --- Majat keitaiden laidoille ------------------------------------------------
  const mudMat = flatMaterial('#c9a273');
  const roofMat = flatMaterial('#a8845a');
  const beamMat = flatMaterial('#6e5236');
  const darkMat = flatMaterial('#3e2c1e');
  let huts = 0;
  for (const o of layout.oases) {
    if (huts >= 3) break;
    for (let attempt = 0; attempt < 200; attempt++) {
      const a = rand() * 6.28, d = o.r * (0.55 + rand() * 0.3);
      const x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d;
      if (terrain.roadDistanceAt(x, z) < flat + 6 || slopeAt(terrain, x, z) > 0.18 || !free(x, z, 6)) continue;
      const yaw = Math.atan2(o.x - x, o.z - z);   // ovi kohti keitaan keskustaa
      const base = Math.min(H(x, z), H(x + 2.5, z), H(x - 2.5, z), H(x, z + 2.5), H(x, z - 2.5)) - 0.4;
      const g = new THREE.Group();
      g.position.set(x, base, z);
      g.rotation.y = yaw;
      const add = (geo, mat, px, py, pz) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(px, py, pz);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        g.add(mesh);
      };
      add(new THREE.BoxGeometry(4.6, 3, 3.6), mudMat, 0, 1.5, 0);
      add(new THREE.BoxGeometry(5, 0.25, 4), roofMat, 0, 3.1, 0);
      for (const bx of [-1.6, -0.5, 0.6, 1.7]) add(new THREE.BoxGeometry(0.14, 0.14, 4.6), beamMat, bx, 2.9, 0);
      add(new THREE.BoxGeometry(1, 1.9, 0.1), darkMat, 0.6, 1.35, 1.82);
      add(new THREE.BoxGeometry(0.6, 0.5, 0.1), darkMat, -1.4, 2.0, 1.82);
      scene.add(g);
      addBoxCollider(world, RAPIER, body, x, base + 1.6, z, 2.3, 1.6, 1.8, yaw);
      taken.push([x, z, 5]);
      huts++;
      break;
    }
  }

  // --- Palmut ----------------------------------------------------------------------
  const trunk = new InstanceBatch(new THREE.CylinderGeometry(0.2, 0.3, 1, 6).translate(0, 0.5, 0), flatMaterial('#8a6a46'), { tag: 'tree' });
  const fronds = new InstanceBatch(frondGeometry(), flatMaterial('#ffffff'), { tag: 'tree' });
  const frondGreens = ['#4f8a39', '#5c9a40', '#457d32'].map((c) => new THREE.Color(c));
  const top = new THREE.Vector3();
  for (const o of layout.oases) {
    let n = 0;
    for (let attempt = 0; attempt < 600 && n < 22; attempt++) {
      const a = rand() * 6.28, d = o.r * (0.2 + rand() * 0.85);
      const x = o.x + Math.cos(a) * d, z = o.z + Math.sin(a) * d;
      if (terrain.roadDistanceAt(x, z) < flat + 2 || !free(x, z, 2)) continue;
      const y = H(x, z);
      const hgt = 6 + rand() * 4;
      // Runko kallistuu hieman satunnaiseen suuntaan
      const la = rand() * 6.28, tilt = 0.05 + rand() * 0.18;
      q.setFromEuler(e.set(Math.sin(la) * tilt, 0, Math.cos(la) * tilt));
      m.compose(p.set(x, y - 0.2, z), q, s.set(1, hgt, 1));
      trunk.add(m);
      top.set(0, hgt - 0.2, 0).applyQuaternion(q).add(p);
      const nf = 7 + ((rand() * 2) | 0);
      const green = frondGreens[(rand() * 3) | 0];
      for (let f = 0; f < nf; f++) {
        q2.setFromEuler(e.set(0.35 + rand() * 0.35, (f / nf) * 6.28 + rand() * 0.4, 0, 'YXZ'));
        m.compose(top, q2, s.set(1, 1, 0.9 + rand() * 0.3));
        fronds.add(m, col.copy(green).multiplyScalar(0.9 + rand() * 0.2));
      }
      addCylinderCollider(world, RAPIER, body, x, y, z, hgt * 0.9, 0.35);
      taken.push([x, z, 1.5]);
      n++;
    }
  }
  trunk.build(scene);
  fronds.build(scene);

  // --- Kaktukset: runko ja 0–2 haaraa, kaikki samasta sylinteristä ------------------
  const cactus = new InstanceBatch(new THREE.CylinderGeometry(0.85, 1, 1, 7).translate(0, 0.5, 0), flatMaterial('#ffffff'));
  const cactusGreens = ['#4e7d3a', '#5a8a42', '#47723a'].map((c) => new THREE.Color(c));
  let cacti = 0;
  for (let attempt = 0; attempt < 6000 && cacti < 240; attempt++) {
    const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
    if (terrain.roadDistanceAt(x, z) < flat + 3 || layout.oasisAt(x, z) > 0.25 || slopeAt(terrain, x, z) > 0.45 || !free(x, z, 1.5)) continue;
    if (layout.deltaAt(x, z) > 0.4) continue;   // ei kaktuksia pelloille
    const y = H(x, z);
    const hgt = 2.2 + rand() * 2.8;
    const r = 0.26 + rand() * 0.12;
    const yaw = rand() * 6.28;
    const g = col.copy(cactusGreens[(rand() * 3) | 0]);
    m.compose(p.set(x, y - 0.2, z), q.identity(), s.set(r, hgt, r));
    cactus.add(m, g);
    const arms = rand() < 0.25 ? 0 : rand() < 0.6 ? 1 : 2;
    for (let k = 0; k < arms; k++) {
      const dir = yaw + k * Math.PI;
      const dx = Math.cos(dir), dz = Math.sin(dir);
      const ah = hgt * (0.35 + rand() * 0.25);
      const len = 0.55 + rand() * 0.3;
      // Vaakasuora tynkä
      q.setFromAxisAngle(new THREE.Vector3(-dz, 0, dx), -Math.PI / 2);
      m.compose(p.set(x, y + ah, z), q, s.set(r * 0.7, len, r * 0.7));
      cactus.add(m, g);
      // Pystysuora haara ylöspäin
      m.compose(p.set(x + dx * len, y + ah - 0.1, z + dz * len), q.identity(), s.set(r * 0.7, 0.9 + rand() * 1.1, r * 0.7));
      cactus.add(m, g);
    }
    addCylinderCollider(world, RAPIER, body, x, y, z, hgt, r + 0.1);
    taken.push([x, z, 1]);
    cacti++;
  }
  cactus.build(scene);

  // --- Kuivat pensaat (ei törmäystä) -------------------------------------------
  const shrubs = new InstanceBatch(new THREE.DodecahedronGeometry(0.5, 0), flatMaterial('#ffffff'), { castShadow: false });
  const shrubColors = ['#9a9455', '#8a8a4e', '#a39a62', '#7f8a4a'].map((c) => new THREE.Color(c));
  for (let i = 0, n = 0; i < 4000 && n < 360; i++) {
    const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
    if (terrain.roadDistanceAt(x, z) < flat + 1.5) continue;
    if (layout.deltaAt(x, z) > 0.55) continue;
    const sc = 0.5 + rand() * 0.9;
    m.compose(p.set(x, H(x, z) + sc * 0.15, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc * 1.3, sc * 0.7, sc * 1.3));
    shrubs.add(m, col.copy(shrubColors[(rand() * 4) | 0]));
    n++;
  }
  shrubs.build(scene);

  scatterRocks(scene, world, RAPIER, body, terrain, rand, {
    count: options.rocks ?? 110, clear: flat + 3, limit, sizeMax: 2.6,
    colorFn: (r) => new THREE.Color().setHSL(0.06 + r() * 0.03, 0.35 + r() * 0.15, 0.45 + r() * 0.12),
    skip: (x, z) => layout.deltaAt(x, z) > 0.4,
  });

  if (layout.pyramids.length) buildPyramids({ scene, world, RAPIER, terrain, body, layout });
  if ((options.houses ?? 0) > 0) buildDelta({ scene, world, RAPIER, terrain, road, layout, rand, body, options, taken, free });
}

// --- Gizan pyramidit -------------------------------------------------------------------
function buildPyramids({ scene, world, RAPIER, terrain, body, layout }) {
  const mat = flatMaterial('#d8be88');
  for (const [x, z, base, height] of layout.pyramids) {
    const half = base / 2;
    let y = Infinity;
    for (const [dx, dz] of [[0, 0], [half, half], [-half, half], [half, -half], [-half, -half]]) y = Math.min(y, terrain.heightAt(x + dx, z + dz));
    y -= 1;
    const geo = new THREE.ConeGeometry(base / Math.SQRT2, height, 4, 1).rotateY(Math.PI / 4).translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const pts = new Float32Array([
      x - half, y, z - half, x + half, y, z - half, x + half, y, z + half, x - half, y, z + half, x, y + height, z,
    ]);
    const desc = RAPIER.ColliderDesc.convexHull(pts);
    if (desc) world.createCollider(desc, body);
  }
}

// --- Niilin suisto: talot peltojen laidoilla ja taatelipalmut ------------------------
const HOUSE_COLORS = ['#d9c7a3', '#c9b48a', '#e6dccb', '#bfa27c', '#d8b48a', '#b9c4c4', '#e0cfae'];
const DOOR_COLORS = ['#2f6d9a', '#3f7d5a', '#6a4a2a', '#2a5c7a'];

function buildDelta({ scene, world, RAPIER, terrain, road, layout, rand, body, options, taken, free }) {
  const flat = road.halfWidth + road.shoulder;
  const H = (x, z) => terrain.heightAt(x, z);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  const darkMat = flatMaterial('#2f2a26');
  const rebarMat = flatMaterial('#4a3f38');
  const wallMats = HOUSE_COLORS.map((c) => flatMaterial(c));
  const doorMats = DOOR_COLORS.map((c) => flatMaterial(c));

  // Talot tien varrelle suiston puolelle
  let houses = 0;
  for (let attempt = 0; attempt < 3000 && houses < options.houses; attempt++) {
    const k = 20 + Math.floor(rand() * (road.count - 40));
    const side = rand() < 0.5 ? -1 : 1;
    const off = flat + 7 + rand() * 18;
    const rx = -road.tz[k] * side, rz = road.tx[k] * side;
    const x = road.xs[k] + rx * off, z = road.zs[k] + rz * off;
    if (layout.deltaAt(x, z) < 0.7 || terrain.roadDistanceAt(x, z) < flat + 6 || slopeAt(terrain, x, z) > 0.12 || !free(x, z, 7)) continue;
    const W = 7 + rand() * 3, D = 6 + rand() * 2;
    const floors = 1 + Math.floor(rand() * 3);
    const Hh = floors * 3;
    const yaw = Math.atan2(road.xs[k] - x, road.zs[k] - z);   // etuseinä tielle päin
    const base = Math.min(H(x, z), H(x + 4, z), H(x - 4, z), H(x, z + 4), H(x, z - 4)) - 0.4;
    const g = new THREE.Group();
    g.position.set(x, base, z);
    g.rotation.y = yaw;
    const add = (geo, mat, px, py, pz) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    };
    const wall = wallMats[(rand() * wallMats.length) | 0];
    const totalH = Hh + 0.4;
    add(new THREE.BoxGeometry(W, totalH, D), wall, 0, totalH / 2, 0);
    // Kaide tasakaton reunoilla
    for (const [px, pz, sx, sz] of [[0, D / 2 - 0.1, W, 0.2], [0, -D / 2 + 0.1, W, 0.2], [W / 2 - 0.1, 0, 0.2, D], [-W / 2 + 0.1, 0, 0.2, D]]) {
      add(new THREE.BoxGeometry(sx, 0.8, sz), wall, px, totalH + 0.4, pz);
    }
    // Ikkunat ja ovi tien puolella
    for (let f = 0; f < floors; f++) {
      for (const wx of [-W / 4, W / 4]) {
        if (f === 0 && wx < 0) continue;
        add(new THREE.BoxGeometry(0.9, 1.1, 0.1), darkMat, wx, 0.4 + f * 3 + 1.6, D / 2 + 0.03);
      }
    }
    add(new THREE.BoxGeometry(1.1, 2.2, 0.1), doorMats[(rand() * doorMats.length) | 0], -W / 4, 0.4 + 1.1, D / 2 + 0.03);
    // Porraskoppi katolla tai harjaterästen tyngät (keskeneräinen kerros)
    if (rand() < 0.5) {
      add(new THREE.BoxGeometry(2.2, 2.2, 2.2), wall, W / 2 - 1.5, totalH + 1.1, -D / 2 + 1.5);
    } else {
      for (const [px, pz] of [[W / 2 - 0.3, D / 2 - 0.3], [-W / 2 + 0.3, D / 2 - 0.3], [W / 2 - 0.3, -D / 2 + 0.3], [-W / 2 + 0.3, -D / 2 + 0.3]]) {
        add(new THREE.CylinderGeometry(0.05, 0.05, 1.4, 4), rebarMat, px, totalH + 0.7, pz);
      }
    }
    scene.add(g);
    addBoxCollider(world, RAPIER, body, x, base + totalH / 2, z, W / 2, totalH / 2 + 0.4, D / 2, yaw);
    taken.push([x, z, Math.hypot(W, D) / 2 + 1]);
    houses++;
  }

  // Taatelipalmut peltojen laidoille ja tien varteen
  const trunk = new InstanceBatch(new THREE.CylinderGeometry(0.2, 0.3, 1, 6).translate(0, 0.5, 0), flatMaterial('#8a6a46'), { tag: 'tree' });
  const fronds = new InstanceBatch(frondGeometry(), flatMaterial('#ffffff'), { tag: 'tree' });
  const greens = ['#4f8a39', '#5c9a40', '#457d32'].map((c) => new THREE.Color(c));
  const top = new THREE.Vector3();
  let palms = 0;
  for (let attempt = 0; attempt < 4000 && palms < (options.palms ?? 90); attempt++) {
    const k = Math.floor(rand() * road.count);
    const side = rand() < 0.5 ? -1 : 1;
    const off = flat + 2.5 + rand() * 40;
    const x = road.xs[k] - road.tz[k] * side * off, z = road.zs[k] + road.tx[k] * side * off;
    if (layout.deltaAt(x, z) < 0.6 || terrain.roadDistanceAt(x, z) < flat + 2 || !free(x, z, 2)) continue;
    const y = H(x, z);
    const hgt = 7 + rand() * 4;
    const la = rand() * 6.28, tilt = 0.04 + rand() * 0.14;
    q.setFromEuler(e.set(Math.sin(la) * tilt, 0, Math.cos(la) * tilt));
    m.compose(p.set(x, y - 0.2, z), q, s.set(1, hgt, 1));
    trunk.add(m);
    top.set(0, hgt - 0.2, 0).applyQuaternion(q).add(p);
    const nf = 7 + ((rand() * 2) | 0);
    const green = greens[(rand() * 3) | 0];
    for (let f = 0; f < nf; f++) {
      q2.setFromEuler(e.set(0.35 + rand() * 0.35, (f / nf) * 6.28 + rand() * 0.4, 0, 'YXZ'));
      m.compose(top, q2, s.set(1, 1, 0.9 + rand() * 0.3));
      fronds.add(m, col.copy(green).multiplyScalar(0.9 + rand() * 0.2));
    }
    addCylinderCollider(world, RAPIER, body, x, y, z, hgt * 0.9, 0.35);
    taken.push([x, z, 2]);
    palms++;
  }
  trunk.build(scene);
  fronds.build(scene);
}
