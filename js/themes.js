// =============================================================================
//  TEEMAT – ratojen ympäristöt
// =============================================================================
//  Teema määrää tunnelman (atmosphere: taivas, valaistus, utu, ks. atmosphere.js),
//  maaston värit, tien pinnan, pölyn värit, tienvarren pikkuyksityiskohdat
//  (roadside, ks. roadside.js) ja maisemaelementit. Rata valitsee teemansa tracks.js:ssä (theme: '…').
// =============================================================================

import * as THREE from 'three';
import { createNoise2D, smoothstep } from './noise.js';
import { createScenery } from './scenery.js';
import { planFinland, finlandOverlay, buildFinland, farmsteadPads } from './sceneryFinland.js';
import { planTuscany, tuscanyColorFn, buildTuscany } from './sceneryTuscany.js';
import { planDesert, desertColorFn, buildDesert } from './sceneryDesert.js';
import { planArizona, arizonaColorFn, buildArizona, arizonaPads } from './sceneryArizona.js';
import { planTropical, tropicalColorFn, buildTropical } from './sceneryTropical.js';
import { planScotland, scotlandColorFn, buildScotland, scotlandPads } from './sceneryScotland.js';

/** Suomalaisen metsän maaston väritys (Harjun kierre alkuperäisenä); layout = hakkuuaukeat ja pellot. */
function forestColorFn(layout) {
  const overlay = layout ? finlandOverlay(layout) : null;
  const patchNoise = createNoise2D(2024);
  const cLush = new THREE.Color('#4f8f37');
  const cGrassA = new THREE.Color('#78b04a');
  const cGrassB = new THREE.Color('#5e9d3d');
  const cDry = new THREE.Color('#a9b65c');
  const cWorn = new THREE.Color('#93a35a');    // kulunut ruoho tien vieressä
  const cVerge = new THREE.Color('#9c8a6c');   // sorainen piennar
  const cDirt = new THREE.Color('#8f7556');
  const cRock = new THREE.Color('#9a968f');
  const cSnow = new THREE.Color('#eef3f5');
  return (col, t) => {
    const patch = patchNoise(t.x * 0.02, t.z * 0.02) * 0.5 + 0.5;
    col.copy(cGrassA).lerp(cGrassB, patch);
    col.lerp(cLush, smoothstep(-2, -9, t.h) * 0.8);
    col.lerp(cDry, smoothstep(8, 16, t.h) * 0.7);
    col.lerp(cDirt, smoothstep(0.9, 0.78, t.slope));
    col.lerp(cRock, smoothstep(0.78, 0.62, t.slope));
    col.lerp(cSnow, smoothstep(30, 40, t.h) * smoothstep(0.45, 0.7, t.slope));
    if (overlay) overlay(col, t);
    col.lerp(cWorn, smoothstep(t.flat + 5, t.flat + 1, t.rd) * 0.7);
    col.lerp(cVerge, smoothstep(t.flat + 0.8, t.flat - 0.4, t.rd));
    col.multiplyScalar(0.93 + t.rand() * 0.12);
  };
}

export const THEMES = {
  // --- Suomalainen metsä (Harjun kierre, Päijälä, Ouninpohja) -------------------
  forest: {
    atmosphere: 'finnishEvening',   // atmosphere.js: taivas, valot, utu, jälkikäsittely
    roadside: {
      items: [
        { type: 'grass', perMeter: 1.6, colors: ['#5f9a3a', '#6fa846', '#4f8433', '#7aa84a'], size: [0.45, 0.85], band: [0.1, 4.5] },
        { type: 'fern', perMeter: 0.35, colors: ['#3f7d32', '#4c8c3a', '#5a9440'], size: [0.5, 0.95], band: [1.2, 6] },
        { type: 'dryGrass', perMeter: 0.25, colors: ['#a8a85a', '#9aa050'], size: [0.35, 0.6], band: [0.1, 3] },
        { type: 'stone', perMeter: 0.6, colors: ['#8f8a82', '#a29d94', '#7c776f'], size: [0.12, 0.38], band: [0, 3.5] },
      ],
    },
    road: null,     // = roadMesh.js:n oletussora
    dust: null,     // = dust.js:n oletuspaletti
    plan: planFinland,
    pads: farmsteadPads,       // pihapiirien tasanteet (scenery.farmsteads)
    terrainColor: (layout) => forestColorFn(layout),
    build: (ctx) => {
      const { scene, world, RAPIER, terrain, road, options, layout } = ctx;
      // legacyDistance: puut sijoitellaan alkuperäisen lähikentän mukaan (Harjun kierre pysyy ennallaan)
      const t = options.legacyDistance ? { ...terrain, roadDistanceAt: terrain.roadDistanceNearAt } : terrain;
      createScenery(scene, world, RAPIER, t, road, options, layout);
      buildFinland(ctx);
    },
  },

  // --- Italian kukkulat (Torrevecchia) -----------------------------------------
  tuscany: {
    atmosphere: 'tuscanGoldenHour',   // atmosphere.js: taivas, valot, utu, jälkikäsittely
    roadside: {
      items: [
        { type: 'dryGrass', perMeter: 1.0, colors: ['#c9b15a', '#b89f4a', '#d6c477', '#a8984a'], size: [0.35, 0.75], band: [0.1, 4.5] },
        { type: 'grass', perMeter: 0.4, colors: ['#8a9a4a', '#7d8f44'], size: [0.3, 0.55], band: [0.5, 4] },
        { type: 'stone', perMeter: 0.5, colors: ['#ddd5c2', '#cfc6b0', '#e6dfcf'], size: [0.12, 0.35], band: [0, 3] },
      ],
    },
    // Strada bianca: vaalea kalkkikivisora
    road: ['#e3dccb', '#c6bba4', '#dcd4c0', '#d2cbb0', '#dcd4c0', '#c6bba4', '#e3dccb'],
    dust: {
      road: ['#f2ede2', '#e9e2d2', '#f7f3ea'],
      offroad: ['#d3c69e', '#c8ba90', '#dacfab'],
      roadBits: ['#d2c9b4', '#bcb09a', '#e2dbcb'],
      offroadBits: ['#93a44c', '#a99d5c', '#7d6c4b'],
    },
    plan: planTuscany,
    terrainColor: (layout) => tuscanyColorFn(layout),
    build: buildTuscany,
  },

  // --- Egyptin aavikko (Bawiti) --------------------------------------------------
  desert: {
    atmosphere: 'desertHaze',   // atmosphere.js: taivas, valot, utu, jälkikäsittely
    roadside: {
      items: [
        { type: 'dryGrass', perMeter: 0.12, colors: ['#c8b07a', '#b89c66'], size: [0.3, 0.55], band: [0.8, 5] },
        { type: 'stone', perMeter: 0.6, colors: ['#c9a46a', '#b8935a', '#d8b880', '#a88a5c'], size: [0.1, 0.35], band: [0, 4] },
      ],
    },
    // Tiivistynyt hiekkatie
    road: ['#dbbd88', '#b9955f', '#d4b27d', '#cbaa76', '#d4b27d', '#b9955f', '#dbbd88'],
    dust: {
      road: ['#efdcb3', '#e6cf9f', '#f4e6c8'],
      offroad: ['#f0daa9', '#e9d099', '#f5e4be'],
      roadBits: ['#c9a46a', '#b8935a', '#d8b880'],
      offroadBits: ['#d9b77a', '#c8a265', '#e2c590'],
    },
    plan: planDesert,
    terrainColor: (layout) => desertColorFn(layout),
    build: buildDesert,
  },

  // --- Arizona (Flagstaff, Bull Mountain, Beaver Valley) -----------------------------
  arizona: {
    atmosphere: 'arizonaAfternoon',   // atmosphere.js: taivas, valot, utu, jälkikäsittely
    roadside: {
      items: [
        { type: 'dryGrass', perMeter: 0.6, colors: ['#b8a25a', '#a08a48', '#c2ad66'], size: [0.35, 0.7], band: [0.2, 4.5] },
        { type: 'shrub', perMeter: 0.2, colors: ['#8a9a6a', '#7d8c62', '#96a476'], size: [0.5, 0.9], band: [1, 5] },
        { type: 'stone', perMeter: 0.55, colors: ['#9a5a3a', '#a8693f', '#8a4e32', '#b5764e'], size: [0.12, 0.4], band: [0, 3.5] },
      ],
    },
    // Punainen hiekkatie
    road: ['#b5744c', '#93573a', '#ab6b45', '#a2704b', '#ab6b45', '#93573a', '#b5744c'],
    dust: {
      road: ['#c98a62', '#b9774f', '#d79c74'],
      offroad: ['#c47a52', '#b56c45', '#d08a62'],
      roadBits: ['#8f5536', '#a8693f', '#7a452c'],
      offroadBits: ['#7d8a5a', '#8f5536', '#6b5a3a'],
    },
    plan: planArizona,
    pads: arizonaPads,        // talojen tasanteet (scenery.houses)
    terrainColor: (layout) => arizonaColorFn(layout),
    build: buildArizona,
  },

  // --- Bahama (Long Cay, Bullet Hill, Treasure Cay) ----------------------------------
  tropical: {
    atmosphere: 'bahamasNoon',   // atmosphere.js: taivas, valot, utu, jälkikäsittely
    roadside: {
      items: [
        { type: 'grass', perMeter: 0.8, colors: ['#6aa84a', '#7fbf55', '#5e9a40'], size: [0.35, 0.7], band: [0.3, 4] },
        { type: 'fern', perMeter: 0.15, colors: ['#4f9a3d', '#5fae48'], size: [0.5, 0.9], band: [1.5, 5] },
        { type: 'stone', perMeter: 0.35, colors: ['#ece4cf', '#ddd2b8', '#f2ecdc'], size: [0.1, 0.3], band: [0, 3] },
      ],
    },
    // Meri: merenpinta 0, läpikuultava turkoosi pinta ja tumma syvyys
    sea: { level: 0, color: '#3cc4cc', deep: '#1a5a85', opacity: 0.62 },
    // Vaalea korallihiekkatie
    road: ['#eadfc2', '#cfc19e', '#e2d6b6', '#d8ccaa', '#e2d6b6', '#cfc19e', '#eadfc2'],
    dust: {
      road: ['#f5efe0', '#ece4cf', '#faf6ec'],
      offroad: ['#f0e6c8', '#e6dab8', '#f6eed6'],
      roadBits: ['#d8ccaa', '#c4b590', '#e6dcc0'],
      offroadBits: ['#5f9a3d', '#e6dab8', '#4f8a33'],
    },
    plan: planTropical,
    terrainColor: (layout) => tropicalColorFn(layout),
    build: buildTropical,
  },

  // --- Skotlanti (Loch Ness, Fort William, Skelwick) --------------------------------
  // Pilvinen harmaa taivas, nummet, kanerva ja kivet. Vesi (järvi tai meri) tulee radalta:
  // tracks.js env.sea = { level, color, deep, opacity, name }.
  highlands: {
    atmosphere: 'highlandOvercast',   // atmosphere.js: taivas, valot, utu, jälkikäsittely
    roadside: {
      items: [
        { type: 'heather', perMeter: 0.8, colors: ['#7a4a78', '#8a5a86', '#6c4466', '#946a8a', '#5f6b3a'], size: [0.45, 0.8], band: [0.4, 5] },
        { type: 'grass', perMeter: 0.8, colors: ['#7d8a4e', '#8c874a', '#6c7a3c'], size: [0.35, 0.65], band: [0.1, 4] },
        { type: 'stone', perMeter: 0.6, colors: ['#8a8a80', '#9a9890', '#77776f'], size: [0.12, 0.4], band: [0, 3.5] },
      ],
    },
    // Harmaanruskea soratie
    road: ['#9a9284', '#7c7467', '#928a7b', '#8a8274', '#928a7b', '#7c7467', '#9a9284'],
    dust: {
      road: ['#b3ab9b', '#a59d8d', '#c0b8a8'],
      offroad: ['#8a8466', '#7d7a5c', '#9a9372'],
      roadBits: ['#7a7365', '#8f877a', '#6b655a'],
      offroadBits: ['#6f7a45', '#5c4c3b', '#8b8f57'],
    },
    plan: planScotland,
    pads: scotlandPads,       // mökkien ja linnan tasanteet
    terrainColor: (layout) => scotlandColorFn(layout),
    build: buildScotland,
  },
};
