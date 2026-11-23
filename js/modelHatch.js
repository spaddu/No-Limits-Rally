// FWD Hatchbackin ulkonäkö: kolmiovinen hot hatch -tyyppinen matalapolygonimalli.
// Vain grafiikkaa, fysiikka (törmäyslaatikko, renkaiden paikat) tulee car.js:stä ja cars.js:stä.
//
// Auton paikallinen koordinaatisto: +X eteenpäin, +Y ylös, +Z oikealle.
// Kori tehdään sivuprofiilista (THREE.Shape), joka pursotetaan leveyssuunnassa ja
// jonka keula, perä ja olkalinja kavennetaan jälkikäteen. Lasikoppi samoin, ja sen
// kyljet kallistuvat sisäänpäin ylöspäin mentäessä.

import * as THREE from 'three';

const HALF_W = 0.9;        // korin puolileveys (renkaat ovat 0.69–1.03)
const BEVEL = 0.05;        // korin reunojen viiste
const SILL = -0.5;         // helmapellin alareuna
const ARCH_R = 0.58;       // pyöränkaaren säde (viisteen jälkeen ~0.53)

// Lasikopin mitat
const BELT = 0.25;         // ikkunalinjan korkeus edessä
const ROOF = 0.9;          // katon korkeus
const GH_W = 0.8;          // lasikopin puolileveys alhaalla
const TUMBLE = 0.24;       // kuinka paljon kyljet kapenevat ylös mentäessä (osuus)

/** Lasikopin kyljen z-etäisyys keskilinjasta korkeudella y. */
const sideZ = (y) => GH_W * (1 - TUMBLE * Math.min(Math.max((y - BELT) / (ROOF - BELT), 0), 1));

function shapeFrom(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) s.lineTo(x, y);
  return s;
}

/** Korin sivuprofiili pyöränkaarineen. */
function bodyProfile(wheelX) {
  const pts = [[-2.0, -0.36], [-1.9, SILL]];
  const arch = (cx) => {
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI - (i * Math.PI) / 8;
      pts.push([cx + ARCH_R * Math.cos(a), SILL + ARCH_R * Math.sin(a)]);
    }
  };
  arch(-wheelX);
  arch(wheelX);
  pts.push(
    [1.92, SILL], [2.04, -0.33], [2.07, -0.07],   // etupuskuri
    [2.0, 0.07],                                  // keulan yläreuna
    [1.6, 0.17],                                  // konepelti
    [0.86, 0.24],                                 // tuulilasin juuri
    [-1.55, 0.32],                                // nouseva vyötärölinja
    [-1.86, 0.3], [-1.99, 0.1], [-2.03, -0.18],   // takaluukku ja puskuri
  );
  return shapeFrom(pts);
}

export function buildHatchBody({ add, paint, dark, glass, headlight, taillight }, C) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /** Ohut palkki kahden pisteen välille. */
  const beam = (a, b, t, material) => {
    const d = b.clone().sub(a);
    const m = add(new THREE.BoxGeometry(d.length(), t, t), material, 0, 0, 0);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V(1, 0, 0), d.normalize());
    return m;
  };

  // --- Kori ------------------------------------------------------------------
  const depth = 2 * (HALF_W - BEVEL);
  const body = new THREE.ExtrudeGeometry(bodyProfile(C.wheelX), {
    depth, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 1, curveSegments: 1,
  });
  body.translate(0, 0, -depth / 2);
  const bp = body.getAttribute('position');
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i), y = bp.getY(i);
    let f = 1;
    if (x > 1.5) f -= 0.13 * Math.min(1, (x - 1.5) / 0.6) ** 1.5;      // keula kapenee
    if (x < -1.65) f -= 0.08 * Math.min(1, (-1.65 - x) / 0.4) ** 1.5;  // perä kapenee
    if (y > 0.08) f -= 0.07 * Math.min(1, (y - 0.08) / 0.25);          // pyöristetty olkalinja
    bp.setZ(i, bp.getZ(i) * f);
  }
  body.computeVertexNormals();
  add(body, paint, 0, 0, 0);

  // --- Lasikoppi ---------------------------------------------------------------
  const greenhouse = new THREE.ExtrudeGeometry(shapeFrom([
    [0.88, 0.22], [-0.02, ROOF], [-1.3, ROOF - 0.01], [-1.62, 0.62], [-1.6, 0.28],
  ]), { depth: 2 * GH_W, bevelEnabled: false });
  greenhouse.translate(0, 0, -GH_W);
  const gp = greenhouse.getAttribute('position');
  for (let i = 0; i < gp.count; i++) gp.setZ(i, Math.sign(gp.getZ(i)) * sideZ(gp.getY(i)));
  greenhouse.computeVertexNormals();
  add(greenhouse, glass, 0, 0, 0);

  // Katto ja kattospoileri
  const roofW = 2 * sideZ(ROOF) + 0.04;
  add(new THREE.BoxGeometry(1.3, 0.06, roofW), paint, -0.67, ROOF + 0.01, 0);
  const spoiler = add(new THREE.BoxGeometry(0.34, 0.05, roofW - 0.02), paint, -1.42, ROOF + 0.0, 0);
  spoiler.rotation.z = 0.16;
  add(new THREE.BoxGeometry(0.06, 0.04, 0.5), taillight, -1.56, ROOF - 0.02, 0);   // jarruvalo

  // Kyljet: leveä C-pilari (sivuikkunan nouseva takakulma), B-pilari ja A-pilarit
  const pillarMat = paint.clone();
  pillarMat.side = THREE.DoubleSide;
  const cPillar = [[-0.85, 0.27], [-1.6, 0.27], [-1.645, 0.62], [-1.33, ROOF + 0.005], [-1.24, ROOF + 0.005], [-1.17, 0.5]];
  for (const s of [-1, 1]) {
    const g = new THREE.ShapeGeometry(shapeFrom(cPillar));
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setZ(i, s * (sideZ(p.getY(i)) + 0.008));
    g.computeVertexNormals();
    add(g, pillarMat, 0, 0, 0);
    // B-pilari (oven ja takasivuikkunan väliin) ja ikkunan alalista
    beam(V(-0.66, 0.27, s * (sideZ(0.27) + 0.012)), V(-0.78, ROOF - 0.03, s * (sideZ(ROOF) + 0.012)), 0.05, dark);
    beam(V(0.84, 0.255, s * (sideZ(0.25) + 0.012)), V(-0.86, 0.285, s * (sideZ(0.28) + 0.012)), 0.025, dark);
    // A-pilari tuulilasin reunaan
    beam(V(0.88, 0.23, s * (sideZ(0.23) - 0.01)), V(-0.02, ROOF, s * (sideZ(ROOF) - 0.01)), 0.07, paint);
  }

  // --- Keula -----------------------------------------------------------------
  // Taaksepäin pyyhkäisevät ajovalot lokasuojan kulmissa
  for (const s of [-1, 1]) {
    const hl = add(new THREE.BoxGeometry(0.52, 0.12, 0.28), headlight, 1.86, 0.075, s * 0.62);
    hl.rotation.set(0, -s * 0.5, -0.22, 'YZX');
    add(new THREE.BoxGeometry(0.04, 0.07, 0.16), headlight, 2.09, -0.2, s * 0.58);   // sumuvalot
    // Peilit
    add(new THREE.BoxGeometry(0.2, 0.13, 0.14), paint, 0.62, 0.37, s * 0.9);
    add(new THREE.BoxGeometry(0.06, 0.1, 0.12), dark, 0.55, 0.37, s * 0.9);
    add(new THREE.BoxGeometry(0.1, 0.04, 0.12), dark, 0.66, 0.31, s * 0.82);
  }
  add(new THREE.BoxGeometry(0.06, 0.06, 0.62), dark, 2.075, 0.01, 0);       // ylempi säleikkö
  add(new THREE.BoxGeometry(0.06, 0.19, 0.98), dark, 2.105, -0.22, 0);      // iso alasäleikkö
  add(new THREE.BoxGeometry(0.02, 0.1, 0.44), mat('#f2f2ee'), 2.14, -0.2, 0); // tyhjä kilpi
  add(new THREE.BoxGeometry(0.22, 0.04, 1.5), dark, 1.98, -0.52, 0);        // etuhelma

  // --- Kyljet ----------------------------------------------------------------
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(1.42, 0.08, 0.05), dark, 0, SILL + 0.01, s * (HALF_W - 0.005)); // helmalista
    add(new THREE.BoxGeometry(0.15, 0.03, 0.03), dark, -0.42, 0.19, s * 0.885);              // ovenkahva
    // Oven saumat
    beam(V(-0.62, -0.46, s * 0.905), V(-0.6, 0.23, s * 0.882), 0.012, dark);
    beam(V(0.7, -0.38, s * 0.905), V(0.84, 0.22, s * 0.882), 0.012, dark);
  }

  // --- Perä ------------------------------------------------------------------
  for (const s of [-1, 1]) {
    const tl = add(new THREE.BoxGeometry(0.08, 0.3, 0.2), taillight, -2.0, 0.13, s * 0.68);
    tl.rotation.y = s * 0.35;
  }
  add(new THREE.BoxGeometry(0.02, 0.1, 0.44), mat('#f2f2ee'), -2.085, -0.08, 0);  // tyhjä kilpi
  add(new THREE.BoxGeometry(0.1, 0.12, 1.3), dark, -2.06, -0.38, 0);              // takahelma
  add(new THREE.CylinderGeometry(0.065, 0.065, 0.14, 8).rotateZ(Math.PI / 2), mat('#9a9ca2', { metalness: 0.6, roughness: 0.3 }), -2.1, -0.4, 0);

  // Antenni katolla
  beam(V(-0.45, ROOF + 0.03, 0), V(-0.75, ROOF + 0.38, 0), 0.016, dark);

  function mat(color, extra = {}) {
    return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, metalness: 0.05, ...extra });
  }
}

/** Viisipuolaisen vanteen tummat aukot pyörän pyörivään osaan. */
export function addHatchRim(spin, C, rimMat, darkMat) {
  const R = C.wheelRadius;
  const W = C.wheelWidth;
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.7, R * 0.7, W + 0.02, 15).rotateX(Math.PI / 2), rimMat);
  spin.add(disc);
  const holeGeo = new THREE.BoxGeometry(R * 0.3, R * 0.2, W + 0.035);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const h = new THREE.Mesh(holeGeo, darkMat);
    h.position.set(Math.cos(a) * R * 0.42, Math.sin(a) * R * 0.42, 0);
    h.rotation.z = a;
    spin.add(h);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.12, R * 0.12, W + 0.045, 6).rotateX(Math.PI / 2), rimMat);
  spin.add(cap);
}
