// WRC AWD:n ulkonäkö: nykyaikainen Rally1-tyylinen kilpa-hatchback isoine siipineen.
// Vain grafiikkaa, fysiikka (törmäyslaatikko, renkaiden paikat) tulee car.js:stä ja cars.js:stä.
//
// Auton paikallinen koordinaatisto: +X eteenpäin, +Y ylös, +Z oikealle.
// Kori tehdään sivuprofiilista (kuten modelHatch.js), mutta se jaetaan kahteen osaan:
// keula (model.color, punainen) ja muu kori (model.body, tumma). Katto = model.roof.

import * as THREE from 'three';

const HALF_W = 0.95;       // leveä kori, renkaat 0.69–1.03
const BEVEL = 0.04;
const SILL = -0.5;
const ARCH_R = 0.58;
const SPLIT_X = 0.55;      // keulan ja korin värisauma (etuoven etureuna)

const BELT = 0.25;
const ROOF = 0.86;
const GH_W = 0.8;
const TUMBLE = 0.24;
const TUMBLE_ANGLE = Math.atan((GH_W * TUMBLE) / (ROOF - BELT));

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

/** Leikkaa monikulmion pystysuoralla viivalla x = xc (keep: 1 = oikea puoli, -1 = vasen). */
function clipX(pts, xc, keep) {
  const inside = (p) => (p[0] - xc) * keep >= 0;
  const cut = (a, b) => {
    const t = (xc - a[0]) / (b[0] - a[0]);
    return [xc, a[1] + (b[1] - a[1]) * t];
  };
  const out = [];
  pts.forEach((cur, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    if (inside(cur)) {
      if (!inside(prev)) out.push(cut(prev, cur));
      out.push(cur);
    } else if (inside(prev)) {
      out.push(cut(prev, cur));
    }
  });
  return out;
}

function bodyPoints(wheelX) {
  const pts = [[-1.98, -0.34], [-1.88, SILL]];
  const arch = (cx) => {
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI - (i * Math.PI) / 8;
      pts.push([cx + ARCH_R * Math.cos(a), SILL + ARCH_R * Math.sin(a)]);
    }
  };
  arch(-wheelX);
  arch(wheelX);
  pts.push(
    [1.9, SILL], [2.06, -0.36], [2.08, -0.1],   // matala keula
    [2.02, 0.06], [1.55, 0.16],                 // lyhyt viisto konepelti
    [0.78, 0.24],                               // tuulilasin juuri
    [-1.5, 0.31],                               // nouseva vyötärö
    [-1.82, 0.3], [-1.95, 0.12], [-2.0, -0.15], // takaluukku ja perä
  );
  return pts;
}

/** Pursottaa korin osan ja kaventaa keulan, perän ja olkalinjan. */
function bodyPart(points) {
  const depth = 2 * (HALF_W - BEVEL);
  const g = new THREE.ExtrudeGeometry(shapeFrom(points), {
    depth, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 1, curveSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    let f = 1;
    if (x > 1.45) f -= 0.12 * Math.min(1, (x - 1.45) / 0.65) ** 1.4;
    if (x < -1.6) f -= 0.07 * Math.min(1, (-1.6 - x) / 0.4) ** 1.4;
    if (y > 0.18) f -= 0.09 * Math.min(1, (y - 0.18) / 0.18);
    p.setZ(i, p.getZ(i) * f);
  }
  g.computeVertexNormals();
  return g;
}

/** Litteä tarra kyljen pystysuoralle osalle (y < 0.18). */
function sideDecal(points, s, lift = 0.006) {
  const g = new THREE.ShapeGeometry(shapeFrom(points));
  g.translate(0, 0, s * (HALF_W + lift));
  return g;
}

// Pieni keltainen kilpailunumero takasivuikkunaan (luodaan kerran)
let numberTex = null;
function numberTexture() {
  if (numberTex) return numberTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 96;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 64, 96);
  g.fillStyle = '#ffd21a';
  g.font = 'italic bold 88px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('5', 32, 52);
  numberTex = new THREE.CanvasTexture(c);
  numberTex.colorSpace = THREE.SRGBColorSpace;
  return numberTex;
}

export function buildWrcBody({ add, paint, dark, glass, headlight, taillight }, C, M) {
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const bodyMat = mat(M.body ?? '#25272c', { roughness: 0.4, metalness: 0.15 });
  const roofMat = mat(M.roof ?? '#f1f1ef', { roughness: 0.45 });
  const carbon = mat('#17181b', { roughness: 0.7 });
  const white = mat('#f4f4f2', { roughness: 0.5 });
  const decalWhite = white.clone();
  decalWhite.side = THREE.DoubleSide;
  const decalRed = paint.clone();
  decalRed.side = THREE.DoubleSide;

  const beam = (a, b, t, material, w = t) => {
    const d = b.clone().sub(a);
    const m = add(new THREE.BoxGeometry(d.length(), t, w), material, 0, 0, 0);
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(V(1, 0, 0), d.normalize());
    return m;
  };

  // --- Kori: punainen keula + tumma muu osa (viisteet tekevät väliin paneelisauman) ---
  const pts = bodyPoints(C.wheelX);
  add(bodyPart(clipX(pts, SPLIT_X + BEVEL, 1)), paint, 0, 0, 0);
  add(bodyPart(clipX(pts, SPLIT_X - BEVEL, -1)), bodyMat, 0, 0, 0);

  // --- Lasikoppi -------------------------------------------------------------
  const greenhouse = new THREE.ExtrudeGeometry(shapeFrom([
    [0.8, 0.22], [-0.08, ROOF], [-1.25, ROOF - 0.01], [-1.58, 0.6], [-1.56, 0.28],
  ]), { depth: 2 * GH_W, bevelEnabled: false });
  greenhouse.translate(0, 0, -GH_W);
  const gp = greenhouse.getAttribute('position');
  for (let i = 0; i < gp.count; i++) gp.setZ(i, Math.sign(gp.getZ(i)) * sideZ(gp.getY(i)));
  greenhouse.computeVertexNormals();
  add(greenhouse, glass, 0, 0, 0);

  // Valkoinen katto, tummat pilarit
  const roofW = 2 * sideZ(ROOF) + 0.04;
  add(new THREE.BoxGeometry(1.24, 0.06, roofW), roofMat, -0.66, ROOF + 0.01, 0);
  add(new THREE.BoxGeometry(0.26, 0.08, 0.34), carbon, -0.3, ROOF + 0.07, 0);          // kattoilmanotto
  add(new THREE.BoxGeometry(0.02, 0.06, 0.28), mat('#08090a'), -0.17, ROOF + 0.07, 0);
  const roofWing = add(new THREE.BoxGeometry(0.3, 0.04, roofW), carbon, -1.36, ROOF - 0.01, 0);
  roofWing.rotation.z = 0.14;
  const pillarMat = bodyMat.clone();
  pillarMat.side = THREE.DoubleSide;
  const cPillar = [[-0.95, 0.27], [-1.58, 0.27], [-1.625, 0.6], [-1.3, ROOF + 0.005], [-1.2, ROOF + 0.005], [-1.08, 0.5]];
  for (const s of [-1, 1]) {
    const g = new THREE.ShapeGeometry(shapeFrom(cPillar));
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setZ(i, s * (sideZ(p.getY(i)) + 0.008));
    add(g, pillarMat, 0, 0, 0);
    beam(V(-0.55, 0.27, s * (sideZ(0.27) + 0.012)), V(-0.66, ROOF - 0.03, s * (sideZ(ROOF) + 0.012)), 0.06, carbon); // B-pilari
    beam(V(0.8, 0.22, s * (sideZ(0.22) - 0.01)), V(-0.08, ROOF, s * (sideZ(ROOF) - 0.01)), 0.07, carbon);          // A-pilari
    // Kilpailunumero takasivuikkunaan
    const num = new THREE.PlaneGeometry(0.17, 0.25);
    const nm = add(num, new THREE.MeshBasicMaterial({ map: numberTexture(), transparent: true }), -0.88, 0.58, s * (sideZ(0.58) + 0.014));
    nm.rotation.set(-TUMBLE_ANGLE, s < 0 ? Math.PI : 0, 0, 'YXZ');
  }

  // --- Keula -----------------------------------------------------------------
  for (const s of [-1, 1]) {
    // Kapeat LED-valot ja niiden alla tumma ilmanottoaukko
    const hl = add(new THREE.BoxGeometry(0.54, 0.1, 0.28), headlight, 1.85, 0.08, s * 0.63);
    hl.rotation.set(0, -s * 0.5, -0.22, 'YZX');
    add(new THREE.BoxGeometry(0.06, 0.16, 0.26), carbon, 2.09, -0.2, s * 0.66);         // jarrujen jäähdytys
    const canard = add(new THREE.BoxGeometry(0.22, 0.02, 0.16), carbon, 2.0, -0.3, s * 0.86); // siivekkeet
    canard.rotation.z = 0.15;
    // Konepellin ritilät
    const vent = add(new THREE.BoxGeometry(0.42, 0.02, 0.26), carbon, 1.42, 0.174 + BEVEL + 0.006, s * 0.36);
    vent.rotation.z = -0.1;
    // Peilit
    add(new THREE.BoxGeometry(0.2, 0.12, 0.14), carbon, 0.6, 0.36, s * 0.93);
    add(new THREE.BoxGeometry(0.1, 0.04, 0.14), carbon, 0.64, 0.3, s * 0.84);
  }
  add(new THREE.BoxGeometry(0.06, 0.26, 1.1), carbon, 2.105, -0.22, 0);       // iso alasäleikkö
  add(new THREE.BoxGeometry(0.06, 0.05, 0.5), carbon, 2.065, 0.02, 0);        // yläsäleikkö
  add(new THREE.BoxGeometry(0.36, 0.04, 2.0), carbon, 2.0, SILL - 0.02, 0);   // etusplitteri

  // --- Kyljet: levikkeiden reunukset, helmat ja teippaus -----------------------
  for (const s of [-1, 1]) {
    for (const cx of [-C.wheelX, C.wheelX]) {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI - (i * Math.PI) / n;
        const a1 = Math.PI - ((i + 1) * Math.PI) / n;
        const r = ARCH_R - BEVEL + 0.035;
        beam(V(cx + r * Math.cos(a0), SILL + r * Math.sin(a0), s * (HALF_W + 0.03)),
          V(cx + r * Math.cos(a1), SILL + r * Math.sin(a1), s * (HALF_W + 0.03)), 0.07, carbon, 0.1);
      }
    }
    add(new THREE.BoxGeometry(1.36, 0.12, 0.12), carbon, 0, SILL + 0.02, s * (HALF_W + 0.02)); // helmasiivet
    // Valkoiset vinoraidat ovissa ja punainen alaraita
    add(sideDecal([[-0.62, -0.43], [-0.32, -0.43], [0.12, 0.16], [-0.18, 0.16]], s, 0.009), decalWhite, 0, 0, 0);
    add(sideDecal([[-0.24, -0.43], [-0.12, -0.43], [0.32, 0.16], [0.2, 0.16]], s, 0.009), decalWhite, 0, 0, 0);
    add(sideDecal([[-0.68, -0.44], [0.6, -0.44], [0.6, -0.37], [-0.68, -0.37]], s), decalRed, 0, 0, 0);
    // Oven saumat
    beam(V(-0.56, -0.44, s * (HALF_W + 0.007)), V(-0.55, 0.17, s * (HALF_W + 0.007)), 0.012, carbon);
  }

  // --- Perä ------------------------------------------------------------------
  // Iso kaksitasoinen takasiipi joutsenkaulakiinnikkeillä
  const wing = add(new THREE.BoxGeometry(0.44, 0.035, 1.8), carbon, -1.92, 1.05, 0);
  wing.rotation.z = 0.1;
  const flap = add(new THREE.BoxGeometry(0.22, 0.03, 1.8), carbon, -2.12, 1.11, 0);
  flap.rotation.z = 0.38;
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.62, 0.36, 0.03), carbon, -1.95, 0.98, s * 0.91);        // päätylevyt
    add(new THREE.BoxGeometry(0.62, 0.06, 0.035), paint, -1.95, 0.83, s * 0.91);
    beam(V(-1.58, 0.62, s * 0.34), V(-1.84, 1.03, s * 0.34), 0.04, carbon, 0.03);        // kiinnikkeet
    add(new THREE.BoxGeometry(0.06, 0.06, 0.4), taillight, -1.91, 0.25, s * 0.56);       // kapeat takavalot
  }
  add(new THREE.BoxGeometry(0.16, 0.2, 1.7), carbon, -2.02, -0.4, 0);          // diffuusori
  add(new THREE.BoxGeometry(0.03, 0.09, 1.62), paint, -2.035, -0.1, 0);       // punainen raita perässä
  for (const z of [-0.45, -0.15, 0.15, 0.45]) {
    add(new THREE.BoxGeometry(0.22, 0.2, 0.02), mat('#0c0c0e'), -2.06, -0.42, z); // diffuusorin rivat
  }
  add(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 8).rotateZ(Math.PI / 2), mat('#8d8f94', { metalness: 0.6, roughness: 0.3 }), -2.06, -0.24, 0.62);
  const bar = add(new THREE.BoxGeometry(0.03, 0.1, 0.03), mat('#e0261e'), -2.03, -0.3, -0.5);  // hinaussilmukka
  bar.rotation.z = 0.2;

  // Valkoinen aurinkosuoja tuulilasin yläreunaan
  const sun = add(new THREE.BoxGeometry(0.2, 0.012, 2 * sideZ(0.8) - 0.02), white, 0.01, 0.81, 0);
  sun.rotation.z = -Math.atan2(ROOF - 0.22, 0.88);
}

/** Tummat monipuolavanteet. */
export function addWrcRim(spin, C, darkMat) {
  const R = C.wheelRadius;
  const W = C.wheelWidth;
  const rimMat = mat('#5c6068', { roughness: 0.4, metalness: 0.4 });
  spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.72, R * 0.72, W + 0.02, 16).rotateX(Math.PI / 2), rimMat));
  const holeGeo = new THREE.BoxGeometry(R * 0.36, R * 0.09, W + 0.035);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const h = new THREE.Mesh(holeGeo, darkMat);
    h.position.set(Math.cos(a) * R * 0.44, Math.sin(a) * R * 0.44, 0);
    h.rotation.z = a;
    spin.add(h);
  }
  spin.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.14, R * 0.14, W + 0.05, 6).rotateX(Math.PI / 2), mat('#d8262c')));
}
