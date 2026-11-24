// Auton perässä pehmeästi seuraava kamera. Vauhdissa näkökenttä levenee (vauhdin tuntu)
// ja soralla kamera tärisee hyvin hienovaraisesti.

// Säädöt yhdessä paikassa. Etäisyys, korkeus ja katsekorkeus ovat autokohtaisia
// (cars.js: camera: { distance, height, lookHeight }, oletus 8.5 / 3.2 / 1.0).
export const CAMERA_FX = {
  follow: 7,           // kuinka nopeasti kamera hakeutuu paikalleen (isompi = jäykempi)
  speedLag: 0.25,      // 0 = kamera pysyy vauhdissa samalla etäisyydellä, 1 = jää jälkeen
                       //     (vanha käytös: noin nopeus / follow metriä, 30 m/s → +4 m)
  fovBoost: 11,        // astetta lisää huippunopeudessa
  fovFrom: 0.2,        // osuus huippunopeudesta, josta leveneminen alkaa
  shake: 0.0032,       // rad: tärinän voimakkuus täydessä vauhdissa soralla
  shakeSpeed: 22,      // m/s, jossa tärinä on täysi
};

import * as THREE from 'three';

export class ChaseCamera {
  constructor(camera, terrain, { distance = 7.5, height = 3.2, lookHeight = 1.0 } = {}) {
    this.camera = camera;
    this.terrain = terrain;
    this.distance = distance;
    this.height = height;
    this.lookHeight = lookHeight;
    this.dir = new THREE.Vector3(1, 0, 0); // tasossa oleva suunta, jota kohti kamera katsoo
    this.desired = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.flatFwd = new THREE.Vector3();
    this.offset = new THREE.Vector3();      // kamera suhteessa autoon (pehmennetty)
    this.worldPos = new THREE.Vector3();    // maailmassa pehmennetty paikka (jää vauhdissa jälkeen)
    this.tmp = new THREE.Vector3();
    this.baseFov = camera.fov;
    this.shakeTime = 0;
    this.shakeAmt = 0;
  }

  /** Palauttaa normaalin näkökentän (valikon kiertävä kamera). */
  resetFov() {
    if (this.camera.fov !== this.baseFov) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  snap(carPos, carForward) {
    this.flatFwd.set(carForward.x, 0, carForward.z);
    if (this.flatFwd.lengthSq() > 1e-4) this.dir.copy(this.flatFwd.normalize());
    this.computeDesired(carPos);
    this.camera.position.copy(this.desired);
    this.worldPos.copy(this.desired);
    this.offset.copy(this.desired).sub(carPos);
    this.camera.lookAt(this.target);
  }

  computeDesired(carPos) {
    this.desired.copy(carPos).addScaledVector(this.dir, -this.distance);
    this.desired.y += this.height;
    this.target.copy(carPos);
    this.target.y += this.lookHeight;
  }

  update(dt, carPos, carForward, motion = null) {
    // Seurataan auton suuntaa vaakatasossa (ei kallistuksia, ettei tule merisairaaksi)
    this.flatFwd.set(carForward.x, 0, carForward.z);
    if (this.flatFwd.lengthSq() > 0.04) {
      this.flatFwd.normalize();
      this.dir.lerp(this.flatFwd, 1 - Math.exp(-dt * 3.5)).normalize();
    }

    this.computeDesired(carPos);
    if (this.offset.lengthSq() === 0) this.snap(carPos, carForward);   // ensimmäinen ruutu
    // Kaksi pehmennystä: auton suhteen (ei jää vauhdissa jälkeen) ja maailmassa (jää);
    // speedLag sekoittaa ne
    const F = CAMERA_FX, k = 1 - Math.exp(-dt * F.follow);
    this.offset.lerp(this.tmp.copy(this.desired).sub(carPos), k);
    this.worldPos.lerp(this.desired, k);
    this.camera.position.copy(carPos).add(this.offset).lerp(this.worldPos, F.speedLag);

    // Pidetään kamera maanpinnan yläpuolella
    const p = this.camera.position;
    const ground = this.terrain.heightAt(p.x, p.z) + 1.2;
    if (p.y < ground) p.y = ground;

    this.camera.lookAt(this.target);
    if (motion) this.applyMotion(dt, motion);
  }

  /** Vauhdin mukaan levenevä näkökenttä ja alustan mukainen pieni tärinä. */
  applyMotion(dt, { speed, maxSpeed, rough }) {
    const F = CAMERA_FX;
    const camera = this.camera;
    const k = THREE.MathUtils.clamp((speed / maxSpeed - F.fovFrom) / (1 - F.fovFrom), 0, 1);
    const fov = this.baseFov + F.fovBoost * k * k * (3 - 2 * k);
    camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3));
    camera.updateProjectionMatrix();

    // Tärinä: muutama eritaajuinen siniaalto (tasainen, ei satunnaista nykimistä)
    const target = rough * Math.min(1, speed / F.shakeSpeed);
    this.shakeAmt += (target - this.shakeAmt) * (1 - Math.exp(-dt * 8));
    if (this.shakeAmt < 0.002) return;
    this.shakeTime += dt;
    const t = this.shakeTime, a = this.shakeAmt;
    const n1 = Math.sin(t * 31.7) * 0.5 + Math.sin(t * 53.3 + 1.3) * 0.3 + Math.sin(t * 87.1 + 2.1) * 0.2;
    const n2 = Math.sin(t * 27.1 + 0.7) * 0.5 + Math.sin(t * 61.9 + 2.9) * 0.3 + Math.sin(t * 79.3) * 0.2;
    camera.rotateX(n2 * a * F.shake);
    camera.rotateZ(n1 * a * F.shake * 0.6);
  }
}
