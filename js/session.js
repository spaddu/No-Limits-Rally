// Yksi ajokerta valitulla radalla ja autolla: oma 3D-näkymä, fysiikkamaailma,
// maasto, tie, auto, ajanotto ja efektit. Radan tai auton vaihtuessa vanha
// sessio puretaan (dispose) ja tilalle rakennetaan uusi.

import * as THREE from 'three';
import { createNaturalHeight, buildHeightfield, makeGrid, resolveTerrain } from './heightmap.js';
import { mulberry32 } from './noise.js';
import { THEMES } from './themes.js';
import { buildRoad } from './road.js';
import { createRoadMesh, nearestRoadSample } from './roadMesh.js';
import { createTerrain } from './terrain.js';
import { Car, IMPACT_THRESHOLD } from './car.js';
import { ChaseCamera } from './camera.js';
import { MapView } from './mapView.js';
import { DustSystem } from './dust.js';
import { Stage } from './stage.js';
import { resolveAtmosphere, fogDensity, Sky, applyFogGlow } from './atmosphere.js';
import { buildRoadside } from './roadside.js';
import { mergeStatic } from './staticBatch.js';

export const STEP = 1 / 60;
const DROWN_DEPTH = 0.55;   // m: tätä syvemmässä vedessä auto hyytyy
const STALLED = { forward: false, back: false, left: false, right: false, handbrake: true };
const SPLASH = new THREE.Color('#e9f7f8');

/** Meri: läpikuultava vesitaso ja sen alle tumma syvyys (teema: sea = { level, color, deep, opacity }). */
function createWater(scene, size, sea) {
  const make = (y, color, opacity) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size * 3, size * 3).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        color, roughness: 0.3, metalness: 0.05, flatShading: true,
        transparent: opacity < 1, opacity, depthWrite: opacity >= 1,
      }),
    );
    mesh.position.y = y;
    scene.add(mesh);
    return mesh;
  };
  make(sea.level - 30, sea.deep, 1);
  return make(sea.level, sea.color, sea.opacity ?? 0.72);
}
const SUN_DISTANCE = 160;   // m: varjokameran etäisyys autosta auringon suuntaan

export class RaceSession {
  constructor(RAPIER, track, carDef) {
    const buildStart = performance.now();
    this.track = track;
    this.carDef = carDef;

    // --- Näkymä ja valot (teeman mukaan) ---------------------------------------------
    const theme = THEMES[track.theme ?? 'forest'];
    this.theme = theme;
    const scene = new THREE.Scene();
    // Tunnelma (atmosphere.js): taivas, aurinko, täyttövalo ja utu. Rata voi muuttaa
    // arvoja (track.env), esim. pyramidit näkyviin kauas.
    const atmo = resolveAtmosphere(theme.atmosphere, track);
    this.atmo = atmo;
    const visibility = atmo.fog.visibility;
    const horizon = new THREE.Color(atmo.sky.horizon);
    scene.background = horizon;
    scene.fog = new THREE.FogExp2(horizon, fogDensity(visibility));   // sama väri kuin taivaan horisontti
    scene.add(new THREE.HemisphereLight(atmo.hemi.sky, atmo.hemi.ground, atmo.hemi.intensity));
    const sun = new THREE.DirectionalLight(atmo.sun.color, atmo.sun.intensity);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45;
    sc.near = 10; sc.far = SUN_DISTANCE + 160;   // matala aurinko: pitkät varjot
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.scene = scene;
    this.sun = sun;
    // Udun takana ei näy mitään, joten näkymä rajataan sinne (utu ~99 %)
    this.camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, visibility * 1.25);
    this.sky = new Sky(scene, atmo, visibility * 1.15);
    this.skyRadius = visibility * 1.15;
    this.view = { far: this.camera.far, fog: visibility };   // kehittäjän paneeli voi säätää
    this.sunDir = this.sky.sunDir;

    // --- Fysiikka ja maailma -----------------------------------------------------
    const world = new RAPIER.World({ x: 0, y: -14, z: 0 }); // hieman maata vahvempi painovoima = napakampi arcade-tuntuma
    world.timestep = STEP;
    this.world = world;
    // Törmäysäänet: auton iskut kerätään jokaisesta fysiikka-askeleesta (onImpact asetetaan main.js:ssä)
    this.RAPIER = RAPIER;
    this.events = new RAPIER.EventQueue(true);
    this.onImpact = null;

    const naturalHeight = createNaturalHeight(resolveTerrain(track));
    const road = buildRoad(track.road, naturalHeight);   // tien keskilinja ja korkeusprofiili
    const options = track.scenery ?? {};
    const pads = theme.pads?.(road, options, naturalHeight, track) ?? [];   // tasanteet pihoille
    const grid = makeGrid(track.terrain?.size);
    const field = buildHeightfield(road, naturalHeight, pads, grid); // maasto, johon tie on muotoiltu
    this.road = road;
    // Maisemasuunnitelma (pellot, keitaat…) ennen maaston värjäystä
    const info = { heightAt: field.heightAt, roadDistanceAt: field.roadDistanceAt, half: grid.half, size: grid.size };
    const rand = mulberry32(options.seed ?? 99);
    const layout = theme.plan(info, road, options, rand, track);
    this.layout = layout;
    this.terrain = createTerrain(scene, world, RAPIER, field, road, theme.terrainColor(layout));
    createRoadMesh(scene, road, theme.road, layout?.roadAlt ?? null);
    theme.build({ scene, world, RAPIER, terrain: this.terrain, road, layout, rand, options, track });
    // Tien reunan ruohotupsut ja pikkukivet (roadside.js); oma siemen, ettei muu maisema muutu
    this.sea = track.env?.sea ?? theme.sea ?? null;   // rata voi tuoda oman vetensä (esim. järvi)
    buildRoadside(scene, this.terrain, road, theme.roadside, (options.seed ?? 99) + 1000, this.sea);
    this.stage = new Stage(scene, world, RAPIER, road, carDef.id);

    // --- Auto ------------------------------------------------------------------------
    const roadEdge = road.halfWidth + road.shoulder;
    this.car = new Car(scene, world, RAPIER, { x: 0, y: 50, z: 0 }, carDef);
    this.car.isOnRoad = (x, z) => this.terrain.roadDistanceAt(x, z) < roadEdge;
    this.placeOnRoad(this.stage.spawnS);

    this.chase = new ChaseCamera(this.camera, this.terrain, carDef.camera);
    this.car.syncVisual(1);
    this.chase.snap(this.car.position, this.car.forward);
    this.mapView = new MapView(scene, this.terrain, road, this.stage);
    // Meri ja auton hyytyminen veteen
    if (this.sea) this.water = createWater(scene, grid.size, this.sea);
    this.drowned = false;
    this.baseDamping = [this.car.body.linearDamping(), this.car.body.angularDamping()];
    this.dust = new DustSystem(scene, theme.dust);
    // Rakennusten, aitojen ym. palaset yhdistetään: murto-osa piirtokutsuista (staticBatch.js)
    const merged = mergeStatic(scene, { exclude: [this.car.group, this.mapView.group, this.sky.mesh] });
    applyFogGlow(scene);   // utu hehkuu auringon suunnassa kuten taivas

    this.accumulator = 0;
    this.perf = { physics: 0, steps: 0 };
    this.orbitAngle = 0;
    this.driven = false;   // onko tällä sessiolla jo ajettu (valikon "Jatka"-nappia varten)
    console.info(`${track.name} + ${carDef.name}: rakennettu ${Math.round(performance.now() - buildStart)} ms, tie ${Math.round(road.length)} m, meshit ${merged.before} → ${merged.after}`);
  }

  /** Siirtää auton tien näytepisteeseen s, ajosuuntaan (tai vastakkaiseen, jos reverse). */
  placeOnRoad(s, reverse = false) {
    const r = this.road;
    let yaw = Math.atan2(-r.tz[s], r.tx[s]);
    if (reverse) yaw += Math.PI;
    this.car.placeAt(r.xs[s], r.hs[s] + (this.car.config.spawnLift ?? 1.2), r.zs[s], yaw);
  }

  /** Palauttaa auton lähimpään kohtaan tiellä, nokka sinne päin kuin auto osoitti. */
  returnToRoad() {
    const r = this.road;
    const car = this.car;
    const s = nearestRoadSample(r, car.currPos.x, car.currPos.z);
    const along = car.forward.x * r.tx[s] + car.forward.z * r.tz[s];
    this.placeOnRoad(s, along < 0);
  }

  /** Uusi yritys: auto lähtöviivalle ja ajanotto nollaan. */
  restart() {
    if (this.drowned) {
      this.drowned = false;
      this.car.body.setLinearDamping(this.baseDamping[0]);
      this.car.body.setAngularDamping(this.baseDamping[1]);
    }
    this.placeOnRoad(this.stage.spawnS);
    this.stage.reset();
    this.car.syncVisual(1);
    this.chase.snap(this.car.position, this.car.forward);
  }

  /** Vesisyvyys auton kohdalla (0 kuivalla maalla). */
  waterDepthAt(x, z) {
    return this.sea ? Math.max(0, this.sea.level - this.terrain.heightAt(x, z)) : 0;
  }

  /** Auto ajoi syvään veteen: moottori sammuu, ajanotto pysähtyy, vain uusi yritys auttaa. */
  drown() {
    this.drowned = true;
    const car = this.car;
    car.body.setLinearDamping(6);   // vesi pysäyttää auton nopeasti
    car.body.setAngularDamping(3);
    this.stage.fail(`Splash! Your car stalled in the ${this.sea.name ?? 'sea'}.`);
    this.onImpact?.(0.9, 'water');
    const p = car.currPos;
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * 6.28, v = 1 + Math.random() * 3.5;
      this.dust.dust.spawn(p.x, this.sea.level + 0.2, p.z, Math.cos(a) * v, 2 + Math.random() * 5, Math.sin(a) * v, 0.8 + Math.random() * 0.8, 0.5 + Math.random() * 0.8, SPLASH);
    }
  }

  stepPhysics(inputState) {
    const car = this.car;
    car.savePrev();
    car.update(this.drowned ? STALLED : inputState, STEP);
    this.world.step(this.events);
    this.collectImpacts();
    car.afterStep();
    this.stage.update(STEP, car.currPos);
    // Kuorma-auto kahlaa syvemmässä (config.wadeDepth)
    const wade = car.config.wadeDepth ?? DROWN_DEPTH;
    if (this.sea && !this.drowned && car.currPos.y < this.sea.level + 1.2 + (wade - DROWN_DEPTH)
      && this.waterDepthAt(car.currPos.x, car.currPos.z) > wade) this.drown();
    if (car.currPos.y < -60) this.returnToRoad();
  }

  /** Lukee fysiikka-askeleen törmäykset ja välittää kovimman iskun materiaaleittain (0–1). */
  collectImpacts() {
    let hits = null;
    const carHandles = this.car.colliderHandles;
    this.events.drainContactForceEvents((e) => {
      const h1 = e.collider1(), h2 = e.collider2();
      const other = carHandles.has(h1) ? h2 : h1;
      if (carHandles.has(other)) return;
      const material = this.materialOf(other);
      const force = e.totalForceMagnitude();
      hits ??= {};
      hits[material] = Math.max(hits[material] ?? 0, force);
    });
    if (!hits || !this.onImpact) return;
    for (const [material, force] of Object.entries(hits)) {
      // Kynnys = hiljainen hipaisu, ~200 × kynnys = täysi rysähdys
      const strength = Math.min(1, Math.max(0.05, Math.log10(force / IMPACT_THRESHOLD) / 2.3));
      this.onImpact(strength, material);
    }
  }

  /** Törmäysäänen materiaali törmäysmuodosta: puut ja tolpat sylintereitä, kivet kuperia, rakennukset laatikoita. */
  materialOf(handle) {
    if (this.stage.metalColliders.has(handle)) return 'metal';
    const c = this.world.getCollider(handle);
    const T = this.RAPIER.ShapeType;
    switch (c?.shapeType()) {
      case T.Cylinder: case T.RoundCylinder: case T.Cone: return 'wood';
      case T.ConvexPolyhedron: case T.RoundConvexPolyhedron: case T.Ball: return 'rock';
      case T.Cuboid: case T.RoundCuboid: return 'building';
      default: return 'ground';
    }
  }

  /** Ajotila: fysiikka, efektit ja perässä seuraava kamera. */
  drive(dt, input) {
    this.driven = true;
    // Vedessä hyytynyttä autoa ei voi nostaa tai siirtää tielle: vain Enter (uusi yritys)
    if (input.consumeReset() && !this.drowned) this.car.reset(this.terrain);
    if (input.consumeRoad() && !this.drowned) this.returnToRoad();
    if (input.consumeMap()) this.mapView.toggle();
    if (input.consumeRestart()) this.restart();

    this.accumulator += dt;
    const physicsStart = performance.now();
    let steps = 0;
    while (this.accumulator >= STEP) {
      this.stepPhysics(input.state);
      this.accumulator -= STEP;
      steps++;
    }
    this.perf.physics = performance.now() - physicsStart;   // suorituskykymittareille
    this.perf.steps = steps;
    const car = this.car;
    car.syncVisual(this.accumulator / STEP);
    this.dust.emit(car, dt);
    // Roiskeet matalassa vedessä
    if (this.sea && !this.drowned && Math.abs(car.speed) > 3 && this.waterDepthAt(car.position.x, car.position.z) > 0.05) {
      for (let i = 0; i < 3; i++) {
        this.dust.dust.spawn(car.position.x + (Math.random() - 0.5) * 2, this.sea.level + 0.1, car.position.z + (Math.random() - 0.5) * 2,
          (Math.random() - 0.5) * 2, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 2, 0.6, 0.35 + Math.random() * 0.4, SPLASH);
      }
    }
    this.dust.update(dt, this.camera.position);
    this.chase.update(dt, car.position, car.forward, this.cameraMotion(car));
    this.mapView.update(car);
    this.stage.updateHud();
    this.followSun();
  }

  /**
   * Piirtoetäisyys (kameran kaukotaso, m): taivaskupu pidetään sen sisäpuolella.
   * Lyhyempi etäisyys = vähemmän piirrettävää, kun utu peittää reunan.
   */
  setDrawDistance(far) {
    this.view.far = far;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
    this.sky.mesh.scale.setScalar(Math.min(1, (far * 0.92) / this.skyRadius));
  }

  /** Udun näkyvyys (m): tätä kauempana kaikki on utua (~96 %). */
  setFogVisibility(visibility) {
    this.view.fog = visibility;
    this.scene.fog.density = fogDensity(visibility);
  }

  /** Kameran elävöitys: vauhti (näkökenttä) ja alustan karheus (tärinä soralla ja maastossa). */
  cameraMotion(car) {
    let contact = 0, offroad = 0;
    for (let i = 0; i < 4; i++) {
      if (!car.vehicle.wheelIsInContact(i)) continue;
      contact++;
      if (!car.wheelOnRoad[i]) offroad++;
    }
    return {
      speed: Math.abs(car.speed),
      maxSpeed: car.config.maxSpeed,
      rough: contact ? (contact / 4) * (1 + 0.8 * (offroad / contact)) : 0,
    };
  }

  /** Valikkotila: fysiikka tauolla, kamera kiertää hitaasti auton ympäri. */
  idle(dt) {
    const p = this.car.position;
    this.orbitAngle += dt * 0.18;
    const a = this.orbitAngle;
    this.camera.position.set(p.x + Math.cos(a) * 10, p.y + 3.8, p.z + Math.sin(a) * 10);
    const ground = this.terrain.heightAt(this.camera.position.x, this.camera.position.z) + 1.5;
    if (this.camera.position.y < ground) this.camera.position.y = ground;
    this.camera.lookAt(p.x, p.y + 0.6, p.z);
    this.chase.resetFov();
    this.dust.update(dt, this.camera.position);
    this.followSun();
  }

  followSun() {
    this.sun.position.copy(this.car.position).addScaledVector(this.sunDir, SUN_DISTANCE);
    this.sun.target.position.copy(this.car.position);
  }

  /** Piirtää näkymän jälkikäsittelyn kautta (postfx.js). */
  render(postfx, dt) {
    const map = this.mapView.active;
    this.sky.mesh.visible = !map && !this.sky.mesh.userData.forceHidden;   // forceHidden: vain törmäysmuodot -tila
    if (!map) this.sky.update(dt, this.camera);
    postfx.render(this.scene, map ? this.mapView.camera : this.camera, dt);
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.mapView.resize();
  }

  /** Vapauttaa näytönohjaimen ja fysiikan resurssit. */
  dispose() {
    this.stage.dispose();
    this.scene.traverse((obj) => {
      obj.geometry?.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      for (const m of mats) {
        m.map?.dispose();
        m.dispose();
      }
      if (obj.isInstancedMesh) obj.dispose();
    });
    this.sun.shadow.map?.dispose();
    this.events.free();
    this.world.free();
  }
}
