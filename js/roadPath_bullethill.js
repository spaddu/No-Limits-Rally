// =============================================================================
//  BULLET HILL (Bahama)
// =============================================================================
//  Lähtö länsirannan läheltä, serpentiineillä vuoren huipulle (n. 53 m) ja alas
//  saaren itärannan lähelle.
//  Sama muoto kuin roadPath.js:ssä (katso ohjeet sieltä). Maaston ja maiseman
//  asetukset ovat tracks.js:ssä. Pidä tie vähintään ~20 m päässä vesirajasta:
//  syvään veteen ajava auto hyytyy.
// =============================================================================

export const ROAD = {
  closed: false,
  startAt: 15,
  finishAt: -45,

  width: 4.5,
  shoulder: 1.5,
  blend: 8,
  smoothing: 4,
  maxGrade: 0.3,
  spacing: 1,

  points: [
    [-180, -30],  // 0 lähtöalue (länsiranta)
    [-165, 10],   // 1
    [-180, 55],   // 2
    [-145, 90],   // 3
    [-105, 115],  // 4
    [-120, 150],  // 5
    [-80, 165],   // 6
    [-30, 150],   // 7
    [20, 165],    // 8
    [70, 150],    // 9
    [120, 130],   // 10
    [150, 90],    // 11
    [125, 55],    // 12
    [85, 80],     // 13
    [45, 95],     // 14
    [20, 70],     // 15
    [60, 45],     // 16
    [95, 25],     // 17
    [80, -15],    // 18
    [45, 0],      // 19
    [10, 10],     // 20 vuoren huippu
    [-25, -15],   // 21
    [-10, -50],   // 22
    [30, -70],    // 23
    [60, -100],   // 24
    [25, -125],   // 25
    [-25, -100],  // 26
    [-60, -75],   // 27
    [-95, -100],  // 28
    [-80, -140],  // 29
    [-40, -160],  // 30
    [0, -180],    // 31
    [45, -170],   // 32
    [95, -160],   // 33
    [125, -120],  // 34
    [160, -95],   // 35
    [170, -50],   // 36 tien loppu (maali ennen tätä)
  ],
};
