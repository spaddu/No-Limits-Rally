// Retro RWD:n ulkonäkö: 70-luvun kaksiovinen ralli-sedan (kolmilaatikkomalli).
// Vain grafiikkaa, fysiikka (törmäyslaatikko, renkaiden paikat) tulee car.js:stä ja cars.js:stä.
//
// Auton paikallinen koordinaatisto: +X eteenpäin, +Y ylös, +Z oikealle.
// Kori tehdään sivuprofiilista, joka pursotetaan leveyssuunnassa (kuten modelHatch.js).
// Värit: model.color = korin pohjaväri (valkoinen), model.accent = katto, konepelti ja
// kylkiraita, model.accent2 = takakyljen raita.

import * as THREE from 'three';

const HALF_W = 0.88;       // korin puolileveys
const BEVEL = 0.04;        // korin reunojen viiste
const SILL = -0.48;        // helmapellin alareuna
const ARCH_R = 0.57;       // pyöränkaaren säde

const BELT = 0.28;         // ikkunalinja (suora, laatikkomainen kylki)
const ROOF = 0.9;
const GH_W = 0.8;          // lasikopin puolileveys alhaalla
const TUMBLE = 0.17;

const sideZ = (y) => GH_W * (1 - TUMBLE * Math.min(Math.max((y - BELT) / (ROOF - BELT), 0), 1));

function shapeFrom(points) {
  const s = new THREE.Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) s.lineTo(x, y);
  return s;
}

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, metalness: 0.05, ...extra });
}

/** Korin sivuprofiili: pitkä suora konepelti, pysty keula ja tavaratila. */
function bodyProfile(wheelX) {
  const pts = [[-2.03, -0.33], [-1.95, SILL]];
  const arch = (cx) => {
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI - (i * Math.PI) / 8;
      pts.push([cx + ARCH_R * Math.cos(a), SILL + ARCH_R * Math.sin(a)]);
    }
  };
  arch(-wheelX);
  arch(wheelX);
  pts.push(
    [1.96, SILL], [2.08, -0.32], [2.1, 0.13],   // pysty keula
    [2.06, 0.22],                               // konepellin etureuna
    [0.8, 0.27],                                // suora konepelti
    [-1.28, 0.28],                              // ikkunalinja
    [-1.98, 0.27], [-2.05, 0.15],               // tavaratilan kansi ja perä
  );
  return shapeFrom(pts);
}

// Kilpailunumero oveen (luodaan kerran)
let numberTex = null;
function raceNumberTexture() {
  if (numberTex) return numberTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f2ec';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#111';
  g.lineWidth = 6;
  g.strokeRect(5, 5, 118, 118);
  g.fillStyle = '#111';
  g.font = 'bold 78px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('29', 64, 70);
  numberTex = new THREE.CanvasTexture(c);
  numberTex.colorSpace = THREE.SRGBColorSpace;
  return numberTex;
}

export function buildRetroBody({ add, paint, dark, glass, headlight, taillight }, C, M) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const accent = mat(M.accent ?? '#c51f2a', { roughness: 0.45 });
  const accent2 = mat(M.accent2 ?? '#1d4ea3', { roughness: 0.45 });
  const chrome = mat('#d9dde2', { roughness: 0.25, metalness: 0.7 });
  const indicator = mat('#f08a12', { emissive: '#ff7a00', emissiveIntensity: 0.35 });
  const white = mat('#f4f2ec');

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
    if (x > 1.85) f -= 0.04 * Math.min(1, (x - 1.85) / 0.3);
    if (x < -1.85) f -= 0.04 * Math.min(1, (-1.85 - x) / 0.25);
    if (y > 0.22) f -= 0.04 * Math.min(1, (y - 0.22) / 0.1);
    bp.setZ(i, bp.getZ(i) * f);
  }
  body.computeVertexNormals();
  add(body, paint, 0, 0, 0);

  // --- Lasikoppi: pysty tuulilasi, suora katto, takalasi ----------------------
  const greenhouse = new THREE.ExtrudeGeometry(shapeFrom([
    [0.82, 0.26], [0.12, ROOF], [-0.88, ROOF], [-1.34, 0.26],
  ]), { depth: 2 * GH_W, bevelEnabled: false });
  greenhouse.translate(0, 0, -GH_W);
  const gp = greenhouse.getAttribute('position');
  for (let i = 0; i < gp.count; i++) gp.setZ(i, Math.sign(gp.getZ(i)) * sideZ(gp.getY(i)));
  greenhouse.computeVertexNormals();
  add(greenhouse, glass, 0, 0, 0);

  // Punainen katto, pilarit ja ikkunanpuitteet
  const roofW = 2 * sideZ(ROOF) + 0.04;
  add(new THREE.BoxGeometry(1.06, 0.06, roofW), accent, -0.38, ROOF + 0.01, 0);
  const pillarMat = accent.clone();
  pillarMat.side = THREE.DoubleSide;
  const cPillar = [[-0.98, 0.27], [-1.36, 0.27], [-0.9, ROOF + 0.005], [-0.74, ROOF + 0.005]];
  for (const s of [-1, 1]) {
    const g = new THREE.ShapeGeometry(shapeFrom(cPillar));
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setZ(i, s * (sideZ(p.getY(i)) + 0.008));
    add(g, pillarMat, 0, 0, 0);
    beam(V(-0.3, 0.28, s * (sideZ(0.28) + 0.012)), V(-0.33, ROOF - 0.02, s * (sideZ(ROOF) + 0.012)), 0.06, accent); // B-pilari
    beam(V(0.82, 0.27, s * (sideZ(0.27) - 0.005)), V(0.12, ROOF, s * (sideZ(ROOF) - 0.005)), 0.06, accent);         // A-pilari
    beam(V(0.8, 0.29, s * (sideZ(0.29) + 0.01)), V(-1.0, 0.29, s * (sideZ(0.29) + 0.01)), 0.03, accent);             // ikkunan alalista
  }

  // --- Teippaus ----------------------------------------------------------------
  // Konepelti punaisena valkoisin raidoin
  const hoodTilt = Math.atan2(0.27 - 0.22, 2.06 - 0.8);
  const hoodY = 0.27 + BEVEL - Math.tan(hoodTilt) * (1.44 - 0.8) + 0.012;
  const hood = add(new THREE.BoxGeometry(1.24, 0.02, 1.36), accent, 1.44, hoodY, 0);
  hood.rotation.z = -hoodTilt;
  for (const z of [-0.4, -0.2, 0.2, 0.4]) {
    const st = add(new THREE.BoxGeometry(1.24, 0.022, 0.045), white, 1.44, hoodY + 0.001, z);
    st.rotation.z = -hoodTilt;
  }
  // Kylkiraidat: punainen edessä, sininen takakyljessä; numerokilpi ovessa
  const sideOut = HALF_W + 0.006;
  const numberMat = new THREE.MeshStandardMaterial({ map: raceNumberTexture(), roughness: 0.6 });
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(2.4, 0.15, 0.012), accent, 0.62, 0.143, s * sideOut);
    add(new THREE.BoxGeometry(1.22, 0.15, 0.012), accent2, -1.22, 0.143, s * sideOut);
    const num = add(new THREE.PlaneGeometry(0.36, 0.36), numberMat, -0.05, -0.12, s * (sideOut + 0.002));
    if (s < 0) num.rotation.y = Math.PI;
    // Ovenkahva, peili ja oven saumat
    add(new THREE.BoxGeometry(0.14, 0.03, 0.03), chrome, -0.2, 0.2, s * 0.895);
    add(new THREE.BoxGeometry(0.05, 0.1, 0.1), chrome, 0.62, 0.38, s * 0.9);
    add(new THREE.BoxGeometry(0.03, 0.03, 0.08), chrome, 0.64, 0.31, s * 0.85);
    beam(V(-0.32, -0.44, s * 0.887), V(-0.31, 0.27, s * 0.887), 0.012, dark);
    beam(V(0.7, -0.36, s * 0.887), V(0.78, 0.27, s * 0.887), 0.012, dark);
    // Roiskeläpät renkaiden takana
    add(new THREE.BoxGeometry(0.02, 0.32, 0.3), dark, -C.wheelX - 0.5, -0.66, s * 0.84);
    add(new THREE.BoxGeometry(0.02, 0.28, 0.28), dark, C.wheelX - 0.5, -0.64, s * 0.84);
  }

  // --- Keula -----------------------------------------------------------------
  add(new THREE.BoxGeometry(0.04, 0.2, 1.06), dark, 2.145, 0.07, 0);          // leveä säleikkö
  add(new THREE.BoxGeometry(0.05, 0.22, 0.03), chrome, 2.15, 0.07, 0.53);     // säleikön kehys
  add(new THREE.BoxGeometry(0.05, 0.22, 0.03), chrome, 2.15, 0.07, -0.53);
  add(new THREE.BoxGeometry(0.05, 0.025, 1.09), chrome, 2.15, 0.18, 0);
  add(new THREE.BoxGeometry(0.05, 0.025, 1.09), chrome, 2.15, -0.04, 0);
  for (let k = -3; k <= 3; k++) {
    add(new THREE.BoxGeometry(0.045, 0.012, 1.04), chrome, 2.15, 0.07 + k * 0.025, 0); // vaakarimat
  }
  const lampGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12).rotateZ(Math.PI / 2);
  const ringGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.04, 12).rotateZ(Math.PI / 2);
  for (const s of [-1, 1]) {
    add(ringGeo, chrome, 2.16, 0.07, s * 0.67);                               // pyöreät ajovalot
    add(lampGeo, headlight, 2.175, 0.07, s * 0.67);
    const ind = add(new THREE.BoxGeometry(0.1, 0.12, 0.08), indicator, 2.12, 0.07, s * 0.8); // vilkut kulmissa
    ind.rotation.y = s * 0.25;
  }
  add(new THREE.BoxGeometry(0.1, 0.09, 1.86), chrome, 2.16, -0.2, 0);          // kromipuskuri
  add(new THREE.BoxGeometry(0.02, 0.1, 0.42), white, 2.215, -0.2, 0);          // tyhjä kilpi
  // Neljä lisävaloa tangossa puskurin edessä (valkoiset suojat)
  add(new THREE.BoxGeometry(0.04, 0.04, 1.5), dark, 2.24, -0.09, 0);
  const auxGeo = new THREE.CylinderGeometry(0.105, 0.105, 0.09, 12).rotateZ(Math.PI / 2);
  const coverGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.02, 12).rotateZ(Math.PI / 2);
  for (const z of [-0.6, -0.22, 0.22, 0.6]) {
    add(auxGeo, chrome, 2.29, -0.03, z);
    add(coverGeo, white, 2.34, -0.03, z);
  }
  // Antenni lokasuojassa
  beam(V(1.25, 0.3, -0.8), V(1.2, 0.75, -0.8), 0.014, dark);

  // --- Perä ------------------------------------------------------------------
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.13, 0.32), taillight, -2.095, 0.13, s * 0.62);
    add(new THREE.BoxGeometry(0.05, 0.06, 0.32), indicator, -2.095, 0.02, s * 0.62);
  }
  add(new THREE.BoxGeometry(0.1, 0.09, 1.84), chrome, -2.1, -0.2, 0);          // takapuskuri
  add(new THREE.BoxGeometry(0.02, 0.1, 0.42), white, -2.1, 0.02, 0);         // tyhjä kilpi
  add(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8).rotateZ(Math.PI / 2), chrome, -2.08, -0.42, 0.55); // pakoputki
}

/** Peltivanne: hopea levy, pieni reikärivi ja napakapseli. */
export function addRetroRim(spin, C, rimMat, darkMat) {
  const R = C.wheelRadius;
  const W = C.wheelWidth;
  spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.66, R * 0.66, W + 0.02, 14).rotateX(Math.PI / 2), rimMat));
  const holeGeo = new THREE.CylinderGeometry(R * 0.07, R * 0.07, W + 0.034, 6).rotateX(Math.PI / 2);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const h = new THREE.Mesh(holeGeo, darkMat);
    h.position.set(Math.cos(a) * R * 0.46, Math.sin(a) * R * 0.46, 0);
    spin.add(h);
  }
  spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.22, R * 0.25, W + 0.05, 10).rotateX(Math.PI / 2), rimMat));
}
