/**
 * Weapon rosters.
 *
 * Two different kinds of data live here, and the difference matters:
 *
 *   - **Names, classes and fire modes** are the real rosters. They are what
 *     you pick from, and they are what makes a weapon findable.
 *   - **Recoil and fire-rate numbers** are NOT extracted from any game. A
 *     handful are community-style estimates; the rest are derived from the
 *     weapon's class. Every derived entry is marked `estimated`, carries a
 *     low confidence score, and says so on the weapon itself.
 *
 * So: pick your gun by name, then trim the numbers on a range. The app is
 * built around that loop - the script header tells you which way to trim.
 *
 * Row format: [name, category] or [name, category, { rpm, v, h, drift, fire, mag, ads }]
 * A row with no third element is a roster entry with class-derived stats.
 */

import { normalizeWeapon } from './weapons.js';

/** Class baselines used for any weapon without measured numbers of its own. */
const CLASS_DEFAULTS = {
  ar:       { rpm: 680, v: 44, h: 13, mag: 30, ads: 260, fire: 'auto' },
  smg:      { rpm: 850, v: 34, h: 15, mag: 32, ads: 200, fire: 'auto' },
  lmg:      { rpm: 640, v: 58, h: 18, mag: 75, ads: 400, fire: 'auto' },
  marksman: { rpm: 320, v: 33, h: 9,  mag: 15, ads: 310, fire: 'semi' },
  sniper:   { rpm: 45,  v: 72, h: 7,  mag: 6,  ads: 540, fire: 'semi' },
  shotgun:  { rpm: 90,  v: 52, h: 10, mag: 6,  ads: 250, fire: 'semi' },
  pistol:   { rpm: 380, v: 26, h: 9,  mag: 15, ads: 190, fire: 'semi' },
  battle:   { rpm: 450, v: 48, h: 11, mag: 20, ads: 290, fire: 'semi' }
};

/* ------------------------------------------------------------------ *
 * Call of Duty: Black Ops 7 - launch roster                           *
 * ------------------------------------------------------------------ */
const BO7 = [
  ['M15 MOD 0', 'ar'], ['AK-27', 'ar'], ['DS20 Mirage', 'ar'], ['X9 Maverick', 'ar'],
  ['Peacekeeper MK1', 'ar'], ['MXR-17', 'ar'], ['Maddox RFB', 'ar'],
  ['Ryden 45K', 'smg'], ['Dravec 45', 'smg'], ['Razor 9mm', 'smg'], ['Carbon 57', 'smg'],
  ['MPC-25', 'smg'], ['RK-9', 'smg'], ['Kogot-7', 'smg'],
  ['MK.78', 'lmg'], ['XM325', 'lmg'],
  ['M8A1', 'marksman', { fire: 'burst', burst: 3, rpm: 480, v: 30, h: 8 }],
  ['Warden 308', 'marksman'], ['M34 Novaline', 'marksman'],
  ['NX Ravager', 'sniper'], ['VS Recon', 'sniper'], ['XR-3 Ion', 'sniper'],
  ['M10 Breacher', 'shotgun'], ['Echo 12', 'shotgun', { fire: 'auto', rpm: 200 }], ['Akita', 'shotgun'],
  ['Jager 45', 'pistol'], ['Coda 9', 'pistol'], ['Velox 5.7', 'pistol']
];

/* ------------------------------------------------------------------ *
 * Call of Duty: Black Ops 6                                           *
 * ------------------------------------------------------------------ */
const BO6 = [
  ['XM4', 'ar', { rpm: 703, v: 40, h: 12, drift: 0.2, mag: 30, ads: 250 }],
  ['AK-74', 'ar', { rpm: 600, v: 52, h: 16, drift: -0.3, mag: 30, ads: 270 }],
  ['AMES 85', 'ar'], ['GPR 91', 'ar'], ['Model L', 'ar'], ['Goblin MK2', 'ar', { fire: 'semi', rpm: 400 }],
  ['AS VAL', 'ar', { rpm: 900, v: 38, h: 14 }], ['Krig C', 'ar'], ['Cypher 091', 'ar'], ['AEK-973', 'ar'],
  ['C9', 'smg', { rpm: 845, v: 34, h: 14, drift: 0.1, mag: 32, ads: 200 }],
  ['KSV', 'smg'], ['Tanto .22', 'smg'], ['PP-919', 'smg'],
  ['Jackal PDW', 'smg', { rpm: 909, v: 38, h: 15, drift: 0.3, mag: 30, ads: 195 }],
  ['Saug', 'smg'], ['Kompakt 92', 'smg'], ['LC10', 'smg'], ['Feng 82', 'smg'],
  ['PU-21', 'lmg', { rpm: 750, v: 58, h: 18, drift: -0.2, mag: 75, ads: 400 }],
  ['XMG', 'lmg'], ['GPMG-7', 'lmg'], ['Feng Light', 'lmg'],
  ['SWAT 5.56', 'battle', { fire: 'burst', burst: 5, rpm: 800, v: 44, h: 10, drift: 0.1, mag: 30, ads: 260 }],
  ['AEK-973 Battle', 'battle'], ['Tsarkov 7.62', 'battle'],
  ['DM-10', 'marksman', { rpm: 300, v: 30, h: 8, mag: 20, ads: 300 }],
  ['SVD', 'marksman'], ['AEK Marksman', 'marksman'],
  ['LR 7.62', 'sniper'], ['LW3A1 Frostline', 'sniper', { rpm: 40, v: 72, h: 6, mag: 5, ads: 560 }],
  ['SVD-M', 'sniper'], ['AMR Mod 4', 'sniper'],
  ['Marine SP', 'shotgun'], ['ASG-89', 'shotgun', { fire: 'auto', rpm: 180 }], ['Maelstrom', 'shotgun'],
  ['GS45', 'pistol'], ['9mm PM', 'pistol'], ['Grekhova', 'pistol'], ['Stryder .22', 'pistol']
];

/* ------------------------------------------------------------------ *
 * Modern Warfare III - its own roster plus the MWII guns it pools      *
 * ------------------------------------------------------------------ */
const MW3 = [
  ['MCW', 'ar', { rpm: 750, v: 38, h: 11, drift: 0.1, mag: 30, ads: 255 }],
  ['SVA 545', 'ar', { rpm: 705, v: 45, h: 13, drift: -0.2, mag: 30, ads: 265 }],
  ['Holger 556', 'ar', { rpm: 705, v: 42, h: 12, drift: 0.2, mag: 30, ads: 270 }],
  ['MTZ-556', 'ar'], ['DG-56', 'ar', { fire: 'burst', burst: 3, rpm: 700 }], ['FR 5.56', 'ar', { fire: 'burst', burst: 3 }],
  ['RAM-7', 'ar'], ['BAS-B', 'battle'], ['Sidewinder', 'ar', { fire: 'semi', rpm: 420 }],
  ['M13C', 'ar'], ['TAQ-56', 'ar'], ['STB 556', 'ar'], ['Kastov 762', 'ar', { rpm: 620, v: 56, h: 18, drift: -0.3 }],
  ['M4', 'ar'], ['Chimera', 'ar'], ['ISO Hemlock', 'ar'], ['TR-76 Geist', 'ar'], ['Lachmann-556', 'ar'],
  ['Striker', 'smg', { rpm: 857, v: 33, h: 15, drift: 0.3, mag: 32, ads: 205 }],
  ['Rival-9', 'smg', { rpm: 882, v: 30, h: 13, drift: 0.1, mag: 30, ads: 195 }],
  ['WSP Swarm', 'smg', { rpm: 1200, v: 42, h: 20, drift: 0.4, mag: 50, ads: 190 }],
  ['AMR9', 'smg'], ['Striker 9', 'smg'], ['HRM-9', 'smg'], ['WSP-9', 'smg'], ['FJX Horus', 'smg'],
  ['Lachmann Sub', 'smg'], ['Fennec 45', 'smg', { rpm: 1100, v: 36, h: 18 }], ['Vaznev-9K', 'smg'],
  ['BAS-P', 'smg'], ['MX9', 'smg'], ['Minibak', 'smg'],
  ['Holger 26', 'lmg', { rpm: 698, v: 55, h: 17, drift: -0.2, mag: 60, ads: 380 }],
  ['Pulemyot 762', 'lmg', { rpm: 620, v: 62, h: 19, drift: -0.3, mag: 100, ads: 430 }],
  ['TAQ Eradicator', 'lmg'], ['DG-58 LSW', 'lmg'], ['Bruen Mk9', 'lmg'], ['Sakin MG38', 'lmg'],
  ['RAAL MG', 'lmg'], ['556 Icarus', 'lmg'], ['RPK', 'lmg'],
  ['MTZ Interceptor', 'marksman', { rpm: 320, v: 34, h: 9, mag: 10, ads: 310 }],
  ['KVD Enforcer', 'marksman'], ['DM56', 'marksman'], ['SP-R 208', 'marksman'], ['EBR-14', 'marksman'],
  ['Lockwood MK2', 'marksman'], ['TAQ-M', 'marksman'], ['SA-B 50', 'marksman'],
  ['KATT-AMR', 'sniper', { rpm: 38, v: 78, h: 7, mag: 7, ads: 600 }],
  ['Longbow', 'sniper'], ['XRK Stalker', 'sniper'], ['MORS', 'sniper'], ['FJX Imperium', 'sniper'],
  ['Signal 50', 'sniper', { fire: 'semi', rpm: 90 }], ['LA-B 330', 'sniper'], ['SP-X 80', 'sniper'],
  ['Victus XMR', 'sniper'], ['Carrack .300', 'sniper'],
  ['Lockwood 680', 'shotgun'], ['Haymaker', 'shotgun', { fire: 'auto', rpm: 300 }], ['Riveter', 'shotgun'],
  ['Bryson 800', 'shotgun'], ['Bryson 890', 'shotgun'], ['Expedite 12', 'shotgun'], ['KV Broadside', 'shotgun'],
  ['COR-45', 'pistol'], ['Renetti', 'pistol'], ['TYR', 'pistol'], ['WSP Stinger', 'pistol'],
  ['.50 GS', 'pistol', { rpm: 300, v: 60, h: 10 }], ['X12', 'pistol'], ['X13 Auto', 'pistol', { fire: 'auto', rpm: 900 }],
  ['Basilisk', 'pistol'], ['FTAC Siege', 'pistol', { fire: 'auto', rpm: 800 }]
];

const ROSTERS = {
  'cod-bo7': BO7,
  'cod-bo6': BO6,
  'cod-mw3': MW3,
  // Warzone pools the current Call of Duty arsenals, so its catalog is theirs,
  // re-tuned against the Warzone game profile.
  warzone: [...BO7, ...BO6, ...MW3],

  apex: [
    ['R-301 Carbine', 'ar', { rpm: 810, v: 34, h: 12, drift: 0.2, mag: 28, ads: 250 }],
    ['Flatline', 'ar', { rpm: 600, v: 52, h: 20, drift: -0.4, mag: 30, ads: 280 }],
    ['Havoc Rifle', 'ar'], ['Nemesis', 'ar', { fire: 'burst', burst: 4 }], ['Hemlok', 'ar', { fire: 'burst', burst: 3 }],
    ['R-99', 'smg', { rpm: 1080, v: 40, h: 18, drift: 0.3, mag: 27, ads: 210 }],
    ['Volt SMG', 'smg', { rpm: 720, v: 30, h: 12, drift: 0.2, mag: 26, ads: 215 }],
    ['Alternator', 'smg'], ['Prowler', 'smg', { fire: 'burst', burst: 5 }], ['CAR SMG', 'smg'],
    ['Spitfire', 'lmg', { rpm: 540, v: 46, h: 14, drift: -0.2, mag: 35, ads: 380 }],
    ['Devotion', 'lmg'], ['Rampage', 'lmg'], ['L-STAR', 'lmg'],
    ['G7 Scout', 'marksman', { rpm: 240, v: 32, h: 8, mag: 20, ads: 300 }],
    ['Triple Take', 'marksman'], ['30-30 Repeater', 'marksman'],
    ['Longbow DMR', 'sniper'], ['Charge Rifle', 'sniper'], ['Sentinel', 'sniper'], ['Kraber', 'sniper'],
    ['EVA-8 Auto', 'shotgun', { fire: 'auto', rpm: 130 }], ['Mastiff', 'shotgun'], ['Peacekeeper', 'shotgun'], ['Mozambique', 'shotgun'],
    ['Wingman', 'pistol', { rpm: 156, v: 48, h: 10, mag: 6, ads: 220 }], ['P2020', 'pistol'], ['RE-45', 'pistol', { fire: 'auto', rpm: 720 }]
  ],

  fortnite: [
    ['Assault Rifle', 'ar', { rpm: 400, v: 30, h: 14, mag: 30, ads: 280 }],
    ['Striker AR', 'ar', { rpm: 420, v: 28, h: 12, drift: 0.1, mag: 30, ads: 270 }],
    ['Hammer AR', 'ar'], ['Nemesis AR', 'ar'], ['Warforged AR', 'ar'],
    ['SMG', 'smg', { rpm: 720, v: 34, h: 18, drift: 0.2, mag: 30, ads: 200 }],
    ['Stinger SMG', 'smg'], ['Thunder Burst SMG', 'smg', { fire: 'burst', burst: 3 }],
    ['Ranger Shotgun', 'shotgun', { rpm: 90, v: 50, h: 10, mag: 6, ads: 250 }],
    ['Hammer Pump', 'shotgun', { rpm: 60, v: 56, h: 8, mag: 5, ads: 260 }],
    ['Frenzy Auto Shotgun', 'shotgun', { fire: 'auto', rpm: 160 }],
    ['Hunting Rifle', 'sniper', { rpm: 60, v: 62, h: 6, mag: 1, ads: 480 }],
    ['Heavy Sniper', 'sniper'], ['Reaper Sniper', 'sniper'],
    ['Ranger Pistol', 'pistol'], ['Hand Cannon', 'pistol']
  ],

  bf2042: [
    ['AK-24', 'ar', { rpm: 600, v: 46, h: 16, drift: -0.2, mag: 30, ads: 260 }],
    ['M5A3', 'ar', { rpm: 700, v: 42, h: 14, drift: 0.2, mag: 30, ads: 250 }],
    ['AM40', 'ar'], ['AEK-971', 'ar'], ['SCZ-3', 'ar'], ['AC-42', 'ar'], ['RM68', 'ar'],
    ['PP-29', 'smg', { rpm: 750, v: 36, h: 16, drift: 0.3, mag: 55, ads: 210 }],
    ['PBX-45', 'smg'], ['MP9', 'smg'], ['K30', 'smg'], ['AKS-74U', 'smg'],
    ['LCMG', 'lmg', { rpm: 550, v: 60, h: 20, drift: -0.3, mag: 100, ads: 420 }],
    ['PKP-BP', 'lmg'], ['Avancys', 'lmg'],
    ['DM7', 'marksman', { rpm: 300, v: 36, h: 10, mag: 20, ads: 320 }], ['SVK', 'marksman'], ['VHX-D3', 'marksman'],
    ['SWS-10', 'sniper', { rpm: 50, v: 74, h: 8, mag: 5, ads: 540 }], ['DXR-1', 'sniper'], ['NTW-50', 'sniper'],
    ['MCS-880', 'shotgun'], ['12M Auto', 'shotgun', { fire: 'auto', rpm: 200 }],
    ['MP28', 'smg'], ['G57', 'pistol']
  ],

  r6siege: [
    ['R4-C', 'ar', { rpm: 860, v: 48, h: 14, drift: 0.2, mag: 30, ads: 200 }],
    ['AK-12', 'ar', { rpm: 850, v: 52, h: 16, drift: -0.2, mag: 30, ads: 210 }],
    ['416-C Carbine', 'ar'], ['C8-SFW', 'ar'], ['AR33', 'ar'], ['F2', 'ar'], ['552 Commando', 'ar'], ['AUG A2', 'ar'],
    ['MP5', 'smg', { rpm: 800, v: 34, h: 12, drift: 0.1, mag: 30, ads: 190 }],
    ['Vector .45 ACP', 'smg', { rpm: 1200, v: 30, h: 15, drift: 0.2, mag: 25, ads: 185 }],
    ['MP7', 'smg'], ['P90', 'smg'], ['UMP45', 'smg'], ['Scorpion EVO 3 A1', 'smg'],
    ['M249', 'lmg', { rpm: 650, v: 58, h: 18, drift: -0.3, mag: 100, ads: 380 }], ['T-95 LSW', 'lmg'], ['ALDA 5.56', 'lmg'],
    ['OTs-03', 'marksman'], ['CAMRS', 'marksman'], ['SR-25', 'marksman'],
    ['SUPER 90', 'shotgun'], ['M590A1', 'shotgun'], ['SPAS-12', 'shotgun'],
    ['Deagle', 'pistol', { rpm: 300, v: 60, h: 10, mag: 7, ads: 200 }], ['P226 MK 25', 'pistol'], ['5.7 USG', 'pistol']
  ],

  destiny2: [
    ['Gnawing Hunger', 'ar', { rpm: 600, v: 38, h: 14, drift: 0.3, mag: 46, ads: 240 }],
    ['Ammit AR2', 'ar', { rpm: 720, v: 34, h: 12, drift: -0.2, mag: 36, ads: 230 }],
    ['Sweet Business', 'ar'], ['Monte Carlo', 'ar'],
    ['The Messenger', 'battle', { fire: 'semi', rpm: 340, v: 40, h: 10, mag: 15, ads: 260 }],
    ['Igneous Hammer', 'battle'], ['Austringer', 'battle'],
    ['Funnelweb', 'smg', { rpm: 900, v: 30, h: 14, drift: 0.2, mag: 40, ads: 200 }],
    ['Recluse', 'smg'], ['Calus Mini-Tool', 'smg'],
    ['Riptide', 'shotgun', { rpm: 140, v: 48, h: 10, mag: 6, ads: 240 }], ['Matador 64', 'shotgun'],
    ['Izanagi’s Burden', 'sniper', { rpm: 72, v: 66, h: 6, mag: 4, ads: 500 }], ['Cloudstrike', 'sniper'],
    ['Thunderlord', 'lmg'], ['Xenophage', 'lmg']
  ],

  pubg: [
    ['M416', 'ar', { rpm: 700, v: 52, h: 18, drift: 0.1, mag: 30, ads: 260 }],
    ['Beryl M762', 'ar', { rpm: 700, v: 68, h: 24, drift: -0.3, mag: 30, ads: 270 }],
    ['AKM', 'ar', { rpm: 600, v: 64, h: 22, drift: -0.2, mag: 30, ads: 280 }],
    ['SCAR-L', 'ar'], ['G36C', 'ar'], ['QBZ95', 'ar'], ['AUG A3', 'ar'], ['ACE32', 'ar'],
    ['UMP45', 'smg', { rpm: 600, v: 40, h: 16, drift: 0.2, mag: 25, ads: 210 }],
    ['Vector', 'smg'], ['MP5K', 'smg'], ['PP-19 Bizon', 'smg'], ['Tommy Gun', 'smg'],
    ['DP-28', 'lmg', { rpm: 550, v: 58, h: 20, drift: -0.2, mag: 47, ads: 420 }], ['M249', 'lmg'], ['MG3', 'lmg'],
    ['Mini 14', 'marksman', { rpm: 400, v: 36, h: 10, mag: 20, ads: 300 }], ['SKS', 'marksman'],
    ['SLR', 'marksman'], ['QBU', 'marksman'], ['Dragunov', 'marksman'],
    ['Kar98k', 'sniper'], ['M24', 'sniper'], ['AWM', 'sniper'], ['Win94', 'sniper'],
    ['S12K', 'shotgun', { fire: 'semi', rpm: 200 }], ['S686', 'shotgun'], ['S1897', 'shotgun'],
    ['P18C', 'pistol', { fire: 'auto', rpm: 1100 }], ['P92', 'pistol'], ['R1895', 'pistol']
  ],

  'halo-infinite': [
    ['MA40 AR', 'ar', { rpm: 360, v: 26, h: 10, drift: 0.1, mag: 32, ads: 240 }],
    ['Commando', 'ar', { rpm: 400, v: 40, h: 14, drift: 0.2, mag: 30, ads: 250 }],
    ['BR75', 'battle', { fire: 'burst', burst: 3, rpm: 400, v: 30, h: 8, mag: 36, ads: 260 }],
    ['VK78 Commando', 'battle'],
    ['Sidekick', 'pistol', { rpm: 420, v: 22, h: 8, mag: 12, ads: 200 }], ['Mangler', 'pistol'], ['Plasma Pistol', 'pistol'],
    ['MK50 Sidekick', 'pistol'],
    ['Pulse Carbine', 'smg'], ['Needler', 'smg'], ['Heatwave', 'shotgun'], ['Bulldog', 'shotgun'],
    ['Sniper Rifle S2 AM', 'sniper', { rpm: 60, v: 60, h: 6, mag: 4, ads: 500 }],
    ['Stalker Rifle', 'marksman'], ['Shock Rifle', 'marksman']
  ]
};

const CACHE = new Map();

function buildWeapon(row, gameId) {
  const [name, category, stats] = row;
  const base = CLASS_DEFAULTS[category] || CLASS_DEFAULTS.ar;
  const s = stats || {};
  const estimated = !stats;

  return normalizeWeapon(
    {
      name,
      category,
      fireMode: s.fire || base.fire,
      burstCount: s.burst || ((s.fire || base.fire) === 'burst' ? 3 : 0),
      rpm: s.rpm ?? base.rpm,
      vertical: s.v ?? base.v,
      horizontal: s.h ?? base.h,
      drift: s.drift ?? 0,
      magSize: s.mag ?? base.mag,
      adsTimeMs: s.ads ?? base.ads,
      source: 'preset',
      estimated,
      confidence: estimated ? 0.25 : 0.6,
      notes: estimated
        ? 'Roster entry - the recoil and fire rate are class baselines, not measured. Trim on the range.'
        : 'Community estimate - verify on the range and trim.'
    },
    { game: gameId }
  );
}

export function catalogFor(gameId) {
  if (CACHE.has(gameId)) return CACHE.get(gameId);
  const rows = ROSTERS[gameId] || [];
  // Warzone pools three rosters, so the same gun can arrive twice.
  const seen = new Set();
  const weapons = [];
  for (const row of rows) {
    const key = `${row[0].toLowerCase()}|${row[1]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    weapons.push(buildWeapon(row, gameId));
  }
  CACHE.set(gameId, weapons);
  return weapons;
}

export function fullCatalog() {
  return Object.fromEntries(Object.keys(ROSTERS).map((id) => [id, catalogFor(id)]));
}

export function catalogGameIds() {
  return Object.keys(ROSTERS);
}
