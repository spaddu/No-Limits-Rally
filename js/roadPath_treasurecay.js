// =============================================================================
//  TREASURE CAY (Bahama)
// =============================================================================
//  Viidakkoa, rantahietikkoa ja mäkiä. Tie kulkee kylän läpi n. 815–950 m kohdalla.
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
    [-255, -110], // 0 lähtöalue
    [-215, -80],  // 1
    [-170, -110], // 2
    [-130, -150], // 3
    [-80, -130],  // 4
    [-40, -170],  // 5
    [10, -150],   // 6
    [40, -195],   // 7
    [90, -180],   // 8
    [140, -200],  // 9
    [190, -170],  // 10
    [175, -120],  // 11
    [130, -100],  // 12
    [95, -60],    // 13
    [65, -20],    // 14
    [100, 20],    // 15 kylä
    [160, 10],    // 16 kylä
    [205, 50],    // 17
    [170, 90],    // 18
    [120, 80],    // 19
    [80, 115],    // 20
    [100, 160],   // 21
    [150, 175],   // 22
    [200, 200],   // 23
    [150, 225],   // 24
    [95, 198],    // 25
    [40, 222],    // 26
    [-10, 198],   // 27
    [-60, 225],   // 28
    [-105, 195],  // 29 tien loppu (maali ennen tätä)
  ],
};
