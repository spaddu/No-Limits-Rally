// Auto: Rapierin raycast-ajoneuvo (jokaisella renkaalla oma jousi ja vaimennin)
// sekä yksinkertainen polygonimalli.
//
// Auton paikallinen koordinaatisto: +X eteenpäin, +Y ylös, +Z oikealle.

import * as THREE from 'three';
import { mergeStatic } from './staticBatch.js';
import { buildHatchBody, addHatchRim } from './modelHatch.js';
import { buildRetroBody, addRetroRim } from './modelRetro.js';
import { buildWrcBody, addWrcRim } from './modelWrc.js';
import { buildTruckBody, addTruckRim, truckTireGeometry } from './modelTruck.js';

/** N: tätä pienemmistä kosketusvoimista ei tule törmäystapahtumaa (ääntä). */
export const IMPACT_THRESHOLD = 9000;

const WHEELS = [
  { x: 1, z: -1, front: true },   // vasen etu
  { x: 1, z: 1, front: true },    // oikea etu
  { x: -1, z: -1, front: false }, // vasen taka
  { x: -1, z: 1, front: false },  // oikea taka
];

/**
 * Rakentaa pelkän automallin ilman fysiikkaa (esim. valikon kuvia varten).
 * Palauttaa { group, wheels }, renkaiden paikat asettaa kutsuja.
 */
export function buildCarModel(carDef) {
  const target = { config: carDef.config, model: carDef.model };
  const group = Car.prototype.buildModel.call(target);
  return { group, wheels: target.wheels };
}

// --- Sivuluisun apu ------------------------------------------------------------
// Rapierin (Bulletin) rengasmalli on lähes kaksitilainen: rengas pitää täysin, kunnes
// raja ylittyy, ja kun luisu hidastuu rajan alle, pito palaa kerralla (nykäys). Lisäksi
// sivukitka syö luisussa nopeutta. Apu tekee luisusta hallittavan:
//   1. Pito riippuu renkaan luistokulmasta pehmeästi (sivukitkan jäykkyys 1 → slideGrip),
//      ja se palautuu luisun jälkeen sulavasti (gripRecovery) eikä hetkessä.
//   2. Nopeuden suuntaus: luisussa nopeusvektori kääntyy kohti auton keulaa (slideAlign)
//      lähes nopeutta menettämättä, jolloin luisusta ajetaan ulos eikä pysähdytä.
//   3. Pyörähdyssuoja: jos auto kiertyy nopeammin kuin ohjaus ja vauhti selittävät
//      (yli yawTolerance), ylimenevää kiertymistä vaimennetaan (yawDamping). Estää sekä
//      pyörähtämisen luisun alussa että vastaohjauksen heilautuksen toiseen suuntaan.
//      Takarenkaiden pito heikkenee luisussa vähemmän (slideGripRear), koska takapään
//      pidon menetys ruokkii pyörähdystä.
// Arvot ovat autokohtaisia (cars.js: config), oletukset alla. Kehittäjän paneelista apu
// saa pois päältä vertailua varten (SLIDE_ASSIST.enabled).
export const SLIDE_ASSIST = { enabled: true, stability: true };
const SLIDE_DEFAULTS = {
  slipStart: 0.1,       // rad (~6°): tähän asti rengas pitää täysin
  slipFull: 0.42,       // rad (~24°): tästä eteenpäin pito on slideGrip
  slideGrip: 0.55,      // eturenkaiden sivukitkan jäykkyys täydessä luisussa (1 = normaali)
  slideGripRear: 0.8,   // takarenkaiden sama (suurempi = vakaampi, pienempi = herkemmin sivuttain)
  yawTolerance: 0.45,   // rad/s: näin paljon ylimääräistä kiertymistä sallitaan (luisutteluvara)
  yawDamping: 8,        // 1/s: kuinka voimakkaasti ylimenevä kiertyminen vaimennetaan
  gripRecovery: 1.0,    // 1/s: kuinka nopeasti pito palautuu luisun jälkeen (pienempi = pehmeämpi)
  slideAlign: 0.4,      // rad/s: kuinka nopeasti nopeusvektori kääntyy kohti keulaa luisussa
  slideAlignThrottle: 0.5, // kaasu lisää suuntausta tällä osuudella (rallityyli: kaasulla ulos)
  slideSpeedKeep: 0.985, // osuus nopeudesta, joka säilyy suuntauksessa (per käännetty radiaani)
};

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _up = new THREE.Vector3();
const _av = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _right = new THREE.Vector3();
// Auton yläsuunta kvaternionista ilman väliaikaisia olioita
const up_x = (q) => 2 * (q.x * q.y - q.w * q.z);
const up_y = (q) => 1 - 2 * (q.x * q.x + q.z * q.z);
const up_z = (q) => 2 * (q.y * q.z + q.w * q.x);
const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class Car {
  /** carDef = auton määritys cars.js:stä (config = kaikki ajosäädöt, model = ulkonäkö). */
  constructor(scene, world, RAPIER, spawn, carDef = null) {
    this.config = carDef?.config;
    this.model = carDef?.model ?? { style: 'wrc', color: '#d8342c' };
    const C = this.config;
    this.world = world;
    this.steer = 0;
    this.sideGrip = [1, 1, 1, 1];   // sivukitkan jäykkyys renkaittain (luisun apu)
    this.slipAngle = 0;            // auton luistokulma (rad), efekteille ja mittareille
    this.speed = 0;
    this.anyWheelContact = true;
    this.isOnRoad = null;              // funktio (x, z) => boolean, asetetaan main.js:ssä
    this.wheelOnRoad = [true, true, true, true];
    this.offroad = 0;                  // osuus renkaista tien ulkopuolella (0…1)
    this.throttle = 0;
    this.braking = false;
    this.handbraking = false;

    // --- Fysiikkakappale --------------------------------------------------
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spawn.x, spawn.y, spawn.z)
        .setCcdEnabled(true)
        .setCanSleep(false) // ajoneuvo-ohjain ei herätä nukkuvaa kappaletta
        .setLinearDamping(0.02)
        .setAngularDamping(0.3),
    );
    this.body = body;

    const h = C.chassisHalf;
    const r = 0.1;
    // Törmäysäänet: Rapier ilmoittaa iskuista, joiden voima ylittää kynnyksen (session.js)
    const events = (desc) => desc
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(IMPACT_THRESHOLD);
    // Hitausmomentit (x = kallistus, y = kääntyminen, z = nyökkäys)
    const chassis = world.createCollider(
      events(RAPIER.ColliderDesc.roundCuboid(h.x - r, h.y - r, h.z - r, r)
        .setMassProperties(C.mass, { x: 0, y: C.centerOfMassY, z: 0 }, C.inertia ?? { x: 380, y: 1350, z: 1150 }, { w: 1, x: 0, y: 0, z: 0 })
        .setFriction(0.6)
        .setRestitution(0.1)),
      body,
    );
    // Ohjaamo: ei massaa, mutta estää katon uppoamisen maahan kaatuessa
    const cb = C.cabinCollider ?? { x: -0.25, y: 0.53, hx: 0.95, hy: 0.28, hz: 0.72 };
    const cabin = world.createCollider(
      events(RAPIER.ColliderDesc.cuboid(cb.hx, cb.hy, cb.hz)
        .setTranslation(cb.x, cb.y, 0)
        .setDensity(0)
        .setFriction(0.6)),
      body,
    );
    this.colliderHandles = new Set([chassis.handle, cabin.handle]);

    // --- Ajoneuvo-ohjain ----------------------------------------------------
    const vehicle = world.createVehicleController(body);
    this.vehicle = vehicle;
    WHEELS.forEach((w, i) => {
      vehicle.addWheel(
        { x: w.x * C.wheelX, y: C.wheelY, z: w.z * C.wheelZ },
        { x: 0, y: -1, z: 0 },   // jousen suunta
        { x: 0, y: 0, z: -1 },   // akseli
        C.suspensionRest,
        C.wheelRadius,
      );
      vehicle.setWheelSuspensionStiffness(i, C.suspensionStiffness);
      vehicle.setWheelSuspensionCompression(i, C.suspensionCompression);
      vehicle.setWheelSuspensionRelaxation(i, C.suspensionRelaxation);
      vehicle.setWheelMaxSuspensionForce(i, C.maxSuspensionForce);
      vehicle.setWheelMaxSuspensionTravel(i, C.suspensionTravel);
      vehicle.setWheelFrictionSlip(i, w.front ? C.frictionFront : C.frictionRear);
      vehicle.setWheelSideFrictionStiffness(i, 1);
    });

    // --- Grafiikka ----------------------------------------------------------
    this.group = this.buildModel();
    // Korin palaset yhdeksi geometriaksi materiaaleittain (renkaat pyörivät, ne jätetään erikseen)
    mergeStatic(this.group, { exclude: this.wheels.map((w) => w.pivot) });
    scene.add(this.group);

    // Interpolointia varten (fysiikka 60 Hz, ruudunpäivitys voi olla eri)
    this.prevPos = new THREE.Vector3();
    this.currPos = new THREE.Vector3();
    this.prevQuat = new THREE.Quaternion();
    this.currQuat = new THREE.Quaternion();
    this.readBody(this.currPos, this.currQuat);
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);

    this.position = new THREE.Vector3();  // interpoloitu, kameraa varten
    this.forward = new THREE.Vector3(1, 0, 0);
    this.syncVisual(1);
  }

  buildModel() {
    const C = this.config;
    const M = this.model;
    const group = new THREE.Group();
    const mat = (color, extra = {}) =>
      new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.6, metalness: 0.05, ...extra });

    const paint = mat(M.color, { roughness: 0.45 });
    const stripe = mat(M.stripe ?? '#f4f4f4', { roughness: 0.5 });
    const dark = mat('#26272b', { roughness: 0.9 });
    const glass = mat('#2c3e52', { roughness: 0.15, metalness: 0.3 });
    const headlight = mat('#fff6d5', { emissive: '#fff1b8', emissiveIntensity: 0.8 });
    const taillight = mat('#c0161d', { emissive: '#ff1010', emissiveIntensity: 3.2 });   // kirkas: hehkuu bloomissa
    const tire = mat('#222225', { roughness: 0.95 });
    const rim = mat('#c9ccd1', { roughness: 0.35, metalness: 0.5 });

    const add = (geo, material, x, y, z) => {
      const m = new THREE.Mesh(geo, material);
      m.position.set(x, y, z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return m;
    };

    if (M.style === 'hatch') {
      // Oma tarkempi malli (js/modelHatch.js)
      buildHatchBody({ add, paint, dark, glass, headlight, taillight }, C);
    } else if (M.style === 'retro') {
      // 70-luvun ralli-sedan (js/modelRetro.js)
      buildRetroBody({ add, paint, dark, glass, headlight, taillight }, C, M);
    } else if (M.style === 'wrc') {
      // Rally1-tyylinen kilpa-auto (js/modelWrc.js)
      buildWrcBody({ add, paint, dark, glass, headlight, taillight }, C, M);
    } else if (M.style === 'truck') {
      // Ralliraidikuorma-auto (js/modelTruck.js)
      buildTruckBody({ add, paint, dark, glass, headlight, taillight }, C, M);
    } else {
      const h = C.chassisHalf;
      // Kori
      add(new THREE.BoxGeometry(h.x * 2, h.y * 2, h.z * 2), paint, 0, 0, 0);

      // Ohjaamo: laatikko, jonka yläosa kavennetaan (vino tuulilasi).
      // Placeholder-mallit eroavat ohjaamon muodolla ja muutamalla lisäpalikalla.
      const cabin = {
        wrc:   { len: 1.9, x: -0.25, front: 0.38, back: 0.14, narrow: 0.86 },
        hatch: { len: 2.25, x: -0.5, front: 0.42, back: 0.04, narrow: 0.88 },
        retro: { len: 1.8, x: -0.2, front: 0.22, back: 0.1, narrow: 0.92 },
      }[M.style] ?? { len: 1.9, x: -0.25, front: 0.38, back: 0.14, narrow: 0.86 };
      const cabinGeo = new THREE.BoxGeometry(cabin.len, 0.56, 1.44);
      const cp = cabinGeo.getAttribute('position');
      for (let i = 0; i < cp.count; i++) {
        if (cp.getY(i) > 0) {
          const x = cp.getX(i);
          cp.setX(i, x > 0 ? x - cabin.front : x + cabin.back);
          cp.setZ(i, cp.getZ(i) * cabin.narrow);
        }
      }
      cabinGeo.computeVertexNormals();
      add(cabinGeo, glass, cabin.x, 0.53, 0);
      // Katto
      const roofLen = cabin.len - cabin.front - cabin.back - 0.04;
      const roofX = cabin.x + (cabin.back - cabin.front) / 2;
      add(new THREE.BoxGeometry(roofLen, 0.07, 1.44 * cabin.narrow - 0.04), paint, roofX, 0.83, 0);

      if (M.style === 'wrc') {
        // Takasiipi ja keulaspoileri
        add(new THREE.BoxGeometry(0.42, 0.06, 1.62), dark, -h.x + 0.2, 0.78, 0);
        for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.1, 0.5, 0.06), dark, -h.x + 0.25, 0.5, s * 0.6);
        add(new THREE.BoxGeometry(0.3, 0.05, h.z * 2 + 0.1), dark, h.x + 0.02, -0.25, 0);
        // Valkoinen raita kyljissä
        for (const s of [-1, 1]) add(new THREE.BoxGeometry(h.x * 1.6, 0.1, 0.02), stripe, 0, 0.02, s * (h.z + 0.005));
      } else if (M.style === 'retro') {
        // Raita konepellin ja katon yli, lisävalot keulassa
        add(new THREE.BoxGeometry(h.x * 2 + 0.01, 0.02, 0.36), stripe, 0, h.y + 0.005, 0);
        add(new THREE.BoxGeometry(roofLen + 0.01, 0.02, 0.36), stripe, roofX, 0.87, 0);
        for (const s of [-1, 1]) {
          add(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 8).rotateZ(Math.PI / 2), headlight, h.x + 0.16, 0.12, s * 0.32);
        }
      } else if (M.style === 'hatch') {
        // Pieni kattospoileri takana
        add(new THREE.BoxGeometry(0.22, 0.05, 1.2), dark, cabin.x - cabin.len / 2 + 0.1, 0.84, 0);
      }

      // Puskurit
      add(new THREE.BoxGeometry(0.18, 0.22, h.z * 2 + 0.04), dark, h.x + 0.05, -0.12, 0);
      add(new THREE.BoxGeometry(0.18, 0.22, h.z * 2 + 0.04), dark, -h.x - 0.05, -0.12, 0);

      // Valot
      for (const s of [-1, 1]) {
        add(new THREE.BoxGeometry(0.06, 0.13, 0.34), headlight, h.x + 0.01, 0.09, s * 0.52);
        add(new THREE.BoxGeometry(0.06, 0.12, 0.34), taillight, -h.x - 0.01, 0.1, s * 0.52);
      }
    }

    // Renkaat: pivot (jousitus + ohjaus) -> spin (pyöriminen) -> meshit
    const tireGeo = M.style === 'truck' ? truckTireGeometry(C)
      : new THREE.CylinderGeometry(C.wheelRadius, C.wheelRadius, C.wheelWidth, 14).rotateX(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(C.wheelRadius * 0.55, C.wheelRadius * 0.55, C.wheelWidth + 0.02, 6).rotateX(Math.PI / 2);
    this.wheels = WHEELS.map(() => {
      const pivot = new THREE.Group();
      const spin = new THREE.Group();
      const t = new THREE.Mesh(tireGeo, tire);
      const rm = new THREE.Mesh(rimGeo, rim);
      t.castShadow = true;
      rm.castShadow = true;
      spin.add(t);
      if (M.style === 'hatch') addHatchRim(spin, C, rim, dark);
      else if (M.style === 'retro') addRetroRim(spin, C, rim, dark);
      else if (M.style === 'wrc') addWrcRim(spin, C, dark);
      else if (M.style === 'truck') addTruckRim(spin, C, dark);
      else spin.add(rm);
      pivot.add(spin);
      group.add(pivot);
      return { pivot, spin };
    });

    return group;
  }

  readBody(pos, quat) {
    const t = this.body.translation();
    const r = this.body.rotation();
    pos.set(t.x, t.y, t.z);
    quat.set(r.x, r.y, r.z, r.w);
  }

  /** Kutsutaan ennen jokaista fysiikka-askelta. */
  update(input, dt) {
    const C = this.config;
    const v = this.vehicle;

    const lv = this.body.linvel();
    const r = this.body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    const fwd = _v.set(1, 0, 0).applyQuaternion(_q);
    const speed = lv.x * fwd.x + lv.y * fwd.y + lv.z * fwd.z;
    this.speed = speed;

    // --- Kaasu, jarru ja peruutus ----------------------------------------
    let engine = 0;
    let brake = 0;
    if (input.forward && !input.back) {
      if (speed < -1) brake = C.brake;
      else engine = C.engineForce * (1 - Math.min(Math.max(speed / C.maxSpeed, 0), 1));
    } else if (input.back && !input.forward) {
      if (speed > 1) brake = C.brake;
      else engine = -C.reverseForce * (1 - Math.min(Math.max(-speed / C.maxReverseSpeed, 0), 1));
    } else {
      brake = Math.abs(speed) < (C.holdSpeed ?? 0.6) ? C.holdBrake : C.coastBrake;
    }
    // Efekteille (pöly): kaasun määrä -1…1, jarrutus ja käsijarru
    this.throttle = engine / C.engineForce;
    this.braking = brake >= C.brake;
    this.handbraking = !!input.handbrake;

    // --- Ohjaus: suurempi kääntökulma pienillä nopeuksilla ---------------
    // Näppäimet antavat täyden lukon (±1); kosketusohjaus antaa analogisen arvon input.steer (−1…1).
    // Painettu näppäin voittaa, jolloin näppäimistöllä ajo toimii aina kuten ennenkin.
    const digital = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    const steerInput = digital !== 0 || input.steer == null ? digital : input.steer;
    const maxSteer = Math.max(C.maxSteer / (1 + Math.abs(speed) / C.steerFalloff), C.minSteer);

    // Luistokulma: auton nopeuden suunta suhteessa keulaan (vain eteenpäin ajaessa)
    const S = SLIDE_ASSIST.enabled ? { ...SLIDE_DEFAULTS, ...C.slide } : null;
    const right = _right.set(0, 0, 1).applyQuaternion(_q);
    const vLat = lv.x * right.x + lv.y * right.y + lv.z * right.z;
    const sliding = speed > 3;
    this.slipAngle = sliding ? Math.atan2(vLat, speed) : 0;

    this.steer += (steerInput * maxSteer - this.steer) * Math.min(1, dt * C.steerSpeed);

    // 1. Pito renkaan luistokulman mukaan (pehmeä raja ja hidas palautuminen)
    if (S) {
      const av = this.body.angvel();
      const up = _up.set(0, 1, 0).applyQuaternion(_q);
      const yaw = av.x * up.x + av.y * up.y + av.z * up.z;
      const vLong = Math.max(Math.abs(speed), 2);
      for (let i = 0; i < 4; i++) {
        const front = WHEELS[i].front;
        // Renkaan sivunopeus: auton sivuliike + kiertymisestä tuleva osuus
        const lat = front ? vLat - yaw * C.wheelX : vLat + yaw * C.wheelX;
        const alpha = Math.abs(Math.atan2(lat, vLong) + (front ? this.steer : 0));
        const t = THREE.MathUtils.smoothstep(alpha, S.slipStart, S.slipFull);
        const minGrip = front ? S.slideGrip : S.slideGripRear;
        const target = Math.abs(speed) > 3 ? 1 - (1 - minGrip) * t : 1;
        const rate = target < this.sideGrip[i] ? 12 : S.gripRecovery;
        this.sideGrip[i] += (target - this.sideGrip[i]) * Math.min(1, dt * rate);
      }
    }

    // --- Alusta: onko kukin rengas tiellä vai maastossa ---------------------
    let offroadWheels = 0;
    for (let i = 0; i < 4; i++) {
      let onRoad = true;
      if (this.isOnRoad && v.wheelIsInContact(i)) {
        const cp = v.wheelContactPoint(i);
        if (cp) onRoad = this.isOnRoad(cp.x, cp.z);
        if (!onRoad) offroadWheels++;
      }
      this.wheelOnRoad[i] = onRoad;
    }
    this.offroad = offroadWheels / 4;

    for (let i = 0; i < 4; i++) {
      const front = WHEELS[i].front;
      // Vetotapa: driveFront-osuus etupyörille, loput takapyörille (2 rengasta kummallakin)
      let e = engine * 2 * (front ? C.driveFront : 1 - C.driveFront);
      let b = brake;
      let slip = (front ? C.frictionFront : C.frictionRear) * (this.wheelOnRoad[i] ? 1 : C.offroadGrip);
      if (input.handbrake && !front) {
        e = 0;
        b = C.handbrake;
        slip = C.frictionHandbrake;
      }
      // Rapierissa jarru vaikuttaa vain kun moottorivoima on nolla
      if (b > 0) e = 0;
      // Luistonesto: rajoittaa vetävän renkaan voimaa niin, että osa renkaan pidosta
      // jää sivuttaispidolle (muuten täysi kaasu vie etuvetoiselta ohjauksen).
      // Rapierissa vetovoima saa käyttää enintään 2 × kitka × jousivoima.
      if (C.tractionControl > 0 && e !== 0 && v.wheelIsInContact(i)) {
        const cap = 2 * slip * (v.wheelSuspensionForce(i) ?? 0) * (1 - C.tractionControl * 0.5);
        e = Math.sign(e) * Math.min(Math.abs(e), cap);
      }
      // Tällä akselimäärityksellä Rapierin positiivinen voima työntää -X-suuntaan
      v.setWheelEngineForce(i, -e);
      v.setWheelBrake(i, b);
      v.setWheelFrictionSlip(i, slip);
      v.setWheelSideFrictionStiffness(i, S ? this.sideGrip[i] : 1);
      v.setWheelSteering(i, front ? this.steer : 0);
    }

    v.updateVehicle(dt);

    // 3. Pyörähdyssuoja: verrataan kiertymisnopeutta siihen, mitä ohjaus ja vauhti selittävät
    //    (polkupyörämalli: yaw = v · tan(ohjaus) / akseliväli) ja vaimennetaan ylimenevä osa
    if (S && SLIDE_ASSIST.stability && speed > 5) {
      let contactCount = 0;
      for (let i = 0; i < 4; i++) if (v.wheelIsInContact(i)) contactCount++;
      if (contactCount >= 3) {
        const av = this.body.angvel();
        const ux = up_x(_q), uy = up_y(_q), uz = up_z(_q);
        const yaw = av.x * ux + av.y * uy + av.z * uz;
        // Ohjauksen tavoittelema kiertyminen, rajattuna sille, mihin renkaiden pito riittää
        // (sivukiihtyvyys ≈ kitka × g → kiertyminen ≤ a / v)
        const lim = (Math.max(C.frictionFront, C.frictionRear) * 9.81 * 1.15) / speed;
        const intended = THREE.MathUtils.clamp((speed * Math.tan(this.steer)) / (2 * C.wheelX), -lim, lim);
        // Apu vain hillitsee kiertymistä, ei koskaan lisää sitä:
        //  - samaan suuntaan kuin ohjaus: vaimennetaan tavoitteen + toleranssin ylittävä osa
        //  - vastakkaiseen suuntaan (auto kiertyy vaikka ohjataan toiseen suuntaan): ylittävä osa
        const allowed = yaw * intended > 0 ? Math.abs(intended) + S.yawTolerance : S.yawTolerance;
        const over = Math.abs(yaw) - allowed;
        if (over > 0) {
          const inertiaY = (C.inertia ?? { y: 1350 }).y;
          const k = -Math.sign(yaw) * over * inertiaY * Math.min(1, S.yawDamping * dt);
          this.body.applyTorqueImpulse({ x: ux * k, y: uy * k, z: uz * k }, true);
        }
      }
    }

    // 2. Luisussa nopeusvektori kääntyy kohti keulaa lähes nopeutta menettämättä
    if (S && sliding && Math.abs(this.slipAngle) > 0.03) {
      let contactCount = 0;
      for (let i = 0; i < 4; i++) if (v.wheelIsInContact(i)) contactCount++;
      if (contactCount >= 3) {
        const nv = this.body.linvel();
        const throttle = Math.max(0, this.throttle);
        const turn = Math.min(Math.abs(this.slipAngle), S.slideAlign * (1 + S.slideAlignThrottle * throttle) * dt)
          * Math.sign(this.slipAngle);
        // Käännetään vaakanopeutta pystyakselin ympäri kohti keulaa
        const c = Math.cos(turn), sn = Math.sin(turn);
        const keep = 1 - (1 - S.slideSpeedKeep) * Math.abs(turn);
        const ax = up_x(_q), ay = up_y(_q), az = up_z(_q);
        // Rodriguesin kaava: v' = v cosθ + (k × v) sinθ + k (k·v)(1 − cosθ)
        const kv = ax * nv.x + ay * nv.y + az * nv.z;
        const cx = ay * nv.z - az * nv.y, cy = az * nv.x - ax * nv.z, cz = ax * nv.y - ay * nv.x;
        const rx = (nv.x * c + cx * sn + ax * kv * (1 - c)) * keep;
        const ry = (nv.y * c + cy * sn + ay * kv * (1 - c)) * keep;
        const rz = (nv.z * c + cz * sn + az * kv * (1 - c)) * keep;
        const m = this.body.mass();
        this.body.applyImpulse({ x: (rx - nv.x) * m, y: (ry - nv.y) * m, z: (rz - nv.z) * m }, true);
      }
    }

    // Maastossa vierintävastus hidastaa vaakasuuntaista liikettä
    if (this.offroad > 0) {
      const k = -C.mass * C.offroadDrag * this.offroad * dt;
      this.body.applyImpulse({ x: lv.x * k, y: 0, z: lv.z * k }, true);
    }

    // --- Ilmassa pieni ohjattavuus -----------------------------------------
    let contact = false;
    for (let i = 0; i < 4; i++) if (v.wheelIsInContact(i)) contact = true;
    this.anyWheelContact = contact;
    if (!contact) {
      // Arcade-apu: ilmassa auto kääntyy hiljalleen pyörät alaspäin,
      // ja A/D kääntää autoa pystyakselin ympäri.
      const upv = _up.set(0, 1, 0).applyQuaternion(_q);
      const av = this.body.angvel();
      const spin = _av.set(av.x, av.y, av.z);
      spin.addScaledVector(upv, -spin.dot(upv)); // vain kallistus/nyökkäys, ei kääntyminen
      const level = _axis.crossVectors(upv, WORLD_UP);
      const torque = level.multiplyScalar(C.airLevel)
        .addScaledVector(spin, -C.airLevelDamping)
        .addScaledVector(upv, steerInput * C.airYaw);
      this.body.applyTorqueImpulse({ x: torque.x * dt, y: torque.y * dt, z: torque.z * dt }, true);
    }
  }

  savePrev() {
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
  }

  afterStep() {
    this.readBody(this.currPos, this.currQuat);
  }

  /** Päivittää 3D-mallin fysiikan mukaan. alpha = interpolointi edellisen ja nykyisen askeleen välillä. */
  syncVisual(alpha) {
    const C = this.config;
    this.group.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.group.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha);
    this.position.copy(this.group.position);
    this.forward.set(1, 0, 0).applyQuaternion(this.group.quaternion);

    const v = this.vehicle;
    for (let i = 0; i < 4; i++) {
      const { pivot, spin } = this.wheels[i];
      const c = v.wheelChassisConnectionPointCs(i);
      const len = v.wheelSuspensionLength(i) ?? C.suspensionRest;
      pivot.position.set(c.x, c.y - len, c.z);
      pivot.rotation.y = v.wheelSteering(i) ?? 0;
      spin.rotation.z = -(v.wheelRotation(i) ?? 0);
    }
  }

  /** Nostaa auton pystyyn nykyiseen kohtaan. */
  reset(terrain) {
    const t = this.body.translation();
    const lim = terrain.half * 0.85;
    const x = Math.min(Math.max(t.x, -lim), lim);
    const z = Math.min(Math.max(t.z, -lim), lim);
    this.placeAt(x, terrain.heightAt(x, z) + 2, z, this.heading());
  }

  /** Auton suunta vaakatasossa (rad, 0 = +X). */
  heading() {
    return Math.atan2(-this.forward.z, this.forward.x);
  }

  /** Siirtää auton annettuun kohtaan pystyasentoon, nokka suuntaan yaw. */
  placeAt(x, y, z, yaw) {
    _q.setFromAxisAngle(WORLD_UP, yaw);
    this.body.setTranslation({ x, y, z }, true);
    this.body.setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steer = 0;
    this.readBody(this.currPos, this.currQuat);
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
    this.forward.set(1, 0, 0).applyQuaternion(this.currQuat);
  }
}
