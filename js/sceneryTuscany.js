// Italian kukkulat (Torrevecchia): pellot, viinitarhat, maatalot, sypressit,
// oliivipuut, pinjat, heinäpaalit ja vanha torni mäen laella.

import * as THREE from 'three';
import { createNoise2D, smoothstep } from './noise.js';
import {
  UP, slopeAt, flatMaterial, InstanceBatch, addCylinderCollider, addBoxCollider,
  gableRoofGeometry, scatterRocks,
} from './sceneryKit.js';

const hash2 = (i, j) => {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Peltojen värit: vehnä, sänki (heinäpaalit), vihreä ja kynnetty
const FIELD_COLORS = ['#dcc574', '#cdb47c', '#98b14f', '#a57b52'].map((c) => new THREE.Color(c));
const FIELD_STUBBLE = 1;
// Kylän kivetty katu (tien kaistojen värit)
const COBBLES = ['#a8a093', '#8f887c', '#a19a8d', '#989184', '#a19a8d', '#8f887c', '#a8a093'];

/** Suunnittelee maiseman ennen maaston värjäystä: pellot, viinitarhat, talot, torni. */
export function planTuscany(terrain, road, options, rand) {
  const flat = road.halfWidth + road.shoulder;
  const warp = createNoise2D(77);
  const A = 0.5; // peltoruudukon kulma
  const meadow = options.meadow ?? 0.35;   // niittyjen osuus (loput peltoa)

  /** Pellon tyyppi kohdassa (x, z): -1 = niitty, muuten FIELD_COLORS-indeksi. */
  const fieldAt = (x, z) => {
    const w = warp(x * 0.01, z * 0.01) * 14;
    const u = (x * Math.cos(A) + z * Math.sin(A) + w) / 46;
    const v = (-x * Math.sin(A) + z * Math.cos(A) + w * 0.7) / 32;
    const hsh = hash2(Math.floor(u), Math.floor(v));
    if (hsh < meadow) return -1;
    return Math.min(3, Math.floor(((hsh - meadow) / (1 - meadow)) * 4));
  };

  // --- Kylä tien varrella (options.village = { from, to } metreinä tien alusta) ---
  let village = null;
  if (options.village) {
    const s0 = Math.max(0, Math.round(options.village.from / road.spacing));
    const s1 = Math.min(road.count - 1, Math.round(options.village.to / road.spacing));
    const R = options.village.radius ?? 26;
    const circles = [];
    for (let k = s0; k <= s1; k += 5) circles.push([road.xs[k], road.zs[k]]);
    const xs = circles.map((c) => c[0]), zs = circles.map((c) => c[1]);
    const box = [Math.min(...xs) - R, Math.max(...xs) + R, Math.min(...zs) - R, Math.max(...zs) + R];
    village = {
      s0, s1, R,
      at: (x, z) => x > box[0] && x < box[1] && z > box[2] && z < box[3] && circles.some(([cx, cz]) => Math.hypot(x - cx, z - cz) < R),
    };
  }
  const villageAt = (x, z) => (village ? village.at(x, z) : false);

  const sampleRange = [30, road.count - 30];
  const randSample = () => Math.floor(sampleRange[0] + rand() * (sampleRange[1] - sampleRange[0]));
  const side = () => (rand() < 0.5 ? -1 : 1);
  const offsetPoint = (s, off) => [road.xs[s] - road.tz[s] * off, road.zs[s] + road.tx[s] * off];

  // --- Maatalot -------------------------------------------------------------------
  const houses = [];
  for (let attempt = 0; attempt < 600 && houses.length < (options.houses ?? 6); attempt++) {
    const s = randSample();
    const [x, z] = offsetPoint(s, side() * (20 + rand() * 18));
    if (terrain.roadDistanceAt(x, z) < 17) continue;
    if (villageAt(x, z)) continue;
    if (slopeAt(terrain, x, z) > 0.14 || slopeAt(terrain, x + 5, z + 5) > 0.2 || slopeAt(terrain, x - 5, z - 5) > 0.2) continue;
    if (houses.some((h) => Math.hypot(h.x - x, h.z - z) < 75)) continue;
    const yaw = Math.atan2(road.xs[s] - x, road.zs[s] - z); // etuseinä tielle päin
    houses.push({ x, z, yaw, roadS: s });
  }

  // --- Viinitarhat ----------------------------------------------------------------
  const plots = [];
  for (let attempt = 0; attempt < 1500 && plots.length < (options.vineyards ?? 9); attempt++) {
    const s = randSample();
    const [cx, cz] = offsetPoint(s, side() * (flat + 14 + rand() * 30));
    const ang = Math.atan2(road.tz[s], road.tx[s]) + (rand() - 0.5) * 0.3;  // rivit tien suuntaisesti
    const hw = 12 + rand() * 5;
    const hd = 8 + rand() * 3;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    let ok = true;
    for (const [u, v] of [[0, 0], [hw, hd], [-hw, hd], [hw, -hd], [-hw, -hd], [hw, 0], [-hw, 0], [0, hd], [0, -hd]]) {
      const x = cx + ca * u - sa * v;
      const z = cz + sa * u + ca * v;
      if (terrain.roadDistanceAt(x, z) < flat + 3 || slopeAt(terrain, x, z) > 0.32 || villageAt(x, z)) { ok = false; break; }
    }
    if (!ok) continue;
    if (houses.some((h) => Math.hypot(h.x - cx, h.z - cz) < 28)) continue;
    if (plots.some((p) => Math.hypot(p.cx - cx, p.cz - cz) < 36)) continue;
    plots.push({ cx, cz, ang, ca, sa, hw, hd });
  }

  /** Viinitarha ja rivinumero kohdassa (x, z), tai null. */
  const plotAt = (x, z) => {
    for (const p of plots) {
      const dx = x - p.cx, dz = z - p.cz;
      const u = dx * p.ca + dz * p.sa;
      const v = -dx * p.sa + dz * p.ca;
      if (Math.abs(u) < p.hw && Math.abs(v) < p.hd) return { plot: p, row: Math.floor((v + p.hd) / 2.4) };
    }
    return null;
  };

  // --- Torni mäen laella ------------------------------------------------------------
  let tower = null;
  if (options.landmark) {
    const [lx, lz] = options.landmark;
    let best = -Infinity;
    for (let i = 0; i < 400; i++) {
      const x = lx + (rand() * 2 - 1) * 25;
      const z = lz + (rand() * 2 - 1) * 25;
      if (terrain.roadDistanceAt(x, z) < 11) continue;
      const h = terrain.heightAt(x, z);
      if (h > best) { best = h; tower = { x, z }; }
    }
  }

  const roadAlt = village ? { from: village.s0, to: village.s1, palette: COBBLES } : null;
  return { fieldAt, plotAt, plots, houses, tower, village, villageAt, roadAlt };
}

/** Maaston väri Italian kukkuloille. */
export function tuscanyColorFn(layout) {
  const patchNoise = createNoise2D(2025);
  const cMeadowA = new THREE.Color('#a6b65e');
  const cMeadowB = new THREE.Color('#8faa51');
  const cGolden = new THREE.Color('#c8b56c');
  const cLow = new THREE.Color('#7f9f47');
  const cSoilA = new THREE.Color('#8f6c4a');
  const cSoilB = new THREE.Color('#a8845c');
  const cYard = new THREE.Color('#c2ab82');
  const cClay = new THREE.Color('#bba27b');
  const cRock = new THREE.Color('#ab9a7f');
  const cWorn = new THREE.Color('#bdb487');
  const cVerge = new THREE.Color('#d7cfba');
  const houses = layout.houses;
  const cPaving = new THREE.Color('#c9bda5');

  return (col, t) => {
    const p = patchNoise(t.x * 0.02, t.z * 0.02) * 0.5 + 0.5;
    col.copy(cMeadowA).lerp(cMeadowB, p);
    col.lerp(cLow, smoothstep(-4, -12, t.h) * 0.6);
    col.lerp(cGolden, smoothstep(2, 12, t.h) * 0.55);

    if (t.slope > 0.93 && t.rd > t.flat + 5) {
      const f = layout.fieldAt(t.x, t.z);
      if (f >= 0) col.copy(FIELD_COLORS[f]).multiplyScalar(0.95 + p * 0.1);
    }
    const vp = layout.plotAt(t.x, t.z);
    if (vp) col.copy(vp.row % 2 ? cSoilA : cSoilB);
    for (const h of houses) {
      if (Math.hypot(t.x - h.x, t.z - h.z) < 12) { col.copy(cYard); break; }
    }

    col.lerp(cClay, smoothstep(0.9, 0.8, t.slope));
    col.lerp(cRock, smoothstep(0.78, 0.62, t.slope));
    col.lerp(cWorn, smoothstep(t.flat + 4, t.flat + 1, t.rd) * 0.6);
    col.lerp(cVerge, smoothstep(t.flat + 0.8, t.flat - 0.4, t.rd));
    if (layout.villageAt(t.x, t.z)) col.copy(cPaving);
    col.multiplyScalar(0.95 + t.rand() * 0.1);
  };
}

/** Rakentaa 3D-elementit ja törmäysmuodot. */
export function buildTuscany({ scene, world, RAPIER, terrain, road, layout, rand, options = {} }) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const flat = road.halfWidth + road.shoulder;
  const limit = terrain.half * 0.8;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const H = (x, z) => terrain.heightAt(x, z);
  const taken = [];   // varatut paikat [x, z, säde], ettei puita tule talojen päälle
  const free = (x, z, r) => !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r) && !layout.plotAt(x, z) && !layout.villageAt(x, z);

  // --- Viinitarhat: rivit pensaita, päätytolpat, rivikohtaiset törmäysmuodot -----
  const vines = new InstanceBatch(new THREE.DodecahedronGeometry(0.5, 0), flatMaterial('#ffffff'));
  const posts = new InstanceBatch(new THREE.CylinderGeometry(0.06, 0.07, 1.7, 5).translate(0, 0.85, 0), flatMaterial('#7a5a3a'));
  const vineGreens = ['#4d7a2e', '#5a8733', '#44702a', '#61893a'].map((c) => new THREE.Color(c));
  for (const pl of layout.plots) {
    const ax = pl.ca, az = pl.sa;      // rivin suunta
    const bx = -pl.sa, bz = pl.ca;     // rivien välinen suunta
    for (let v = -pl.hd + 1.2; v <= pl.hd - 0.6; v += 2.4) {
      for (let u = -pl.hw + 0.8; u <= pl.hw - 0.8; u += 1.3) {
        const x = pl.cx + ax * u + bx * v, z = pl.cz + az * u + bz * v;
        const sc = 0.9 + rand() * 0.35;
        m.compose(p.set(x, H(x, z) + 0.75, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc * 1.1, sc * 1.25, sc * 1.1));
        vines.add(m, col.copy(vineGreens[(rand() * 4) | 0]));
      }
      for (const u of [-pl.hw + 0.3, pl.hw - 0.3]) {
        const x = pl.cx + ax * u + bx * v, z = pl.cz + az * u + bz * v;
        m.compose(p.set(x, H(x, z) - 0.1, z), q.identity(), s.set(1, 1, 1));
        posts.add(m);
      }
      // Törmäysmuoto riville 6 m pätkissä (seuraa rinnettä)
      for (let u0 = -pl.hw + 0.5; u0 < pl.hw - 0.5; u0 += 6) {
        const len = Math.min(6, pl.hw - 0.5 - u0);
        const uc = u0 + len / 2;
        const x = pl.cx + ax * uc + bx * v, z = pl.cz + az * uc + bz * v;
        addBoxCollider(world, RAPIER, body, x, H(x, z) + 0.6, z, len / 2, 0.6, 0.35, -pl.ang);
      }
    }
    taken.push([pl.cx, pl.cz, Math.hypot(pl.hw, pl.hd)]);
  }
  vines.build(scene);
  posts.build(scene);

  // --- Maatalot -----------------------------------------------------------------
  const wallMat = flatMaterial('#e3d0a7');
  const wallMat2 = flatMaterial('#d8bf92');
  const roofMat = flatMaterial('#b5532f');
  const darkMat = flatMaterial('#4a3828');
  const shutterMat = flatMaterial('#5d7a4a');
  const cypressPts = [];
  for (const h of layout.houses) {
    const g = new THREE.Group();
    const base = Math.min(H(h.x, h.z), H(h.x + 6, h.z), H(h.x - 6, h.z), H(h.x, h.z + 6), H(h.x, h.z - 6)) - 0.6;
    g.position.set(h.x, base, h.z);
    g.rotation.y = h.yaw;
    const add = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    };
    const wallH = 5.6;
    add(new THREE.BoxGeometry(10, wallH, 7), wallMat, 0, wallH / 2, 0);
    add(gableRoofGeometry(10, 1.9, 7, 0.45), roofMat, 0, wallH + 0.95, 0);
    add(new THREE.BoxGeometry(6, 3.8, 5.5), wallMat2, 8, 1.9, -0.6);
    add(gableRoofGeometry(6, 1.3, 5.5, 0.35), roofMat, 8, 3.8 + 0.65, -0.6);
    add(new THREE.BoxGeometry(0.9, 1.6, 0.9), wallMat2, -3, wallH + 1.6, -1.5);   // savupiippu
    add(new THREE.BoxGeometry(1.3, 2.3, 0.12), darkMat, 0.5, 1.15 + 0.6, 3.52);    // ovi
    for (const wx of [-3.4, 3.4]) {
      for (const wy of [2.2, 4.4]) {
        add(new THREE.BoxGeometry(0.9, 1.1, 0.1), darkMat, wx, wy + 0.6, 3.52);
        add(new THREE.BoxGeometry(0.35, 1.15, 0.12), shutterMat, wx - 0.65, wy + 0.6, 3.54);
        add(new THREE.BoxGeometry(0.35, 1.15, 0.12), shutterMat, wx + 0.65, wy + 0.6, 3.54);
      }
    }
    scene.add(g);

    // Törmäysmuodot (talo ja sivurakennus)
    const cos = Math.cos(h.yaw), sin = Math.sin(h.yaw);
    const local = (lx, lz) => [h.x + lx * cos + lz * sin, h.z - lx * sin + lz * cos];
    addBoxCollider(world, RAPIER, body, h.x, base + wallH / 2, h.z, 5, wallH / 2 + 0.6, 3.5, h.yaw);
    const [ax2, az2] = local(8, -0.6);
    addBoxCollider(world, RAPIER, body, ax2, base + 1.9, az2, 3, 2.2, 2.75, h.yaw);
    taken.push([h.x, h.z, 13]);

    // Sypressikuja talolta tielle
    const tx = road.xs[h.roadS], tz = road.zs[h.roadS];
    const dist = Math.hypot(tx - h.x, tz - h.z);
    const dx = (tx - h.x) / dist, dz = (tz - h.z) / dist;
    for (let d = 7; d < dist; d += 6.5) {
      for (const sd of [-3.2, 3.2]) {
        const x = h.x + dx * d - dz * sd, z = h.z + dz * d + dx * sd;
        if (terrain.roadDistanceAt(x, z) < flat + 2.5) continue;
        cypressPts.push([x, z]);
      }
    }
  }

  // --- Torni ----------------------------------------------------------------------
  if (layout.tower) {
    const { x, z } = layout.tower;
    const g = new THREE.Group();
    const base = Math.min(H(x, z), H(x + 3, z + 3), H(x - 3, z - 3), H(x + 3, z - 3), H(x - 3, z + 3)) - 1;
    g.position.set(x, base, z);
    const stone = flatMaterial('#cdb994');
    const add = (geo, mat, px, py, pz) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    };
    const th = 17;
    add(new THREE.BoxGeometry(5, th, 5), stone, 0, th / 2, 0);
    add(new THREE.BoxGeometry(5.8, 0.6, 5.8), stone, 0, th + 0.3, 0);
    for (let i = 0; i < 4; i++) {
      for (const k of [-2, 0, 2]) {
        const a = (i * Math.PI) / 2;
        add(new THREE.BoxGeometry(0.9, 1.1, 0.9), stone, Math.cos(a) * 2.45 - Math.sin(a) * k, th + 1.15, Math.sin(a) * 2.45 + Math.cos(a) * k);
      }
      for (const wy of [6, 11, 14.5]) {
        const a = (i * Math.PI) / 2;
        add(new THREE.BoxGeometry(0.5, 1.4, 0.1).rotateY(-a + Math.PI / 2), darkMat, Math.cos(a) * 2.53, wy, Math.sin(a) * 2.53);
      }
    }
    scene.add(g);
    addBoxCollider(world, RAPIER, body, x, base + th / 2, z, 2.5, th / 2, 2.5);
    taken.push([x, z, 6]);
    for (let i = 0; i < 6; i++) {
      const a = rand() * 6.28, r = 7 + rand() * 6;
      cypressPts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]);
    }
  }

  // --- Sypressirivit tien varressa ja yksittäiset sypressit -------------------
  for (let k = 0; k < (options.cypressRows ?? 4); k++) {
    const s0 = Math.floor(40 + rand() * (road.count - 120));
    const sd = (rand() < 0.5 ? -1 : 1) * (flat + 3.5);
    for (let s = s0; s < s0 + 60 && s < road.count; s += 7) {
      cypressPts.push([road.xs[s] - road.tz[s] * sd, road.zs[s] + road.tx[s] * sd]);
    }
  }
  for (let i = 0; i < 120 && cypressPts.length < 260; i++) {
    const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
    if (terrain.roadDistanceAt(x, z) < flat + 4) continue;
    cypressPts.push([x, z]);
    if (rand() < 0.5) cypressPts.push([x + 3 + rand() * 2, z + rand() * 3]);
  }
  const cypress = new InstanceBatch(new THREE.IcosahedronGeometry(1, 0), flatMaterial('#ffffff'), { tag: 'tree' });
  const cypressTrunk = new InstanceBatch(new THREE.CylinderGeometry(0.15, 0.2, 1.2, 5).translate(0, 0.6, 0), flatMaterial('#6a4e34'), { tag: 'tree' });
  const cypressGreens = ['#2f4d28', '#36552c', '#2a4524', '#3b5a2f'].map((c) => new THREE.Color(c));
  for (const [x, z] of cypressPts) {
    if (!free(x, z, 1)) continue;
    const y = H(x, z);
    const hgt = 3.4 + rand() * 1.6;
    m.compose(p.set(x, y + 0.6 + hgt, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(0.85 + rand() * 0.2, hgt, 0.85 + rand() * 0.2));
    cypress.add(m, col.copy(cypressGreens[(rand() * 4) | 0]));
    m.compose(p.set(x, y - 0.1, z), q.identity(), s.set(1, 1, 1));
    cypressTrunk.add(m);
    addCylinderCollider(world, RAPIER, body, x, y, z, hgt * 1.6, 0.55);
    taken.push([x, z, 1.2]);
  }
  cypress.build(scene);
  cypressTrunk.build(scene);

  // --- Oliivilehdot ja pinjat ---------------------------------------------------
  const oliveTrunk = new InstanceBatch(new THREE.CylinderGeometry(0.18, 0.3, 1.8, 5).translate(0, 0.9, 0), flatMaterial('#6e5c47'), { tag: 'tree' });
  const oliveCrown = new InstanceBatch(new THREE.IcosahedronGeometry(1, 0), flatMaterial('#ffffff'), { tag: 'tree' });
  const oliveGreens = ['#8f9d6b', '#9aa774', '#83925f'].map((c) => new THREE.Color(c));
  let groves = 0;
  for (let attempt = 0; attempt < 400 && groves < (options.groves ?? 5); attempt++) {
    const cx = (rand() * 2 - 1) * limit, cz = (rand() * 2 - 1) * limit;
    const rd = terrain.roadDistanceAt(cx, cz);
    if (rd < 22 || rd > 90 || slopeAt(terrain, cx, cz) > 0.3 || !free(cx, cz, 18)) continue;
    groves++;
    for (let gx = -16; gx <= 16; gx += 7.5) {
      for (let gz = -12; gz <= 12; gz += 7.5) {
        const x = cx + gx + (rand() - 0.5) * 2, z = cz + gz + (rand() - 0.5) * 2;
        if (terrain.roadDistanceAt(x, z) < flat + 3 || !free(x, z, 2)) continue;
        const y = H(x, z);
        const sc = 0.8 + rand() * 0.4;
        m.compose(p.set(x, y - 0.1, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc, sc, sc));
        oliveTrunk.add(m);
        m.compose(p.set(x, y + 2.3 * sc, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(1.9 * sc, 1.3 * sc, 1.9 * sc));
        oliveCrown.add(m, col.copy(oliveGreens[(rand() * 3) | 0]));
        addCylinderCollider(world, RAPIER, body, x, y, z, 2.4, 0.35);
      }
    }
  }
  oliveTrunk.build(scene);
  oliveCrown.build(scene);

  const pineTrunk = new InstanceBatch(new THREE.CylinderGeometry(0.22, 0.32, 1, 6).translate(0, 0.5, 0), flatMaterial('#6b4a33'), { tag: 'tree' });
  const pineCrown = new InstanceBatch(new THREE.IcosahedronGeometry(1, 0), flatMaterial('#ffffff'), { tag: 'tree' });
  for (let i = 0, n = 0; i < 600 && n < (options.pines ?? 28); i++) {
    const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
    const rd = terrain.roadDistanceAt(x, z);
    if (rd < flat + 6 || rd > 70 || !free(x, z, 4)) continue;
    const y = H(x, z);
    const hgt = 7 + rand() * 3;
    m.compose(p.set(x, y - 0.1, z), q.identity(), s.set(1, hgt, 1));
    pineTrunk.add(m);
    m.compose(p.set(x, y + hgt + 0.6, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(3.6 + rand(), 1.1, 3.6 + rand()));
    pineCrown.add(m, col.set('#3f5b2d').multiplyScalar(0.9 + rand() * 0.2));
    addCylinderCollider(world, RAPIER, body, x, y, z, hgt, 0.4);
    taken.push([x, z, 4]);
    n++;
  }
  pineTrunk.build(scene);
  pineCrown.build(scene);

  // --- Heinäpaalit sänkipelloilla -------------------------------------------------
  const bales = new InstanceBatch(new THREE.CylinderGeometry(0.75, 0.75, 1.3, 10).rotateZ(Math.PI / 2), flatMaterial('#d8b55c'));
  for (let i = 0, n = 0; i < 3000 && n < (options.bales ?? 45); i++) {
    const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
    const rd = terrain.roadDistanceAt(x, z);
    if (rd < flat + 6 || rd > 80 || layout.fieldAt(x, z) !== FIELD_STUBBLE || slopeAt(terrain, x, z) > 0.12 || !free(x, z, 1.5)) continue;
    const yaw = rand() * 6.28;
    m.compose(p.set(x, H(x, z) + 0.65, z), q.setFromAxisAngle(UP, yaw), s.set(1, 1, 1));
    bales.add(m);
    addBoxCollider(world, RAPIER, body, x, H(x, z) + 0.7, z, 0.65, 0.7, 0.7, yaw);
    n++;
  }
  bales.build(scene);

  scatterRocks(scene, world, RAPIER, body, terrain, rand, {
    count: options.rocks ?? 50, clear: flat + 3, limit, sizeMax: 1.4,
    colorFn: (r) => new THREE.Color().setHSL(0.1, 0.12, 0.62 + r() * 0.12),
    skip: layout.villageAt,
  });

  if (layout.village) buildVillage({ scene, world, RAPIER, terrain, road, layout, rand, body });
}

// --- Italialainen kylä: talot kujan molemmin puolin ja kirkontorni -------------------
// Talojen etäisyys tien reunasta (m): kapea jalkakäytävä kujan ja seinien välissä
const HOUSE_GAP = [2.2, 3.0];
const PLASTER = ['#e8d3a8', '#d9b27c', '#e6c9a0', '#c98f62', '#efe2c7', '#d7a07a', '#cfae8a', '#e3bfa0'];

function buildVillage({ scene, world, RAPIER, terrain, road, layout, rand, body }) {
  const { s0, s1 } = layout.village;
  const hw = road.halfWidth;
  const H = (x, z) => terrain.heightAt(x, z);
  const roofMat = flatMaterial('#b5532f');
  const darkMat = flatMaterial('#3b2d22');
  const doorMat = flatMaterial('#5a3a22');
  const shutterMats = ['#5d7a4a', '#7a5a3a', '#4f6a7a'].map((c) => flatMaterial(c));
  const plasterMats = PLASTER.map((c) => flatMaterial(c));
  const stoneMat = flatMaterial('#d5c29d');
  const placed = [];   // [x, z, säde]
  const overlaps = (x, z, r) => placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < (pr + r) * 0.82);

  const makeGroup = (x, base, z, yaw) => {
    const g = new THREE.Group();
    g.position.set(x, base, z);
    g.rotation.y = yaw;
    scene.add(g);
    return (geo, mat, px, py, pz) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
    };
  };

  // Talon nurkat tien suhteen: a = tien suunta, r = poispäin tiestä
  const footprintOk = (cx, cz, ax, az, rx, rz, L, D) => {
    for (const [u, v] of [[L / 2, D / 2], [-L / 2, D / 2], [L / 2, -D / 2], [-L / 2, -D / 2], [0, -D / 2]]) {
      const x = cx + ax * u + rx * v, z = cz + az * u + rz * v;
      if (terrain.roadDistanceAt(x, z) < hw + HOUSE_GAP[0] - 0.3) return false;
    }
    return true;
  };

  // --- Kirkontorni kylän keskivaiheille ---
  {
    const sm = Math.round((s0 + s1) / 2);
    const side = rand() < 0.5 ? -1 : 1;
    const rx = -road.tz[sm] * side, rz = road.tx[sm] * side;
    for (let off = hw + 5; off < hw + 14; off += 1) {
      const x = road.xs[sm] + rx * off, z = road.zs[sm] + rz * off;
      if (terrain.roadDistanceAt(x, z) < hw + 4.6) continue;
      const base = Math.min(H(x + 2, z + 2), H(x - 2, z - 2), H(x + 2, z - 2), H(x - 2, z + 2)) - 0.5;
      const th = 19;
      const add = makeGroup(x, base, z, Math.atan2(-road.tz[sm], road.tx[sm]));
      add(new THREE.BoxGeometry(4.6, th, 4.6), stoneMat, 0, th / 2, 0);
      add(new THREE.ConeGeometry(3.5, 3.4, 4).rotateY(Math.PI / 4), roofMat, 0, th + 1.7, 0);
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        add(new THREE.BoxGeometry(1.2, 2.2, 0.12).rotateY(-a + Math.PI / 2), darkMat, Math.cos(a) * 2.33, th - 2.4, Math.sin(a) * 2.33);
      }
      addBoxCollider(world, RAPIER, body, x, base + th / 2, z, 2.3, th / 2, 2.3, Math.atan2(-road.tz[sm], road.tx[sm]));
      placed.push([x, z, 3.6]);
      break;
    }
  }

  // --- Talorivit kujan molemmin puolin ---
  for (const side of [-1, 1]) {
    let s = s0;
    while (s < s1) {
      const L = 6 + rand() * 5;
      const D = 7 + rand() * 3;
      const floors = 2 + Math.floor(rand() * 2);
      const Hh = floors * 3.1;
      const sc = Math.min(road.count - 1, s + Math.round(L / 2 / road.spacing));
      if (sc > s1) break;
      const ax = road.tx[sc], az = road.tz[sc];
      const rx = -az * side, rz = ax * side;
      const setback = hw + HOUSE_GAP[0] + rand() * (HOUSE_GAP[1] - HOUSE_GAP[0]);
      const cx = road.xs[sc] + rx * (setback + D / 2), cz = road.zs[sc] + rz * (setback + D / 2);
      const rad = Math.hypot(L, D) / 2;
      if (!footprintOk(cx, cz, ax, az, rx, rz, L, D) || overlaps(cx, cz, rad)) {
        s += Math.max(1, Math.round(2.5 / road.spacing));
        continue;
      }
      const yaw = Math.atan2(-az, ax);       // paikallinen x = tien suunta, z = tien oikea puoli
      const face = -side;                     // tienpuoleinen seinä paikallisessa z-suunnassa
      let base = Infinity;
      for (const [u, v] of [[L / 2, D / 2], [-L / 2, D / 2], [L / 2, -D / 2], [-L / 2, -D / 2]]) {
        base = Math.min(base, H(cx + ax * u + rx * v, cz + az * u + rz * v));
      }
      base -= 0.5;
      const add = makeGroup(cx, base, cz, yaw);
      const wall = plasterMats[(rand() * plasterMats.length) | 0];
      const shutter = shutterMats[(rand() * shutterMats.length) | 0];
      const totalH = Hh + 0.5;
      add(new THREE.BoxGeometry(L, totalH, D), wall, 0, totalH / 2, 0);
      if (rand() < 0.6) {
        add(gableRoofGeometry(L, 1.5, D, 0.35), roofMat, 0, totalH + 0.75, 0);
      } else {
        add(new THREE.BoxGeometry(L + 0.3, 0.35, D + 0.3), wall, 0, totalH + 0.17, 0);   // räystäslista
        add(new THREE.BoxGeometry(L * 0.5, 0.9, D * 0.45), roofMat, L * 0.15, totalH + 0.6, 0);
      }
      const fz = face * (D / 2 + 0.03);
      const nWin = Math.max(1, Math.floor((L - 1.2) / 2.3));
      for (let f = 0; f < floors; f++) {
        for (let w = 0; w < nWin; w++) {
          const wx = -L / 2 + 1.2 + (w + 0.5) * ((L - 2.4) / nWin);
          const wy = 0.5 + f * 3.1 + 1.6;
          if (f === 0 && w === 0) {
            add(new THREE.BoxGeometry(1.1, 2.2, 0.1), doorMat, wx, 0.5 + 1.1, fz);
            continue;
          }
          add(new THREE.BoxGeometry(0.75, 1.15, 0.1), darkMat, wx, wy, fz);
          add(new THREE.BoxGeometry(0.3, 1.2, 0.12), shutter, wx - 0.55, wy, fz);
          add(new THREE.BoxGeometry(0.3, 1.2, 0.12), shutter, wx + 0.55, wy, fz);
        }
      }
      addBoxCollider(world, RAPIER, body, cx, base + totalH / 2, cz, L / 2, totalH / 2, D / 2, yaw);
      placed.push([cx, cz, rad]);
      s += Math.max(1, Math.round((L + 0.4 + rand() * 1.2) / road.spacing));
    }
  }
}
