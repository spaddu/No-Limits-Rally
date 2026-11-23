// Skotlannin ylämaa: loivat nummet, kanerva ja ruohotupsut, yksittäiset vaivaiskoivut,
// paljon pieniä kiviä ja kivikasoja, osittain sortuneet kiviaidat tien varrella.
//   Loch Ness:   järvi (terrain.lake + env.sea), linnan rauniot rannalla, kivimökit
//   Fort William: sola korkeiden kukkuloiden välissä, ylempänä karumpaa kalliota
//   Skelwick:    puuton tuulinen rannikko, kylä kivi- ja puutaloineen
//
// scenery-asetukset (tracks.js):
//   heather, grass, gorse, birches, rocks, pebbles, cairns, outcrops: määrät
//   walls       kiviaitojen määrä tien varrella      fieldWalls  irrallisia aitoja nummella
//   houses      [{ at, side }]: kivimökit (at = m tien alusta, side 1 = oikealla, -1 = vasemmalla)
//   castle      { at, side, off }: linnan rauniot (off = keskipisteen etäisyys tiestä)
//   village     { from, to }: kylä tien varrella (kivi- ja puutaloja)
//   bare        korkeus (m), jonka yläpuolella kasvillisuus harvenee ja kalliota on enemmän
//   wind        0…1: tuulen piiskaama ruoho (vaaleampi ja matalampi, Skelwick)
//   rocky       0…1: kalliopintalaikkujen määrä
//   crofts      [{ at, side, off, wooden, size }]: mökit luonnolliselle maalle (ei tasannetta)
//   roadBirches koivuja tien varrelle     pines  kotimäntyjä     woodland { count, maxAbove }: rantametsä
//   sheep, cattle (ylämaankarja), deer: laumojen määrä     folds: pyöreät kiviset lammastarhat
//   nessie { x, z, yaw }: Loch Nessin hirviö     jetties [{ at, side }]: laituri ja soutuvene
//   viaduct { at, height, span }: kaarisilta tien yli (höyryjunineen)
//   lighthouse { x, z }: majakka     stoneCircle { x, z }: pystykivikehä     boats: veneitä rannalla

import * as THREE from 'three';
import { createNoise2D, smoothstep } from './noise.js';
import {
  UP, slopeAt, flatMaterial, InstanceBatch, addCylinderCollider, addBoxCollider, scatterRocks, gableRoofGeometry,
} from './sceneryKit.js';

const STONE = ['#8f8a80', '#7d786f', '#9b968b', '#858076', '#a39e92', '#6f6b63'].map((c) => new THREE.Color(c));
const HOUSE_OFFSET = 17;   // mökin keskipiste tien keskilinjasta (m)

/** Kehys tien kohdassa: u = tien suuntaan, v = poispäin tiestä (side-puolelle). */
function frameAt(road, at, side = 1) {
  const s = Math.min(road.count - 1, Math.max(0, Math.round(at / road.spacing)));
  const yaw = Math.atan2(-road.tz[s], road.tx[s]) + (side < 0 ? Math.PI : 0);
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const ox = road.xs[s], oz = road.zs[s];
  return {
    s, side, yaw, ox, oz, roadH: road.hs[s],
    world: (u, v) => [ox + c * u + sn * v, oz - sn * u + c * v],
    local: (x, z) => { const dx = x - ox, dz = z - oz; return [c * dx - sn * dz, sn * dx + c * dz]; },
  };
}

/** Veden pinta radalla (järvi tai meri) tai -Infinity. */
const waterLevel = (track) => track?.env?.sea?.level ?? -Infinity;

/** Tasanteet mökeille ja linnalle (heightmap.js:n buildHeightfield). */
export function scotlandPads(road, options, naturalHeight, track) {
  const pads = [];
  for (const h of options.houses ?? []) {
    const fr = frameAt(road, h.at, h.side);
    const [x, z] = fr.world(0, HOUSE_OFFSET);
    let sum = 0, n = 0;
    for (let u = -6; u <= 6; u += 2) for (let v = -5; v <= 5; v += 2) { sum += naturalHeight(...fr.world(u, HOUSE_OFFSET + v)); n++; }
    pads.push({ x, z, r: 9, falloff: 7, h: Math.max(sum / n * 0.5 + (fr.roadH + 0.4) * 0.5, waterLevel(track) + 1.5) });
  }
  const C = options.castle;
  if (C) {
    // Linna rannan niemekkeellä: tasanne nousee vedestä (tekee niemen järveen)
    const fr = frameAt(road, C.at, C.side);
    const [x, z] = fr.world(0, C.off ?? 32);
    pads.push({ x, z, r: C.r ?? 17, falloff: 11, h: Math.max(waterLevel(track) + 2.6, Math.min(fr.roadH - 1.5, naturalHeight(x, z) + 3)) });
  }
  return pads;
}

export function planScotland(terrain, road, options, rand, track) {
  const level = waterLevel(track);
  const houses = (options.houses ?? []).map((h) => frameAt(road, h.at, h.side));
  const castle = options.castle ? frameAt(road, options.castle.at, options.castle.side) : null;
  let village = null;
  if (options.village) {
    const s0 = Math.max(0, Math.round(options.village.from / road.spacing));
    const s1 = Math.min(road.count - 1, Math.round(options.village.to / road.spacing));
    village = { s0, s1 };
  }
  const villageAt = village
    ? (x, z) => {
      for (let s = village.s0; s <= village.s1; s += 3) {
        if ((road.xs[s] - x) ** 2 + (road.zs[s] - z) ** 2 < 32 * 32) return true;
      }
      return false;
    }
    : () => false;
  /** Pihat: kulunut ruoho mökkien ympärillä. */
  const yardAt = (x, z) => {
    for (const fr of houses) {
      const [u, v] = fr.local(x, z);
      if (Math.abs(u) < 2 && v > 0 && v < HOUSE_OFFSET - 3) return 2;   // polku tieltä ovelle
      if (Math.hypot(u, v - HOUSE_OFFSET) < 10) return 1;
    }
    return 0;
  };
  return {
    level, houses, castle, village, villageAt, yardAt,
    bare: options.bare ?? 1e6, wind: options.wind ?? 0, rocky: options.rocky ?? 0.3, seaType: track?.env?.sea?.name ?? null,
  };
}

export function scotlandColorFn(layout) {
  const patch = createNoise2D(4141);
  const heath = createNoise2D(4242);
  const rockN = createNoise2D(4343);
  const level = layout.level;
  const { bare, wind, rocky } = layout;
  const cGrassA = new THREE.Color('#6c7a3c');
  const cGrassB = new THREE.Color('#566733');
  const cWindy = new THREE.Color('#8a9152');
  const cDryGrass = new THREE.Color('#8c874a');
  const cDarkGrass = new THREE.Color('#455628');
  const cHeather = new THREE.Color('#6e604c');
  const cHeatherBloom = new THREE.Color('#735f66');
  const cPeat = new THREE.Color('#5c4c3b');
  const cBog = new THREE.Color('#566a38');
  const cRock = new THREE.Color('#8d8a83');
  const cScree = new THREE.Color('#9d998f');
  const cShingle = new THREE.Color('#857f73');
  const cWetRock = new THREE.Color('#5e5b54');
  const cLakeBed = new THREE.Color('#3d3a2c');
  const cSeaBed = new THREE.Color('#40504f');
  const cDeep = new THREE.Color('#1e2c31');
  const cVerge = new THREE.Color('#8b8273');
  const cYard = new THREE.Color('#7e8a4e');
  const cPath = new THREE.Color('#8a7f6a');
  const cVillage = new THREE.Color('#8f8a78');
  const tmp = new THREE.Color();
  const isSea = layout.seaType === 'sea';
  return (col, t) => {
    const h = t.h - level;   // korkeus vedenpinnasta (ilman vettä: absoluuttinen)
    if (h < 0.05) {
      // Järven pohja turvetta, meren pohja kiveä; syvemmällä tummaa
      col.copy(isSea ? cSeaBed : cLakeBed).lerp(cDeep, smoothstep(0.5, 6, -h));
    } else {
      const n = patch(t.x * 0.025, t.z * 0.025) * 0.5 + 0.5;
      const hn = heath(t.x * 0.012, t.z * 0.012) * 0.5 + 0.5;
      col.copy(cGrassA).lerp(cGrassB, n);
      // Isot vyöhykkeet: kuivaa vaaleaa ja tummaa märkää ruohoa
      const zone = patch(t.x * 0.007 + 31, t.z * 0.007 - 17);
      col.lerp(cDryGrass, smoothstep(0.1, 0.5, zone) * 0.6);
      col.lerp(cDarkGrass, smoothstep(-0.15, -0.5, zone) * 0.55);
      col.lerp(cWindy, wind * (0.3 + n * 0.4));
      // Kanervalaikut ja turvekohdat
      col.lerp(tmp.copy(cHeather).lerp(cHeatherBloom, n * 0.7), smoothstep(0.55, 0.78, hn) * 0.75 * (1 - wind * 0.6));
      col.lerp(cPeat, smoothstep(0.82, 0.95, hn) * 0.6);
      // Kostea painanne järven ja meren lähellä
      col.lerp(cBog, smoothstep(6, 2, h) * 0.5);
      // Kalliopintalaikut (Skelwickissä eniten), rinteet ja ylängöt kalliota ja louhikkoa
      const rp = rockN(t.x * 0.035, t.z * 0.035) * 0.7 + rockN(t.x * 0.11, t.z * 0.11) * 0.3;
      col.lerp(cRock, smoothstep(0.12, 0.32, rp) * rocky * 0.9);
      col.lerp(cRock, smoothstep(0.86, 0.7, t.slope));
      col.lerp(cScree, smoothstep(bare, bare + 22, t.h) * (0.35 + n * 0.4));
      // Rantakivikko ja märkä kivi vesirajassa
      if (level > -Infinity) {
        col.lerp(cShingle, smoothstep(2.6, 1.2, h));
        col.lerp(cWetRock, smoothstep(0.6, 0.15, h));
      }
      const yard = layout.yardAt(t.x, t.z);
      if (yard === 1) col.lerp(cYard, 0.5);
      if (yard === 2) col.lerp(cPath, 0.75);
      if (layout.villageAt(t.x, t.z)) col.lerp(cVillage, 0.35);
    }
    col.lerp(cVerge, smoothstep(t.flat + 0.8, t.flat - 0.4, t.rd));
    col.multiplyScalar(0.93 + t.rand() * 0.12);
  };
}

export function buildScotland({ scene, world, RAPIER, terrain, road, layout, rand, options = {} }) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const flat = road.halfWidth + road.shoulder;
  const limit = terrain.half * 0.94;
  const level = layout.level;
  const bare = options.bare ?? 1e6;
  const wind = options.wind ?? 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const e = new THREE.Euler();
  const col = new THREE.Color();
  const taken = [];
  const free = (x, z, r) => !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r);
  const H = (x, z) => terrain.heightAt(x, z);
  const dry = (x, z, margin = 0.6) => H(x, z) > level + margin;
  /** Kasvillisuuden tiheys korkeuden mukaan: ylängöllä harvempaa. */
  const growth = (h) => 1 - smoothstep(bare, bare + 25, h) * 0.85;
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // --- Rakennukset ensin, jotta muut väistävät ------------------------------------------
  for (const fr of layout.houses) {
    const [x, z] = fr.world(0, HOUSE_OFFSET);
    buildCottage({ scene, world, RAPIER, body, terrain, x, z, yaw: fr.yaw, rand, wooden: false });
    taken.push([x, z, 9]);
  }
  if (layout.castle) {
    const C = options.castle;
    const [x, z] = layout.castle.world(0, C.off ?? 32);
    buildCastleRuins({ scene, world, RAPIER, body, terrain, x, z, yaw: layout.castle.yaw, rand });
    taken.push([x, z, 24]);
  }
  if (layout.village) buildVillage({ scene, world, RAPIER, body, terrain, road, layout, rand, taken });
  // Mökit luonnolliselle maalle (ei tasannetta: maaston muoto ei muutu)
  for (const c of options.crofts ?? []) {
    const fr = frameAt(road, c.at, c.side);
    // Etsitään luonnostaan tasainen kohta (maastoa ei muokata): kulmien korkeusero pieni
    let spot = null;
    for (const dv of [0, 5, 10, 15, 20, 26]) for (const du of [0, -8, 8, -16, 16]) {
      if (spot) break;
      const [x, z] = fr.world((c.u ?? 0) + du, (c.off ?? 18) + dv);
      if (!free(x, z, 8) || !dry(x, z, 1.5) || terrain.roadDistanceAt(x, z) < flat + 7) continue;
      let lo = Infinity, hi = -Infinity;
      for (const [a, b] of [[-6, -4], [6, -4], [-6, 4], [6, 4]]) {
        const [px, pz] = fr.world((c.u ?? 0) + du + a, (c.off ?? 18) + dv + b);
        const hh = terrain.heightAt(px, pz); lo = Math.min(lo, hh); hi = Math.max(hi, hh);
      }
      if (hi - lo < 1.6 * (c.size ?? 1)) spot = [x, z];
    }
    if (!spot) continue;
    const [x, z] = spot;
    buildCottage({ scene, world, RAPIER, body, terrain, x, z, yaw: fr.yaw, rand, wooden: !!c.wooden, size: c.size ?? 1 });
    taken.push([x, z, 9 * (c.size ?? 1)]);
  }
  const ctx = { scene, world, RAPIER, body, terrain, road, layout, rand, taken, free, flat };
  if (options.viaduct) buildViaduct(ctx, options.viaduct);
  if (options.lighthouse) buildLighthouse(ctx, options.lighthouse);
  if (options.stoneCircle) buildStoneCircle(ctx, options.stoneCircle);
  if (options.nessie) buildNessie(ctx, options.nessie);
  for (const j of options.jetties ?? []) buildJetty(ctx, j);
  if (options.boats) placeBoats(ctx, options.boats);

  // --- Kiviaidat tien varrella: osittain sortuneita, välissä aukkoja ------------------------
  const wallStones = new InstanceBatch(new THREE.DodecahedronGeometry(1, 0), flatMaterial('#ffffff'));
  /** Aita pisteestä a pisteeseen b (maailman koordinaateissa), korkeus 0.6–1.1 m. */
  const wall = (ax, az, bx, bz, broken = 0.25) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 2) return;
    const dx = (bx - ax) / len, dz = (bz - az) / len;
    const yaw = Math.atan2(-dz, dx);
    let segStart = null;
    let segH = 0;
    const flush = (endT) => {
      if (segStart === null) return;
      const midT = (segStart + endT) / 2, half = (endT - segStart) / 2;
      if (half > 0.6) {
        const cx = ax + dx * midT, cz = az + dz * midT;
        addBoxCollider(world, RAPIER, body, cx, H(cx, cz) + segH / 2, cz, half, segH / 2 + 0.2, 0.45, yaw);
      }
      segStart = null;
    };
    let t = 0;
    let gap = 0, low = 0;
    while (t < len) {
      const x = ax + dx * t, z = az + dz * t;
      // Satunnaiset aukot ja sortuneet kohdat
      if (gap <= 0 && rand() < broken * 0.05) gap = 2 + rand() * 5;
      if (low <= 0 && rand() < broken * 0.08) low = 2 + rand() * 4;
      const tooClose = terrain.roadDistanceAt(x, z) < flat + 1.5 || !dry(x, z, 0.4);
      if (gap > 0 || tooClose) {
        flush(t);
        // Sortuneen kohdan kivet maassa
        if (gap > 0 && !tooClose && rand() < 0.5) {
          const sz = 0.22 + rand() * 0.2;
          m.compose(p.set(x + (rand() - 0.5) * 1.5, H(x, z) + sz * 0.2, z + (rand() - 0.5) * 1.5),
            q.setFromEuler(e.set(rand(), rand() * 6.28, rand())), s.set(sz * 1.3, sz * 0.7, sz));
          wallStones.add(m, col.copy(pick(STONE)).multiplyScalar(0.85 + rand() * 0.2));
        }
        gap -= 0.55; low -= 0.55; t += 0.55;
        continue;
      }
      const hgt = (low > 0 ? 0.35 + rand() * 0.25 : 0.75 + rand() * 0.3);
      if (segStart === null) { segStart = t; segH = hgt; } else segH = Math.max(segH, hgt);
      const g = H(x, z);
      // Kivikerrokset: alimmat isompia
      for (let y = 0; y < hgt;) {
        const sz = (y < 0.3 ? 0.3 : 0.22) + rand() * 0.12;
        m.compose(p.set(x + (rand() - 0.5) * 0.18, g + y + sz * 0.45, z + (rand() - 0.5) * 0.18),
          q.setFromEuler(e.set((rand() - 0.5) * 0.4, yaw + (rand() - 0.5) * 0.5, (rand() - 0.5) * 0.4)),
          s.set(sz * 1.5, sz * 0.75, sz * 1.15));
        wallStones.add(m, col.copy(pick(STONE)).multiplyScalar(0.8 + rand() * 0.25));
        y += sz * 0.85;
      }
      gap -= 0.55; low -= 0.55; t += 0.55;
    }
    flush(len);
  };
  // Tienvarren aidat: kulkevat tien suuntaisesti 7–11 m päässä
  const nWalls = options.walls ?? 0;
  for (let attempt = 0, placed = 0; attempt < nWalls * 20 && placed < nWalls; attempt++) {
    const k0 = Math.floor(rand() * (road.count - 80));
    const L = 25 + rand() * 60;
    const side = rand() < 0.5 ? -1 : 1;
    const off = flat + 4 + rand() * 4;
    const k1 = Math.min(road.count - 1, k0 + Math.round(L / road.spacing));
    // Ei kylän tai rakennusten kohdalle
    const mid = Math.round((k0 + k1) / 2);
    if (!free(road.xs[mid] - road.tz[mid] * off * side, road.zs[mid] + road.tx[mid] * off * side, 10)) continue;
    const pts = [];
    for (let k = k0; k <= k1; k += 4) pts.push([road.xs[k] - road.tz[k] * off * side, road.zs[k] + road.tx[k] * off * side]);
    for (let i = 0; i < pts.length - 1; i++) wall(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 0.3);
    taken.push([road.xs[mid] - road.tz[mid] * off * side, road.zs[mid] + road.tx[mid] * off * side, 4]);
    placed++;
  }
  // Irralliset aidat nummella: vanhoja lammashakojen rajoja
  const nField = options.fieldWalls ?? 0;
  for (let attempt = 0, placed = 0; attempt < nField * 30 && placed < nField; attempt++) {
    const x = (rand() * 2 - 1) * limit * 0.9, z = (rand() * 2 - 1) * limit * 0.9;
    const a = rand() * Math.PI, L = 35 + rand() * 60;
    const bx = x + Math.cos(a) * L, bz = z + Math.sin(a) * L;
    const rdA = terrain.roadDistanceAt(x, z), rdB = terrain.roadDistanceAt(bx, bz);
    if (rdA < 25 || rdB < 25 || rdA > 140 || !dry(x, z) || !dry(bx, bz) || !free((x + bx) / 2, (z + bz) / 2, L / 2)) continue;
    wall(x, z, bx, bz, 0.5);
    placed++;
  }
  // Pyöreät kiviset lammastarhat (sheepfold) nummella
  const nFolds = options.folds ?? 0;
  for (let attempt = 0, placed = 0; attempt < nFolds * 40 && placed < nFolds; attempt++) {
    const x = (rand() * 2 - 1) * limit * 0.85, z = (rand() * 2 - 1) * limit * 0.85, R = 6 + rand() * 4;
    const rd = terrain.roadDistanceAt(x, z);
    if (rd < flat + R + 8 || rd > 90 || !dry(x, z, 1) || slopeAt(terrain, x, z) > 0.2 || !free(x, z, R + 2)) continue;
    const n = 14, gapAt = Math.floor(rand() * n);
    for (let k = 0; k < n; k++) {
      if (k === gapAt) continue;   // portti
      const a0 = (k / n) * 6.283, a1 = ((k + 1) / n) * 6.283;
      wall(x + Math.cos(a0) * R, z + Math.sin(a0) * R, x + Math.cos(a1) * R, z + Math.sin(a1) * R, 0.1);
    }
    taken.push([x, z, R + 1]);
    placed++;
  }
  wallStones.build(scene);

  // --- Kivikasat (cairns) ja kallioleikkaukset --------------------------------------------
  const stones = new InstanceBatch(new THREE.DodecahedronGeometry(1, 0), flatMaterial('#ffffff'));
  const nCairns = options.cairns ?? 0;
  for (let attempt = 0, placed = 0; attempt < nCairns * 30 && placed < nCairns; attempt++) {
    const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
    const rd = terrain.roadDistanceAt(x, z);
    if (rd < flat + 4 || rd > 120 || !dry(x, z, 1) || slopeAt(terrain, x, z) > 0.35 || !free(x, z, 2)) continue;
    const g = H(x, z), R = 0.7 + rand() * 0.7, ht = 0.6 + rand() * 1.0;
    // Leveä pohja, kapeneva keko
    for (let y = 0, r = R; y < ht; y += 0.28, r *= 0.78) {
      const n = Math.max(1, Math.round(r * 5));
      for (let k = 0; k < n; k++) {
        const a = (k / n) * 6.28 + rand() * 0.5, sz = 0.2 + rand() * 0.18;
        m.compose(p.set(x + Math.cos(a) * r * 0.75, g + y + sz * 0.4, z + Math.sin(a) * r * 0.75),
          q.setFromEuler(e.set(rand(), rand() * 6.28, rand())), s.set(sz * 1.2, sz * 0.8, sz));
        stones.add(m, col.copy(pick(STONE)).multiplyScalar(0.85 + rand() * 0.25));
      }
    }
    addCylinderCollider(world, RAPIER, body, x, g - 0.2, z, ht + 0.2, R * 0.85);
    taken.push([x, z, R + 0.5]);
    placed++;
  }
  // Kallioleikkaukset: isoja, maahan painuneita laakeita kivilaattoja
  const nOut = options.outcrops ?? 0;
  const tmpV = new THREE.Vector3();
  const dodPos = new THREE.DodecahedronGeometry(1, 0).getAttribute('position');
  for (let attempt = 0, placed = 0; attempt < nOut * 30 && placed < nOut; attempt++) {
    const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
    const sz = 2 + rand() * 4;
    if (terrain.roadDistanceAt(x, z) < flat + sz + 2 || !dry(x, z, 1) || !free(x, z, sz)) continue;
    const g = H(x, z);
    s.set(sz * (1 + rand() * 0.6), sz * (0.35 + rand() * 0.25), sz * (0.8 + rand() * 0.5));
    m.compose(p.set(x, g - s.y * 0.45, z), q.setFromEuler(e.set((rand() - 0.5) * 0.3, rand() * 6.28, (rand() - 0.5) * 0.3)), s);
    stones.add(m, col.copy(pick(STONE)).multiplyScalar(0.8 + rand() * 0.2));
    const pts = new Float32Array(dodPos.count * 3);
    for (let k = 0; k < dodPos.count; k++) {
      tmpV.fromBufferAttribute(dodPos, k).applyMatrix4(m);
      pts[k * 3] = tmpV.x; pts[k * 3 + 1] = tmpV.y; pts[k * 3 + 2] = tmpV.z;
    }
    const desc = RAPIER.ColliderDesc.convexHull(pts);
    if (desc) world.createCollider(desc.setFriction(0.8), body);
    taken.push([x, z, sz]);
    placed++;
  }
  stones.build(scene);

  // --- Puut: vaivaiskoivut, isot koivut ja kotimännyt ------------------------------------
  {
    const trunk = new InstanceBatch(new THREE.CylinderGeometry(0.07, 0.13, 1, 5).translate(0, 0.5, 0), flatMaterial('#d6d1c4'));
    const pineTrunk = new InstanceBatch(new THREE.CylinderGeometry(0.16, 0.3, 1, 6).translate(0, 0.5, 0), flatMaterial('#8a5a3c'));
    const crown = new InstanceBatch(new THREE.IcosahedronGeometry(1, 0), flatMaterial('#ffffff'));
    const leaf = ['#7f9a45', '#93ad55', '#6f8a3a', '#a7a84e', '#86a04a'].map((c) => new THREE.Color(c));
    const pineLeaf = ['#2f4a2a', '#3a5a32', '#2a4426', '#40603a'].map((c) => new THREE.Color(c));
    const clump = createNoise2D(7373);
    const dwarfBirch = (x, z, g) => {
      const ht = 1.8 + rand() * 2.4, lean = (rand() - 0.5) * 0.35, dir = rand() * 6.28;
      q.setFromEuler(e.set(Math.sin(dir) * lean, 0, Math.cos(dir) * lean));
      m.compose(p.set(x, g - 0.1, z), q, s.set(1, ht, 1));
      trunk.add(m);
      const top = new THREE.Vector3(0, ht, 0).applyQuaternion(q);
      const c = pick(leaf);
      for (let k = 0; k < 3; k++) {
        const cs = 0.6 + rand() * 0.6;
        m.compose(p.set(x + top.x + (rand() - 0.5) * 1.1, g + top.y * (0.65 + rand() * 0.35), z + top.z + (rand() - 0.5) * 1.1),
          q.setFromEuler(e.set(rand(), rand() * 6.28, rand())), s.set(cs * 1.2, cs * 0.8, cs));
        crown.add(m, col.copy(c).multiplyScalar(0.85 + rand() * 0.3));
      }
      addCylinderCollider(world, RAPIER, body, x, g - 0.1, z, ht * 0.8, 0.14);
    };
    const bigBirch = (x, z, g) => {
      const ht = 6 + rand() * 5, sc = 1.6 + rand() * 0.8;
      m.compose(p.set(x, g - 0.2, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc, ht, sc));
      trunk.add(m);
      const c = pick(leaf);
      for (let k = 0; k < 6; k++) {
        const a = rand() * 6.28, r = rand() * 1.6, cs = 1.1 + rand() * 1.0;
        m.compose(p.set(x + Math.cos(a) * r, g + ht * (0.55 + rand() * 0.45), z + Math.sin(a) * r),
          q.setFromEuler(e.set(rand(), rand() * 6.28, rand())), s.set(cs, cs * 1.3, cs));
        crown.add(m, col.copy(c).multiplyScalar(0.85 + rand() * 0.3));
      }
      addCylinderCollider(world, RAPIER, body, x, g - 0.2, z, ht * 0.7, 0.2);
    };
    const pine = (x, z, g) => {
      const ht = 8 + rand() * 7;
      m.compose(p.set(x, g - 0.2, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(1, ht, 1));
      pineTrunk.add(m);
      const c = pick(pineLeaf);
      // Kotimännyn laakea latvus: muutama litteä pilvi korkealla
      for (let k = 0; k < 4; k++) {
        const a = rand() * 6.28, r = 0.6 + rand() * 1.8, cs = 1.3 + rand() * 1.1;
        m.compose(p.set(x + Math.cos(a) * r, g + ht * (0.72 + rand() * 0.3), z + Math.sin(a) * r),
          q.setFromEuler(e.set(rand() * 0.3, rand() * 6.28, rand() * 0.3)), s.set(cs * 1.4, cs * 0.55, cs * 1.3));
        crown.add(m, col.copy(c).multiplyScalar(0.85 + rand() * 0.3));
      }
      addCylinderCollider(world, RAPIER, body, x, g - 0.2, z, ht * 0.7, 0.3);
    };
    /** Yleinen sijoittelu: test(x, z, g) palauttaa true, jos paikka kelpaa. */
    const uniform = () => [(rand() * 2 - 1) * limit, (rand() * 2 - 1) * limit];
    const scatter = (count, test, make, radius = 1.2, sample = uniform) => {
      for (let attempt = 0, placed = 0; attempt < count * 40 && placed < count; attempt++) {
        const [x, z] = sample();
        const g = H(x, z);
        if (!dry(x, z, 1.2) || !test(x, z, g)) continue;
        if (terrain.roadDistanceAt(x, z) < flat + 3 || slopeAt(terrain, x, z) > 0.5 || layout.villageAt(x, z) || !free(x, z, radius)) continue;
        make(x, z, g);
        taken.push([x, z, radius]);
        placed++;
      }
    };
    const clumpAt = (x, z) => clump(x * 0.01, z * 0.01) * 0.5 + 0.5;
    // Vaivaiskoivut nummella
    scatter(options.birches ?? 0, (x, z, g) => rand() < growth(g) * (0.25 + clumpAt(x, z) * 0.9), dwarfBirch);
    // Koivuja tien varrelle
    scatter(options.roadBirches ?? 0, (x, z) => { const rd = terrain.roadDistanceAt(x, z); return rd > flat + 4 && rd < flat + 18; },
      (x, z, g) => (rand() < 0.35 ? bigBirch(x, z, g) : dwarfBirch(x, z, g)));
    // Kotimännyt ryhmissä
    scatter(options.pines ?? 0, (x, z, g) => rand() < growth(g) * clumpAt(x + 300, z) * 1.3, pine, 1.8);
    // Rantametsä (Loch Ness): rannalta rinteeseen, tiheästi
    const W = options.woodland;
    if (W) {
      scatter(W.count, (x, z, g) => {
        const above = g - level;
        return above < (W.maxAbove ?? 12) && rand() < 0.35 + clumpAt(x, z) * 0.9;
      }, (x, z, g) => { const r = rand(); if (r < 0.45) bigBirch(x, z, g); else if (r < 0.75) pine(x, z, g); else dwarfBirch(x, z, g); }, 1.6);
      // Tien ja rannan välinen kaistale: näytteet tien varresta, jotta metsä näkyy ajaessa
      const nearRoad = () => {
        const k = Math.floor(rand() * road.count), v = (flat + 4 + rand() * 60) * (rand() < 0.5 ? -1 : 1);
        return [road.xs[k] - road.tz[k] * v, road.zs[k] + road.tx[k] * v];
      };
      scatter(W.nearRoad ?? 0, (x, z, g) => g - level < (W.maxAbove ?? 12) && rand() < 0.4 + clumpAt(x, z) * 0.8,
        (x, z, g) => { const r = rand(); if (r < 0.5) bigBirch(x, z, g); else if (r < 0.7) pine(x, z, g); else dwarfBirch(x, z, g); }, 1.8, nearRoad);
    }
    trunk.build(scene);
    pineTrunk.build(scene);
    crown.build(scene);
  }

  // --- Eläimet: lampaat, ylämaankarja ja punahirvet (ei törmäyksiä) --------------------------
  placeAnimals({ scene, terrain, rand, limit, flat, layout, free, dry, taken }, options);

  // --- Kanerva, piikkiherne ja ruohotupsut (ei törmäyksiä) ---------------------------------
  {
    const bush = new InstanceBatch(new THREE.IcosahedronGeometry(1, 0), flatMaterial('#ffffff'), { castShadow: false });
    const tuft = new InstanceBatch(new THREE.ConeGeometry(0.35, 1, 4).translate(0, 0.5, 0), flatMaterial('#ffffff'), { castShadow: false });
    const heatherCol = ['#5f5a3e', '#6b5a48', '#6e5664', '#556040', '#5c4f3e', '#4f5a38'].map((c) => new THREE.Color(c));
    const gorseCol = ['#5b6b2c', '#6a7432', '#b8a032', '#c9ad3a'].map((c) => new THREE.Color(c));
    const grassCol = ['#a7a46a', '#8e9156', '#b8ad74', '#9a9a5e'].map((c) => new THREE.Color(c));
    const place = (count, minRd, fn) => {
      for (let attempt = 0, placed = 0; attempt < count * 6 && placed < count; attempt++) {
        const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
        const g = H(x, z);
        if (!dry(x, z, 0.8) || rand() > growth(g)) continue;
        if (terrain.roadDistanceAt(x, z) < minRd || layout.villageAt(x, z) || !free(x, z, 0.4)) continue;
        fn(x, g, z);
        placed++;
      }
    };
    place(options.heather ?? 0, flat + 1, (x, g, z) => {
      const sc = 0.25 + rand() * 0.4;
      m.compose(p.set(x, g + sc * 0.05, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc * 1.3, sc * 0.5, sc * 1.15));
      bush.add(m, col.copy(pick(heatherCol)).multiplyScalar(0.9 + rand() * 0.25));
    });
    place(options.gorse ?? 0, flat + 2, (x, g, z) => {
      const sc = 0.5 + rand() * 0.6;
      m.compose(p.set(x, g + sc * 0.3, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc * 1.2, sc * 0.9, sc * 1.1));
      bush.add(m, col.copy(pick(gorseCol)).multiplyScalar(0.9 + rand() * 0.2));
    });
    place(options.grass ?? 0, flat + 0.8, (x, g, z) => {
      // Tupsu: muutama kapea kartio, tuulessa vinossa
      const n = 3, ht = (0.35 + rand() * 0.4) * (1 - wind * 0.35);
      const c = pick(grassCol);
      for (let k = 0; k < n; k++) {
        const lean = 0.2 + rand() * 0.3 + wind * 0.35, a = wind > 0 ? 0.6 + (rand() - 0.5) * 0.6 : rand() * 6.28;
        m.compose(p.set(x + (rand() - 0.5) * 0.3, g - 0.05, z + (rand() - 0.5) * 0.3),
          q.setFromEuler(e.set(Math.sin(a) * lean, rand() * 6.28, Math.cos(a) * lean)), s.set(0.35 + rand() * 0.3, ht, 0.35 + rand() * 0.3));
        tuft.add(m, col.copy(c).multiplyScalar(0.85 + rand() * 0.3));
      }
    });
    bush.build(scene);
    tuft.build(scene);
  }

  // --- Pikkukivet ilman törmäyksiä (paljon) ja isommat kivet törmäyksin -----------------------
  {
    const pebbles = new InstanceBatch(new THREE.DodecahedronGeometry(1, 0), flatMaterial('#ffffff'), { castShadow: false });
    const n = options.pebbles ?? 0;
    for (let attempt = 0, placed = 0; attempt < n * 4 && placed < n; attempt++) {
      const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
      if (!dry(x, z, 0.2) || terrain.roadDistanceAt(x, z) < flat + 0.5) continue;
      const sz = 0.12 + Math.pow(rand(), 2) * 0.35;
      m.compose(p.set(x, H(x, z), z), q.setFromEuler(e.set(rand(), rand() * 6.28, rand())), s.set(sz * 1.3, sz * 0.7, sz));
      pebbles.add(m, col.copy(pick(STONE)).multiplyScalar(0.8 + rand() * 0.3));
      placed++;
    }
    pebbles.build(scene);
  }
  scatterRocks(scene, world, RAPIER, body, terrain, rand, {
    count: options.rocks ?? 200, clear: flat + 2, limit, sizeMax: 1.3,
    skip: (x, z) => !dry(x, z, 0.3) || !free(x, z, 1.2) || layout.villageAt(x, z),
    colorFn: (r) => col.copy(STONE[Math.floor(r() * STONE.length)]).multiplyScalar(0.8 + r() * 0.25).clone(),
  });
}

// --- Rakennukset ----------------------------------------------------------------------------

/** Ryhmä paikallisissa koordinaateissa: palauttaa add(geo, color, x, y, z). */
function makeGroup(scene, x, y, z, yaw) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = yaw;
  scene.add(g);
  const mats = {};
  return (geo, color, px, py, pz) => {
    const mesh = new THREE.Mesh(geo, mats[color] ??= flatMaterial(color));
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/**
 * Skotlantilainen mökki: matala ja pitkä, valkoiseksi rapattu tai harmaa kivi, liuskekivikatto
 * ja savupiiput päädyissä. wooden = puutalo (Skelwick).
 */
function buildCottage({ scene, world, RAPIER, body, terrain, x, z, yaw, rand, wooden = false, size = 1 }) {
  const L = (wooden ? 7 + rand() * 2 : 9 + rand() * 3) * size, D = (wooden ? 5 : 5.4) * size, wallH = wooden ? 2.6 : 2.5;
  // Paikallinen -z kohti tietä (ovi ja ikkunat sinne)
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  let lo = Infinity, hi = -Infinity;
  for (const [u, v] of [[L / 2, D / 2], [-L / 2, D / 2], [L / 2, -D / 2], [-L / 2, -D / 2], [0, 0]]) {
    const h = terrain.heightAt(x + c * u + sn * v, z - sn * u + c * v); lo = Math.min(lo, h); hi = Math.max(hi, h);
  }
  const floor = hi + 0.15;
  const add = makeGroup(scene, x, floor, z, yaw);
  const walls = wooden
    ? ['#9b3f35', '#4f6f7a', '#d8ccae', '#5f6b4a', '#c9b98a'][Math.floor(rand() * 5)]
    : ['#ecebe4', '#e4e0d4', '#8e897e', '#ecebe4', '#a39d90'][Math.floor(rand() * 5)];
  const roof = wooden ? ['#3d3f44', '#5a3a30', '#46494e'][Math.floor(rand() * 3)] : '#4a4f56';
  const trim = wooden ? '#f1eee6' : '#2e3135';
  add(box(L + 0.3, floor - lo + 0.4, D + 0.3), '#6f6b63', 0, -(floor - lo) / 2, 0);   // kivijalka
  add(box(L, wallH, D), walls, 0, wallH / 2, 0);
  const roofH = wooden ? 2.0 : 2.3;
  const roofGeo = gableRoofGeometry(L, roofH, D, 0.35);
  add(roofGeo, roof, 0, wallH + roofH / 2, 0);
  if (!wooden) {
    // Kiviset savupiiput päätyjen harjalla
    for (const sx of [-1, 1]) add(box(0.9, 1.6, 1.1), '#7d786f', sx * (L / 2 - 0.35), wallH + roofH + 0.15, 0);
    for (const sx of [-1, 1]) add(box(0.25, 0.35, 0.25), '#9a5a40', sx * (L / 2 - 0.35), wallH + roofH + 1.1, 0);
  } else {
    add(box(0.6, 1.3, 0.6), '#5e5a54', L / 2 - 1.2, wallH + roofH * 0.6, 0.6);
    // Pystylaudoitus: tummat raidat
    for (let u = -L / 2 + 0.6; u < L / 2; u += 0.9) add(box(0.06, wallH, 0.04), '#3a302a', u, wallH / 2, -D / 2 - 0.02);
  }
  // Ovi ja pienet syvät ikkunat
  const door = ['#a8322c', '#2f5d8a', '#3f6b3f', '#e0c040', '#2e3135'][Math.floor(rand() * 5)];
  add(box(0.95, 1.9, 0.1), door, 0, 0.95, -D / 2 - 0.05);
  for (const wx of [-L / 3.4, L / 3.4]) {
    add(box(1.0, 1.05, 0.08), trim, wx, 1.45, -D / 2 - 0.04);
    add(box(0.82, 0.88, 0.1), '#2a3036', wx, 1.45, -D / 2 - 0.06);
  }
  for (const wx of [-L / 4, L / 4]) add(box(0.82, 0.88, 0.1), '#2a3036', wx, 1.45, D / 2 + 0.05);
  addBoxCollider(world, RAPIER, body, x, (lo + floor + wallH + roofH) / 2, z, L / 2 + 0.2, (floor + wallH + roofH - lo) / 2, D / 2 + 0.2, yaw);
}

/** Kylä (Skelwick): kivi- ja puutaloja tien molemmin puolin, pihoilla kiviaidat. */
function buildVillage({ scene, world, RAPIER, body, terrain, road, layout, rand, taken }) {
  const { s0, s1 } = layout.village;
  const hw = road.halfWidth;
  const placed = [];
  const overlaps = (x, z, r) => placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + r);
  for (const side of [-1, 1]) {
    let s = s0 + Math.floor(rand() * 8);
    while (s < s1) {
      const wooden = rand() < 0.45;
      const L = wooden ? 8.5 : 11, D = 5.4;
      const sc = Math.min(road.count - 1, s + Math.round(L / 2 / road.spacing));
      if (sc > s1) break;
      const ax = road.tx[sc], az = road.tz[sc];
      const rx = -az * side, rz = ax * side;
      const setback = hw + 7 + rand() * 4;
      const cx = road.xs[sc] + rx * (setback + D / 2), cz = road.zs[sc] + rz * (setback + D / 2);
      const rad = Math.hypot(L, D) / 2 + 1;
      let bad = overlaps(cx, cz, rad) || terrain.heightAt(cx, cz) < layout.level + 1.5;
      // Ei jyrkkään rinteeseen (korkea kivijalka näyttäisi oudolta)
      let lo = Infinity, hi = -Infinity;
      for (const [u, v] of [[L / 2, -D / 2], [-L / 2, -D / 2], [L / 2, D / 2], [-L / 2, D / 2]]) {
        const hh = terrain.heightAt(cx + ax * u + rx * v, cz + az * u + rz * v); lo = Math.min(lo, hh); hi = Math.max(hi, hh);
      }
      if (hi - lo > 1.3) bad = true;
      for (const [u, v] of [[L / 2, -D / 2], [-L / 2, -D / 2], [L / 2, D / 2], [-L / 2, D / 2]]) {
        if (terrain.roadDistanceAt(cx + ax * u + rx * v, cz + az * u + rz * v) < hw + 4) bad = true;
      }
      if (bad) { s += 4; continue; }
      const yaw = Math.atan2(-az, ax) + (side < 0 ? Math.PI : 0);
      buildCottage({ scene, world, RAPIER, body, terrain, x: cx, z: cz, yaw, rand, wooden });
      // Turvepino talon takana
      if (rand() < 0.6) {
        const c = Math.cos(yaw), sn = Math.sin(yaw), u = (rand() - 0.5) * L * 0.6, v = D / 2 + 2.4;
        const px = cx + c * u + sn * v, pz = cz - sn * u + c * v;
        peatStack(scene, px, terrain.heightAt(px, pz) - 0.1, pz, yaw);
      }
      placed.push([cx, cz, rad]);
      s += Math.max(4, Math.round((L + 8 + rand() * 14) / road.spacing));
    }
  }
  // Punainen puhelinkoppi kylän keskelle tien varteen
  {
    const sm = Math.round((s0 + s1) / 2), side = rand() < 0.5 ? -1 : 1;
    const off = hw + 4.5;
    const x = road.xs[sm] - road.tz[sm] * off * side, z = road.zs[sm] + road.tx[sm] * off * side;
    if (!overlaps(x, z, 1.5)) phoneBox({ scene, world, RAPIER, body }, x, terrain.heightAt(x, z) - 0.05, z, Math.atan2(-road.tz[sm], road.tx[sm]));
  }
  for (const [x, z, r] of placed) taken.push([x, z, r + 1]);
}

/**
 * Linnan rauniot: neliskulmainen tornilinna (osittain sortunut), muurit aukkoineen,
 * portin tornien tyngät ja kivikasoja. Keskipiste (x, z), paikallinen -z kohti tietä.
 */
function buildCastleRuins({ scene, world, RAPIER, body, terrain, x, z, yaw, rand }) {
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const toWorld = (u, v) => [x + c * u + sn * v, z - sn * u + c * v];
  const H = (u, v) => terrain.heightAt(...toWorld(u, v));
  const base = H(0, 0);
  const add = makeGroup(scene, x, 0, z, yaw);
  const stone = ['#9a9283', '#8a8376', '#a59d8e', '#918a7c'];
  const pickStone = () => stone[Math.floor(rand() * stone.length)];
  const T = 1.4;   // muurin paksuus
  /** Muuri u0→u1 (v vakio) tai v0→v1 (u vakio): rosoinen yläreuna, aukot. */
  const curtain = (u0, v0, u1, v1, hMax) => {
    const len = Math.hypot(u1 - u0, v1 - v0), du = (u1 - u0) / len, dv = (v1 - v0) / len;
    const ang = Math.atan2(-dv, du);
    for (let t = 0; t < len; t += 2.2) {
      if (rand() < 0.14) continue;   // sortunut kohta
      const u = u0 + du * (t + 1.1), v = v0 + dv * (t + 1.1);
      const g = H(u, v);
      const h = hMax * (0.35 + rand() * 0.65);
      const mesh = add(box(2.3, h + 2, T), pickStone(), u, g - 2 + (h + 2) / 2, v);
      mesh.rotation.y = ang;
      const [wx, wz] = toWorld(u, v);
      addBoxCollider(world, RAPIER, body, wx, g + h / 2, wz, 1.15, h / 2 + 1, T / 2, yaw + ang);
    }
  };
  // Muurit: suorakaide 30 × 20 m, pihan reunat
  const W = 15, Dp = 10;
  curtain(-W, -Dp, W, -Dp, 4.5);     // tien puoleinen muuri
  curtain(-W, Dp, W, Dp, 3.5);       // järven puoleinen, matalampi
  curtain(-W, -Dp, -W, Dp, 4);
  curtain(W, -Dp, W, Dp, 4);
  // Tornilinna kulmassa: 8 × 8 m, 14 m korkea, yksi kulma sortunut
  {
    const u = W - 3, v = Dp - 3, g = H(u, v);
    const th = 14;
    add(box(8, th + 3, 8), '#948c7e', u, g - 3 + (th + 3) / 2, v);
    // Sortunut kulma: matalampi porrastus tornin kyljessä
    add(box(3, 4, 3), '#8a8376', u + 4.2, g + th * 0.45, v + 4.2);
    // Rosoinen huippu: hammaspalat ja sortunut kulma
    // (yksi kulma puuttuu: sortunut)
    for (const [du, dv] of [[-3.2, -3.2], [0, -3.4], [3.2, -3.2], [-3.4, 0], [-3.2, 3.2], [0, 3.4]]) {
      add(box(1.6, 1.2 + rand() * 1.2, 1.6), '#8f877a', u + du, g + th + 0.6, v + dv);
    }
    // Ikkuna-aukot
    for (const hy of [5, 9]) for (const [du, dv, w, d] of [[0, -4.05, 0.9, 0.2], [-4.05, 0, 0.2, 0.9]]) add(box(w, 1.6, d), '#2c2925', u + du, g + hy, v + dv);
    const [wx, wz] = toWorld(u, v);
    addBoxCollider(world, RAPIER, body, wx, g + th / 2, wz, 4, th / 2, 4, yaw);
  }
  // Portti: kaksi pyöreän tornin tynkää tien puoleisen muurin keskellä
  for (const su of [-1, 1]) {
    const u = su * 3.4, v = -Dp, g = H(u, v), th = 5 + rand() * 2.5;
    add(new THREE.CylinderGeometry(2.2, 2.5, th + 2, 9), '#8a8276', u, g - 2 + (th + 2) / 2, v);
    const [wx, wz] = toWorld(u, v);
    addCylinderCollider(world, RAPIER, body, wx, g - 0.5, wz, th + 0.5, 2.4);
  }
  // Sisäpihan rakennusten matalat raunioseinät ja kivikasat
  for (const [u, v, w, d] of [[-8, 2, 7, 1], [-11, -2, 1, 6], [-3, 5, 6, 1]]) {
    const g = H(u, v), h = 0.8 + rand() * 1.2;
    add(box(w, h + 1, d), pickStone(), u, g - 1 + (h + 1) / 2, v);
  }
  for (let k = 0; k < 18; k++) {
    const u = (rand() * 2 - 1) * (W + 2), v = (rand() * 2 - 1) * (Dp + 3), sz = 0.3 + rand() * 0.5;
    const mesh = add(new THREE.DodecahedronGeometry(sz, 0), pickStone(), u, H(u, v) + sz * 0.3, v);
    mesh.rotation.set(rand(), rand() * 6, rand());
  }
  void base;
}

// --- Eläimet -----------------------------------------------------------------------------------

/**
 * Lammaslaumat, ylämaankarja ja punahirvet. Ei törmäyksiä (pysyvät tiestä loitolla).
 * Jokainen ruumiinosa on oma instanssijoukkonsa, joten satoja eläimiä on kevyt piirtää.
 */
function placeAnimals({ scene, terrain, rand, limit, flat, layout, free, dry, taken }, options) {
  const batches = {};
  const box1 = new THREE.BoxGeometry(1, 1, 1);
  const ico1 = new THREE.IcosahedronGeometry(1, 0);
  const B = (key, geo, color) => (batches[key + geo.uuid] ??= new InstanceBatch(geo, flatMaterial(color)));
  const base = new THREE.Matrix4(), loc = new THREE.Matrix4(), out = new THREE.Matrix4();
  const v = new THREE.Vector3(), sc = new THREE.Vector3(), qq = new THREE.Quaternion(), e = new THREE.Euler();
  const part = (key, geo, color, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => {
    loc.compose(v.set(x, y, z), qq.setFromEuler(e.set(rx, ry, rz)), sc.set(sx, sy, sz));
    B(key, geo, color).add(out.multiplyMatrices(base, loc));
  };
  const H = (x, z) => terrain.heightAt(x, z);
  const at = (x, z, yaw) => base.compose(v.set(x, H(x, z) - 0.05, z), qq.setFromAxisAngle(UP, yaw), sc.set(1, 1, 1));

  const sheep = (grazing) => {
    part('wool', ico1, '#e6e1d3', 0, 0.62, 0, 0.6, 0.42, 0.4);
    const hy = grazing ? 0.35 : 0.68;
    part('black', box1, '#2a2624', 0.62, hy, 0, 0.3, 0.26, 0.2, 0, 0, grazing ? -0.6 : 0.15);
    for (const [lx, lz] of [[0.32, 0.16], [0.32, -0.16], [-0.32, 0.16], [-0.32, -0.16]]) part('black', box1, '#2a2624', lx, 0.22, lz, 0.08, 0.46, 0.08);
  };
  const cow = () => {
    // Ylämaankarja: pörröinen inkiväärinruskea turkki ja leveät sarvet
    const fur = ['#a8582a', '#94481f', '#b8692f'][Math.floor(rand() * 3)];
    part('fur' + fur, ico1, fur, 0, 1.0, 0, 1.15, 0.62, 0.58);
    part('fur' + fur, box1, fur, 1.15, 1.08, 0, 0.55, 0.52, 0.5);
    part('fur' + fur, box1, fur, 1.38, 1.22, 0, 0.12, 0.25, 0.46);   // otsatukka
    for (const s of [-1, 1]) part('horn', box1, '#e8dfc4', 1.22, 1.38, s * 0.42, 0.08, 0.08, 0.5, s * 0.5, 0, 0);
    for (const [lx, lz] of [[0.6, 0.28], [0.6, -0.28], [-0.6, 0.28], [-0.6, -0.28]]) part('hoof', box1, '#4a2a16', lx, 0.35, lz, 0.18, 0.72, 0.18);
  };
  const deer = () => {
    part('deer', ico1, '#7a5236', 0, 1.2, 0, 0.75, 0.38, 0.3);
    part('deer', box1, '#7a5236', 0.62, 1.55, 0, 0.18, 0.6, 0.18, 0, 0, -0.5);
    part('deer', box1, '#6a4630', 0.85, 1.85, 0, 0.34, 0.18, 0.16);
    for (const s of [-1, 1]) {
      part('antler', box1, '#d9cbb0', 0.75, 2.2, s * 0.18, 0.05, 0.6, 0.05, s * 0.35, 0, 0.15);
      part('antler', box1, '#d9cbb0', 0.9, 2.3, s * 0.3, 0.04, 0.35, 0.04, s * 0.6, 0, -0.4);
    }
    for (const [lx, lz] of [[0.42, 0.12], [0.42, -0.12], [-0.42, 0.12], [-0.42, -0.12]]) part('deerLeg', box1, '#4a3424', lx, 0.5, lz, 0.07, 1.0, 0.07);
  };

  const herd = (count, nMin, nMax, spread, test, make) => {
    for (let attempt = 0, placed = 0; attempt < count * 60 && placed < count; attempt++) {
      const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
      if (!test(x, z)) continue;
      const n = nMin + Math.floor(rand() * (nMax - nMin + 1)), yaw0 = rand() * 6.28;
      for (let k = 0; k < n; k++) for (let tries = 0; tries < 6; tries++) {
        const ax = x + (rand() - 0.5) * spread * 2, az = z + (rand() - 0.5) * spread * 2;
        if (!test(ax, az)) continue;
        at(ax, az, yaw0 + (rand() - 0.5) * 1.6);
        make(rand() < 0.6);
        break;
      }
      taken.push([x, z, spread]);
      placed++;
    }
  };
  const ok = (minRd) => (x, z) => {
    const rd = terrain.roadDistanceAt(x, z);
    return rd > flat + minRd && rd < 160 && dry(x, z, 1) && slopeAt(terrain, x, z) < 0.38 && !layout.villageAt(x, z) && free(x, z, 1.5);
  };
  herd(options.sheep ?? 0, 4, 9, 12, ok(5), sheep);
  herd(options.cattle ?? 0, 3, 6, 10, ok(10), cow);
  herd(options.deer ?? 0, 2, 4, 9, ok(18), deer);
  for (const b of Object.values(batches)) b.build(scene);
}

// --- Erikoiskohteet ----------------------------------------------------------------------------

const CONCRETE = '#b9b6ac';

/**
 * Kaarisilta (Glenfinnanin tyyliin) solan yli tien yläpuolella: pylväät, puoliympyräkaaret ja
 * kansi, jolla seisoo höyryjuna. Tie kulkee yhden kaaren alta (ei pylvästä tien kohdalla).
 */
function buildViaduct({ scene, world, RAPIER, body, terrain, road, taken }, V) {
  const fr = frameAt(road, V.at, 1);
  const deckY = fr.roadH + (V.height ?? 20);
  const span = V.span ?? 16;
  const Hv = (vv) => terrain.heightAt(...fr.world(0, vv));
  let vR = 8; while (vR < 240 && Hv(vR) < deckY - 0.3) vR += 1;
  let vL = 8; while (vL < 240 && Hv(-vL) < deckY - 0.3) vL += 1;
  vR += 5; vL += 5;
  const add = makeGroup(scene, fr.ox, 0, fr.oz, fr.yaw);
  const T = 1.4;   // kannen paksuus
  // Kansi ja kaiteet (paikallinen x = tien suunta, z = sillan suunta)
  add(box(4.4, T, vL + vR), CONCRETE, 0, deckY - T / 2, (vR - vL) / 2);
  for (const sx of [-1, 1]) add(box(0.3, 0.9, vL + vR), '#a9a69c', sx * 2.05, deckY + 0.45, (vR - vL) / 2);
  // Pylväiden paikat: tie keskellä jänneväliä
  const piers = [];
  for (let k = 0; span / 2 + k * span < vR - 2; k++) piers.push(span / 2 + k * span);
  for (let k = 0; -span / 2 - k * span > -vL + 2; k++) piers.push(-span / 2 - k * span);
  piers.sort((a, b) => a - b);
  const segs = 8;
  for (const pv of piers) {
    const g = Hv(pv);
    if (deckY - g < 2.5) continue;
    const [wx, wz] = fr.world(0, pv);
    if (terrain.roadDistanceAt(wx, wz) < 6) continue;   // ei pylvästä tielle
    const h = deckY - T - g + 2;
    add(box(3.6, h, 2.4), CONCRETE, 0, g - 2 + h / 2, pv);
    addBoxCollider(world, RAPIER, body, wx, g + h / 2 - 2, wz, 1.8, h / 2, 1.2, fr.yaw);
  }
  // Kaaret ja kaarien väliset täytteet
  const r = span / 2 - 1.2, yc = deckY - T - 0.5 - r;
  const all = [-vL, ...piers, vR];
  for (let i = 0; i < all.length - 1; i++) {
    const va = all[i], vb = all[i + 1];
    if (vb - va < span - 0.1) continue;
    const vc = (va + vb) / 2;
    if (Hv(vc) > yc + r * 0.5) continue;   // kaari olisi maan sisällä
    for (let k = 0; k < segs; k++) {
      const a0 = Math.PI * (k / segs), a1 = Math.PI * ((k + 1) / segs);
      const z0 = vc + r * Math.cos(a0), y0 = yc + r * Math.sin(a0), z1 = vc + r * Math.cos(a1), y1 = yc + r * Math.sin(a1);
      const len = Math.hypot(z1 - z0, y1 - y0);
      const mesh = add(box(3.6, 0.9, len + 0.15), CONCRETE, 0, (y0 + y1) / 2, (z0 + z1) / 2);
      mesh.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
    }
    // Täyte kaaren hartioiden ja kannen väliin
    for (const sv of [va, vb]) {
      const hgt = deckY - T - yc;
      if (Hv(sv) < yc) add(box(3.5, hgt, 4.2), CONCRETE, 0, yc + hgt / 2, sv);
    }
  }
  // Höyryjuna kannella: veturi, hiilivaunu ja kolme vaunua
  const ty = deckY;
  const tv = (vR - vL) / 2 - 18;
  add(new THREE.CylinderGeometry(0.85, 0.85, 4.6, 12).rotateX(Math.PI / 2), '#1f2224', 0, ty + 1.9, tv + 2.6);
  add(box(2.4, 2.4, 2.2), '#1f2224', 0, ty + 2.2, tv - 0.6);
  add(box(2.6, 0.2, 2.6), '#2c2f31', 0, ty + 3.5, tv - 0.6);
  add(new THREE.CylinderGeometry(0.28, 0.35, 1.0, 8), '#1f2224', 0, ty + 3.1, tv + 4.2);
  add(box(2.4, 0.5, 0.25), '#9a2a22', 0, ty + 1.0, tv + 5.0);
  add(box(2.3, 1.7, 3.2), '#1f2224', 0, ty + 1.75, tv - 3.6);
  for (let w = 0; w < 4; w++) for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.55, 0.55, 0.2, 10).rotateZ(Math.PI / 2), '#3a1e1a', sx * 1.1, ty + 0.6, tv + 3.6 - w * 1.5);
  for (let c = 0; c < 3; c++) {
    const cz = tv - 9.4 - c * 9.3;
    add(box(2.6, 2.6, 8.8), '#6b1f24', 0, ty + 2.0, cz);
    add(box(2.7, 0.3, 9.0), '#3d3f42', 0, ty + 3.4, cz);
    for (const sx of [-1, 1]) add(box(0.05, 0.7, 7.6), '#e4d8b8', sx * 1.31, ty + 2.5, cz);
  }
  taken.push([fr.ox, fr.oz, 6]);
}

/** Majakka korkealle niemen kärkeen (lähin sopiva kohta annetusta pisteestä) ja vartijan talo. */
function buildLighthouse({ scene, world, RAPIER, body, terrain, layout, rand, taken }, L) {
  const H = (x, z) => terrain.heightAt(x, z);
  let best = null;
  for (let i = 0; i < 500; i++) {
    const a = rand() * 6.28, r = Math.sqrt(rand()) * (L.radius ?? 50);
    const x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r;
    if (terrain.roadDistanceAt(x, z) < 30 || H(x, z) < layout.level + 2.5 || slopeAt(terrain, x, z) > 0.25) continue;
    const score = H(x, z) - r * 0.05;
    if (!best || score > best.score) best = { x, z, score };
  }
  if (!best) return;
  const { x, z } = best;
  const g = H(x, z);
  const add = makeGroup(scene, x, g, z, 0);
  add(new THREE.CylinderGeometry(3.4, 3.6, 1.2, 14), '#d8d4ca', 0, 0, 0);
  add(new THREE.CylinderGeometry(1.7, 2.4, 15, 14), '#f2f0ea', 0, 8, 0);
  add(new THREE.CylinderGeometry(1.75, 1.8, 0.7, 14), '#d9a548', 0, 15.6, 0);
  add(new THREE.CylinderGeometry(2.5, 2.5, 0.25, 14), '#24272a', 0, 16.05, 0);
  const lamp = add(new THREE.CylinderGeometry(1.25, 1.25, 1.9, 10), '#fff2b0', 0, 17.1, 0);
  lamp.material = flatMaterial('#fff2b0', { emissive: '#ffe48a', emissiveIntensity: 0.8 });
  add(new THREE.ConeGeometry(1.5, 1.3, 10), '#24272a', 0, 18.7, 0);
  add(box(0.6, 1.9, 0.12), '#24272a', 0, 1.4, 2.2);   // ovi
  addCylinderCollider(world, RAPIER, body, x, g - 1, z, 17, 2.4);
  // Vartijan matala talo vieressä
  buildCottage({ scene, world, RAPIER, body, terrain, x: x + 9, z: z + 3, yaw: rand() * 6.28, rand, wooden: false, size: 0.9 });
  taken.push([x, z, 16]);
}

/** Pystykivikehä kukkulalla (kuin Orkneysaarilla). */
function buildStoneCircle({ scene, world, RAPIER, body, terrain, layout, rand, taken, free, flat }, C) {
  const H = (x, z) => terrain.heightAt(x, z);
  let spot = null;
  for (let i = 0; i < 600 && !spot; i++) {
    const a = rand() * 6.28, r = Math.sqrt(rand()) * (C.radius ?? 70);
    const x = C.x + Math.cos(a) * r, z = C.z + Math.sin(a) * r;
    const rd = terrain.roadDistanceAt(x, z);
    if (rd < flat + 18 || rd > 80 || H(x, z) < layout.level + 2 || slopeAt(terrain, x, z) > 0.15 || !free(x, z, 14)) continue;
    spot = { x, z };
  }
  if (!spot) return;
  const R = 9 + rand() * 2, n = 12;
  const grey = ['#8a8a7e', '#7c7c72', '#94948a', '#6f6f66'];
  for (let k = 0; k < n; k++) {
    if (rand() < 0.15) continue;   // kadonnut kivi
    const a = (k / n) * 6.283 + (rand() - 0.5) * 0.1;
    const x = spot.x + Math.cos(a) * R, z = spot.z + Math.sin(a) * R;
    const stub = rand() < 0.2;
    const h = stub ? 0.8 + rand() * 0.6 : 3 + rand() * 2.4, w = 1.1 + rand() * 0.5, d = 0.4 + rand() * 0.25;
    const g = H(x, z);
    const add = makeGroup(scene, x, g - 0.4, z, -a + Math.PI / 2);
    const mesh = add(box(w, h + 0.4, d), grey[Math.floor(rand() * grey.length)], 0, (h + 0.4) / 2, 0);
    mesh.rotation.z = (rand() - 0.5) * 0.12;
    addBoxCollider(world, RAPIER, body, x, g + h / 2, z, w / 2, h / 2, d / 2, -a + Math.PI / 2);
  }
  // Kaatunut kivi keskellä
  const add = makeGroup(scene, spot.x, H(spot.x, spot.z), spot.z, rand() * 6.28);
  add(box(3.4, 0.5, 1.1), '#7c7c72', 0, 0.2, 0);
  taken.push([spot.x, spot.z, R + 3]);
}

/** Loch Nessin hirviö: kyttyrät, kaula ja pää veden pinnalla. */
function buildNessie({ scene, layout, road, taken }, N) {
  const y = layout.level;
  // Näkymäaukko tieltä hirviölle: rantaan ei puita tälle kaistalle
  let best = 0, bd = Infinity;
  for (let k = 0; k < road.count; k++) { const d = Math.hypot(road.xs[k] - N.x, road.zs[k] - N.z); if (d < bd) { bd = d; best = k; } }
  for (const dk of [-30, -15, 0, 15]) {
    const k = Math.min(road.count - 1, Math.max(0, best + Math.round(dk / road.spacing)));
    for (let t = 0; t <= 1; t += 0.12) taken.push([road.xs[k] + (N.x - road.xs[k]) * t, road.zs[k] + (N.z - road.zs[k]) * t, 7]);
  }
  const add = makeGroup(scene, N.x, y, N.z, N.yaw ?? 0);
  scene.children[scene.children.length - 1].scale.setScalar(N.scale ?? 1.5);
  const skin = '#3d5a3c';
  const hump = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  for (const [u, s] of [[-6, 0.7], [-2.6, 1.15], [1.0, 1.35]]) add(hump, skin, u, -0.2, 0).scale.set(s * 1.7, s * 1.0, s * 1.1);
  // Kaarevasti nouseva kaula ja pää
  let px = 3.6, py = -0.3, a = 1.15;
  for (let k = 0; k < 5; k++) {
    const len = 1.2, r = 0.55 - k * 0.06;
    const mesh = add(new THREE.CylinderGeometry(r * 0.9, r, len, 8), skin, px + Math.cos(a) * len / 2, py + Math.sin(a) * len / 2, 0);
    mesh.rotation.z = a - Math.PI / 2;
    px += Math.cos(a) * len; py += Math.sin(a) * len;
    a -= 0.22;
  }
  const head = add(new THREE.IcosahedronGeometry(0.55, 0), skin, px + 0.35, py + 0.05, 0);
  head.scale.set(1.5, 0.75, 0.8);
  for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.08, 6, 4), '#111111', px + 0.65, py + 0.25, s * 0.28);
}

/** Puulaituri järveen mökin kohdalta ja soutuvene sen päässä. */
function buildJetty({ scene, terrain, road, layout, rand }, J) {
  const fr = frameAt(road, J.at, J.side);
  const H = (vv) => terrain.heightAt(...fr.world(0, vv));
  let shore = null;
  for (let vv = 20; vv < 110; vv += 1) if (H(vv) < layout.level - 0.2) { shore = vv; break; }
  if (shore === null) return;
  const deckY = layout.level + 0.75, v0 = shore - 5, v1 = shore + 13;
  const add = makeGroup(scene, fr.ox, 0, fr.oz, fr.yaw);
  for (let vv = v0; vv < v1; vv += 0.55) add(box(2.0, 0.12, 0.45), ['#7a6248', '#6e5840', '#836a4e'][Math.floor(rand() * 3)], 0, deckY, vv);
  for (let vv = v0 + 1; vv <= v1; vv += 3) for (const su of [-1, 1]) add(box(0.2, 3, 0.2), '#5a4632', su * 0.9, deckY - 1.4, vv);
  // Soutuvene laiturin vieressä
  const yawB = Math.PI / 2 + (rand() - 0.5) * 0.3;
  for (const [geo, color, x, y, z] of boatParts(3.6, 1.3, 0.6, '#2f6f9f')) {
    const m = add(geo, color, 0, 0, 0);
    m.position.set(1.9 + x * Math.cos(yawB), layout.level + 0.15 + y, v1 - 2.5 - x * Math.sin(yawB));
    m.rotation.y = yawB;
  }
}

/** Veneen runko: laatikko, jonka keula ja perä kapenevat ja pohja kapenee. */
function boatGeometry(L, W, Hh) {
  const geo = new THREE.BoxGeometry(L, Hh, W, 4, 1, 1);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const endTaper = 1 - Math.pow(Math.abs(x) / (L / 2), 3) * 0.85;
    pos.setZ(i, pos.getZ(i) * endTaper * (y < 0 ? 0.55 : 1));
    if (Math.abs(x) > L * 0.45) pos.setY(i, y + 0.12);   // keula ja perä hieman ylempänä
  }
  geo.computeVertexNormals();
  return geo;
}

/** Avoin vene: runko, tumma sisäpohja (näyttää kovertuneelta), reunalistat ja tuhto. Palauttaa add()-argumentit. */
function boatParts(L, W, Hh, color) {
  return [
    [boatGeometry(L, W, Hh), color, 0, 0, 0],
    [boatGeometry(L * 0.86, W * 0.78, 0.04), '#5a4632', 0, Hh / 2 + 0.01, 0],
    [box(1.2, 0.08, W * 0.8), '#c9b48a', 0, Hh / 2 + 0.12, 0],
  ];
}

/** Kalastusveneitä vedettynä rantakivikolle kylän lähelle. */
function placeBoats({ scene, terrain, road, layout, rand, taken }, n) {
  if (!layout.village) return;
  const H = (x, z) => terrain.heightAt(x, z);
  const spots = [];
  for (let s = layout.village.s0 - 80; s <= layout.village.s1 + 80; s += 4) {
    const k = Math.min(road.count - 1, Math.max(0, s));
    for (const side of [-1, 1]) for (let vv = 15; vv < 110; vv += 3) {
      const x = road.xs[k] - road.tz[k] * vv * side, z = road.zs[k] + road.tx[k] * vv * side;
      const above = H(x, z) - layout.level;
      if (above > 0.5 && above < 1.6 && slopeAt(terrain, x, z) < 0.3) spots.push([x, z]);
    }
  }
  const colors = ['#2f5f8f', '#a8322c', '#3f6b3f', '#e8e4da', '#d9a032'];
  const used = [];
  for (let i = 0; i < n * 10 && used.length < n && spots.length; i++) {
    const [x, z] = spots[Math.floor(rand() * spots.length)];
    if (used.some(([ux, uz]) => Math.hypot(ux - x, uz - z) < 7)) continue;
    const add = makeGroup(scene, x, H(x, z) + 0.25, z, rand() * 6.28);
    const L = 4.5 + rand() * 1.5;
    const tilt = 0.2 + rand() * 0.15;   // kallellaan rannalla
    for (const part of boatParts(L, 1.6, 0.75, colors[Math.floor(rand() * colors.length)])) add(...part);
    scene.children[scene.children.length - 1].rotation.z = tilt;   // kyljellään
    used.push([x, z]);
    taken.push([x, z, 3]);
  }
}

/** Turvepino: tummanruskeat turvepalat kasassa talon takana. */
function peatStack(scene, x, y, z, yaw) {
  const add = makeGroup(scene, x, y, z, yaw);
  add(box(2.4, 0.9, 1.3), '#4a3a2c', 0, 0.45, 0);
  const top = add(box(2.5, 0.35, 0.9), '#3e3024', 0, 1.0, 0);
  top.rotation.x = 0.15;
}

/** Punainen puhelinkoppi kylän raitin varrella. */
function phoneBox({ scene, world, RAPIER, body }, x, y, z, yaw) {
  const add = makeGroup(scene, x, y, z, yaw);
  add(box(1.05, 2.5, 1.05), '#b0201c', 0, 1.25, 0);
  add(box(1.15, 0.2, 1.15), '#b0201c', 0, 2.6, 0);
  for (const [u, v, w, d] of [[0, -0.53, 0.75, 0.04], [0, 0.53, 0.75, 0.04], [-0.53, 0, 0.04, 0.75], [0.53, 0, 0.04, 0.75]]) add(box(w, 1.5, d), '#2a3036', u, 1.35, v);
  add(box(0.6, 0.14, 0.05), '#f1eee6', 0, 2.3, -0.54);
  addBoxCollider(world, RAPIER, body, x, y + 1.3, z, 0.55, 1.3, 0.55, yaw);
}
