/**
 * Bundled starter catalog.
 *
 * These are community-style estimates so you have something to generate from on
 * a fresh install - they are NOT extracted from any game's files and they drift
 * every balance patch. Treat a preset as a starting point, then trim the numbers
 * in the tuner (or import your own data) once you have seen it on the range.
 *
 * Row format: [name, category, fireMode, rpm, vertical, horizontal, drift, magSize, adsMs]
 *   vertical / horizontal : 0-100 normalised recoil
 *   drift                 : -1 pulls left, 0 straight, 1 pulls right
 */

import { normalizeWeapon } from './weapons.js';

const ROWS = {
  'cod-bo6': [
    ['XM4', 'ar', 'auto', 703, 40, 12, 0.2, 30, 250],
    ['AK-74', 'ar', 'auto', 600, 52, 16, -0.3, 30, 270],
    ['C9', 'smg', 'auto', 845, 34, 14, 0.1, 32, 200],
    ['Jackal PDW', 'smg', 'auto', 909, 38, 15, 0.3, 30, 195],
    ['PU-21', 'lmg', 'auto', 750, 58, 18, -0.2, 75, 400],
    ['SWAT 5.56', 'battle', 'burst', 800, 44, 10, 0.1, 30, 260],
    ['DM-10', 'marksman', 'semi', 300, 30, 8, 0, 20, 300],
    ['LW3A1 Frostline', 'sniper', 'semi', 40, 72, 6, 0, 5, 560]
  ],
  'cod-mw3': [
    ['MCW', 'ar', 'auto', 750, 38, 11, 0.1, 30, 255],
    ['SVA 545', 'ar', 'auto', 705, 45, 13, -0.2, 30, 265],
    ['Holger 556', 'ar', 'auto', 705, 42, 12, 0.2, 30, 270],
    ['Striker', 'smg', 'auto', 857, 33, 15, 0.3, 32, 205],
    ['Rival-9', 'smg', 'auto', 882, 30, 13, 0.1, 30, 195],
    ['Holger 26', 'lmg', 'auto', 698, 55, 17, -0.2, 60, 380],
    ['MTZ Interceptor', 'marksman', 'semi', 320, 34, 9, 0, 10, 310],
    ['KATT-AMR', 'sniper', 'semi', 38, 78, 7, 0, 7, 600]
  ],
  warzone: [
    ['Superi 46', 'smg', 'auto', 900, 36, 16, 0.2, 32, 200],
    ['BAL-27', 'ar', 'auto', 720, 44, 12, 0.1, 30, 260],
    ['Kar98k', 'sniper', 'semi', 45, 70, 6, 0, 5, 520],
    ['Pulemyot 762', 'lmg', 'auto', 620, 62, 19, -0.3, 100, 430],
    ['TAQ Evolvere', 'lmg', 'auto', 705, 57, 16, 0.2, 75, 410],
    ['WSP Swarm', 'smg', 'auto', 1200, 42, 20, 0.4, 50, 190]
  ],
  apex: [
    ['R-301 Carbine', 'ar', 'auto', 810, 34, 12, 0.2, 28, 250],
    ['Flatline', 'ar', 'auto', 600, 52, 20, -0.4, 30, 280],
    ['R-99', 'smg', 'auto', 1080, 40, 18, 0.3, 27, 210],
    ['Volt SMG', 'smg', 'auto', 720, 30, 12, 0.2, 26, 215],
    ['Spitfire', 'lmg', 'auto', 540, 46, 14, -0.2, 35, 380],
    ['G7 Scout', 'marksman', 'semi', 240, 32, 8, 0, 20, 300],
    ['Wingman', 'pistol', 'semi', 156, 48, 10, 0, 6, 220]
  ],
  fortnite: [
    ['Assault Rifle', 'ar', 'auto', 400, 30, 14, 0, 30, 280],
    ['Striker AR', 'ar', 'auto', 420, 28, 12, 0.1, 30, 270],
    ['Ranger Shotgun', 'shotgun', 'semi', 90, 50, 10, 0, 6, 250],
    ['SMG', 'smg', 'auto', 720, 34, 18, 0.2, 30, 200],
    ['Hammer Pump', 'shotgun', 'semi', 60, 56, 8, 0, 5, 260],
    ['Hunting Rifle', 'sniper', 'semi', 60, 62, 6, 0, 1, 480]
  ],
  bf2042: [
    ['AK-24', 'ar', 'auto', 600, 46, 16, -0.2, 30, 260],
    ['M5A3', 'ar', 'auto', 700, 42, 14, 0.2, 30, 250],
    ['PP-29', 'smg', 'auto', 750, 36, 16, 0.3, 55, 210],
    ['LCMG', 'lmg', 'auto', 550, 60, 20, -0.3, 100, 420],
    ['DM7', 'marksman', 'semi', 300, 36, 10, 0, 20, 320],
    ['SWS-10', 'sniper', 'semi', 50, 74, 8, 0, 5, 540]
  ],
  r6siege: [
    ['R4-C', 'ar', 'auto', 860, 48, 14, 0.2, 30, 200],
    ['AK-12', 'ar', 'auto', 850, 52, 16, -0.2, 30, 210],
    ['MP5', 'smg', 'auto', 800, 34, 12, 0.1, 30, 190],
    ['Vector .45 ACP', 'smg', 'auto', 1200, 30, 15, 0.2, 25, 185],
    ['M249', 'lmg', 'auto', 650, 58, 18, -0.3, 100, 380],
    ['Deagle', 'pistol', 'semi', 300, 60, 10, 0, 7, 200]
  ],
  destiny2: [
    ['Gnawing Hunger', 'ar', 'auto', 600, 38, 14, 0.3, 46, 240],
    ['Ammit AR2', 'ar', 'auto', 720, 34, 12, -0.2, 36, 230],
    ['The Messenger', 'battle', 'semi', 340, 40, 10, 0.1, 15, 260],
    ['Riptide', 'shotgun', 'semi', 140, 48, 10, 0, 6, 240],
    ['Funnelweb', 'smg', 'auto', 900, 30, 14, 0.2, 40, 200],
    ['Izanagi’s Burden', 'sniper', 'semi', 72, 66, 6, 0, 4, 500]
  ],
  pubg: [
    ['M416', 'ar', 'auto', 700, 52, 18, 0.1, 30, 260],
    ['Beryl M762', 'ar', 'auto', 700, 68, 24, -0.3, 30, 270],
    ['AKM', 'ar', 'auto', 600, 64, 22, -0.2, 30, 280],
    ['UMP45', 'smg', 'auto', 600, 40, 16, 0.2, 25, 210],
    ['DP-28', 'lmg', 'auto', 550, 58, 20, -0.2, 47, 420],
    ['Mini 14', 'marksman', 'semi', 400, 36, 10, 0, 20, 300]
  ],
  'halo-infinite': [
    ['MA40 AR', 'ar', 'auto', 360, 26, 10, 0.1, 32, 240],
    ['BR75', 'battle', 'burst', 400, 30, 8, 0, 36, 260],
    ['Sidekick', 'pistol', 'semi', 420, 22, 8, 0, 12, 200],
    ['Commando', 'ar', 'auto', 400, 40, 14, 0.2, 30, 250],
    ['Sniper Rifle S2 AM', 'sniper', 'semi', 60, 60, 6, 0, 4, 500]
  ]
};

const CACHE = new Map();

export function catalogFor(gameId) {
  if (CACHE.has(gameId)) return CACHE.get(gameId);
  const rows = ROWS[gameId] || [];
  const weapons = rows.map(([name, category, fireMode, rpm, vertical, horizontal, drift, magSize, adsTimeMs]) =>
    normalizeWeapon(
      {
        name,
        category,
        fireMode,
        burstCount: fireMode === 'burst' ? 3 : 0,
        rpm,
        vertical,
        horizontal,
        drift,
        magSize,
        adsTimeMs,
        source: 'preset',
        confidence: 0.6,
        notes: 'Community estimate - verify on the range and trim.'
      },
      { game: gameId }
    )
  );
  CACHE.set(gameId, weapons);
  return weapons;
}

export function fullCatalog() {
  return Object.fromEntries(Object.keys(ROWS).map((id) => [id, catalogFor(id)]));
}

export function catalogGameIds() {
  return Object.keys(ROWS);
}
