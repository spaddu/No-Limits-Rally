// =============================================================================
//  BEAVER VALLEY (USA)
// =============================================================================
//  Alkuosa kanjonin pohjaa (kanjoni seuraa tietä, tracks.js: roadCanyon), vanha
//  rautatiesilta tien yllä, puolivälissä nousu kanjonista ja loppu tiheää mäntymetsää.
//  Sama muoto kuin roadPath.js:ssä (katso ohjeet sieltä). Maaston ja maiseman
//  asetukset ovat tracks.js:ssä.
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
    [-245, 170],  // 0 lähtöalue, kanjonin pohja
    [-205, 190],  // 1
    [-160, 170],  // 2
    [-130, 130],  // 3
    [-150, 85],   // 4
    [-120, 45],   // 5
    [-70, 55],    // 6 rautatiesilta tien yllä
    [-30, 95],    // 7
    [15, 80],     // 8
    [35, 35],     // 9
    [10, -10],    // 10
    [-30, -45],   // 11
    [-20, -95],   // 12
    [25, -120],   // 13
    [75, -100],   // 14
    [120, -130],  // 15 nousu kanjonista
    [110, -180],  // 16
    [150, -215],  // 17 mäntymetsä alkaa
    [200, -190],  // 18
    [185, -140],  // 19
    [225, -100],  // 20
    [200, -50],   // 21
    [150, -40],   // 22
    [120, 0],     // 23
    [160, 40],    // 24
    [210, 30],    // 25
    [230, 80],    // 26
    [190, 115],   // 27
    [140, 95],    // 28
    [100, 130],   // 29
    [130, 175],   // 30
    [180, 160],   // 31
    [220, 200],   // 32
    [175, 235],   // 33 tien loppu (maali ennen tätä)
  ],
};
