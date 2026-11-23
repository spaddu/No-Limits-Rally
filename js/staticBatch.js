// Staattisten kappaleiden yhdistäminen (static batching): rakennukset, aidat, portit ja
// muut monesta palasta kootut kappaleet piirretään muuten yksi palanen kerrallaan, eli
// jokainen laatikko on oma piirtokutsunsa (ja toinen varjokartassa). Kun rata on
// rakennettu, saman materiaalin palaset yhdistetään yhdeksi geometriaksi ruuduittain
// (ruutu = CELL m), jolloin piirtokutsuja on murto-osa ja näkymän ulkopuoliset ruudut
// jätetään silti piirtämättä.
//
// Yhdistetään vain tavalliset meshit (ei InstancedMeshejä, ei usean materiaalin
// kappaleita, ei läpinäkyviä eikä shader-materiaaleja). Liikkuvat osat rajataan pois
// exclude-listalla (auto, kartta, taivas).

import * as THREE from 'three';

const CELL = 160;

const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

/** Kelpaako mesh yhdistettäväksi? */
function mergeable(o) {
  if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible || !o.frustumCulled) return false;
  const mat = o.material;
  if (Array.isArray(mat) || mat.isShaderMaterial || mat.transparent || o.renderOrder !== 0) return false;
  const g = o.geometry;
  if (!g.attributes.position || Object.keys(g.morphAttributes).length) return false;   // ryhmät (BoxGeometry) eivät haittaa: materiaali on yksi
  return true;
}

/** Geometrian attribuuttien tunniste: vain samanlaiset voidaan yhdistää. */
function signature(g) {
  return Object.keys(g.attributes).sort()
    .map((n) => { const a = g.attributes[n]; return `${n}${a.itemSize}${a.array.constructor.name}${a.normalized ? 'n' : ''}`; }).join(',');
}

/** Kopio geometriasta juuren koordinaatistossa (indeksitön, kierto korjattu peilikuville). */
function bake(mesh, toRoot) {
  let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
  _m.multiplyMatrices(toRoot, mesh.matrixWorld);
  g.applyMatrix4(_m);
  if (_m.determinant() < 0) {
    // Peilattu kappale: käännetään kolmioiden kiertosuunta, ettei etupuoli katoa
    for (const attr of Object.values(g.attributes)) {
      const a = attr.array, s = attr.itemSize;
      for (let t = 0; t + 3 * s <= a.length; t += 3 * s) {
        for (let k = 0; k < s; k++) {
          const tmp = a[t + s + k];
          a[t + s + k] = a[t + 2 * s + k];
          a[t + 2 * s + k] = tmp;
        }
      }
    }
  }
  return g;
}

/** Liittää samanlaiset indeksittömät geometriat yhdeksi. */
function concat(geos) {
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(geos[0].attributes)) {
    const first = geos[0].attributes[name];
    let total = 0;
    for (const g of geos) total += g.attributes[name].array.length;
    const arr = new first.array.constructor(total);
    let off = 0;
    for (const g of geos) {
      arr.set(g.attributes[name].array, off);
      off += g.attributes[name].array.length;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, first.itemSize, first.normalized));
  }
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

/**
 * Yhdistää rootin alla olevat staattiset meshit materiaaleittain ja ruuduittain.
 * Tulos lisätään rootin lapsiksi rootin omaan koordinaatistoon. Palauttaa
 * { before, after } = meshien määrä ennen ja jälkeen.
 */
export function mergeStatic(root, { exclude = [], cell = CELL } = {}) {
  root.updateMatrixWorld(true);
  _inv.copy(root.matrixWorld).invert();
  const skip = new Set(exclude.filter(Boolean));
  const groups = new Map();
  const walk = (obj) => {
    if (skip.has(obj)) return;
    if (obj !== root && mergeable(obj)) {
      const g = obj.geometry;
      if (!g.boundingSphere) g.computeBoundingSphere();
      _sphere.copy(g.boundingSphere).applyMatrix4(obj.matrixWorld);
      const c = _sphere.center;
      const key = [obj.material.uuid, obj.castShadow ? 1 : 0, obj.receiveShadow ? 1 : 0, signature(g),
        Math.floor(c.x / cell), Math.floor(c.z / cell)].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(obj);
    }
    for (const child of obj.children.slice()) walk(child);
  };
  walk(root);

  let before = 0, after = 0;
  for (const list of groups.values()) {
    before += list.length;
    if (list.length < 2) { after++; continue; }
    const first = list[0];
    const merged = new THREE.Mesh(concat(list.map((m) => bake(m, _inv))), first.material);
    merged.castShadow = first.castShadow;
    merged.receiveShadow = first.receiveShadow;
    for (const m of list) m.removeFromParent();
    root.add(merged);
    after++;
  }
  return { before, after };
}
