// Ralliraidikuorma-auto (Dakar-tyylinen 4x4): matala ohjaamo moottorin päällä, iso huoltolaatikko
// takana, korkea maavara ja isot nappularenkaat. Vain grafiikkaa, fysiikka tulee car.js:stä
// ja cars.js:stä (config: renkaat, jousitus, törmäyslaatikot).
//
// Auton paikallinen koordinaatisto: +X eteenpäin, +Y ylös, +Z oikealle.
// Värit: model.color = sininen pohja, model.cab = ohjaamon valkoinen, model.accent = vaaleansininen
// raita, model.stripe = keltainen raita.

import * as THREE from 'three';

const HALF_W = 1.18;     // korin puolileveys
const CAB_X0 = 1.0;      // ohjaamon takaseinä
const CAB_X1 = 2.92;     // ohjaamon keula
const CAB_Y0 = -0.08;    // ohjaamon pohja (etupyörien yläpuolella)
const CAB_TOP = 1.8;
const BOX_X0 = -2.95;    // huoltolaatikon takaseinä
const BOX_X1 = 0.86;
const BOX_Y0 = -0.22;
const BOX_TOP = 1.6;

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, metalness: 0.05, ...extra });
}

function shapeFrom(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) s.lineTo(x, y);
  return s;
}

/** Sivuprofiilista pursotettu kappale koko korin leveydeltä, pyöristetyt reunat. */
function extrudeSide(points, halfW, bevel = 0.05) {
  const depth = 2 * (halfW - bevel);
  const g = new THREE.ExtrudeGeometry(shapeFrom(points), {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Litteä tarra korin kylkeen (s = puoli, -1 vasen / 1 oikea). */
function decal(points, s, z) {
  const g = new THREE.ShapeGeometry(shapeFrom(points));
  g.translate(0, 0, s * z);
  return g;
}

/** Kaareva tarramuoto: alareuna ja yläreuna käyrinä (pisteet näytteistetään funktiosta). */
function sweep(x0, x1, lower, upper, n = 10) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const x = x0 + ((x1 - x0) * i) / n; pts.push([x, lower(x)]); }
  for (let i = n; i >= 0; i--) { const x = x0 + ((x1 - x0) * i) / n; pts.push([x, upper(x)]); }
  return pts;
}

// Kilpailunumero oviin (luodaan kerran)
let numberTex = null;
function numberTexture() {
  if (numberTex) return numberTex;
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f6f6f2';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#16181c';
  g.font = 'bold 104px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('500', 128, 70);
  numberTex = new THREE.CanvasTexture(c);
  numberTex.colorSpace = THREE.SRGBColorSpace;
  return numberTex;
}

/** Nappularengas: kehällä vuorottelevat korkeat palat ja urat (litteä varjostus tekee kulmikkaan kuvion). */
export function truckTireGeometry(C) {
  const R = C.wheelRadius, W = C.wheelWidth, N = 40;
  const g = new THREE.CylinderGeometry(R, R, W, N, 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < R * 0.5) continue;
    const idx = ((Math.round(Math.atan2(z, x) / (2 * Math.PI / N)) % N) + N) % N;
    // Keskirivillä palat porrastettu (kuin V-kuvio), olkapäillä täysleveät palat
    const mid = Math.abs(y) < W * 0.25;
    const block = mid ? (idx + 2) % 4 < 2 : idx % 4 < 2;
    const k = block ? 1 : 0.93;
    p.setX(i, x * k);
    p.setZ(i, z * k);
    // Olkapää pyöristyy hieman
    if (Math.abs(y) > W * 0.45) { p.setX(i, p.getX(i) * 0.97); p.setZ(i, p.getZ(i) * 0.97); }
  }
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

/** Teräsvanne: harmaa kiekko, kahdeksan reikää ja napa pultteineen. */
export function addTruckRim(spin, C, darkMat) {
  const R = C.wheelRadius, W = C.wheelWidth;
  const steel = mat('#a3a8ae', { roughness: 0.45, metalness: 0.45 });
  spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.6, R * 0.6, W * 0.8, 16).rotateX(Math.PI / 2), steel));
  const holeGeo = new THREE.CylinderGeometry(R * 0.07, R * 0.07, W * 0.8 + 0.02, 6).rotateX(Math.PI / 2);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const h = new THREE.Mesh(holeGeo, darkMat);
    h.position.set(Math.cos(a) * R * 0.4, Math.sin(a) * R * 0.4, 0);
    spin.add(h);
  }
  const hub = mat('#6d7279', { roughness: 0.4, metalness: 0.5 });
  spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.22, R * 0.26, W * 0.8 + 0.12, 10).rotateX(Math.PI / 2), hub));
  const bolt = new THREE.CylinderGeometry(0.025, 0.025, W * 0.8 + 0.16, 6).rotateX(Math.PI / 2);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const b = new THREE.Mesh(bolt, steel);
    b.position.set(Math.cos(a) * R * 0.17, Math.sin(a) * R * 0.17, 0);
    spin.add(b);
  }
}

export function buildTruckBody({ add, paint, dark, glass, headlight, taillight }, C, M) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const cabMat = mat(M.cab ?? '#eef0ec', { roughness: 0.45 });
  const accent = mat(M.accent ?? '#5cb6f0', { roughness: 0.45, side: THREE.DoubleSide });
  const stripeMat = mat(M.stripe ?? '#f2c230', { roughness: 0.5, side: THREE.DoubleSide });
  const whiteDecal = mat('#f4f5f2', { roughness: 0.5, side: THREE.DoubleSide });
  const navy = mat(M.trim ?? '#163f8c', { roughness: 0.5, side: THREE.DoubleSide });
  const black = mat('#1b1c1f', { roughness: 0.85 });
  const rubber = mat('#151517', { roughness: 0.95 });
  const chrome = mat('#c9ccd0', { roughness: 0.25, metalness: 0.7 });
  const sideGlass = glass.clone();
  sideGlass.side = THREE.DoubleSide;
  const W = HALF_W;

  /** Laatikko pisteestä a pisteeseen b (sivuprofiilin tasossa tai vinosti). */
  const beam = (a, b, t, material, w = t) => {
    const d = b.clone().sub(a);
    const m = add(new THREE.BoxGeometry(d.length(), t, w), material, 0, 0, 0);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V(1, 0, 0), d.normalize());
    return m;
  };

  // --- Runko ja alusta ---------------------------------------------------------
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(5.7, 0.26, 0.14), black, -0.1, -0.5, s * 0.48);  // runkopalkit
  add(new THREE.BoxGeometry(0.2, 0.2, 1.0), black, -1.85, -0.72, 0);   // taka-akselin tasauspyörästö
  add(new THREE.BoxGeometry(0.2, 0.2, 0.9), black, 1.85, -0.72, 0);    // etuakseli
  for (const x of [-C.wheelX, C.wheelX]) add(new THREE.CylinderGeometry(0.08, 0.08, 2 * C.wheelZ - 0.3, 8).rotateX(Math.PI / 2), black, x, -0.82, 0);
  // Polttoainetanki ja akkulaatikko akselien välissä
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(1.7, 0.5, 0.42), mat('#2c2e33', { roughness: 0.5, metalness: 0.3 }), -0.05, -0.48, s * 0.86);
    add(new THREE.BoxGeometry(1.72, 0.04, 0.44), black, -0.05, -0.2, s * 0.86);
  }
  // Iskunvaimentimet (pystyssä akseleiden päällä)
  for (const x of [-C.wheelX, C.wheelX]) for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), mat('#e2a51c', { roughness: 0.4 }), x + 0.28, -0.55, s * 0.62);
  }

  // --- Ohjaamo -------------------------------------------------------------------
  add(extrudeSide([
    [CAB_X0, CAB_Y0], [CAB_X1 - 0.04, CAB_Y0], [CAB_X1, 0.88], [CAB_X1 - 0.19, 1.66],
    [CAB_X1 - 0.34, CAB_TOP], [CAB_X0, CAB_TOP],
  ], W), cabMat, 0, 0, 0);
  // Sininen kattolippa ja kattoreunus
  add(extrudeSide([[CAB_X0 - 0.02, 1.58], [CAB_X1 - 0.24, 1.58], [CAB_X1 - 0.13, 1.66], [CAB_X1 - 0.34, CAB_TOP + 0.03], [CAB_X0 - 0.02, CAB_TOP + 0.03]], W + 0.012, 0.04), paint, 0, 0, 0);
  // Tuulilasi
  const windshield = mat('#07080a', { roughness: 0.3, metalness: 0 });   // musta tuulilasi
  beam(V(CAB_X1 + 0.08, 0.95, 0), V(CAB_X1 - 0.1, 1.6, 0), 0.03, windshield, 2 * W - 0.2);   // korin viisteen ulkopuolella
  // Tuulilasin keskipylväs ja pyyhkimet
  beam(V(CAB_X1 + 0.1, 0.95, 0), V(CAB_X1 - 0.08, 1.6, 0), 0.03, black, 0.05);
  for (const s of [-1, 1]) {
    const wiper = beam(V(CAB_X1 + 0.1, 0.96, s * 0.15), V(CAB_X1 + 0.04, 1.2, s * 0.62), 0.015, black, 0.02);
    wiper.position.x += 0.01;
  }
  // Sivuikkunat
  for (const s of [-1, 1]) {
    add(decal([[1.78, 0.94], [CAB_X1 - 0.02, 0.94], [CAB_X1 - 0.17, 1.52], [1.78, 1.52]], s, W + 0.006), sideGlass, 0, 0, 0);
    add(decal([[1.3, 0.94], [1.66, 0.94], [1.66, 1.52], [1.3, 1.52]], s, W + 0.006), sideGlass, 0, 0, 0);
    // Oven sauma ja kahva
    beam(V(1.2, CAB_Y0 + 0.05, s * (W + 0.008)), V(1.2, 1.56, s * (W + 0.008)), 0.014, black, 0.01);
    add(new THREE.BoxGeometry(0.2, 0.04, 0.04), black, 1.42, 0.82, s * (W + 0.02));
    // Sininen kaari ovien alaosassa ja navy-reunus
    add(decal(sweep(CAB_X0, CAB_X1 - 0.02, () => CAB_Y0 + 0.04, (x) => 0.25 + 0.3 * ((CAB_X1 - x) / (CAB_X1 - CAB_X0)) ** 1.5), s, W + 0.007), paint.clone(), 0, 0, 0)
      .material.side = THREE.DoubleSide;
    add(decal(sweep(CAB_X0, CAB_X1 - 0.02, (x) => 0.25 + 0.3 * ((CAB_X1 - x) / (CAB_X1 - CAB_X0)) ** 1.5, (x) => 0.31 + 0.3 * ((CAB_X1 - x) / (CAB_X1 - CAB_X0)) ** 1.5), s, W + 0.008), accent, 0, 0, 0);
    // Kilpailunumero ovessa
    const num = add(new THREE.PlaneGeometry(0.62, 0.31), new THREE.MeshBasicMaterial({ map: numberTexture() }), 1.95, 0.66, s * (W + 0.01));
    if (s < 0) num.rotation.y = Math.PI;
    // Peilit varsien päässä ohjaamon etukulmissa
    beam(V(CAB_X1 - 0.12, 1.25, s * (W - 0.02)), V(CAB_X1 - 0.02, 1.32, s * (W + 0.3)), 0.04, black);
    add(new THREE.BoxGeometry(0.08, 0.42, 0.22), black, CAB_X1 - 0.02, 1.2, s * (W + 0.34));
    add(new THREE.BoxGeometry(0.02, 0.36, 0.17), mat('#8fa8bf', { roughness: 0.1, metalness: 0.6 }), CAB_X1 - 0.065, 1.2, s * (W + 0.34));
    // Askelmat oven alla
    add(new THREE.BoxGeometry(0.34, 0.05, 0.22), black, 1.05, -0.28, s * (W - 0.05));
    add(new THREE.BoxGeometry(0.34, 0.05, 0.18), black, 1.05, 0.12, s * (W + 0.02));
  }
  // Keula: säleikkö, valot ja keltainen raita
  add(new THREE.BoxGeometry(0.06, 0.46, 1.3), black, CAB_X1 - 0.01, 0.38, 0);
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.03, 0.04, 1.3), cabMat, CAB_X1 + 0.025, 0.2 + i * 0.12, 0);
  add(new THREE.BoxGeometry(0.03, 0.2, 0.36), paint, CAB_X1 + 0.03, 0.38, 0);    // merkkikilpi (tyhjä)
  add(new THREE.BoxGeometry(0.02, 0.06, 2 * W - 0.1), stripeMat, CAB_X1 + 0.003, 0.72, 0);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.18, 0.3), headlight, CAB_X1 - 0.005, 0.38, s * 0.86);
    add(new THREE.BoxGeometry(0.04, 0.06, 0.3), mat('#f29a1a', { emissive: '#b85d00', emissiveIntensity: 0.3 }), CAB_X1, 0.22, s * 0.86);
  }
  // LED-lisävalorivi tuulilasin alla
  for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.06, 0.07, 0.2), headlight, CAB_X1 + 0.012, 0.86, -0.75 + i * 0.3);

  // --- Puskuri ---------------------------------------------------------------------
  add(new THREE.BoxGeometry(0.32, 0.36, 2 * W - 0.04), paint, CAB_X1 + 0.12, -0.32, 0);
  add(new THREE.BoxGeometry(0.34, 0.06, 2 * W - 0.02), black, CAB_X1 + 0.12, -0.53, 0);
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 10).rotateZ(Math.PI / 2), headlight, CAB_X1 + 0.29, -0.3, s * 0.8);
    add(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 10).rotateZ(Math.PI / 2), black, CAB_X1 + 0.275, -0.3, s * 0.8);
    add(new THREE.BoxGeometry(0.1, 0.1, 0.06), mat('#d8262c'), CAB_X1 + 0.3, -0.48, s * 0.38);   // hinauskoukut
    beam(V(CAB_X1 + 0.05, -0.48, s * 0.42), V(CAB_X1 - 0.5, -0.75, s * 0.45), 0.1, paint, 0.1); // puskurin tuet
  }

  // --- Lokasuojat (mustat kaaret renkaiden yllä) ---------------------------------
  const WC = C.wheelY - C.suspensionRest + 0.08;   // renkaan keskikohta ajossa
  const arch = (cx, from, to, r, z, width) => {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a0 = from + ((to - from) * i) / n, a1 = from + ((to - from) * (i + 1)) / n;
      beam(V(cx + r * Math.cos(a0), WC + r * Math.sin(a0), z), V(cx + r * Math.cos(a1), WC + r * Math.sin(a1), z), 0.05, rubber, width);
    }
  };
  for (const s of [-1, 1]) {
    arch(C.wheelX, 0.35, Math.PI - 0.25, 0.78, s * (C.wheelZ + 0.04), C.wheelWidth + 0.18);
    arch(-C.wheelX, 0.25, Math.PI - 0.35, 0.78, s * (C.wheelZ + 0.04), C.wheelWidth + 0.18);
    // Roiskeläpät takarenkaiden takana
    add(new THREE.BoxGeometry(0.03, 0.62, C.wheelWidth + 0.14), rubber, -C.wheelX - 0.8, -1.02, s * (C.wheelZ + 0.03));
    add(new THREE.BoxGeometry(0.03, 0.52, C.wheelWidth + 0.1), rubber, C.wheelX - 0.82, -0.96, s * (C.wheelZ + 0.03));
  }

  // --- Huoltolaatikko ------------------------------------------------------------
  add(extrudeSide([
    [BOX_X0, BOX_Y0], [BOX_X1, BOX_Y0], [BOX_X1, BOX_TOP - 0.06], [BOX_X1 - 0.14, BOX_TOP],
    [BOX_X0 + 0.42, BOX_TOP], [BOX_X0, BOX_TOP - 0.36],
  ], W, 0.06), paint, 0, 0, 0);
  // Laatikon pohjalista ja kattokansi
  add(new THREE.BoxGeometry(BOX_X1 - BOX_X0, 0.08, 2 * W + 0.02), black, (BOX_X0 + BOX_X1) / 2, BOX_Y0 - 0.02, 0);
  add(new THREE.BoxGeometry(2.6, 0.05, 1.6), navy, -1.0, BOX_TOP + 0.015, 0);
  for (const s of [-1, 1]) {
    const z = W + 0.006;
    // Leveä vaaleansininen pyyhkäisy etualakulmasta ylös taakse
    add(decal(sweep(BOX_X0 + 0.08, BOX_X1 - 0.08, (x) => -0.12 + 0.1 * ((BOX_X1 - x) / 3.8), (x) => 0.18 + 0.95 * ((BOX_X1 - x) / 3.8) ** 1.7), s, z), accent, 0, 0, 0);
    add(decal(sweep(BOX_X0 + 0.08, BOX_X1 - 0.08, (x) => 0.18 + 0.95 * ((BOX_X1 - x) / 3.8) ** 1.7, (x) => 0.3 + 0.95 * ((BOX_X1 - x) / 3.8) ** 1.7), s, z + 0.001), whiteDecal, 0, 0, 0);
    add(decal(sweep(BOX_X0 + 0.08, BOX_X1 - 0.08, (x) => 0.36 + 0.95 * ((BOX_X1 - x) / 3.8) ** 1.7, (x) => 0.42 + 0.95 * ((BOX_X1 - x) / 3.8) ** 1.7), s, z + 0.001), stripeMat, 0, 0, 0);
    // Takamoottorin jäähdyttimen ritilä laatikon etukulmassa
    add(new THREE.BoxGeometry(0.62, 0.92, 0.02), black, BOX_X1 - 0.42, 0.62, s * (W + 0.01));
    for (let i = 0; i < 8; i++) add(new THREE.BoxGeometry(0.6, 0.025, 0.02), mat('#3b3e44'), BOX_X1 - 0.42, 0.2 + i * 0.12, s * (W + 0.022));
    // Laatikon luukkujen saumat
    for (const x of [-0.5, -1.7]) beam(V(x, BOX_Y0 + 0.05, s * (W + 0.009)), V(x, BOX_TOP - 0.12, s * (W + 0.009)), 0.012, navy, 0.01);
    beam(V(BOX_X0 + 0.2, 0.0, s * (W + 0.009)), V(-0.1, 0.0, s * (W + 0.009)), 0.012, navy, 0.01);
  }
  // Ilmanoton torni ja pakoputki ohjaamon takana
  add(new THREE.BoxGeometry(0.22, 0.95, 0.5), paint, BOX_X1 + 0.05, BOX_TOP + 0.35, -0.65);
  add(new THREE.BoxGeometry(0.24, 0.12, 0.52), black, BOX_X1 + 0.05, BOX_TOP + 0.86, -0.65);
  add(new THREE.CylinderGeometry(0.07, 0.07, 1.9, 10), chrome, BOX_X1 + 0.06, 1.0, 0.85);
  add(new THREE.CylinderGeometry(0.075, 0.07, 0.12, 10), black, BOX_X1 + 0.06, 1.98, 0.85);

  // --- Katto: putkikehikko, valopaneeli ja antennit -----------------------------
  const tube = (a, b) => beam(a, b, 0.05, paint, 0.05);
  for (const s of [-1, 1]) {
    tube(V(CAB_X0 + 0.05, CAB_TOP + 0.04, s * (W - 0.12)), V(CAB_X0 + 0.05, CAB_TOP + 0.28, s * (W - 0.12)));
    tube(V(CAB_X1 - 0.5, CAB_TOP + 0.04, s * (W - 0.12)), V(CAB_X1 - 0.42, CAB_TOP + 0.28, s * (W - 0.12)));
    tube(V(CAB_X0 + 0.05, CAB_TOP + 0.28, s * (W - 0.12)), V(CAB_X1 - 0.42, CAB_TOP + 0.28, s * (W - 0.12)));
  }
  tube(V(CAB_X1 - 0.42, CAB_TOP + 0.28, -(W - 0.12)), V(CAB_X1 - 0.42, CAB_TOP + 0.28, W - 0.12));
  tube(V(CAB_X0 + 0.05, CAB_TOP + 0.28, -(W - 0.12)), V(CAB_X0 + 0.05, CAB_TOP + 0.28, W - 0.12));
  add(new THREE.BoxGeometry(0.1, 0.12, 1.7), black, CAB_X1 - 0.4, CAB_TOP + 0.36, 0);
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.03, 0.08, 0.26), headlight, CAB_X1 - 0.34, CAB_TOP + 0.36, -0.64 + i * 0.32);
  add(new THREE.BoxGeometry(0.5, 0.05, 2 * W - 0.3), stripeMat, CAB_X0 + 0.4, CAB_TOP + 0.03, 0);
  add(new THREE.CylinderGeometry(0.008, 0.012, 1.1, 4), black, CAB_X0 + 0.2, CAB_TOP + 0.55, -0.9);
  add(new THREE.CylinderGeometry(0.008, 0.012, 0.8, 4), black, CAB_X0 + 0.2, CAB_TOP + 0.4, 0.9);

  // --- Perä: varapyörä, valot ja alleajosuoja -------------------------------------
  const spare = new THREE.Group();
  spare.position.set(BOX_X0 - 0.3, 0.55, 0);
  spare.rotation.y = Math.PI / 2;
  const tire = new THREE.Mesh(truckTireGeometry(C), rubber);
  tire.castShadow = true;
  spare.add(tire);
  addTruckRim(spare, C, dark);
  add(new THREE.BoxGeometry(0.2, 0.12, 1.1), black, BOX_X0 - 0.1, 0.55, 0).parent.add(spare);
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.16, 0.3), taillight, BOX_X0 - 0.04, -0.08, s * (W - 0.22));
    add(new THREE.BoxGeometry(0.06, 0.1, 0.16), mat('#f29a1a', { emissive: '#b85d00', emissiveIntensity: 0.3 }), BOX_X0 - 0.04, 0.08, s * (W - 0.22));
  }
  add(new THREE.BoxGeometry(0.12, 0.14, 2 * W - 0.3), paint, BOX_X0 - 0.12, -0.72, 0);
  for (const s of [-1, 1]) beam(V(BOX_X0 - 0.1, -0.68, s * 0.5), V(BOX_X0 + 0.5, -0.45, s * 0.5), 0.08, black);
}
