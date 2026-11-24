// Bahaman trooppinen saaristo: hiekkarannat, turkoosi rantavesi, palmut, viidakko,
// olkikattoiset majat (Long Cay), kalkkikivimuodostelmat (Bullet Hill) ja
// bahamalainen kylä pastellinvärisine taloineen (Treasure Cay).
// Meri on merenpinnan korkeudella 0 (themes.js: sea); maasto tulee terrain.island-asetuksista.
//
// scenery-asetukset (tracks.js):
//   palms, jungle (0…1 viidakon tiheys), bushes, rocks: määrät
//   huts       olkikattoisten majojen määrä tien varrella
//   formations kalkkikivimuodostelmien määrä vuoren rinteillä
//   village    { from, to }: kylä tien varrella (m tien alusta)

import * as THREE from 'three';
import { createNoise2D, smoothstep } from './noise.js';
import {
  UP, slopeAt, flatMaterial, InstanceBatch, addCylinderCollider, addBoxCollider, scatterRocks,
} from './sceneryKit.js';

const PASTEL = ['#f4a6b8', '#f7d774', '#8fd8d2', '#b6e3a1', '#c9b6e8', '#f6b48a', '#9cc9f0'];
const ROOFS = ['#f4f1ea', '#c8463d', '#4a8f6a', '#f4f1ea', '#3f6fa0'];

export function planTropical(terrain, road, options) {
  let village = null;
  if (options.village) {
    const s0 = Math.max(0, Math.round(options.village.from / road.spacing));
    const s1 = Math.min(road.count - 1, Math.round(options.village.to / road.spacing));
    village = { s0, s1 };
  }
  /** Onko kohta kylässä (alle 34 m kylän tienpätkästä). */
  const villageAt = village
    ? (x, z) => {
      for (let s = village.s0; s <= village.s1; s += 3) {
        if ((road.xs[s] - x) ** 2 + (road.zs[s] - z) ** 2 < 34 * 34) return true;
      }
      return false;
    }
    : () => false;
  return { village, villageAt };
}

export function tropicalColorFn(layout) {
  const patch = createNoise2D(5151);
  const cGrassA = new THREE.Color('#79b552');
  const cGrassB = new THREE.Color('#5c9e44');
  const cJungle = new THREE.Color('#4a7d35');
  const cSand = new THREE.Color('#efe2bd');
  const cSandB = new THREE.Color('#e6d6ad');
  const cWet = new THREE.Color('#d2bf92');
  const cShallow = new THREE.Color('#ece0b6');
  const cMid = new THREE.Color('#9fd8c8');
  const cDeep = new THREE.Color('#2d7c9c');
  const cRock = new THREE.Color('#a9a394');
  const cVerge = new THREE.Color('#d9cba4');
  const cVillage = new THREE.Color('#ddd0ae');
  const tmp = new THREE.Color();
  return (col, t) => {
    const n = patch(t.x * 0.03, t.z * 0.03) * 0.5 + 0.5;
    if (t.h < 0.05) {
      // Merenpohja: vaalea hiekka matalassa, turkoosi ja syvä sininen kauempana
      const d = -t.h;
      col.copy(cShallow).lerp(cMid, smoothstep(0.4, 3, d)).lerp(cDeep, smoothstep(3, 8, d));
    } else {
      col.copy(cGrassA).lerp(cGrassB, n).lerp(cJungle, smoothstep(5, 12, t.h) * 0.5);
      // Ranta: hiekka matalalla, märkä hiekka vesirajassa
      col.lerp(tmp.copy(cSand).lerp(cSandB, n), smoothstep(2.7, 1.9, t.h));
      col.lerp(cWet, smoothstep(0.5, 0.1, t.h));
      col.lerp(cRock, smoothstep(0.75, 0.55, t.slope) * 0.85);
      if (layout.villageAt(t.x, t.z)) col.lerp(cVillage, 0.55);
    }
    col.lerp(cVerge, smoothstep(t.flat + 0.8, t.flat - 0.4, t.rd));
    col.multiplyScalar(0.94 + t.rand() * 0.1);
  };
}

/** Palmun lehti: kapea, kaartuva ja kärjestä kapeneva nauha (pituus 1, kaarre alaspäin). */
function frondGeometry() {
  const seg = 6;
  const pos = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const w = 0.16 * Math.sin(Math.PI * Math.min(1, t * 1.15 + 0.08));
    const y = 0.12 * t - 0.55 * t * t;
    pos.push(t, y, -w, t, y - 0.03, w);
    if (i < seg) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function buildTropical({ scene, world, RAPIER, terrain, road, layout, rand, options = {} }) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const flat = road.halfWidth + road.shoulder;
  const limit = terrain.half * 0.92;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const q2 = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const taken = [];
  const free = (x, z, r) => !taken.some(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) < tr + r);
  const H = (x, z) => terrain.heightAt(x, z);
  const X = new THREE.Vector3(1, 0, 0);
  const Z = new THREE.Vector3(0, 0, 1);

  // Kylä ensin, jotta muut kappaleet väistävät sitä
  if (layout.village) buildVillage({ scene, world, RAPIER, terrain, road, layout, rand, body, taken, free });

  // --- Kalkkikivimuodostelmat vuoren rinteillä --------------------------------------------
  const nForm = options.formations ?? 0;
  const lime = ['#cfc6b2', '#b9af9a', '#ddd4c0', '#a59c87', '#c2b59a'].map((c) => new THREE.Color(c));
  if (nForm > 0) {
    const stones = new InstanceBatch(new THREE.DodecahedronGeometry(1, 0), flatMaterial('#ffffff'));
    for (let attempt = 0, placed = 0; attempt < 3000 && placed < nForm; attempt++) {
      const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
      const h = H(x, z), rd = terrain.roadDistanceAt(x, z);
      if (h < 7 || rd < flat + 9 || rd > 75 || !free(x, z, 6)) continue;
      // Ryhmä pylväitä: kasa kiviä päällekkäin, ylöspäin kapenevia
      const n = 2 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const a = rand() * 6.28, d = k === 0 ? 0 : 2.5 + rand() * 4;
        const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
        if (terrain.roadDistanceAt(px, pz) < flat + 6) continue;
        const height = (k === 0 ? 15 : 6) + rand() * (k === 0 ? 10 : 7);
        let y = H(px, pz) - 0.8, r = (k === 0 ? 3.0 : 2.0) + rand() * 1.4;
        const r0 = r;
        // Iso lohkare juurella
        { const bs = r * 1.7; m.compose(p.set(px, H(px, pz) + bs * 0.15, pz), q.setFromEuler(new THREE.Euler(rand() * 0.3, rand() * 6.28, rand() * 0.3)), s.set(bs * 1.3, bs * 0.7, bs * 1.1)); stones.add(m, col.copy(lime[3]).multiplyScalar(0.9 + rand() * 0.15)); }
        const c0 = lime[Math.floor(rand() * lime.length)];
        while (y < H(px, pz) + height) {
          const sz = r * (0.8 + rand() * 0.4);
          m.compose(p.set(px + (rand() - 0.5) * 0.6, y + sz * 0.6, pz + (rand() - 0.5) * 0.6),
            q.setFromEuler(new THREE.Euler(rand() * 0.5, rand() * 6.28, rand() * 0.5)), s.set(sz, sz * (0.9 + rand() * 0.5), sz));
          stones.add(m, col.copy(c0).multiplyScalar(0.88 + rand() * 0.2));
          y += sz * 1.05;
          r *= 0.9 + rand() * 0.08;
        }
        // Tasapainoileva lohkare huipulla
        if (rand() < 0.5) {
          const sz = r * 1.6;
          m.compose(p.set(px, y + sz * 0.4, pz), q.setFromEuler(new THREE.Euler(rand(), rand() * 6.28, rand())), s.set(sz * 1.2, sz * 0.7, sz));
          stones.add(m, col.copy(c0).multiplyScalar(0.95));
        }
        addCylinderCollider(world, RAPIER, body, px, H(px, pz) - 1, pz, height + 1, r0 * 1.15);
      }
      taken.push([x, z, 9]);
      placed++;
    }
    stones.build(scene);
  }

  // --- Olkikattoiset majat tien varrella -----------------------------------------------------
  const nHuts = options.huts ?? 0;
  for (let attempt = 0, placed = 0; attempt < 2000 && placed < nHuts; attempt++) {
    const k = Math.floor(rand() * road.count);
    const side = rand() < 0.5 ? -1 : 1;
    const off = flat + 9 + rand() * 10;
    const x = road.xs[k] - road.tz[k] * off * side, z = road.zs[k] + road.tx[k] * off * side;
    if (terrain.roadDistanceAt(x, z) < flat + 7 || H(x, z) < 1.2 || slopeAt(terrain, x, z) > 0.15 || !free(x, z, 9)) continue;
    if (taken.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 60)) continue;   // majat hajallaan
    buildHut({ scene, world, RAPIER, body, terrain, x, z, yaw: Math.atan2(road.xs[k] - x, road.zs[k] - z), rand });
    taken.push([x, z, 7]);
    placed++;
  }

  // --- Palmut: tiheimmin rannoilla ------------------------------------------------------------
  {
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.2, 1, 7).translate(0, 0.5, 0);
    const trunks = new InstanceBatch(trunkGeo, flatMaterial('#8a7356'), { tag: 'tree' });
    const fronds = new InstanceBatch(frondGeometry(), flatMaterial('#ffffff', { side: THREE.DoubleSide }), { tag: 'tree' });
    const nuts = new InstanceBatch(new THREE.IcosahedronGeometry(0.16, 0), flatMaterial('#6b4f2c'), { tag: 'tree' });
    const greens = ['#4e9a3a', '#5fae45', '#3f8a35', '#6cb84c'].map((c) => new THREE.Color(c));
    const n = options.palms ?? 500;
    for (let attempt = 0, placed = 0; attempt < n * 30 && placed < n; attempt++) {
      const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
      const h = H(x, z);
      if (h < 0.5) continue;
      const beach = smoothstep(4, 1.6, h);
      if (rand() > 0.12 + beach * 0.88) continue;
      if (terrain.roadDistanceAt(x, z) < flat + 2.5 || slopeAt(terrain, x, z) > 0.45 || !free(x, z, 1.2)) continue;
      // Kaartuva runko 5 osana, nojaa satunnaiseen suuntaan
      const lean = rand() * 6.28, bend = 0.03 + rand() * 0.1, segs = 5, segLen = 1.3 + rand() * 0.6;
      let px = x, py = h - 0.2, pz = z;
      for (let k = 0; k < segs; k++) {
        const tilt = bend * (k + 1);
        const dx = Math.cos(lean) * Math.sin(tilt), dz = Math.sin(lean) * Math.sin(tilt), dy = Math.cos(tilt);
        q.setFromUnitVectors(UP, new THREE.Vector3(dx, dy, dz));
        m.compose(p.set(px, py, pz), q, s.set(1 - k * 0.06, segLen * 1.05, 1 - k * 0.06));
        trunks.add(m);
        px += dx * segLen; py += dy * segLen; pz += dz * segLen;
      }
      const g = greens[Math.floor(rand() * greens.length)];
      const nf = 8 + Math.floor(rand() * 3), size = 3.2 + rand() * 1.3;
      for (let f = 0; f < nf; f++) {
        const a = (f / nf) * 6.28 + rand() * 0.3;
        q.setFromAxisAngle(UP, a).multiply(q2.setFromAxisAngle(Z, 0.25 - rand() * 0.5));
        m.compose(p.set(px, py, pz), q, s.set(size, size * (0.8 + rand() * 0.4), size * 1.3));
        fronds.add(m, col.copy(g).multiplyScalar(0.85 + rand() * 0.3));
      }
      for (let c = 0; c < 3; c++) {
        const a = rand() * 6.28;
        m.compose(p.set(px + Math.cos(a) * 0.25, py - 0.25, pz + Math.sin(a) * 0.25), q.identity(), s.set(1, 1, 1));
        nuts.add(m);
      }
      addCylinderCollider(world, RAPIER, body, x, h - 0.2, z, segLen * 3, 0.25);
      placed++;
    }
    trunks.build(scene);
    fronds.build(scene);
    nuts.build(scene);
  }

  // --- Viidakko: lehtipuut, pensaat ja saniaiset -------------------------------------------
  const jungle = options.jungle ?? 0;
  {
    const trunk = new InstanceBatch(new THREE.CylinderGeometry(0.22, 0.35, 1, 6).translate(0, 0.5, 0), flatMaterial('#6f6252'), { tag: 'tree' });
    const crown = new InstanceBatch(new THREE.IcosahedronGeometry(1, 0), flatMaterial('#ffffff'), { tag: 'tree' });
    const bush = new InstanceBatch(new THREE.IcosahedronGeometry(1, 0), flatMaterial('#ffffff'));
    const fern = new InstanceBatch(frondGeometry(), flatMaterial('#ffffff', { side: THREE.DoubleSide }));
    const leaf = ['#2f6b2c', '#3d7f34', '#4f9440', '#2a5e2a', '#5a9a3c'].map((c) => new THREE.Color(c));
    const nTrees = Math.round((options.trees ?? 300) * (0.3 + jungle));
    const dense = createNoise2D(6262);
    for (let attempt = 0, placed = 0; attempt < nTrees * 25 && placed < nTrees; attempt++) {
      const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
      const h = H(x, z);
      if (h < 2.6) continue;
      const d = dense(x * 0.012, z * 0.012) * 0.5 + 0.5;
      if (rand() > jungle * (0.4 + d) + 0.08) continue;
      if (terrain.roadDistanceAt(x, z) < flat + 3 || slopeAt(terrain, x, z) > 0.6 || layout.villageAt(x, z) || !free(x, z, 1.5)) continue;
      const th = 4 + rand() * 5, sc = 0.8 + rand() * 0.6;
      m.compose(p.set(x, h - 0.2, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc, th, sc));
      trunk.add(m);
      const c = leaf[Math.floor(rand() * leaf.length)];
      for (let k = 0; k < 4; k++) {
        const a = rand() * 6.28, r = rand() * 1.8 * sc, cs = (1.6 + rand() * 1.4) * sc;
        m.compose(p.set(x + Math.cos(a) * r, h + th + (rand() - 0.3) * 1.5, z + Math.sin(a) * r),
          q.setFromEuler(new THREE.Euler(rand(), rand() * 6.28, rand())), s.set(cs * 1.2, cs * 0.8, cs * 1.1));
        crown.add(m, col.copy(c).multiplyScalar(0.85 + rand() * 0.3));
      }
      addCylinderCollider(world, RAPIER, body, x, h - 0.2, z, th, 0.4 * sc);
      placed++;
    }
    const nBush = Math.round((options.bushes ?? 600) * (0.4 + jungle));
    for (let attempt = 0, placed = 0; attempt < nBush * 10 && placed < nBush; attempt++) {
      const x = (rand() * 2 - 1) * limit, z = (rand() * 2 - 1) * limit;
      const h = H(x, z);
      if (h < 1.8 || terrain.roadDistanceAt(x, z) < flat + 1.5 || slopeAt(terrain, x, z) > 0.6 || !free(x, z, 0.8)) continue;
      const c = leaf[Math.floor(rand() * leaf.length)];
      if (rand() < 0.45) {   // saniainen
        const sc = 1.1 + rand() * 1.0;
        for (let f = 0; f < 6; f++) {
          q.setFromAxisAngle(UP, (f / 6) * 6.28 + rand()).multiply(q2.setFromAxisAngle(Z, 0.6 + rand() * 0.3));
          m.compose(p.set(x, h, z), q, s.set(sc, sc, sc * 1.4));
          fern.add(m, col.copy(c).multiplyScalar(1.1 + rand() * 0.2));
        }
      } else {
        const sc = 0.5 + rand() * 1.0;
        m.compose(p.set(x, h + sc * 0.2, z), q.setFromAxisAngle(UP, rand() * 6.28), s.set(sc * 1.3, sc * 0.8, sc * 1.1));
        bush.add(m, col.copy(c).multiplyScalar(0.9 + rand() * 0.3));
      }
      placed++;
    }
    trunk.build(scene);
    crown.build(scene);
    bush.build(scene);
    fern.build(scene);
  }

  // --- Kiviä rannoille ja rinteille -------------------------------------------------------
  scatterRocks(scene, world, RAPIER, body, terrain, rand, {
    count: options.rocks ?? 120, clear: flat + 2.5, limit, sizeMax: 1.6,
    skip: (x, z) => H(x, z) < 0.4 || !free(x, z, 1.5) || layout.villageAt(x, z),
    colorFn: (r) => col.copy(lime[Math.floor(r() * lime.length)]).multiplyScalar(0.8 + r() * 0.25).clone(),
  });
}

// --- Olkikattoinen maja: pyöreä tai suorakaide, kartio- tai harjakatto oljesta -------------
function buildHut({ scene, world, RAPIER, body, terrain, x, z, yaw, rand }) {
  const g = new THREE.Group();
  const base = Math.min(terrain.heightAt(x + 3, z), terrain.heightAt(x - 3, z), terrain.heightAt(x, z + 3), terrain.heightAt(x, z - 3)) - 0.2;
  g.position.set(x, base, z);
  g.rotation.y = yaw;
  const add = (geo, color, px, py, pz) => {
    const mesh = new THREE.Mesh(geo, flatMaterial(color));
    mesh.position.set(px, py, pz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  const wall = ['#e9e0cc', '#d8c3a0', '#f0e6d2'][Math.floor(rand() * 3)];
  const thatch = '#c9a65a', thatchDark = '#a8843f';
  if (rand() < 0.6) {
    const r = 2.4 + rand() * 0.8, wh = 2.3;
    add(new THREE.CylinderGeometry(r + 0.2, r + 0.3, 0.4, 10), '#8a7356', 0, 0.2, 0);
    add(new THREE.CylinderGeometry(r, r, wh, 10), wall, 0, 0.4 + wh / 2, 0);
    add(new THREE.ConeGeometry(r * 1.55, 3.0, 12), thatch, 0, 0.4 + wh + 1.3, 0);
    add(new THREE.CylinderGeometry(r * 1.56, r * 1.6, 0.25, 12), thatchDark, 0, 0.4 + wh - 0.05, 0);
    add(new THREE.BoxGeometry(0.9, 1.9, 0.1), '#5a3e28', 0, 0.4 + 0.95, r - 0.02);
    addCylinderCollider(world, RAPIER, body, x, base, z, 4.5, r + 0.3);
  } else {
    const L = 5 + rand() * 2, D = 3.6, wh = 2.2;
    add(new THREE.BoxGeometry(L + 0.4, 0.4, D + 0.4), '#8a7356', 0, 0.2, 0);
    add(new THREE.BoxGeometry(L, wh, D), wall, 0, 0.4 + wh / 2, 0);
    const roof = new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4);
    add(roof.scale(L * 0.95, 2.6, D * 1.15), thatch, 0, 0.4 + wh + 1.25, 0);
    add(new THREE.BoxGeometry(0.9, 1.9, 0.1), '#5a3e28', 0.8, 0.4 + 0.95, D / 2 + 0.02);
    for (const wx of [-1.4, 2.2]) add(new THREE.BoxGeometry(0.8, 0.7, 0.08), '#3b2e22', wx, 1.9, D / 2 + 0.02);
    addBoxCollider(world, RAPIER, body, x, base + 2, z, L / 2 + 0.3, 2, D / 2 + 0.3, yaw);
  }
  scene.add(g);
}

// --- Bahamalainen kylä: pastellitalot kuisteineen, valkoiset aidat ja kirkko -----------------
function buildVillage({ scene, world, RAPIER, terrain, road, layout, rand, body, taken, free }) {
  const { s0, s1 } = layout.village;
  const hw = road.halfWidth;
  const H = (x, z) => terrain.heightAt(x, z);
  const mats = {};
  const M = (c) => (mats[c] ??= flatMaterial(c));
  const placed = [];
  const overlaps = (x, z, r) => placed.some(([px, pz, pr]) => Math.hypot(px - x, pz - z) < pr + r);
  // Aidan tolpat ja johteet yhtenä instanssijoukkona (satoja pieniä kappaleita)
  const fenceParts = new InstanceBatch(new THREE.BoxGeometry(1, 1, 1), M('#ffffff'));
  // Huom: nimet eivät saa törmätä talon mittoihin (L = pituus, D = syvyys)
  const fenceFrame = new THREE.Matrix4(), fenceMove = new THREE.Matrix4(), fenceSize = new THREE.Matrix4();

  const group = (x, y, z, yaw) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
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
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  /** Aumakatto (neljälappeinen) suorakaiteen muotoiselle talolle. */
  const hipRoof = (L, D, h) => new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).scale(L * 0.78, h, D * 0.78);

  // Kirkko kylän keskivaiheille
  {
    const sm = Math.round((s0 + s1) / 2);
    const side = rand() < 0.5 ? -1 : 1;
    const rx = -road.tz[sm] * side, rz = road.tx[sm] * side;
    const off = hw + 13;
    const x = road.xs[sm] + rx * off, z = road.zs[sm] + rz * off;
    const yaw = Math.atan2(-road.tz[sm], road.tx[sm]) + (side < 0 ? Math.PI : 0);
    const base = Math.min(H(x + 4, z + 4), H(x - 4, z - 4), H(x + 4, z - 4), H(x - 4, z + 4)) - 0.4;
    const add = group(x, base, z, yaw + Math.PI / 2);
    add(box(6, 4.2, 10), '#f6f4ee', 0, 2.1, 0);
    add(new THREE.ConeGeometry(1, 1, 4).rotateY(Math.PI / 4).scale(4.6, 2.6, 7.8), '#c8463d', 0, 4.2 + 1.3, 0);
    add(box(2.4, 7.5, 2.4), '#f6f4ee', 0, 3.75, -6);
    add(new THREE.ConeGeometry(1.8, 3.4, 4).rotateY(Math.PI / 4), '#c8463d', 0, 7.5 + 1.7, -6);
    add(box(0.12, 1.4, 0.12), '#5a4a3a', 0, 11.4, -6);
    add(box(0.8, 0.12, 0.12), '#5a4a3a', 0, 11.6, -6);
    add(box(1.4, 2.4, 0.1), '#7a3a2a', 0, 1.2, -7.25);
    for (const zz of [-2.5, 0.5, 3.5]) for (const sx of [-1, 1]) add(box(0.1, 1.8, 0.9), '#6aa6c9', sx * 3.03, 2.4, zz);
    addBoxCollider(world, RAPIER, body, x, base + 3, z, 3.2, 3, 5.2, yaw + Math.PI / 2);
    addBoxCollider(world, RAPIER, body, x - Math.sin(yaw + Math.PI / 2) * 6, base + 4, z - Math.cos(yaw + Math.PI / 2) * 6, 1.3, 4, 1.3, yaw);
    placed.push([x, z, 8]);
  }

  // Talorivit tien molemmin puolin, väleissä pihoja
  for (const side of [-1, 1]) {
    let s = s0 + Math.floor(rand() * 6);
    while (s < s1) {
      const L = 6 + rand() * 2.5, D = 6 + rand() * 1.5, wallH = 2.8;
      const sc = Math.min(road.count - 1, s + Math.round(L / 2 / road.spacing));
      if (sc > s1) break;
      const ax = road.tx[sc], az = road.tz[sc];
      const rx = -az * side, rz = ax * side;
      const setback = hw + 6.5 + rand() * 2.5;        // väljästi tiestä, edessä piha ja aita
      const cx = road.xs[sc] + rx * (setback + D / 2), cz = road.zs[sc] + rz * (setback + D / 2);
      const rad = Math.hypot(L + 2.4, D + 2.4) / 2;
      let tooClose = false;
      for (const [u, v] of [[L / 2, D / 2], [-L / 2, D / 2], [L / 2, -D / 2 - 2.2], [-L / 2, -D / 2 - 2.2]]) {
        if (terrain.roadDistanceAt(cx + ax * u + rx * v, cz + az * u + rz * v) < hw + 4.5) tooClose = true;
      }
      if (tooClose || overlaps(cx, cz, rad) || H(cx, cz) < 0.8) { s += 3; continue; }
      const yaw = Math.atan2(-az, ax) + (side < 0 ? Math.PI : 0);   // paikallinen -z = kohti tietä
      let lo = Infinity, hi = -Infinity;
      for (const [u, v] of [[L / 2, D / 2], [-L / 2, D / 2], [L / 2, -D / 2], [-L / 2, -D / 2]]) {
        const h = H(cx + ax * u + rx * v, cz + az * u + rz * v); lo = Math.min(lo, h); hi = Math.max(hi, h);
      }
      const floor = hi + 0.5;
      const add = group(cx, floor, cz, yaw);
      const wall = PASTEL[Math.floor(rand() * PASTEL.length)];
      const roof = ROOFS[Math.floor(rand() * ROOFS.length)];
      const trim = '#ffffff';
      add(box(L + 0.2, floor - lo + 0.3, D + 0.2), '#d9d2c3', 0, -(floor - lo) / 2 + 0.1, 0);   // perustus
      add(box(L, wallH, D), wall, 0, wallH / 2, 0);
      for (const [px, pz] of [[L / 2, D / 2], [-L / 2, D / 2], [L / 2, -D / 2], [-L / 2, -D / 2]]) add(box(0.18, wallH, 0.18), trim, px, wallH / 2, pz);
      add(hipRoof(L + 0.8, D + 0.8, 1.8), roof, 0, wallH + 0.9, 0);
      // Kuisti etupuolella: lattia, valkoiset pylväät ja kaide, oma katto
      add(box(L - 0.6, 0.18, 1.9), '#c9b99a', 0, -0.08, -D / 2 - 0.95);
      for (const px of [-L / 2 + 0.5, -L / 6, L / 6, L / 2 - 0.5]) add(box(0.14, 2.3, 0.14), trim, px, 1.15, -D / 2 - 1.75);
      add(box(L - 0.8, 0.08, 0.08), trim, 0, 0.8, -D / 2 - 1.75);
      const pr = add(box(L, 0.12, 2.3), roof, 0, 2.4, -D / 2 - 1.0);
      pr.rotation.x = -0.18;
      // Ovi ja ikkunat bahamalaisilla ikkunaluukuilla
      const shutter = ['#3f8f7a', '#2f6f9f', '#ffffff', '#4a7a3a'][Math.floor(rand() * 4)];
      add(box(0.95, 2.0, 0.08), shutter, 0, 1.0, -D / 2 - 0.04);
      for (const wx of [-L / 3.2, L / 3.2]) {
        add(box(1.1, 1.2, 0.06), '#2a333b', wx, 1.55, -D / 2 - 0.03);
        const sh = add(box(1.3, 1.3, 0.08), shutter, wx, 1.75, -D / 2 - 0.25);
        sh.rotation.x = 0.45;   // yläsaranoitu "Bahama shutter"
      }
      for (const wx of [-L / 4, L / 4]) add(box(1.0, 1.1, 0.06), '#2a333b', wx, 1.55, D / 2 + 0.03);
      // Valkoinen säleaita pihan edessä
      const fv = -D / 2 - 2.6 - rand() * 0.6;
      fenceFrame.makeRotationY(yaw).setPosition(cx, 0, cz);
      const part = (u, y, v, sx, sy, sz) => {
        fenceParts.add(new THREE.Matrix4().multiplyMatrices(fenceFrame, fenceMove.makeTranslation(u, y, v)).multiply(fenceSize.makeScale(sx, sy, sz)));
      };
      // Paikallinen (u, v) maailmaan: u = tien suunta (vastakkaisella puolella käänteinen), v = poispäin tiestä
      const ground = (u, v) => H(cx + ax * u * side + rx * v, cz + az * u * side + rz * v);
      const fence = (u0, u1) => {
        for (let u = u0; u <= u1; u += 0.45) part(u, ground(u, fv) + 0.42, fv, 0.08, 0.85, 0.08);
        part((u0 + u1) / 2, ground((u0 + u1) / 2, fv) + 0.6, fv, u1 - u0, 0.07, 0.06);
      };
      fence(-L / 2 - 0.8, -0.8);
      fence(0.8, L / 2 + 0.8);
      addBoxCollider(world, RAPIER, body, cx, (lo + floor + wallH) / 2, cz, L / 2, (floor + wallH - lo) / 2, D / 2 + 1, yaw);
      placed.push([cx, cz, rad]);
      s += Math.max(3, Math.round((L + 4 + rand() * 6) / road.spacing));
    }
  }
  fenceParts.build(scene);
  for (const [x, z, r] of placed) taken.push([x, z, r + 1]);
}
