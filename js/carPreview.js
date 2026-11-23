// Valikon autokuvat: pelin omat automallit renderöidään kerran etuviistosta
// läpinäkyvälle taustalle ja muutetaan kuviksi (data-URL). Kun mallia muutetaan
// car.js:ssä, valikon kuva päivittyy samalla.

import * as THREE from 'three';
import { buildCarModel } from './car.js';

const WIDTH = 640;      // kuvan koko pikseleinä (kortissa noin puolet tästä)
const HEIGHT = 400;
const SUSPENSION = 0.2;  // jousen pituus levossa kuvassa (m)
const STEER = 0.32;      // etupyörät hieman käännettyinä

/** Palauttaa jokaisesta autosta kuvan data-URL:na samassa järjestyksessä kuin cars. */
export function renderCarThumbnails(cars) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.setClearColor(0x000000, 0);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xdfe9f5, 0x4a4036, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.6);
  sun.position.set(3, 8, -5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 20 });
  sun.shadow.radius = 4;
  scene.add(sun);
  // Takavalo erottaa auton ääriviivat tummasta taustasta
  const rim = new THREE.DirectionalLight(0xffd27a, 1.4);
  rim.position.set(-6, 3, 4);
  scene.add(rim);

  // Pelkkä varjo maahan, ei näkyvää lattiaa
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2),
    new THREE.ShadowMaterial({ opacity: 0.45 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  // Etuviisto vasemmalta edestä (auton +X = eteen, -Z = vasen). Etäisyys skaalataan
  // auton koon mukaan, jotta kaikki autot mahtuvat kuvaan samalla tavalla.
  const camera = new THREE.PerspectiveCamera(24, WIDTH / HEIGHT, 0.5, 50);
  const VIEW_DIR = new THREE.Vector3(5.8, 1.7, -6.0).normalize();
  const FIT = 1.68;   // kameran etäisyys suhteessa auton rajauslaatikon lävistäjään
  const box = new THREE.Box3();
  const center = new THREE.Vector3();
  const size = new THREE.Vector3();

  const urls = cars.map((def) => {
    const C = def.config;
    const { group, wheels } = buildCarModel(def);
    const corners = [[1, -1], [1, 1], [-1, -1], [-1, 1]];
    wheels.forEach(({ pivot }, i) => {
      const [sx, sz] = corners[i];
      pivot.position.set(sx * C.wheelX, C.wheelY - (C.previewSuspension ?? SUSPENSION), sz * C.wheelZ);
      if (sx > 0) pivot.rotation.y = STEER;
    });
    // Renkaiden alapinta maan tasolle
    const groundY = C.wheelY - (C.previewSuspension ?? SUSPENSION) - C.wheelRadius;
    group.position.y = -groundY;
    scene.add(group);
    box.setFromObject(group);
    box.getCenter(center);
    box.getSize(size);
    camera.position.copy(center).addScaledVector(VIEW_DIR, size.length() * FIT);
    camera.lookAt(center);
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(group);
    disposeTree(group);
    return url;
  });

  ground.geometry.dispose();
  ground.material.dispose();
  renderer.dispose();
  renderer.forceContextLoss();
  return urls;
}

function disposeTree(root) {
  const mats = new Set();
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) mats.add(o.material);
  });
  mats.forEach((m) => m.dispose());
}
