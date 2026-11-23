// Arizonan maisema (USA): punaruskea hiekka, kerroksittain raidoitetut kalliot, pensaat,
// paljon kiviä ja jyrkkiä kalliomuodostelmia. Lisäksi mäntymetsät (Flagstaff, Beaver Valley),
// amerikkalaiset omakotitalot, puusilta kanjonin yli (tracks.js: road.bridges) ja
// kanjonin ylittävä vanha rautatiesilta, jonka alta tie kulkee (scenery.overpass).
//
// scenery-asetukset (tracks.js):
//   forest   { from, to, radius }: mäntymetsä tien varrella välillä from–to (m tien alusta)
//   houses   [{ at, side }]: omakotitalo tien varteen (side 1 = oikealla, -1 = vasemmalla)
//   overpass { at, height }: rautatiesilta tien yllä (height = korkeus tiestä, m)
//   pines, shrubs, rocks, formations: määrät

import * as THREE from 'three';
import { createNoise2D, smoothstep } from './noise.js';
import {
  UP, slopeAt, flatMaterial, InstanceBatch, addCylinderCollider, addBoxCollider, gableRoofGeometry, scatterRocks,
} from './sceneryKit.js';

// Kalliokerrosten värit alhaalta ylös (toistuvat)
const STRATA = ['#9b4a2a', '#a8573a', '#b8663d', '#c47a4c', '#cf8f60', '#bf7448', '#ad5e3b', '#9e5032'].map((c) => new THREE.Color(c));
// Sillan kannen värit (roadMesh-kaistat vasemmalta oikealle)
const WOOD_DECK = ['#6b5138', '#5a4430', '#735840', '#6e543a', '#735840', '#5a4430', '#6b5138'];
const SIDING = ['#a9c3d1', '#e9e4d8', '#d9c9a3', '#9fb39a', '#c9a27e', '#c7cfd6'];

const HOUSE_OFFSET = 17;   // talon keskipiste tien keskilinjasta (m)

/** Talon kehys tien kohdassa: paikallinen u = tien suuntaan, v = poispäin tiestä. */
function houseFrame(road, h) {
  const s = Math.min(road.count - 1, Math.max(0, Math.round(h.at / road.spacing)));
  const side = h.side ?? 1;
  const yaw = Math.atan2(-road.tz[s], road.tx[s]) + (side < 0 ? Math.PI : 0);
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const ox = road.xs[s], oz = road.zs[s];
  return {
    s, side, yaw, ox, oz, roadH: road.hs[s],
    world: (u, v) => [ox + c * u + sn * v, oz - sn * u + c * v],
    local: (x, z) => { const dx = x - ox, dz = z - oz; return [c * dx - sn * dz, sn * dx + c * dz]; },
  };
}

/** Tasanteet taloille (heightmap.js:n buildHeightfield). */
export function arizonaPads(road, options, naturalHeight) {
  return (options.houses ?? []).map((h) => {
    const fr = houseFrame(road, h);
    const [x, z] = fr.world(0, HOUSE_OFFSET);
    let sum = 0, n = 0;
    for (let u = -6; u <= 6; u += 2) for (let v = -6; v <= 6; v += 2) { sum += naturalHeight(...fr.world(u, HOUSE_OFFSET + v)); n++; }
    return { x, z, r: 10, falloff: 7, h: sum / n * 0.5 + (fr.roadH + 0.5) * 0.5 };
  });
}

/** Metsävyöhyke, talot ja sillan kansi. */
export function planArizona(terrain, road, options) {
  // Metsä: karkea ruudukko etäisyydestä tien metsäosuuteen
  const F = options.forest;
  const CC = 8, half = terrain.half, CN = Math.round(terrain.size / CC) + 1;
  let forestGrid = null;
  if (F) {
    forestGrid = new Float32Array(CN * CN).fill(1e9);
    const s0 = Math.max(0, Math.round(F.from / road.spacing)), s1 = Math.min(road.count - 1, Math.round(F.to / road.spacing));
    for (let i = 0; i < CN; i++) {
      for (let j = 0; j < CN; j++) {
        const x = -half + j * CC, z = -half + i * CC;
        let best = 1e9, other = 1e9;
        for (let s = 0; s < road.count; s += 3) {
          const d = (road.xs[s] - x) ** 2 + (road.zs[s] - z) ** 2;
          if (s >= s0 && s <= s1) best = Math.min(best, d); else other = Math.min(other, d);
        }
        // Metsää vain metsäosuuden puolella: lähempänä muuta tietä (esim. kanjonia) metsä loppuu
        best = Math.sqrt(best); other = Math.sqrt(other);
        forestGrid[i * CN + j] = best + Math.max(0, best - other + 15) * 3;
      }
    }
  }
  const edge = createNoise2D(919);
  const forestAt = forestGrid
    ? (x, z) => {
      const gx = Math.min(Math.max((x + half) / CC, 0), CN - 1.001), gz = Math.min(Math.max((z + half) / CC, 0), CN - 1.001);
      const j = Math.floor(gx), i = Math.floor(gz), u = gx - j, v = gz - i;
      const d = (forestGrid[i * CN + j] * (1 - u) + forestGrid[i * CN + j + 1] * u) * (1 - v)
        + (forestGrid[(i + 1) * CN + j] * (1 - u) + forestGrid[(i + 1) * CN + j + 1] * u) * v;
      const R = F.radius ?? 110;
      return smoothstep(R, R * 0.6, d + edge(x * 0.02, z * 0.02) * 25);
    }
    : () => 0;

  const houses = (options.houses ?? []).map((h) => houseFrame(road, h));
  /** Pihan ja ajotien kohta: 2 = sorapiha/ajotie, 1 = pihanurmi. */
  const yardAt = (x, z) => {
    for (const fr of houses) {
      const [u, v] = fr.local(x, z);
      if (Math.abs(u - 5.5) < 1.8 && v > 0 && v < HOUSE_OFFSET) return 2;   // ajotie autotallille
      if (Math.hypot(u, v - HOUSE_OFFSET) < 12) return 1;
    }
    return 0;
  };
  const roadAlt = road.bridges.map((b) => ({ from: b.s0, to: b.s1, palette: WOOD_DECK }));
  return { forestAt, houses, yardAt, roadAlt: roadAlt.length ? roadAlt : null };
}

export function arizonaColorFn(layout) {
  const patch = createNoise2D(1777);
  const strataNoise = createNoise2D(1778);
  const scrub = createNoise2D(1779);
  const cSandA = new THREE.Color('#c27c4e');
  const cSandB = new THREE.Color('#b26a42');
  const cSandLight = new THREE.Color('#d39a6a');
  const cScrub = new THREE.Color('#8f8a5a');
  const cForestA = new THREE.Color('#7a6a42');
  const cForestB = new THREE.Color('#6d7440');
  const cWorn = new THREE.Color('#b77a50');
  const cVerge = new THREE.Color('#a86a45');
  const cYard = new THREE.Color('#8f9150');
  const cGravel = new THREE.Color('#b09a80');
  const tmp = new THREE.Color();
  return (col, t) => {
    const n = patch(t.x * 0.025, t.z * 0.025) * 0.5 + 0.5;
    col.copy(cSandA).lerp(cSandB, n).lerp(cSandLight, smoothstep(0.75, 1, n) * 0.5);
    // Jyrkät kohdat: kalliokerrokset korkeuden mukaan
    const steep = smoothstep(0.9, 0.66, t.slope);
    if (steep > 0) {
      const band = Math.floor((t.h + strataNoise(t.x * 0.012, t.z * 0.012) * 2.5) / 2.4);
      col.lerp(STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length], steep);
    }
    // Pensaikkoa tasaisilla kohdilla
    col.lerp(cScrub, smoothstep(0.35, 0.85, scrub(t.x * 0.045, t.z * 0.045)) * 0.35 * smoothstep(0.86, 0.95, t.slope));
    // Mäntymetsän pohja
    const f = layout.forestAt(t.x, t.z);
    if (f > 0) col.lerp(tmp.copy(cForestA).lerp(cForestB, n), f * 0.85 * smoothstep(0.72, 0.86, t.slope));
    // Talojen pihat
    const y = layout.yardAt(t.x, t.z);
    if (y === 2) col.copy(cGravel);
    else if (y === 1) col.lerp(cYard, 0.55);
    // Tien reuna
    col.lerp(cWorn, smoothstep(t.flat + 4, t.flat + 1, t.rd) * 0.6);
    col.lerp(cVerge, smoothstep(t.flat + 0.8, t.flat - 0.4, t.rd));
    col.multiplyScalar(0.93 + t.rand() * 0.12);
  };
}

/** Laatikko-törmäysmuoto täydellä kierrolla (q = THREE.Quaternion). */
function addOrientedBox(world, RAPIER, body, p, q, hx, hy, hz) {
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(p.x, p.y, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    body,
  );
}

export function buildArizona({ scene, world, RAPIER, terrain, road, layout, rand, options = {} }) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const flat = road.halfWidth + road.shoulder;
  const limit = terrain.half * 0.8;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const taken = [];   // [x, z, säde]: talot ja kalliomuodostelmat
  const free = (x, z, r) => !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r);
  for (const fr of layout.houses) taken.push([...fr.world(0, HOUSE_OFFSET), 14]);

  // --- Kalliomuodostelmat: mesat, pylväät ja hoodoot ------------------------------------
  const nForm = options.formations ?? 16;
  for (let attempt = 0, placed = 0; attempt < 600 && placed < nForm; attempt++) {
    const x = (rand() * 2 - 1) * limit * 0.95, z = (rand() * 2 - 1) * limit * 0.95;
    const butte = rand() < 0.4;
    const r0 = butte ? 7 + rand() * 7 : 2 + rand() * 2.5;
    if (terrain.roadDistanceAt(x, z) < r0 + 22 || layout.forestAt(x, z) > 0.15 || !free(x, z, r0 + 6)) continue;
    let lo = Infinity;
    for (let a = 0; a < 6.28; a += 1.05) lo = Math.min(lo, terrain.heightAt(x + Math.cos(a) * r0, z + Math.sin(a) * r0));
    const g = new THREE.Group();
    g.position.set(x, lo - 1, z);
    g.rotation.y = rand() * 6.28;
    const H = butte ? 10 + rand() * 10 : 9 + rand() * 9;
    const tiers = butte ? 3 : 4 + Math.floor(rand() * 2);
    let y = 0, r = r0;
    for (let k = 0; k < tiers; k++) {
      const h = (H / tiers) * (0.8 + rand() * 0.4);
      const rTop = butte ? r * (0.88 + rand() * 0.08) : r * (0.75 + rand() * 0.2);
      const geo = new THREE.CylinderGeometry(rTop, r, h, butte ? 9 : 7).translate(0, h / 2, 0);
      const mesh = new THREE.Mesh(geo, flatMaterial(STRATA[(k * 2 + Math.floor(rand() * 2)) % STRATA.length].getStyle()));
      mesh.position.y = y;
      mesh.rotation.y = rand() * 6.28;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      y += h;
      r = rTop;
    }
    if (!butte) {   // hoodoon kivihattu
      const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(r * 1.7, 0).scale(1, 0.45, 1), flatMaterial('#7b3a22'));
      cap.position.y = y + r * 0.3;
      cap.castShadow = true;
      g.add(cap);
    }
    scene.add(g);
    addCylinderCollider(world, RAPIER, body, x, lo - 1, z, y + 1, r0 * 0.95);
    taken.push([x, z, r0 + 2]);
    placed++;
  }

  // --- Männyt metsävyöhykkeelle -------------------------------------------------------------
  if (options.forest) {
    const trunk = new InstanceBatch(new THREE.CylinderGeometry(0.16, 0.26, 1, 6).translate(0, 0.5, 0), flatMaterial('#6e4630'));
    const crownA = new InstanceBatch(new THREE.ConeGeometry(1.7, 3.6, 7).translate(0, 1.8, 0), flatMaterial('#ffffff'));
    const crownB = new InstanceBatch(new THREE.ConeGeometry(1.2, 2.8, 7).translate(0, 1.4, 0), flatMaterial('#ffffff'));
    const greens = ['#3f5f2e', '#4a6b33', '#365428', '#527338'].map((c) => new THREE.Color(c));
    const nPines = options.pines ?? 1800;
    for (let attempt = 0, placed = 0; attempt < nPines * 12 && placed < nPines; attempt++) {
      const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
      const f = layout.forestAt(x, z);
      if (f <= 0.05 || rand() > f) continue;
      const rd = terrain.roadDistanceAt(x, z);
      if (rd < flat + 3.5 || slopeAt(terrain, x, z) > 0.55 || !free(x, z, 1.5)) continue;
      if (rd < 40 && rand() < 0.1) continue;
      const H = 7 + rand() * 6, sc = 0.8 + rand() * 0.5;
      const y = terrain.heightAt(x, z) - 0.15;
      const yaw = rand() * 6.28;
      q.setFromAxisAngle(UP, yaw);
      m.compose(p.set(x, y, z), q, s.set(sc, H * 0.45 + 3.2 * sc, sc));   // runko latvan sisään asti
      trunk.add(m);
      col.copy(greens[Math.floor(rand() * greens.length)]).multiplyScalar(0.9 + rand() * 0.2);
      m.compose(p.set(x, y + H * 0.45, z), q, s.set(sc, sc * 1.1, sc));
      crownA.add(m, col);
      m.compose(p.set(x, y + H * 0.45 + 2.4 * sc, z), q, s.set(sc, sc * 1.1, sc));
      crownB.add(m, col);
      addCylinderCollider(world, RAPIER, body, x, y, z, H, 0.3 * sc);
      placed++;
    }
    trunk.build(scene);
    crownA.build(scene);
    crownB.build(scene);
  }

  // --- Pensaat (salvia ja kataja) ---------------------------------------------------------
  {
    const shrubs = new InstanceBatch(new THREE.IcosahedronGeometry(1, 0), flatMaterial('#ffffff'));
    const sage = ['#8a8f62', '#7a8457', '#9a9468', '#6f7a4a', '#5f6e42'].map((c) => new THREE.Color(c));
    const n = options.shrubs ?? 1500;
    for (let attempt = 0, placed = 0; attempt < n * 6 && placed < n; attempt++) {
      const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
      if (terrain.roadDistanceAt(x, z) < flat + 1.5 || slopeAt(terrain, x, z) > 0.5 || !free(x, z, 1)) continue;
      if (layout.forestAt(x, z) > 0.6 && rand() < 0.6) continue;
      const sc = 0.45 + rand() * 0.9;
      m.compose(p.set(x, terrain.heightAt(x, z) + sc * 0.15, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc * 1.2, sc * 0.75, sc));
      shrubs.add(m, col.copy(sage[Math.floor(rand() * sage.length)]).multiplyScalar(0.85 + rand() * 0.3));
      placed++;
    }
    shrubs.build(scene);
  }

  // --- Kiviä paljon ----------------------------------------------------------------------
  const rockColors = ['#9b4a2a', '#b5643a', '#8a3f25', '#a65535', '#7d5a48'].map((c) => new THREE.Color(c));
  scatterRocks(scene, world, RAPIER, body, terrain, rand, {
    count: options.rocks ?? 520, clear: flat + 2, limit, sizeMax: 2.4,
    skip: (x, z) => !free(x, z, 2),
    colorFn: (r) => col.copy(rockColors[Math.floor(r() * rockColors.length)]).multiplyScalar(0.85 + r() * 0.3).clone(),
  });

  for (const fr of layout.houses) buildHouse({ scene, world, RAPIER, terrain, road, fr, rand, body });
  for (const b of road.bridges) buildDeckBridge({ scene, world, RAPIER, terrain, road, b, body });
  if (options.overpass) buildOverpass({ scene, world, RAPIER, terrain, road, o: options.overpass, body, rand });
}

// --- Amerikkalainen omakotitalo: lautaverhous, kuisti, autotalli ja postilaatikko -----------
function buildHouse({ scene, world, RAPIER, terrain, road, fr, rand, body }) {
  const H = (u, v) => terrain.heightAt(...fr.world(u, v));
  const mats = {};
  const M = (c) => (mats[c] ??= flatMaterial(c));
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const group = (u, v, y, rot = 0) => {
    const g = new THREE.Group();
    const [x, z] = fr.world(u, v);
    g.position.set(x, y, z);
    g.rotation.y = fr.yaw + rot;
    scene.add(g);
    return (geo, color, px, py, pz) => {
      const mesh = new THREE.Mesh(geo, M(color));
      mesh.position.set(px, py, pz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
  };
  const ground = (u, v, w, d) => {
    let lo = Infinity, hi = -Infinity;
    for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) {
      const h = H(u + a, v + b); lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return [lo, hi];
  };
  const collider = (u, v, y0, y1, hw, hd) => {
    const [x, z] = fr.world(u, v);
    addBoxCollider(world, RAPIER, body, x, (y0 + y1) / 2, z, hw, (y1 - y0) / 2, hd, fr.yaw);
  };

  const siding = SIDING[Math.floor(rand() * SIDING.length)];
  const trim = '#f4f1ea', roof = rand() < 0.5 ? '#5b5751' : '#6b4f3f', glass = '#2a333b';
  const door = ['#7a2f26', '#2f4a6a', '#3d5a3a'][Math.floor(rand() * 3)];
  const L = 10, D = 8, wallH = 3.0;
  const u0 = -2, v0 = HOUSE_OFFSET;
  const [lo, hi] = ground(u0, v0, L + 8, D + 4);
  const floor = hi + 0.45;
  const add = group(u0, v0, floor);

  add(box(L + 0.2, floor - lo + 0.2, D + 0.2), '#9a958c', 0, -(floor - lo) / 2 + 0.05, 0);   // perustus
  add(box(L, wallH, D), siding, 0, wallH / 2, 0);
  const sidingLine = '#' + new THREE.Color(siding).multiplyScalar(0.82).getHexString();   // lautaverhouksen saumat
  for (let y = 0.35; y < wallH; y += 0.3) add(box(L + 0.03, 0.035, D + 0.03), sidingLine, 0, y, 0);
  for (const [cx, cz] of [[L / 2, D / 2], [-L / 2, D / 2], [L / 2, -D / 2], [-L / 2, -D / 2]]) add(box(0.2, wallH, 0.2), trim, cx, wallH / 2, cz);
  add(gableRoofGeometry(L, 2.0, D, 0.45), roof, 0, wallH + 1.0, 0);
  add(box(0.9, 2.4, 0.9), '#8a7f72', -L / 2 + 1.2, wallH + 1.2, 1.4);   // kivinen savupiippu
  // Ikkunat ja ikkunaluukut etuseinällä (kohti tietä, -z) ja takana
  const win = (x, y, z, nz) => {
    add(box(1.2, 1.4, 0.06), trim, x, y, z + nz * 0.03);
    add(box(0.95, 1.15, 0.05), glass, x, y, z + nz * 0.06);
    for (const sx of [-1, 1]) add(box(0.35, 1.4, 0.06), '#2b2f33', x + sx * 0.82, y, z + nz * 0.03);
  };
  for (const wx of [-3.4, -1.4, 2.8]) win(wx, 1.6, -D / 2, -1);
  for (const wx of [-3, 0, 3]) win(wx, 1.6, D / 2, 1);
  add(box(1.0, 2.1, 0.08), door, 0.7, 1.05, -D / 2 - 0.04);
  add(box(1.3, 0.12, 0.1), trim, 0.7, 2.18, -D / 2 - 0.05);
  // Kuisti: lattia, pylväät, katto ja portaat
  const pw = 5, pd = 2.2;
  add(box(pw, 0.2, pd), '#8b7a62', 0.2, -0.1, -D / 2 - pd / 2);
  for (const px of [-pw / 2 + 0.3, 0, pw / 2 - 0.3]) add(box(0.16, 2.5, 0.16), trim, 0.2 + px, 1.25, -D / 2 - pd + 0.15);
  const pr = add(box(pw + 0.4, 0.14, pd + 0.4), roof, 0.2, 2.6, -D / 2 - pd / 2);
  pr.rotation.x = -0.12;
  const step = Math.max(0.25, floor - H(u0 + 0.2, v0 - D / 2 - pd - 0.6));
  add(box(1.6, step, 0.9), '#9a958c', 0.2, -step / 2, -D / 2 - pd - 0.45);
  // Autotalli kyljessä (ajotien päässä) ja autotallin ovi
  const gx = L / 2 + 3, gw = 6, gd = 7, gh = 2.7;
  add(box(gw, gh, gd), siding, gx, gh / 2, 0.3);
  add(gableRoofGeometry(gw, 1.3, gd, 0.35), roof, gx, gh + 0.65, 0.3);
  add(box(gw - 1.2, 2.2, 0.08), '#f1efe9', gx, 1.1, 0.3 - gd / 2 - 0.04);
  for (let y = 0.55; y < 2.2; y += 0.55) add(box(gw - 1.25, 0.04, 0.1), '#c9c6bf', gx, y, 0.3 - gd / 2 - 0.06);
  add(box(gw, floor - lo + 0.2, gd), '#9a958c', gx, -(floor - lo) / 2 + 0.05, 0.3);
  collider(u0, v0, lo, floor + wallH, L / 2, D / 2);
  collider(u0 + gx, v0 + 0.3, lo, floor + gh, gw / 2, gd / 2);
  // Postilaatikko tien vieressä ajotien suulla
  const flat = road.halfWidth + road.shoulder;
  const mbV = flat + 1.2, mbU = 3.6;
  const mby = H(mbU, mbV);
  const mb = group(mbU, mbV, mby);
  mb(box(0.12, 1.1, 0.12), '#6e4b32', 0, 0.55, 0);
  mb(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), '#3b3f45', 0, 1.15, 0);
  mb(box(0.4, 0.22, 0.5), '#3b3f45', 0, 1.06, 0);
  mb(box(0.05, 0.25, 0.08), '#c23b2b', 0.22, 1.25, 0.1);
}

// --- Puusilta kanjonin yli: kansi, kaiteet ja pukkituet kanjonin pohjaan asti ---------------
function buildDeckBridge({ scene, world, RAPIER, terrain, road, b, body }) {
  const { xs, zs, hs, tx, tz } = road;
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const planks = new InstanceBatch(unit, flatMaterial('#ffffff'));
  const timber = new InstanceBatch(unit, flatMaterial('#5e4733'));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qYaw = new THREE.Quaternion();
  const qTilt = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const col = new THREE.Color();
  const Z = new THREE.Vector3(0, 0, 1);
  const X = new THREE.Vector3(1, 0, 0);
  const hw = road.halfWidth;
  const deckW = road.width + 1.2;
  const woods = ['#6b5138', '#5f4630', '#77593d', '#664c34'].map((c) => new THREE.Color(c));

  /** Palkki pisteestä a pisteeseen b (THREE.Vector3), poikkileikkaus t × t. */
  const beam = (batch, a, c, t = 0.22) => {
    const d = new THREE.Vector3().subVectors(c, a);
    const len = d.length();
    q.setFromUnitVectors(X, d.normalize());
    m.compose(p.addVectors(a, c).multiplyScalar(0.5), q, sc.set(len, t, t));
    batch.add(m);
  };

  // Kansi: poikittaiset lankut, alla pitkittäiset palkit; törmäysmuoto 2 m paloina
  for (let s = b.s0; s < b.s1; s++) {
    const yaw = Math.atan2(-tz[s], tx[s]);
    const pitch = Math.atan2(hs[s + 1] - hs[s], Math.hypot(xs[s + 1] - xs[s], zs[s + 1] - zs[s]));
    qYaw.setFromAxisAngle(UP, yaw);
    qTilt.setFromAxisAngle(Z, pitch);
    q.copy(qYaw).multiply(qTilt);
    m.compose(p.set((xs[s] + xs[s + 1]) / 2, (hs[s] + hs[s + 1]) / 2 - 0.08, (zs[s] + zs[s + 1]) / 2), q, sc.set(0.92, 0.16, deckW));
    planks.add(m, col.copy(woods[s % woods.length]));
    if ((s - b.s0) % 2 === 0 && s + 2 <= b.s1) {
      const s2 = s + 2;
      const pitch2 = Math.atan2(hs[s2] - hs[s], Math.hypot(xs[s2] - xs[s], zs[s2] - zs[s]));
      q.copy(qYaw).multiply(qTilt.setFromAxisAngle(Z, pitch2));
      const c = new THREE.Vector3((xs[s] + xs[s2]) / 2, (hs[s] + hs[s2]) / 2 - 0.2, (zs[s] + zs[s2]) / 2);
      addOrientedBox(world, RAPIER, body, c, q, 1.0, 0.2, deckW / 2);
      // Kaiteet törmäysmuotoina
      for (const side of [-1, 1]) {
        const o = side * (hw + 0.45);
        addOrientedBox(world, RAPIER, body, new THREE.Vector3(c.x - tz[s] * o, c.y + 0.75, c.z + tx[s] * o), q, 1.0, 0.55, 0.08);
      }
    }
  }
  // Pitkittäiset palkit kannen alla ja kaiteet
  const at = (s, o, dy) => new THREE.Vector3(xs[s] - tz[s] * o, hs[s] + dy, zs[s] + tx[s] * o);
  for (let s = b.s0; s < b.s1; s += 4) {
    const s2 = Math.min(b.s1, s + 4);
    for (const o of [-hw, -hw / 3, hw / 3, hw]) beam(timber, at(s, o, -0.35), at(s2, o, -0.35), 0.3);
    for (const side of [-1, 1]) {
      const o = side * (hw + 0.45);
      beam(timber, at(s, o, 1.0), at(s2, o, 1.0), 0.16);
      beam(timber, at(s, o, 0.5), at(s2, o, 0.5), 0.12);
    }
  }
  for (let s = b.s0; s <= b.s1; s += 2) {
    for (const side of [-1, 1]) beam(timber, at(s, side * (hw + 0.45), -0.1), at(s, side * (hw + 0.45), 1.1), 0.16);
  }
  // Pukkituet 5 m välein: kolme pylvästä maahan asti, vaakapuut ja ristikkäiset vinotuet
  for (let s = b.s0 + 3; s < b.s1 - 2; s += 5) {
    const top = hs[s] - 0.5;
    const offs = [-hw - 0.6, 0, hw + 0.6];
    const grounds = offs.map((o) => { const v = at(s, o, 0); return terrain.heightAt(v.x, v.z) - 0.5; });
    if (Math.max(...grounds) > top - 1) continue;
    offs.forEach((o, k) => beam(timber, at(s, o, top - hs[s]).setY(grounds[k]), at(s, o, top - hs[s]), 0.32));
    for (let y = top - 3.5; y > Math.min(...grounds) + 1; y -= 3.5) {
      const ok = (k) => grounds[k] < y - 0.5;
      if (ok(0) && ok(2)) beam(timber, at(s, offs[0], 0).setY(y), at(s, offs[2], 0).setY(y), 0.18);
      if (ok(0) && ok(1)) beam(timber, at(s, offs[0], 0).setY(y), at(s, offs[1], 0).setY(y + 3.5), 0.14);
      if (ok(1) && ok(2)) beam(timber, at(s, offs[2], 0).setY(y), at(s, offs[1], 0).setY(y + 3.5), 0.14);
    }
    for (const [k, o] of offs.entries()) {
      const v = at(s, o, 0);
      addCylinderCollider(world, RAPIER, body, v.x, grounds[k], v.z, top - grounds[k], 0.25);
    }
  }
  planks.build(scene);
  timber.build(scene);
}

// --- Vanha rautatiesilta kanjonin yli, tie kulkee sen alta -----------------------------------
function buildOverpass({ scene, world, RAPIER, terrain, road, o, body }) {
  const s = Math.min(road.count - 1, Math.max(0, Math.round(o.at / road.spacing)));
  const { xs, zs, hs, tx, tz } = road;
  const deck = hs[s] + (o.height ?? 12);
  const flat = road.halfWidth + road.shoulder;
  const rx = -tz[s], rz = tx[s];   // sillan suunta (tien poikki)
  const pt = (off, y) => new THREE.Vector3(xs[s] + rx * off, y, zs[s] + rz * off);
  // Sillan päät: kohta, jossa kanjonin seinä nousee kannen tasolle
  const reach = (dir) => {
    for (let d = flat + 2; d < 80; d += 1) {
      const v = pt(dir * d, 0);
      if (terrain.heightAt(v.x, v.z) > deck - 0.3) return d + 3;
    }
    return 80;
  };
  const e0 = reach(-1), e1 = reach(1);
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const timber = new InstanceBatch(unit, flatMaterial('#5a4532'));
  const ties = new InstanceBatch(unit, flatMaterial('#4a3a2c'));
  const steel = new InstanceBatch(unit, flatMaterial('#3c3a38'));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);
  const beam = (batch, a, c, t = 0.22, t2 = t) => {
    const d = new THREE.Vector3().subVectors(c, a);
    const len = d.length();
    q.setFromUnitVectors(X, d.normalize());
    m.compose(p.addVectors(a, c).multiplyScalar(0.5), q, sc.set(len, t, t2));
    batch.add(m);
  };
  const along = (v, d) => v.clone().add(new THREE.Vector3(tx[s] * d, 0, tz[s] * d));   // tien suuntaan
  // Kansipalkit ja ratapölkyt
  for (const d of [-1.1, 1.1]) beam(timber, along(pt(-e0, deck - 0.35), d), along(pt(e1, deck - 0.35), d), 0.5, 0.4);
  for (let off = -e0; off <= e1; off += 0.7) beam(ties, along(pt(off, deck + 0.02), -1.5), along(pt(off, deck + 0.02), 1.5), 0.16, 0.24);
  for (const d of [-0.72, 0.72]) beam(steel, along(pt(-e0, deck + 0.17), d), along(pt(e1, deck + 0.17), d), 0.12, 0.08);
  for (const d of [-1.6, 1.6]) beam(timber, along(pt(-e0, deck + 0.8), d), along(pt(e1, deck + 0.8), d), 0.1);
  // Pukit 4,5 m välein tien molemmin puolin (ei tien kohdalle)
  for (let off = -e0 + 2; off <= e1 - 2; off += 4.5) {
    if (Math.abs(off) < flat + 1.8) continue;
    const base = pt(off, 0);
    const g = terrain.heightAt(base.x, base.z) - 0.4;
    if (g > deck - 1.5) continue;
    for (const d of [-1.4, 1.4]) beam(timber, along(pt(off, g), d), along(pt(off, deck - 0.6), d), 0.3);
    for (let y = deck - 0.6; y > g + 2; y -= 3) {
      beam(timber, along(pt(off, y), -1.4), along(pt(off, y), 1.4), 0.16);
      if (y - 3 > g) beam(timber, along(pt(off, y), -1.4), along(pt(off, y - 3), 1.4), 0.12);
    }
    addBoxCollider(world, RAPIER, body, base.x, (g + deck) / 2, base.z, 0.4, (deck - g) / 2, 1.7, Math.atan2(-rz, rx));
  }
  timber.build(scene);
  ties.build(scene);
  steel.build(scene);
}
