// Tien reunan pikkuyksityiskohdat: ruohotupsut, saniaiset, kanerva, kuiva heinä ja pikkukivet
// ojanpenkoilla. Pelkkää grafiikkaa (ei törmäyksiä), muutama kolmio per kappale, ja kaikki
// samanlaiset piirretään yhtenä InstancedMesh-joukkona (sceneryKit.InstanceBatch, 240 m ruudut,
// ei varjoja: pienet kappaleet maksaisivat varjokartassa paljon piirtokutsuja).
//
// Teema antaa tyypit ja värit (themes.js: roadside):
//   roadside: {
//     density: 1,                     // kerroin määrille
//     items: [{ type: 'grass' | 'fern' | 'heather' | 'dryGrass' | 'shrub' | 'stone',
//               perMeter, colors: [...], size: [min, max], band: [min, max] }],
//   }
// perMeter = kappaleita tien metriä kohti (molemmat puolet yhteensä), band = etäisyys
// tien reunasta metreinä.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { InstanceBatch } from './sceneryKit.js';

/** Ruohotupsu: ohuita kolmion muotoisia korsia, jotka kaartuvat ulospäin. */
function bladesGeometry(blades, width, lean) {
  const pos = [];
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + (i % 2) * 0.4;
    const ca = Math.cos(a), sa = Math.sin(a);
    const h = 0.75 + ((i * 37) % 10) / 30;
    const l = lean * (0.6 + ((i * 53) % 10) / 20);
    // Korren tyvi on poikittain kaltevuuden suuntaan nähden
    const bx = -sa * width, bz = ca * width;
    pos.push(-bx, 0, -bz, bx, 0, bz, ca * l, h, sa * l);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Saniainen: leveitä, matalalle kaartuvia lehtiä (kaksi kolmiota per lehti). */
function fernGeometry(fronds) {
  const pos = [];
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const w = 0.16;
    const mid = [ca * 0.45, 0.42, sa * 0.45];
    const tip = [ca * 0.95, 0.22, sa * 0.95];
    const l = [-sa * w + ca * 0.3, 0.36, ca * w + sa * 0.3];
    const r = [sa * w + ca * 0.3, 0.36, -ca * w + sa * 0.3];
    pos.push(0, 0, 0, ...l, ...mid, 0, 0, 0, ...mid, ...r, ...l, ...tip, ...mid, ...mid, ...tip, ...r);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const GEOMETRIES = {
  grass: () => bladesGeometry(7, 0.11, 0.32),
  dryGrass: () => bladesGeometry(8, 0.08, 0.42),
  fern: () => fernGeometry(6),
  heather: () => bladesGeometry(10, 0.16, 0.5).scale(1.1, 0.55, 1.1),     // matala tuuhea varvikko
  shrub: () => new THREE.IcosahedronGeometry(0.5, 0).scale(1, 0.8, 1).translate(0, 0.3, 0),
  stone: () => new THREE.IcosahedronGeometry(0.5, 0),
};

/**
 * Ripottelee tien varteen yksityiskohdat. sea = vesi (ei vedenpinnan alle), rand = siemen.
 */
export function buildRoadside(scene, terrain, road, style, seed = 7, sea = null) {
  if (!style?.items?.length) return;
  const rand = mulberry32(seed);
  const edge = road.halfWidth + road.shoulder;
  const density = style.density ?? 1;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();

  for (const item of style.items) {
    const geo = GEOMETRIES[item.type]();
    const plant = item.type !== 'stone';
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff', flatShading: true, roughness: 1,
      side: plant && item.type !== 'shrub' ? THREE.DoubleSide : THREE.FrontSide,
    });
    // Pienet kappaleet: ei varjoja (näkyisivät tuskin) ja isot ruudut, jotta piirtokutsuja on vähän
    const batch = new InstanceBatch(geo, material, { castShadow: false, cell: 240 });
    const colors = item.colors.map((c) => new THREE.Color(c));
    const [s0, s1] = item.size ?? [0.4, 0.8];
    const [b0, b1] = item.band ?? [0.2, 4];
    const total = Math.round(road.length * item.perMeter * density);

    for (let i = 0; i < total; i++) {
      const k = Math.floor(rand() * road.count);
      if (road.bridgeSeg?.[k]) continue;
      const side = rand() < 0.5 ? -1 : 1;
      // Tiheintä aivan reunassa, harvenee ojanpenkalle
      const v = edge + b0 + Math.pow(rand(), 1.6) * (b1 - b0);
      const along = (rand() - 0.5) * road.spacing;
      const x = road.xs[k] + road.tx[k] * along - road.tz[k] * v * side;
      const z = road.zs[k] + road.tz[k] * along + road.tx[k] * v * side;
      if (terrain.roadDistanceAt(x, z) < edge + b0 * 0.5) continue;   // mutkan sisäkaarteessa tie on lähellä
      const h = terrain.heightAt(x, z);
      if (sea && h < sea.level + 0.25) continue;
      if (h < road.hs[k] - 4) continue;   // jyrkänne tai kanjoni
      const size = s0 + rand() * (s1 - s0);
      if (plant) {
        s.set(size * (0.8 + rand() * 0.4), size * (0.75 + rand() * 0.5), size * (0.8 + rand() * 0.4));
        e.set((rand() - 0.5) * 0.25, rand() * Math.PI * 2, (rand() - 0.5) * 0.25);
        p.set(x, h - 0.04, z);
      } else {
        s.set(size * (0.7 + rand() * 0.6), size * (0.4 + rand() * 0.4), size * (0.7 + rand() * 0.6));
        e.set(rand() * 0.8, rand() * Math.PI * 2, rand() * 0.8);
        p.set(x, h - s.y * 0.15, z);
      }
      q.setFromEuler(e);
      m.compose(p, q, s);
      col.copy(colors[Math.floor(rand() * colors.length)]).multiplyScalar(0.88 + rand() * 0.24);
      batch.add(m, col);
    }
    batch.build(scene);
  }
}
