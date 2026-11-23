// =============================================================================
//  RADAT – valikossa näkyvät radat maittain
// =============================================================================
//  Jokaisella radalla on reitti (roadPath*.js), oma maasto ja teema.
//  country: valikon ryhmä. theme: 'forest' (Suomi), 'tuscany' (Italia), 'desert' (Egypti),
//  'arizona' (USA), 'tropical' (Bahama: saaret ja meri, syvään veteen ajava auto hyytyy).
//
//  terrain-asetukset (katso DEFAULT_TERRAIN heightmap.js:ssä):
//    size      alueen koko metreinä (oletus 640, Ouninpohja 960)
//    seed      maaston muoto (null = Harjun alkuperäinen maasto)
//    hills     isojen mäkien korkeus (m)        hillScale isojen mäkien tiheys
//    ridges    harjanteiden korkeus (m)          ridgeScale harjanteiden tiheys [x, z]
//    bumps     pienten kumpareiden korkeus (m)   rim       reunavuorten korkeus (m)
//    basins    painanteet [x, z, säde, syvyys] (keitaat)
//    plateaus  tasanteet [x, z, säde, korkeus] (kylä, pyramidit)
//    lowland   alanko [dx, dz, siirtymä, leveys, kerroin] (Niilin suisto)
//    terraces  kallioterassit [porras (m), jyrkän osan osuus 0…1]; terraceMask rajaa alueen
//    canyons   kanjonit [{ points: [[x, z, syvyys], …], width }]
//    roadCanyon kanjoni, jonka pohjaa tie kulkee { from, to, depth, width, taperOut }
//    peaks     vuoret [[x, z, säde, korkeus], …]
//    island    saari meressä { shapes: [[x0, z0, x1, z1, säde], …], beach, inland, depth, shelf, lift, noise }
//
//  scenery-asetukset riippuvat teemasta:
//    forest:  trees, rocks, forestCover (tiheys), clearcuts ja fields [[x, z, säde], …],
//             farmsteads [{ at, side }] = pihapiiri (2 vanhaa taloa, koivut, maitolaituri)
//             at metreinä tien alusta, side 1 = tien oikealla, -1 = vasemmalla puolella,
//             legacyDistance (vain Harju)
//    tuscany: houses, vineyards, landmark [x, z], village { from, to } (m tien alusta),
//             meadow (niittyjen osuus), groves, pines, cypressRows, bales, rocks
//    desert:  pyramids [[x, z, kanta, korkeus], …], houses, palms, rocks
//    arizona: forest { from, to, radius }, houses [{ at, side }], overpass { at, height },
//             pines, shrubs, rocks, formations (kalliomuodostelmat)
//    tropical: palms, jungle (0…1), trees, bushes, rocks, huts (olkikattomajat),
//             formations (kalkkikivimuodostelmat), village { from, to }
//    highlands (Skotlanti): heather, grass, gorse, birches, rocks, pebbles, cairns, outcrops,
//             walls (kiviaidat tien varrella), fieldWalls, houses [{ at, side }], castle { at, side, off },
//             village { from, to }, bare (korkeus, jonka yläpuolella karumpaa), wind (0…1),
//             rocky (0…1 kalliopintalaikkujen määrä)
//  env: taivaan tai sumun muutos, esim. { fog: [lähellä, kaukana] }, ja oma vesi:
//       sea = { level, color, deep, opacity, name } (name näkyy viestissä "stalled in the …").
//    lake      järvi { points: [[x, z], …], width, level, depth, shore, rise, noise } (Loch Ness)
//  color = valikon kortin väri.
// =============================================================================

import { ROAD as HARJU } from './roadPath.js';
import { ROAD as PAIJALA } from './roadPath_paijala.js';
import { ROAD as OUNINPOHJA } from './roadPath_ouninpohja.js';
import { ROAD as TORREVECCHIA } from './roadPath2.js';
import { ROAD as TRICARICO } from './roadPath_tricarico.js';
import { ROAD as DURAZZANO } from './roadPath_durazzano.js';
import { ROAD as BAWITI } from './roadPath3.js';
import { ROAD as GIZA } from './roadPath_giza.js';
import { ROAD as GHAMRIN } from './roadPath_ghamrin.js';
import { ROAD as FLAGSTAFF } from './roadPath_flagstaff.js';
import { ROAD as BULL_MOUNTAIN } from './roadPath_bullmountain.js';
import { ROAD as BEAVER_VALLEY } from './roadPath_beavervalley.js';
import { ROAD as LONG_CAY } from './roadPath_longcay.js';
import { ROAD as BULLET_HILL } from './roadPath_bullethill.js';
import { ROAD as TREASURE_CAY } from './roadPath_treasurecay.js';
import { ROAD as LOCH_NESS } from './roadPath_lochness.js';
import { ROAD as FORT_WILLIAM } from './roadPath_fortwilliam.js';
import { ROAD as SKELWICK } from './roadPath_skelwick.js';

export const COUNTRIES = ['Finland', 'Italy', 'Egypt', 'USA', 'Bahamas', 'Scotland'];

export const TRACKS = [
  // --- Finland -------------------------------------------------------------------
  {
    id: 'harju',
    country: 'Finland',
    name: 'Harju',
    description: 'Hilly, twisty forest stage with big climbs and an old farm halfway',
    color: '#3f8f4a',
    theme: 'forest',
    road: HARJU,
    terrain: {},
    scenery: { trees: 2600, seed: 99, legacyDistance: true, farmsteads: [{ at: 519, side: -1 }] },
  },
  {
    id: 'paijala',
    country: 'Finland',
    name: 'Päijälä',
    description: 'Dense forest, short steep crests, tight bends and clear-cuts',
    color: '#2d6a3a',
    theme: 'forest',
    road: PAIJALA,
    terrain: { seed: 4321, hills: 16, hillScale: 0.017, ridges: 7, ridgeScale: [0.02, 0.02], bumps: 2.2, rim: 40 },
    scenery: {
      trees: 4200, seed: 41, forestCover: 0.25,
      clearcuts: [[-130, 150, 45], [20, 15, 42], [120, -110, 45], [70, -200, 40], [-135, -125, 42]],
    },
  },
  {
    id: 'ouninpohja',
    country: 'Finland',
    name: 'Ouninpohja (LONG)',
    description: 'The long one: fast straights, tight corners, forests and open fields',
    color: '#5c8a3c',
    theme: 'forest',
    road: OUNINPOHJA,
    terrain: { size: 960, seed: 7777, hills: 26, hillScale: 0.007, ridges: 5, bumps: 1.4, rim: 38 },
    scenery: {
      trees: 9000, rocks: 540, seed: 77, forestCover: 0.15,
      fields: [[-120, 236, 62], [70, 60, 58], [110, -14, 62], [-110, -152, 55], [325, 215, 60], [40, 330, 60], [-320, 170, 55]],
      clearcuts: [[-200, -95, 40], [330, -200, 40], [-250, 330, 40]],
    },
  },

  // --- Italy -----------------------------------------------------------------------
  {
    id: 'torrevecchia',
    country: 'Italy',
    name: 'Torrevecchia',
    description: 'A long climb through the Italian hills past vineyards and farmhouses to the old tower',
    color: '#c27a43',
    theme: 'tuscany',
    road: TORREVECCHIA,
    terrain: { seed: 5150, hills: 34, hillScale: 0.0065, ridges: 3, bumps: 0.9, rim: 38 },
    scenery: { seed: 12, houses: 10, vineyards: 15, cypressRows: 7, groves: 8, pines: 45, bales: 70, rocks: 80, landmark: [-55, -110] },
  },
  {
    id: 'tricarico',
    country: 'Italy',
    name: 'Tricarico',
    description: 'Narrow mountain roads over the ridge and down the western slopes, vineyards on the hillsides',
    color: '#9a6a48',
    theme: 'tuscany',
    road: TRICARICO,
    terrain: { seed: 6060, hills: 58, hillScale: 0.0075, ridges: 10, bumps: 1.0, rim: 55 },
    scenery: { seed: 23, houses: 5, vineyards: 20, meadow: 0.6, groves: 5, pines: 24, cypressRows: 4, bales: 18, rocks: 200 },
  },
  {
    id: 'durazzano',
    country: 'Italy',
    name: 'Durazzano',
    description: 'A hilltop village with a narrow, winding alley, then on through the eastern vineyards',
    color: '#b8893f',
    theme: 'tuscany',
    road: DURAZZANO,
    terrain: { seed: 9090, hills: 26, hillScale: 0.007, ridges: 3, bumps: 0.7, rim: 40, plateaus: [[-82, 88, 75, 9]] },
    scenery: {
      seed: 17, houses: 7, vineyards: 20, meadow: 0.45, cypressRows: 7, groves: 8, pines: 45, bales: 70, rocks: 80,
      village: { from: 222, to: 348 },
    },
  },

  // --- Egypt ------------------------------------------------------------------------
  {
    id: 'bawiti',
    country: 'Egypt',
    name: 'Bawiti',
    description: 'A long run over the dunes of the Egyptian desert and through its oases',
    color: '#d6a95a',
    theme: 'desert',
    road: BAWITI,
    terrain: {
      seed: 808, hills: 20, hillScale: 0.006, ridges: 12, ridgeScale: [0.009, 0.022], bumps: 1.2, rim: 45,
      basins: [[-82, 38, 40, 4.5], [102, 76, 40, 4.5], [196, -122, 38, 4.5]],
    },
    scenery: { seed: 31 },
  },
  {
    id: 'giza',
    country: 'Egypt',
    name: 'Giza',
    description: 'Steep slopes and big dunes, then a long loop past the pyramids',
    color: '#c99a5c',
    theme: 'desert',
    road: GIZA,
    terrain: {
      seed: 2560, hills: 30, hillScale: 0.008, ridges: 18, ridgeScale: [0.008, 0.02], bumps: 1.5, rim: 16,
      plateaus: [[205, -205, 125, 2]],
    },
    scenery: { seed: 61, pyramids: [[190, -190, 100, 64], [112, -242, 80, 52], [246, -128, 44, 28]] },
    env: { fog: [220, 820] },
  },
  {
    id: 'ghamrin',
    country: 'Egypt',
    name: 'Ghamrin',
    description: 'Nile Delta farm roads lined with houses, in and out of the desert dunes',
    color: '#7f9f4a',
    theme: 'desert',
    road: GHAMRIN,
    terrain: {
      seed: 1313, hills: 20, hillScale: 0.007, ridges: 12, ridgeScale: [0.01, 0.022], bumps: 1.0, rim: 30,
      lowland: [-0.95, 0.31, 10, 90, 0.1],
    },
    scenery: { seed: 19, houses: 28, palms: 160 },
  },

  // --- USA ----------------------------------------------------------------------------
  {
    id: 'flagstaff',
    country: 'USA',
    name: 'Flagstaff',
    description: 'Twisty pine forest past a couple of houses, then out into the rugged desert',
    color: '#6d7a45',
    theme: 'arizona',
    road: FLAGSTAFF,
    terrain: {
      seed: 4747, hills: 30, hillScale: 0.0075, ridges: 10, bumps: 1.8, rim: 45,
      terraces: [5, 0.35], terraceMask: [1, 0, 30, 140],
    },
    scenery: {
      seed: 71, forest: { from: 0, to: 1050, radius: 110 },
      houses: [{ at: 405, side: 1 }, { at: 635, side: -1 }],
      pines: 1800, shrubs: 1300, rocks: 450, formations: 10,
    },
  },
  {
    id: 'bullmountain',
    country: 'USA',
    name: 'Bull Mountain',
    description: 'Rugged rocky mountains, steep climbs and drops, and a wooden bridge over a canyon',
    color: '#a5532f',
    theme: 'arizona',
    road: BULL_MOUNTAIN,
    terrain: {
      seed: 1910, hills: 50, hillScale: 0.008, ridges: 16, bumps: 2.2, rim: 50, terraces: [6, 0.4],
      canyons: [{ points: [[-340, -10, 20], [-170, 25, 20], [0, -15, 20], [170, 15, 20], [340, -5, 20]], width: 24 }],
    },
    scenery: { seed: 83, shrubs: 1300, rocks: 650, formations: 18 },
  },
  {
    id: 'beavervalley',
    country: 'USA',
    name: 'Beaver Valley',
    description: 'Along a winding red rock canyon under an old railway bridge, then up into dense pine forest',
    color: '#b06a3c',
    theme: 'arizona',
    road: BEAVER_VALLEY,
    terrain: {
      seed: 3131, hills: 24, hillScale: 0.007, ridges: 8, bumps: 1.5, rim: 45, terraces: [5, 0.4],
      roadCanyon: { from: 0, to: 900, depth: 22, width: 26, taperOut: 130 },
    },
    scenery: {
      seed: 97, forest: { from: 880, to: 1800, radius: 120 }, overpass: { at: 330, height: 13 },
      pines: 3800, shrubs: 1200, rocks: 550, formations: 12,
    },
  },

  // --- Bahamas ------------------------------------------------------------------------
  {
    id: 'longcay',
    country: 'Bahamas',
    name: 'Long Cay',
    description: 'Out and back along a long, narrow island past beaches, palms and thatched huts',
    color: '#2fb5c0',
    theme: 'tropical',
    road: LONG_CAY,
    terrain: {
      size: 800, seed: 2424, hills: 10, hillScale: 0.012, ridges: 3, bumps: 1.2, rim: 0,
      island: { shapes: [[-300, -150, -90, -40, 95], [-90, -40, 110, 50, 95], [110, 50, 300, 170, 95]], beach: 1.4, inland: 40, depth: 9, shelf: 60, lift: 2, noise: 16 },
    },
    scenery: { seed: 29, palms: 700, jungle: 0.25, trees: 300, bushes: 700, rocks: 90, huts: 6 },
  },
  {
    id: 'bullethill',
    country: 'Bahamas',
    name: 'Bullet Hill',
    description: 'From the shore up a steep island mountain past limestone pinnacles and back down',
    color: '#4f9a6a',
    theme: 'tropical',
    road: BULLET_HILL,
    terrain: {
      seed: 5353, hills: 8, hillScale: 0.012, ridges: 4, bumps: 1.2, rim: 0, peaks: [[10, -10, 160, 50], [-60, 40, 70, 10]],
      island: { shapes: [[-40, 10, 40, -20, 200]], beach: 1.4, inland: 35, depth: 10, shelf: 55, lift: 1, noise: 18 },
    },
    scenery: { seed: 37, palms: 500, jungle: 0.4, trees: 350, bushes: 700, rocks: 160, formations: 22 },
  },
  {
    id: 'treasurecay',
    country: 'Bahamas',
    name: 'Treasure Cay',
    description: 'Jungle hills and sandy dunes, straight through a colourful Bahamian village',
    color: '#d9b84a',
    theme: 'tropical',
    road: TREASURE_CAY,
    terrain: {
      seed: 7171, hills: 22, hillScale: 0.011, ridges: 6, bumps: 1.6, rim: 0,
      island: { shapes: [[-190, -120, 110, -150, 112], [110, -150, 160, 140, 110], [160, 140, -60, 195, 85]], beach: 1.4, inland: 45, depth: 9, shelf: 55, lift: 4, noise: 18 },
    },
    scenery: { seed: 43, palms: 550, jungle: 1, trees: 700, bushes: 1200, rocks: 100, village: { from: 815, to: 950 } },
  },

  // --- Scotland -----------------------------------------------------------------------
  {
    id: 'lochness',
    country: 'Scotland',
    name: 'Loch Ness',
    description: 'Winding moorland road along a long, dark loch past castle ruins and stone cottages',
    color: '#4f6f7a',
    theme: 'highlands',
    road: LOCH_NESS,
    terrain: {size: 800, seed: 3030, hills: 24, hillScale: 0.0055, ridges: 5, ridgeScale: [0.008, 0.012], bumps: 1.3, rim: 55, peaks: [[-200, -330, 170, 38], [150, -320, 160, 34], [330, -250, 120, 26]], lake: {points: [[-460, -260], [-250, -170], [-60, -110], [120, -40], [300, 20], [460, 90]], width: 55, level: -16, depth: 12, shore: 170, rise: 0.13, noise: 14}},
    scenery: {
      seed: 53, heather: 6000, grass: 5000, gorse: 220, birches: 200, rocks: 320, pebbles: 4000, rocky: 0.2,
      cairns: 14, outcrops: 25, walls: 18, fieldWalls: 10, folds: 3,
      roadBirches: 110, pines: 60, woodland: { count: 1300, nearRoad: 380, maxAbove: 13 }, sheep: 9,
      houses: [{ at: 150, side: -1 }, { at: 610, side: -1 }, { at: 1000, side: 1 }, { at: 1430, side: -1 }],
      crofts: [{ at: 470, side: 1, off: 22 }, { at: 800, side: -1, off: 20 }, { at: 1250, side: 1, off: 22 }, { at: 1620, side: 1, off: 20, wooden: true }],
      castle: { at: 340, side: -1, off: 34 },
      nessie: { x: 106, z: -6, yaw: 0.6, scale: 1.6 },
      jetties: [{ at: 610, side: -1 }, { at: 150, side: -1 }],
    },
    env: { sea: { level: -16, color: '#3e5862', deep: '#16232a', opacity: 0.82, name: 'loch' } },
  },
  {
    id: 'fortwilliam',
    country: 'Scotland',
    name: 'Fort William',
    description: 'A narrow glen between high hills, then a climb onto the bare, rocky tops',
    color: '#6b6e5a',
    theme: 'highlands',
    road: FORT_WILLIAM,
    terrain: {size: 800, seed: 6161, hills: 40, hillScale: 0.0065, ridges: 12, ridgeScale: [0.011, 0.011], bumps: 1.6, rim: 60, peaks: [[-260, 0, 170, 45], [60, 160, 190, 50], [-60, -200, 170, 40], [220, 40, 150, 40], [180, -260, 170, 48], [-130, -275, 150, 40], [-255, -255, 120, 42]], roadCanyon: {from: 0, to: 1350, depth: 32, width: 75, floor: 0.22, taperOut: 450}},
    scenery: {
      seed: 59, heather: 5000, grass: 4000, gorse: 120, birches: 110, rocks: 600, pebbles: 5000, rocky: 0.5,
      cairns: 18, outcrops: 70, walls: 12, fieldWalls: 6, bare: 8, folds: 2,
      roadBirches: 80, pines: 220, sheep: 5, cattle: 4, deer: 6,
      crofts: [{ at: 120, side: 1, off: 20 }, { at: 420, side: -1, off: 20 }, { at: 760, side: 1, off: 22 }, { at: 1500, side: -1, off: 18, size: 0.7 }],
      viaduct: { at: 985, height: 20, span: 16 },
    },
    env: { fog: [130, 470] },
  },
  {
    id: 'skelwick',
    country: 'Scotland',
    name: 'Skelwick',
    description: 'The bleakest corner of the north: treeless, wind-swept coast and a tiny village',
    color: '#7d8c84',
    theme: 'highlands',
    road: SKELWICK,
    terrain: {size: 896, seed: 8282, hills: 20, hillScale: 0.009, ridges: 7, ridgeScale: [0.012, 0.012], bumps: 1.6, rim: 0, island: {shapes: [[-140, 120, 140, 120, 275], [-175, -120, -195, -225, 55], [175, -110, 205, -215, 50]], beach: 1.2, inland: 55, depth: 11, shelf: 45, lift: 7, noise: 24}},
    scenery: {
      seed: 67, heather: 1500, grass: 9000, rocks: 500, pebbles: 6000,
      cairns: 16, outcrops: 90, walls: 14, fieldWalls: 12, folds: 4, wind: 1, rocky: 1, sheep: 14,
      village: { from: 740, to: 880 },
      crofts: [{ at: 300, side: 1, off: 20, wooden: true }, { at: 520, side: -1, off: 22 }, { at: 1100, side: 1, off: 20, wooden: true }, { at: 1350, side: -1, off: 20 }],
      lighthouse: { x: 205, z: -255, radius: 50 },
      stoneCircle: { x: -120, z: 120, radius: 220 },
      boats: 5,
    },
    env: { sky: '#aeb6bd', sea: { level: 0, color: '#4d6e78', deep: '#1b2e36', opacity: 0.78, name: 'sea' } },
  },
];
