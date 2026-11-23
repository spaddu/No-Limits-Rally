// =============================================================================
//  BULL MOUNTAIN (USA)
// =============================================================================
//  Karua kivistä vuoristoa, jyrkkiä nousuja ja laskuja. Puusilta kanjonin yli.
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
  maxGrade: 0.33,
  spacing: 1,

  // Silta: tie kulkee näiden kohtien välillä suoraa kantta pitkin (m tien alusta)
  bridges: [{ from: 700, to: 770 }],

  points: [
    [-240, -230], // 0 lähtöalue
    [-200, -240], // 1
    [-160, -205], // 2
    [-195, -165], // 3
    [-170, -120], // 4
    [-125, -140], // 5
    [-95, -185],  // 6
    [-50, -215],  // 7
    [0, -190],    // 8
    [-10, -145],  // 9
    [30, -110],   // 10
    [75, -135],   // 11
    [115, -100],  // 12
    [115, -60],   // 13
    [115, -30],   // 14 puusilta kanjonin yli alkaa
    [115, 40],    // 15 silta päättyy
    [110, 75],    // 16
    [70, 100],    // 17
    [30, 70],     // 18
    [-20, 95],    // 19
    [-60, 60],    // 20
    [-100, 95],   // 21
    [-150, 80],   // 22
    [-185, 120],  // 23
    [-150, 165],  // 24
    [-100, 190],  // 25
    [-50, 165],   // 26
    [0, 200],     // 27
    [50, 175],    // 28
    [100, 205],   // 29
    [150, 170],   // 30
    [195, 200],   // 31
    [230, 160],   // 32 tien loppu (maali ennen tätä)
  ],
};
