// =============================================================================
//  AUTOT – valikossa näkyvät autot
// =============================================================================
//  Jokaisella autolla on config-kohdassa kaikki ajosäädöt. Tärkeimmät erot:
//    driveFront  vetävien renkaiden jako: 1 = etuveto, 0 = takaveto, 0.4 = neliveto
//    engineForce moottorin voima (keskimäärin per rengas)
//    mass        massa (kg)
//    friction*   renkaiden pito
//    tractionControl luistonesto 0…1 (car.js)
//  model = placeholder-mallin tyyli ('hatch', 'retro', 'wrc') ja väri.
//  stats = valikon palkit (0–5), puhtaasti näyttöä varten.
// =============================================================================

export const CARS = [
  {
    id: 'etuveto',
    name: 'FWD Hatchback',
    drive: 'Front-wheel drive',
    description: 'Light and grippy, easy to drive, but the least power',
    color: '#2350b8',
    model: { style: 'hatch', color: '#2350b8' },
    stats: { power: 2, grip: 5, agility: 4 },
    // Moottorin ääni (audio.js): kireä ja kirkas nelonen
    sound: { cylinders: 4, idle: 950, redline: 7400, tone: 1.15, rough: 0.12, volume: 0.9, turbo: 0, pops: 0.15 },
    config: {
        mass: 1000,
        centerOfMassY: -0.7,          // epärealistisen matala painopiste = auto ei kaadu helposti
        chassisHalf: { x: 1.9, y: 0.25, z: 0.8 },

        wheelRadius: 0.42,
        wheelWidth: 0.34,
        wheelX: 1.25,                 // akselien etäisyys keskeltä
        wheelZ: 0.86,                 // renkaiden etäisyys keskeltä sivulle
        wheelY: -0.25,                // jousituksen kiinnityskohta

        suspensionRest: 0.45,         // jousen lepopituus
        suspensionTravel: 0.3,        // suurin joustomatka
        suspensionStiffness: 30,
        suspensionCompression: 3.2,   // vaimennus puristuessa (pienempi = pomppivampi)
        suspensionRelaxation: 3.6,    // vaimennus palautuessa
        maxSuspensionForce: 100000,

        frictionFront: 1.15,
        frictionRear: 1.2,
        frictionHandbrake: 0.4,

        driveFront: 1.0,              // vetävien renkaiden jako: 1 = etuveto, 0 = takaveto
        tractionControl: 0,           // luistonesto 0…1 (0 = pois, 1 = puolet pidosta varataan ohjaukselle)
        engineForce: 3000,            // keskimäärin per rengas (koko voima = 4 ×)
        reverseForce: 2200,
        maxSpeed: 25,                 // m/s (~115 km/h)
        maxReverseSpeed: 8,

        brake: 50,
        coastBrake: 1.2,              // hidastuu itsestään kun kaasu ei ole pohjassa
        holdBrake: 40,                // pitää auton paikallaan rinteessä
        handbrake: 60,

        maxSteer: 0.5,               // rad paikallaan
        minSteer: 0.1,                // rad vähintään
        steerFalloff: 12,             // m/s; kääntökulma puolittuu tällä nopeudella
        steerSpeed: 10,

        airLevel: 4000,               // Nm, ilmassa auto oikaisee itseään
        airLevelDamping: 1200,
        airYaw: 1500,                 // Nm, ilmassa A/D kääntää autoa

        // Alusta: soratiellä käytetään yllä olevia pitoarvoja, maastossa näitä kertoimia
        offroadGrip: 0.85,            // pidon kerroin tien ulkopuolella
        offroadDrag: 0.12,            // vierintävastus tien ulkopuolella (1/s): hidastaa ja laskee huippunopeutta
    },
  },
  {
    id: 'takaveto',
    name: 'Retro RWD',
    drive: 'Rear-wheel drive',
    description: 'A wild and powerful 80s beast with a lively rear end',
    color: '#c51f2a',
    // color = korin pohjaväri, accent = katto, konepelti ja kylkiraita, accent2 = takakyljen raita
    model: { style: 'retro', color: '#f1efe8', accent: '#c51f2a', accent2: '#1d4ea3' },
    stats: { power: 5, grip: 2, agility: 3 },
    // Moottorin ääni: matala, rouhea ja epätasaisesti käyvä 70-luvun kone
    sound: { cylinders: 4, idle: 780, redline: 6300, tone: 0.75, rough: 0.85, volume: 1.05, turbo: 0, pops: 1.0 },
    config: {
        mass: 1100,
        centerOfMassY: -0.7,          // epärealistisen matala painopiste = auto ei kaadu helposti
        chassisHalf: { x: 1.9, y: 0.25, z: 0.8 },

        wheelRadius: 0.42,
        wheelWidth: 0.34,
        wheelX: 1.25,                 // akselien etäisyys keskeltä
        wheelZ: 0.86,                 // renkaiden etäisyys keskeltä sivulle
        wheelY: -0.25,                // jousituksen kiinnityskohta

        suspensionRest: 0.45,         // jousen lepopituus
        suspensionTravel: 0.3,        // suurin joustomatka
        suspensionStiffness: 30,
        suspensionCompression: 3.2,   // vaimennus puristuessa (pienempi = pomppivampi)
        suspensionRelaxation: 3.6,    // vaimennus palautuessa
        maxSuspensionForce: 100000,

        frictionFront: 1.1,
        frictionRear: 1.0,
        frictionHandbrake: 0.35,

        driveFront: 0.0,              // vetävien renkaiden jako: 1 = etuveto, 0 = takaveto
        tractionControl: 0,           // luistonesto 0…1 (0 = pois, 1 = puolet pidosta varataan ohjaukselle)
        engineForce: 5200,            // keskimäärin per rengas (koko voima = 4 ×)
        reverseForce: 3200,
        maxSpeed: 26,                 // m/s (~115 km/h)
        maxReverseSpeed: 8,

        brake: 50,
        coastBrake: 1.2,              // hidastuu itsestään kun kaasu ei ole pohjassa
        holdBrake: 40,                // pitää auton paikallaan rinteessä
        handbrake: 60,

        maxSteer: 0.6,               // rad paikallaan
        minSteer: 0.1,                // rad vähintään
        steerFalloff: 15,             // m/s; kääntökulma puolittuu tällä nopeudella
        steerSpeed: 11,

        airLevel: 4000,               // Nm, ilmassa auto oikaisee itseään
        airLevelDamping: 1200,
        airYaw: 1500,                 // Nm, ilmassa A/D kääntää autoa

        // Alusta: soratiellä käytetään yllä olevia pitoarvoja, maastossa näitä kertoimia
        offroadGrip: 0.85,            // pidon kerroin tien ulkopuolella
        offroadDrag: 0.12,            // vierintävastus tien ulkopuolella (1/s): hidastaa ja laskee huippunopeutta
    },
  },
  {
    id: 'wrc',
    name: 'WRC AWD',
    drive: 'All-wheel drive',
    description: 'Modern rally weapon: strong acceleration and controllable slides',
    color: '#d8342c',
    // color = keula ja punaiset raidat, body = muu kori, roof = katto
    model: { style: 'wrc', color: '#d8262c', body: '#25272c', roof: '#f1f1ef' },
    stats: { power: 4, grip: 3, agility: 5 },
    // Moottorin ääni: korkeat kierrokset, turbon vihellys ja pamahdukset kaasua nostettaessa
    sound: { cylinders: 4, idle: 1100, redline: 8200, tone: 1, rough: 0.42, volume: 1, turbo: 1, pops: 1 },
    config: {
        mass: 1300,
        centerOfMassY: -0.7,          // epärealistisen matala painopiste = auto ei kaadu helposti
        chassisHalf: { x: 1.9, y: 0.25, z: 0.8 },

        wheelRadius: 0.42,
        wheelWidth: 0.34,
        wheelX: 1.25,                 // akselien etäisyys keskeltä
        wheelZ: 0.86,                 // renkaiden etäisyys keskeltä sivulle
        wheelY: -0.25,                // jousituksen kiinnityskohta

        suspensionRest: 0.45,         // jousen lepopituus
        suspensionTravel: 0.3,        // suurin joustomatka
        suspensionStiffness: 30,
        suspensionCompression: 3.2,   // vaimennus puristuessa (pienempi = pomppivampi)
        suspensionRelaxation: 3.6,    // vaimennus palautuessa
        maxSuspensionForce: 100000,

        frictionFront: 1.05,
        frictionRear: 1.00,
        frictionHandbrake: 0.4,

        driveFront: 0.4,              // vetävien renkaiden jako: 1 = etuveto, 0 = takaveto
        tractionControl: 0.0,           // luistonesto 0…1 (0 = pois, 1 = puolet pidosta varataan ohjaukselle)
        engineForce: 4600,            // keskimäärin per rengas (koko voima = 4 ×)
        reverseForce: 3200,
        maxSpeed: 30,                 // m/s (~115 km/h)
        maxReverseSpeed: 12,

        brake: 80,
        coastBrake: 1.2,              // hidastuu itsestään kun kaasu ei ole pohjassa
        holdBrake: 40,                // pitää auton paikallaan rinteessä
        handbrake: 60,

        maxSteer: 0.6,               // rad paikallaan
        minSteer: 0.1,                // rad vähintään
        steerFalloff: 20,             // m/s; kääntökulma puolittuu tällä nopeudella
        steerSpeed: 10,

        airLevel: 4000,               // Nm, ilmassa auto oikaisee itseään
        airLevelDamping: 1200,
        airYaw: 1500,                 // Nm, ilmassa A/D kääntää autoa

        // Alusta: soratiellä käytetään yllä olevia pitoarvoja, maastossa näitä kertoimia
        offroadGrip: 0.85,            // pidon kerroin tien ulkopuolella
        offroadDrag: 0.12,            // vierintävastus tien ulkopuolella (1/s): hidastaa ja laskee huippunopeutta
    },
  },
];
