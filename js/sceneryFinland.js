// Suomalaisen metsäteeman lisät: hakkuuaukeat (kannot, hakkuutähteet, taimet),
// peltoaukeat (kaistapellot, säilörehupaalit, punaiset talot ja ladot) sekä
// tienvarren pihapiirit (kaksi vanhaa puutaloa, koivut ja maitolaituri).
// Vyöhykkeet annetaan tracks.js:ssä: scenery.clearcuts ja scenery.fields = [[x, z, säde], …],
// pihat scenery.farmsteads = [{ at: metriä tien alusta, side: 1 = oikealla, -1 = vasemmalla }].

import * as THREE from 'three';
import { createNoise2D, smoothstep } from './noise.js';
import {
  UP, slopeAt, flatMaterial, InstanceBatch, addCylinderCollider, addBoxCollider, gableRoofGeometry,
} from './sceneryKit.js';

const hash2 = (i, j) => {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Peltojen värit: ohra, nurmi, heinä, kynnös
const FIELD_COLORS = ['#cdbb5c', '#7fae46', '#a7b55b', '#6f5639'].map((c) => new THREE.Color(c));

// --- Pihapiiri: paikallinen koordinaatisto u = tien suuntaan, v = poispäin tiestä --------
const YARD_OFFSET = 19;   // pihan keskipiste tien keskilinjasta (m)
const YARD_RADIUS = 13;   // tasoitetun pihan säde (m)
const YARD_FALLOFF = 8;   // tasanteen reunaluiska (m)

/** Pihan kehys tien kohdassa: maailma ↔ paikallinen (u, v). */
function farmFrame(road, f) {
  const s = Math.min(road.count - 1, Math.max(0, Math.round(f.at / road.spacing)));
  const side = f.side ?? 1;
  const ax = road.tx[s], az = road.tz[s];
  const yaw = Math.atan2(-az, ax) + (side < 0 ? Math.PI : 0);   // ryhmän kierto: +z = poispäin tiestä
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const ox = road.xs[s], oz = road.zs[s];
  return {
    s, side, yaw, ox, oz, roadH: road.hs[s],
    world: (u, v) => [ox + c * u + sn * v, oz - sn * u + c * v],
    local: (x, z) => { const dx = x - ox, dz = z - oz; return [c * dx - sn * dz, sn * dx + c * dz]; },
  };
}

/** Maaston tasanteet pihoille (heightmap.js:n buildHeightfield). */
export function farmsteadPads(road, options, naturalHeight) {
  return (options.farmsteads ?? []).map((f) => {
    const fr = farmFrame(road, f);
    const [x, z] = fr.world(0, YARD_OFFSET);
    let sum = 0, n = 0;
    for (let u = -8; u <= 8; u += 2) for (let v = -8; v <= 8; v += 2) {
      sum += naturalHeight(...fr.world(u, YARD_OFFSET + v)); n++;
    }
    // Piha luonnollisen maan ja tien tason väliin, ettei ajotie ole liian jyrkkä
    const h = Math.max(sum / n * 0.6 + (fr.roadH + 1) * 0.4, fr.roadH + 0.4);
    return { x, z, r: YARD_RADIUS, falloff: YARD_FALLOFF, h };
  });
}

/** Vyöhykkeet tai null (silloin metsä on kuten ennen). */
export function planFinland(terrain, road, options) {
  const clearcuts = options.clearcuts ?? [];
  const fields = options.fields ?? [];
  const farms = (options.farmsteads ?? []).map((f) => farmFrame(road, f));
  if (!clearcuts.length && !fields.length && !farms.length) return null;
  const edge = createNoise2D(515);
  const inside = (zones, x, z) => {
    let best = 0;
    for (const [cx, cz, r] of zones) {
      const rr = r * (1 + edge(x * 0.03, z * 0.03) * 0.18);   // rosoinen reuna
      const d = Math.hypot(x - cx, z - cz);
      if (d < rr) best = Math.max(best, 1 - d / rr);
    }
    return best;
  };
  const clearcutAt = (x, z) => inside(clearcuts, x, z);
  const fieldAt = (x, z) => inside(fields, x, z);
  /** Pihan pintatyyppi: 2 = ajotie/sorapiha, 1 = pihanurmi, 0 = ei pihaa. */
  const yardAt = (x, z) => {
    for (const fr of farms) {
      const [u, v] = fr.local(x, z);
      if (Math.hypot(u, v - YARD_OFFSET) > YARD_RADIUS + 2) continue;
      const drive = Math.abs(u - 2) < 1.5 && v > 0 && v < 14;
      const gravel = Math.hypot((u - 3) / 1.3, v - 14.5) < 5.5 + edge(x * 0.15, z * 0.15) * 1.2;
      return drive || gravel ? 2 : 1;
    }
    return 0;
  };
  return {
    clearcuts, fields, clearcutAt, fieldAt, farms, yardAt,
    zoneAt: (x, z) => Math.max(clearcutAt(x, z), fieldAt(x, z)),
    /** Pihat: näille ei tule metsän puita eikä kiviä. */
    clearAt: (x, z) => farms.some((fr) => {
      const [u, v] = fr.local(x, z);
      return Math.hypot(u, v - YARD_OFFSET) < YARD_RADIUS + 3 || (Math.abs(u) < 8 && v > 0 && v < YARD_OFFSET);
    }),
    /** Peltokaistan tyyppi (FIELD_COLORS-indeksi) ja onko kohdalla oja. */
    stripAt: (x, z) => {
      const A = 0.35;
      const u = (x * Math.cos(A) + z * Math.sin(A)) / 22;
      const v = (-x * Math.sin(A) + z * Math.cos(A)) / 60;
      const iu = Math.floor(u), iv = Math.floor(v);
      return { type: Math.floor(hash2(iu, iv) * 4), ditch: u - iu < 0.06 };
    },
  };
}

/** Lisää metsän värityksen päälle hakkuuaukeat ja pellot. */
export function finlandOverlay(layout) {
  const cCutA = new THREE.Color('#8b8052');
  const cCutB = new THREE.Color('#9a8d5c');
  const cDitch = new THREE.Color('#557a35');
  const cEdge = new THREE.Color('#93a35a');
  const cYard = new THREE.Color('#86a24f');
  const cGravel = new THREE.Color('#a8977a');
  const tmp = new THREE.Color();
  return (col, t) => {
    const y = layout.yardAt(t.x, t.z);
    if (y === 2) col.copy(cGravel);
    else if (y === 1) col.lerp(cYard, 0.6);
    const cc = layout.clearcutAt(t.x, t.z);
    if (cc > 0) col.lerp(tmp.copy(cCutA).lerp(cCutB, (Math.sin(t.x * 0.7) * Math.cos(t.z * 0.6)) * 0.5 + 0.5), smoothstep(0, 0.12, cc));
    const f = layout.fieldAt(t.x, t.z);
    if (f > 0 && t.slope > 0.85) {
      const strip = layout.stripAt(t.x, t.z);
      col.lerp(cEdge, smoothstep(0, 0.06, f));
      if (f > 0.06) col.copy(strip.ditch ? cDitch : FIELD_COLORS[strip.type]);
    }
  };
}

/** Kannot, hakkuutähteet, taimet, paalit ja talot. */
export function buildFinland({ scene, world, RAPIER, terrain, road, layout, rand }) {
  if (!layout) return;
  for (const fr of layout.farms) buildFarmstead({ scene, world, RAPIER, terrain, road, fr, rand });
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const flat = road.halfWidth + road.shoulder;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const H = (x, z) => terrain.heightAt(x, z);
  const randIn = ([cx, cz, r]) => {
    const a = rand() * 6.28, d = Math.sqrt(rand()) * r * 0.95;
    return [cx + Math.cos(a) * d, cz + Math.sin(a) * d];
  };

  // --- Hakkuuaukeat ----------------------------------------------------------------
  const stumps = new InstanceBatch(new THREE.CylinderGeometry(0.28, 0.34, 0.55, 7).translate(0, 0.27, 0), flatMaterial('#7a5b3c'));
  const slash = new InstanceBatch(new THREE.DodecahedronGeometry(0.5, 0), flatMaterial('#ffffff'), { castShadow: false });
  const saplings = new InstanceBatch(new THREE.ConeGeometry(0.5, 1.6, 6).translate(0, 0.8, 0), flatMaterial('#ffffff'));
  for (const zone of layout.clearcuts) {
    const n = Math.round(zone[2] * zone[2] * 0.012);
    for (let i = 0; i < n; i++) {
      const [x, z] = randIn(zone);
      if (terrain.roadDistanceAt(x, z) < flat + 2) continue;
      const y = H(x, z);
      const r = rand();
      if (r < 0.45) {
        const sc = 0.8 + rand() * 0.6;
        m.compose(p.set(x, y - 0.12, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc, 0.8 + rand() * 0.6, sc));
        stumps.add(m);
        addCylinderCollider(world, RAPIER, body, x, y - 0.1, z, 0.5, 0.3 * sc);
      } else if (r < 0.75) {
        const sc = 0.6 + rand() * 1.0;
        m.compose(p.set(x, y + 0.05, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc * 2, sc * 0.5, sc * 1.2));
        slash.add(m, col.setHSL(0.08, 0.25, 0.32 + rand() * 0.12));
      } else {
        const sc = 0.5 + rand() * 1.1;
        m.compose(p.set(x, y - 0.05, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc, sc, sc));
        saplings.add(m, col.set('#3d7f3e').multiplyScalar(0.85 + rand() * 0.3));
      }
    }
  }
  stumps.build(scene);
  slash.build(scene);
  saplings.build(scene);

  // --- Pellot: säilörehupaalit -------------------------------------------------------
  const bales = new InstanceBatch(new THREE.CylinderGeometry(0.65, 0.65, 1.2, 12).rotateZ(Math.PI / 2), flatMaterial('#f1f1ec'));
  const taken = [];
  for (const zone of layout.fields) {
    const groups = 2 + Math.floor(rand() * 2);
    for (let g = 0; g < groups; g++) {
      const [gx, gz] = randIn(zone);
      if (terrain.roadDistanceAt(gx, gz) < flat + 6) continue;
      const yaw0 = rand() * 6.28;
      const n = 3 + Math.floor(rand() * 6);
      for (let i = 0; i < n; i++) {
        const x = gx + Math.cos(yaw0) * i * 1.5 + (rand() - 0.5) * 0.3;
        const z = gz + Math.sin(yaw0) * i * 1.5 + (rand() - 0.5) * 0.3;
        if (terrain.roadDistanceAt(x, z) < flat + 3) continue;
        const yaw = -yaw0 + Math.PI / 2 + (rand() - 0.5) * 0.2;
        m.compose(p.set(x, H(x, z) + 0.62, z), q.setFromAxisAngle(UP, yaw), s.set(1, 1, 1));
        bales.add(m);
        addBoxCollider(world, RAPIER, body, x, H(x, z) + 0.65, z, 0.6, 0.65, 0.65, yaw);
      }
      taken.push([gx, gz, 8]);
    }
  }
  bales.build(scene);

  // --- Punainen talo ja lato pellon laidalle -------------------------------------------
  const red = flatMaterial('#9a2c1f');
  const white = flatMaterial('#f2efe6');
  const roofDark = flatMaterial('#3a3b3f');
  const glass = flatMaterial('#2b3540');
  const barnRed = flatMaterial('#8a2a1e');
  for (const zone of layout.fields) {
    for (let attempt = 0; attempt < 80; attempt++) {
      const a = rand() * 6.28, d = zone[2] * (0.6 + rand() * 0.35);
      const x = zone[0] + Math.cos(a) * d, z = zone[1] + Math.sin(a) * d;
      const rd = terrain.roadDistanceAt(x, z);
      if (rd < 16 || rd > 45 || slopeAt(terrain, x, z) > 0.15 || taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + 10)) continue;
      // Etuseinä kohti lähintä tienkohtaa (karkea haku)
      let bs = 0, bd = Infinity;
      for (let k = 0; k < road.count; k += 4) {
        const dd = (road.xs[k] - x) ** 2 + (road.zs[k] - z) ** 2;
        if (dd < bd) { bd = dd; bs = k; }
      }
      const yaw = Math.atan2(road.xs[bs] - x, road.zs[bs] - z);
      const base = Math.min(H(x, z), H(x + 5, z), H(x - 5, z), H(x, z + 5), H(x, z - 5)) - 0.4;
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
      // Asuinrakennus
      const wh = 4.2;
      add(new THREE.BoxGeometry(9, wh, 6), red, 0, wh / 2, 0);
      add(gableRoofGeometry(9, 2.2, 6, 0.4), roofDark, 0, wh + 1.1, 0);
      for (const [cx, cz] of [[4.5, 3], [-4.5, 3], [4.5, -3], [-4.5, -3]]) add(new THREE.BoxGeometry(0.25, wh, 0.25), white, cx, wh / 2, cz);
      for (const wx of [-2.8, 0, 2.8]) {
        add(new THREE.BoxGeometry(1.2, 1.3, 0.08), white, wx, 2.5, 3.02);
        add(new THREE.BoxGeometry(0.9, 1.0, 0.1), glass, wx, 2.5, 3.04);
      }
      add(new THREE.BoxGeometry(1.1, 2.1, 0.1), white, -4.0 + 0.8, 1.45, 3.03);
      add(new THREE.BoxGeometry(0.7, 1.4, 0.7), red, 2, wh + 1.7, -1);   // savupiippu
      // Lato sivulla
      add(new THREE.BoxGeometry(11, 5, 7.5), barnRed, 13, 2.5, -4);
      add(gableRoofGeometry(11, 2.6, 7.5, 0.4), roofDark, 13, 5 + 1.3, -4);
      add(new THREE.BoxGeometry(3.6, 3.6, 0.1), white, 13, 1.8, -0.2);
      scene.add(g);
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      addBoxCollider(world, RAPIER, body, x, base + wh / 2, z, 4.6, wh / 2 + 0.5, 3.1, yaw);
      addBoxCollider(world, RAPIER, body, x + 13 * cos - 4 * sin, base + 2.5, z - 13 * sin - 4 * cos, 5.6, 2.8, 3.8, yaw);
      taken.push([x, z, 20]);
      break;
    }
  }
}

// --- Pihapiiri: vanha punainen päärakennus, harmaa hirsitupa, koivut ja maitolaituri ------
function buildFarmstead({ scene, world, RAPIER, terrain, road, fr, rand }) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const H = (u, v) => terrain.heightAt(...fr.world(u, v));
  const mat = {};
  const M = (c) => (mat[c] ??= flatMaterial(c));

  /** Ryhmä paikallisessa koordinaatistossa (u, v) kierrettynä rot (rad). add(geo, väri, x, y, z, rotY). */
  const group = (u, v, y, rot = 0) => {
    const g = new THREE.Group();
    const [x, z] = fr.world(u, v);
    g.position.set(x, y, z);
    g.rotation.y = fr.yaw + rot;
    scene.add(g);
    return (geo, color, px, py, pz, ry = 0) => {
      const mesh = new THREE.Mesh(geo, M(color));
      mesh.position.set(px, py, pz);
      mesh.rotation.y = ry;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
  };
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  /** Piste (u, v) + paikallinen siirto ryhmän koordinaateissa (rot = 0). */
  const uvAlong = (u, v, dx, dz) => [u + dx, v + dz];
  /** Maan korkeus alueella: [alin, ylin]. */
  const groundRange = (u, v, w, d, rot = 0) => {
    let lo = Infinity, hi = -Infinity;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (const [a, b] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) {
      const h = H(u + a * c + b * s, v - a * s + b * c);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    return [lo, hi];
  };
  const collider = (u, v, y0, y1, hw, hd, rot = 0) => {
    const [x, z] = fr.world(u, v);
    addBoxCollider(world, RAPIER, body, x, (y0 + y1) / 2, z, hw, (y1 - y0) / 2, hd, fr.yaw + rot);
  };
  /** Ikkuna: valkoinen karmi, tumma lasi ja ristipuitteet. nz = seinän suunta (+1 / -1), z = seinän paikka. */
  const window6 = (add, x, y, z, nz, w = 1.0, h = 1.3, frame = '#f1eee6') => {
    add(box(w + 0.24, h + 0.24, 0.08), frame, x, y, z + nz * 0.04);
    add(box(w, h, 0.06), '#2a333b', x, y, z + nz * 0.08);
    add(box(0.07, h, 0.06), frame, x, y, z + nz * 0.11);
    add(box(w, 0.07, 0.06), frame, x, y + h * 0.15, z + nz * 0.11);
  };

  // --- Päärakennus: punamullattu puolitoistakerroksinen talo, valkoiset nurkkalaudat ---
  {
    const u = -5, v = 21, L = 11, D = 7, wallH = 3.6;
    const [lo, hi] = groundRange(u, v, L + 1, D + 1);
    const floor = hi + 0.45;
    const add = group(u, v, floor);
    const red = '#8e3a2b', white = '#efebe2', roof = '#4f4b47';
    add(box(L + 0.3, floor - lo + 0.3, D + 0.3), '#7f7c76', 0, -(floor - lo) / 2 + 0.1, 0);   // kivijalka
    add(box(L, wallH, D), red, 0, wallH / 2, 0);
    for (const [cx, cz] of [[L / 2, D / 2], [-L / 2, D / 2], [L / 2, -D / 2], [-L / 2, -D / 2]]) {
      add(box(0.24, wallH, 0.24), white, cx, wallH / 2, cz);
    }
    add(box(L + 0.1, 0.18, D + 0.1), white, 0, wallH - 0.09, 0);   // räystäslauta
    add(gableRoofGeometry(L, 2.8, D, 0.5), roof, 0, wallH + 1.4, 0);
    add(box(0.8, 1.8, 0.8), '#7d4537', 2.2, wallH + 2.2, 0.6);      // savupiippu
    add(box(1.0, 0.12, 1.0), '#5a5450', 2.2, wallH + 3.15, 0.6);
    // Ikkunat: etuseinä (kohti tietä, -z) ja takaseinä
    for (const wx of [-4, -2.2, 2.2, 4]) window6(add, wx, 1.9, -D / 2, -1);
    for (const wx of [-3.5, 0, 3.5]) window6(add, wx, 1.9, D / 2, 1);
    // Päätyikkunat (myös ylisillä)
    for (const sx of [-1, 1]) {
      const addEnd = group(...uvAlong(u, v, sx * L / 2, 0), floor, sx * Math.PI / 2);
      window6(addEnd, 0, wallH + 0.9, 0, 1, 0.8, 1.0);
      window6(addEnd, -1.8, 1.9, 0, 1);
      window6(addEnd, 1.8, 1.9, 0, 1);
    }
    // Kuisti keskellä etuseinää: lasitettu, oma harjakatto
    const pw = 3.2, pd = 2.2, ph = 2.8;
    add(box(pw, ph, pd), red, 0, ph / 2, -D / 2 - pd / 2);
    add(gableRoofGeometry(pd, 1.2, pw, 0.3).rotateY(Math.PI / 2), roof, 0, ph + 0.6, -D / 2 - pd / 2);
    for (const cx of [-pw / 2, pw / 2]) add(box(0.2, ph, 0.2), white, cx, ph / 2, -D / 2 - pd);
    add(box(1.0, 2.1, 0.08), '#5c3b26', 0, 1.05, -D / 2 - pd - 0.04);   // ovi
    add(box(1.4, 0.06, 0.08), white, 0, 2.15, -D / 2 - pd - 0.05);
    for (const sx of [-1, 1]) {
      add(box(0.06, 1.0, 0.7), '#2a333b', sx * (pw / 2 + 0.03), 1.8, -D / 2 - pd / 2);
      add(box(0.08, 1.2, 0.9), white, sx * (pw / 2 + 0.01), 1.8, -D / 2 - pd / 2);
    }
    // Portaat
    const step = Math.min(0.9, floor - H(u, v - D / 2 - pd - 0.8));
    add(box(1.6, Math.max(0.2, step), 0.9), '#8a8780', 0, -Math.max(0.2, step) / 2, -D / 2 - pd - 0.45);
    collider(u, v, lo, floor + wallH, L / 2, D / 2);
    collider(u, v - D / 2 - pd / 2, lo, floor + ph, pw / 2, pd / 2);
  }

  // --- Vanha harmaa hirsitupa, pääty kohti tietä ---
  {
    const u = 9, v = 17, W = 5.6, Dp = 7.2, wallH = 2.8;
    const [lo, hi] = groundRange(u, v, W + 1, Dp + 1);
    const floor = hi + 0.35;
    const add = group(u, v, floor, -0.08);
    const log = '#7c7367', dark = '#5b544b', roof = '#5f5545';
    add(box(W + 0.2, floor - lo + 0.2, Dp + 0.2), '#77746e', 0, -(floor - lo) / 2 + 0.05, 0);   // kiviperustus
    add(box(W, wallH, Dp), log, 0, wallH / 2, 0);
    // Hirsien saumat ja ulkonevat nurkat
    for (let y = 0.3; y < wallH; y += 0.32) {
      add(box(W + 0.02, 0.04, Dp + 0.02), dark, 0, y, 0);
    }
    for (const [cx, cz] of [[W / 2, Dp / 2], [-W / 2, Dp / 2], [W / 2, -Dp / 2], [-W / 2, -Dp / 2]]) {
      add(box(0.55, wallH, 0.55), '#6f665a', cx, wallH / 2, cz);
    }
    add(gableRoofGeometry(Dp, 2.2, W, 0.45).rotateY(Math.PI / 2), roof, 0, wallH + 1.1, 0);
    // Päädyssä (kohti tietä) ovi ja pieni ikkuna, sivuilla ikkunat
    add(box(0.95, 1.85, 0.08), '#4a3a2c', -1.2, 0.95, -Dp / 2 - 0.04);
    window6(add, 1.2, 1.6, -Dp / 2, -1, 0.8, 0.9, '#d8d2c4');
    window6(add, 0, wallH + 0.7, -Dp / 2, -1, 0.5, 0.6, '#d8d2c4');
    add(box(1.4, 0.35, 0.8), '#8a8780', -1.2, -0.15, -Dp / 2 - 0.4);   // kivi kynnyksenä
    // Halkopino seinustalla
    const [wlo] = groundRange(u + W / 2 + 0.8, v + 1, 1, 3, -0.08);
    const pile = group(u + W / 2 + 0.75, v + 1, wlo, -0.08);
    pile(box(0.9, 1.2, 3.0), '#9b7a52', 0, 0.6, 0);
    pile(box(0.92, 1.1, 2.9), '#c9a678', 0, 0.6, 0);
    collider(u, v, lo, floor + wallH, W / 2, Dp / 2, -0.08);
  }

  // --- Koivut pihan reunoilla ---
  {
    const birchTrunk = new THREE.CylinderGeometry(0.14, 0.2, 1, 7).translate(0, 0.5, 0);
    const crown = new THREE.IcosahedronGeometry(1, 0);
    for (const [u0, v0] of [[-14, 15], [1, 30], [16, 27], [-12, 29]]) {
      const u = u0 + (rand() - 0.5) * 2, v = v0 + (rand() - 0.5) * 2;
      const h = 6 + rand() * 2.5;
      const add = group(u, v, H(u, v) - 0.1, rand() * 6.28);
      add(birchTrunk.clone().scale(1, h, 1), '#e8e4da', 0, 0, 0);
      for (let k = 0; k < 4; k++) add(box(0.22, 0.12, 0.05), '#2f2b28', (k % 2 - 0.5) * 0.12, 0.8 + k * 1.2, 0.16, k);
      const leaf = ['#7fae4a', '#8cb851', '#73a443'][(rand() * 3) | 0];
      add(crown.clone().scale(2.2, 2.6, 2.2), leaf, 0, h - 0.6, 0);
      add(crown.clone().scale(1.6, 2.0, 1.6), leaf, 0.5, h + 1.2, 0.3);
      add(crown.clone().scale(1.4, 1.6, 1.4), leaf, -0.7, h - 1.6, -0.4);
      const [x, z] = fr.world(u, v);
      addCylinderCollider(world, RAPIER, body, x, H(u, v) - 0.1, z, h, 0.22);
    }
  }

  // --- Maitolaituri ajotien suulla, aivan tien vieressä ---
  {
    const flat = road.halfWidth + road.shoulder;
    const u = -2.6, v = flat + 1.9, W = 2.6, Dp = 1.8;
    // Tason korkeus tien kohdalta (tie nousee tai laskee pihan kohdalla)
    const [sx, sz] = fr.world(u, 0);
    let ns = fr.s, nd = Infinity;
    for (let k = Math.max(0, fr.s - 15); k <= Math.min(road.count - 1, fr.s + 15); k++) {
      const d = (road.xs[k] - sx) ** 2 + (road.zs[k] - sz) ** 2;
      if (d < nd) { nd = d; ns = k; }
    }
    const top = road.hs[ns] + 1.0;                     // maitoauton lavan korkeus
    const [lo] = groundRange(u, v, W, Dp);
    const add = group(u, v, top);
    const wood = '#8d8475', post = '#6c655b';
    add(box(W, 0.14, Dp), wood, 0, -0.07, 0);           // lankkutaso
    for (let k = -2; k <= 2; k++) add(box(0.03, 0.02, Dp), '#5c564d', k * 0.52, 0.005, 0);
    for (const [px, pz, ph] of [[-W / 2 + 0.1, -Dp / 2 + 0.1, 1.8], [W / 2 - 0.1, -Dp / 2 + 0.1, 1.8], [-W / 2 + 0.1, Dp / 2 - 0.1, 2.2], [W / 2 - 0.1, Dp / 2 - 0.1, 2.2]]) {
      const len = top - lo + ph;
      add(box(0.15, len, 0.15), post, px, ph - len / 2, pz);
    }
    const roofMesh = add(box(W + 0.5, 0.08, Dp + 0.6), '#6f6a62', 0, 2.05, 0);   // pulpettikatto
    roofMesh.rotation.x = Math.atan2(0.4, Dp);   // takareuna ylempänä
    // Kaide takana ja sivuilla
    add(box(W - 0.2, 0.08, 0.06), wood, 0, 0.55, Dp / 2 - 0.1);
    for (const sx of [-1, 1]) add(box(0.06, 0.08, Dp - 0.2), wood, sx * (W / 2 - 0.1), 0.55, 0);
    // Maitotonkat
    const can = new THREE.CylinderGeometry(0.2, 0.2, 0.5, 10).translate(0, 0.25, 0);
    const neck = new THREE.CylinderGeometry(0.11, 0.18, 0.14, 10).translate(0, 0.57, 0);
    const lid = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 10).translate(0, 0.665, 0);
    for (const [cx, cz] of [[-0.75, -0.2], [-0.28, -0.32], [0.25, -0.15], [0.95, 0.35]]) {
      add(can, '#c3c7ca', cx, 0, cz);
      add(neck, '#c3c7ca', cx, 0, cz);
      add(lid, '#a9adb0', cx, 0, cz);
    }
    collider(u, v, lo, top + 2.1, W / 2 + 0.1, Dp / 2 + 0.1);
  }
}
