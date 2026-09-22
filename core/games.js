/**
 * Game profiles.
 *
 * Every number here is a *calibration starting point*, not ground truth. Games
 * patch weapon handling constantly and no two players run the same settings, so
 * the generator treats these as the origin of the tuning curve and expects the
 * user to trim from there (see README - "Calibrating").
 *
 * Field reference:
 *   referenceFov       field of view the recoil stats are quoted at
 *   referenceSens      sensitivity the recoil stats in the catalog are quoted at
 *   sensExponent       how strongly stick compensation scales with sensitivity
 *   referenceAds       ADS sensitivity multiplier the stats are quoted at
 *   responseCurves     stick response curve -> compensation multiplier
 *                      (curves that soften small inputs need a bigger push)
 *   recoilGain         normalised recoil (0-100) -> right-stick units, per unit
 *   kickDelayMs        how long after the trigger before recoil actually starts
 *   semiFireCapRpm     server-side cap on semi-auto fire rate (rapid fire limit)
 *   aimAssist          shape of the game's aim assist, drives sticky-aim defaults
 */

export const GAMES = [
  {
    id: 'cod-bo7',
    name: 'Call of Duty: Black Ops 7',
    family: 'cod',
    referenceFov: 80,
    referenceSens: 6,
    sensExponent: 1.0,
    referenceAds: 0.9,
    responseCurves: { standard: 1.18, linear: 1.0, dynamic: 1.12 },
    recoilGain: 0.60,
    kickDelayMs: 70,
    semiFireCapRpm: 400,
    aimAssist: { type: 'rotational', radius: 7, periodMs: 90 },
    notes: 'Rotational aim assist, as with the rest of the Black Ops line.'
  },
  {
    id: 'cod-bo6',
    name: 'Call of Duty: Black Ops 6',
    family: 'cod',
    referenceFov: 80,
    referenceSens: 6,
    sensExponent: 1.0,
    referenceAds: 0.9,
    responseCurves: { standard: 1.18, linear: 1.0, dynamic: 1.12 },
    recoilGain: 0.60,
    kickDelayMs: 70,
    semiFireCapRpm: 400,
    aimAssist: { type: 'rotational', radius: 7, periodMs: 90 },
    notes: 'Rotational aim assist rewards small continuous stick motion while ADS.'
  },
  {
    id: 'cod-mw3',
    name: 'Call of Duty: Modern Warfare III',
    family: 'cod',
    referenceFov: 80,
    referenceSens: 6,
    sensExponent: 1.0,
    referenceAds: 0.85,
    responseCurves: { standard: 1.2, linear: 1.0, dynamic: 1.12 },
    recoilGain: 0.62,
    kickDelayMs: 70,
    semiFireCapRpm: 400,
    aimAssist: { type: 'rotational', radius: 7, periodMs: 90 },
    notes: 'Recoil is front-loaded; most guns need a ramp-in rather than a flat pull.'
  },
  {
    id: 'warzone',
    name: 'Call of Duty: Warzone',
    family: 'cod',
    referenceFov: 80,
    referenceSens: 6,
    sensExponent: 1.0,
    referenceAds: 0.85,
    responseCurves: { standard: 1.2, linear: 1.0, dynamic: 1.12 },
    recoilGain: 0.68,
    kickDelayMs: 80,
    semiFireCapRpm: 400,
    aimAssist: { type: 'rotational', radius: 6, periodMs: 100 },
    notes: 'Longer engagement ranges - vertical pull matters more than horizontal.'
  },
  {
    id: 'apex',
    name: 'Apex Legends',
    family: 'apex',
    referenceFov: 90,
    referenceSens: 4,
    sensExponent: 0.9,
    referenceAds: 1.0,
    responseCurves: { standard: 1.15, linear: 1.0, dynamic: 1.1 },
    recoilGain: 0.72,
    kickDelayMs: 60,
    semiFireCapRpm: 480,
    aimAssist: { type: 'slowdown', radius: 5, periodMs: 110 },
    notes: 'Fixed recoil patterns - pattern import gives far better results than a flat value.'
  },
  {
    id: 'fortnite',
    name: 'Fortnite',
    family: 'fortnite',
    referenceFov: 80,
    referenceSens: 6,
    sensExponent: 0.85,
    referenceAds: 0.6,
    responseCurves: { standard: 1.12, linear: 1.0, dynamic: 1.08 },
    recoilGain: 0.55,
    kickDelayMs: 90,
    semiFireCapRpm: 360,
    aimAssist: { type: 'slowdown', radius: 5, periodMs: 120 },
    notes: 'First-shot accuracy is high; delay compensation until the 2nd-3rd round.'
  },
  {
    id: 'bf2042',
    name: 'Battlefield 2042',
    family: 'battlefield',
    referenceFov: 74,
    referenceSens: 5,
    sensExponent: 1.0,
    referenceAds: 0.8,
    responseCurves: { standard: 1.1, linear: 1.0, dynamic: 1.05 },
    recoilGain: 0.75,
    kickDelayMs: 50,
    semiFireCapRpm: 450,
    aimAssist: { type: 'slowdown', radius: 4, periodMs: 120 },
    notes: 'High first-shot kick and strong horizontal drift on most LMGs.'
  },
  {
    id: 'r6siege',
    name: 'Rainbow Six Siege',
    family: 'siege',
    referenceFov: 84,
    referenceSens: 12,
    sensExponent: 1.1,
    referenceAds: 0.5,
    responseCurves: { standard: 1.05, linear: 1.0, dynamic: 1.05 },
    recoilGain: 0.85,
    kickDelayMs: 40,
    semiFireCapRpm: 500,
    aimAssist: { type: 'none', radius: 0, periodMs: 0 },
    notes: 'No meaningful aim assist - sticky aim is disabled by default for this game.'
  },
  {
    id: 'destiny2',
    name: 'Destiny 2',
    family: 'destiny',
    referenceFov: 95,
    referenceSens: 6,
    sensExponent: 0.95,
    referenceAds: 1.0,
    responseCurves: { standard: 1.1, linear: 1.0, dynamic: 1.06 },
    recoilGain: 0.58,
    kickDelayMs: 60,
    semiFireCapRpm: 450,
    aimAssist: { type: 'magnetism', radius: 6, periodMs: 100 },
    notes: 'Recoil direction stat maps directly to the horizontal drift value.'
  },
  {
    id: 'pubg',
    name: 'PUBG: Battlegrounds',
    family: 'pubg',
    referenceFov: 90,
    referenceSens: 50,
    sensExponent: 1.0,
    referenceAds: 0.8,
    responseCurves: { standard: 1.1, linear: 1.0, dynamic: 1.05 },
    recoilGain: 0.9,
    kickDelayMs: 50,
    semiFireCapRpm: 480,
    aimAssist: { type: 'none', radius: 0, periodMs: 0 },
    notes: 'Heaviest recoil of the supported games; expect large vertical values.'
  },
  {
    id: 'halo-infinite',
    name: 'Halo Infinite',
    family: 'halo',
    referenceFov: 78,
    referenceSens: 5,
    sensExponent: 0.9,
    referenceAds: 0.8,
    responseCurves: { standard: 1.1, linear: 1.0, dynamic: 1.05 },
    recoilGain: 0.5,
    kickDelayMs: 80,
    semiFireCapRpm: 420,
    aimAssist: { type: 'magnetism', radius: 6, periodMs: 110 },
    notes: 'Low recoil, strong magnetism - lean on sticky aim over anti-recoil.'
  },
  {
    id: 'generic',
    name: 'Other / custom game',
    family: 'generic',
    referenceFov: 85,
    referenceSens: 6,
    sensExponent: 1.0,
    referenceAds: 0.8,
    responseCurves: { standard: 1.12, linear: 1.0, dynamic: 1.08 },
    recoilGain: 0.65,
    kickDelayMs: 65,
    semiFireCapRpm: 420,
    aimAssist: { type: 'slowdown', radius: 5, periodMs: 110 },
    notes: 'Neutral baseline for a game without a dedicated profile.'
  }
];

const BY_ID = new Map(GAMES.map((g) => [g.id, g]));

export function getGame(id) {
  return BY_ID.get(id) || BY_ID.get('generic');
}

export function listGames() {
  // referenceSens/Ads/Fov travel with the game: a sensitivity of 6 means something
  // completely different in PUBG (1-100) than in Call of Duty (1-20).
  return GAMES.map(({ id, name, notes, aimAssist, referenceSens, referenceAds, referenceFov }) =>
    ({ id, name, notes, aimAssist, referenceSens, referenceAds, referenceFov }));
}

/** Weapon categories and how they behave under compensation. */
export const CATEGORIES = {
  ar: { label: 'Assault Rifle', stickyScale: 1.0, rapidFireDefault: false },
  smg: { label: 'SMG', stickyScale: 1.15, rapidFireDefault: false },
  lmg: { label: 'LMG', stickyScale: 0.85, rapidFireDefault: false },
  marksman: { label: 'Marksman / DMR', stickyScale: 0.7, rapidFireDefault: true },
  sniper: { label: 'Sniper', stickyScale: 0.0, rapidFireDefault: false },
  pistol: { label: 'Pistol', stickyScale: 1.0, rapidFireDefault: true },
  shotgun: { label: 'Shotgun', stickyScale: 0.9, rapidFireDefault: true },
  battle: { label: 'Battle Rifle', stickyScale: 0.9, rapidFireDefault: false },
  other: { label: 'Other', stickyScale: 1.0, rapidFireDefault: false }
};

export function getCategory(id) {
  return CATEGORIES[id] || CATEGORIES.other;
}
