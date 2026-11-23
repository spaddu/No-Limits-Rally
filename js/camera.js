// Auton perässä pehmeästi seuraava kamera.

import * as THREE from 'three';

export class ChaseCamera {
  constructor(camera, terrain, { distance = 8.5, height = 3.2, lookHeight = 1.0 } = {}) {
    this.camera = camera;
    this.terrain = terrain;
    this.distance = distance;
    this.height = height;
    this.lookHeight = lookHeight;
    this.dir = new THREE.Vector3(1, 0, 0); // tasossa oleva suunta, jota kohti kamera katsoo
    this.desired = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.flatFwd = new THREE.Vector3();
  }

  snap(carPos, carForward) {
    this.flatFwd.set(carForward.x, 0, carForward.z);
    if (this.flatFwd.lengthSq() > 1e-4) this.dir.copy(this.flatFwd.normalize());
    this.computeDesired(carPos);
    this.camera.position.copy(this.desired);
    this.camera.lookAt(this.target);
  }

  computeDesired(carPos) {
    this.desired.copy(carPos).addScaledVector(this.dir, -this.distance);
    this.desired.y += this.height;
    this.target.copy(carPos);
    this.target.y += this.lookHeight;
  }

  update(dt, carPos, carForward) {
    // Seurataan auton suuntaa vaakatasossa (ei kallistuksia, ettei tule merisairaaksi)
    this.flatFwd.set(carForward.x, 0, carForward.z);
    if (this.flatFwd.lengthSq() > 0.04) {
      this.flatFwd.normalize();
      this.dir.lerp(this.flatFwd, 1 - Math.exp(-dt * 3.5)).normalize();
    }

    this.computeDesired(carPos);
    this.camera.position.lerp(this.desired, 1 - Math.exp(-dt * 7));

    // Pidetään kamera maanpinnan yläpuolella
    const p = this.camera.position;
    const ground = this.terrain.heightAt(p.x, p.z) + 1.2;
    if (p.y < ground) p.y = ground;

    this.camera.lookAt(this.target);
  }
}
