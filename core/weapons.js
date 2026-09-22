/**
 * Weapon model + importers.
 *
 * A weapon is game-agnostic on purpose: every importer (preset catalog, JSON,
 * CSV, AI text/screenshot extraction, manual form) funnels into `normalizeWeapon`
 * so the tuner and the GPC emitter only ever see one shape.
 */

import { getCategory, getGame } from './games.js';

/** @typedef {{atMs:number, vertical:number, horizontal:number}} RecoilPhase */

export const FIRE_MODES = ['auto', 'semi', 'burst'];

const CATEGORY_ALIASES = {
  ar: 'ar', assault: 'ar', 'assault rifle': 'ar', rifle: 'ar', carbine: 'ar',
  smg: 'smg', 'sub machine gun': 'smg', submachine: 'smg', 'submachine gun': 'smg', pdw: 'smg',
  lmg: 'lmg', 'light machine gun': 'lmg', mg: 'lmg', machinegun: 'lmg',
  dmr: 'marksman', marksman: 'marksman', 'marksman rifle': 'marksman', 'designated marksman': 'marksman',
  sniper: 'sniper', 'sniper rifle': 'sniper', bolt: 'sniper', 'bolt action': 'sniper',
  pistol: 'pistol', handgun: 'pistol', sidearm: 'pistol', revolver: 'pistol',
  shotgun: 'shotgun', 'shot gun': 'shotgun',
  battle: 'battle', br: 'battle', 'battle rifle': 'battle', 'tactical rifle': 'battle'
};

/** Header aliases accepted by the CSV/JSON importers. */
const FIELD_ALIASES = {
  name: ['name', 'weapon', 'weapon_name', 'gun', 'title', 'id'],
  category: ['category', 'class', 'type', 'weapon_class', 'weapon_type', 'slot_type'],
  game: ['game', 'title_id', 'source_game'],
  fireMode: ['firemode', 'fire_mode', 'mode', 'trigger', 'firing_mode'],
  burstCount: ['burst', 'burst_count', 'rounds_per_burst'],
  rpm: ['rpm', 'fire_rate', 'firerate', 'rate_of_fire', 'rof', 'rounds_per_minute'],
  magSize: ['mag', 'mag_size', 'magazine', 'magazine_size', 'clip', 'ammo'],
  adsTimeMs: ['ads', 'ads_time', 'adstime', 'ads_ms', 'aim_down_sight_time', 'handling'],
  vertical: ['vertical', 'vertical_recoil', 'recoil_vertical', 'v_recoil', 'recoil', 'kick', 'vrecoil'],
  horizontal: ['horizontal', 'horizontal_recoil', 'recoil_horizontal', 'h_recoil', 'hrecoil', 'sway'],
  drift: ['drift', 'recoil_direction', 'direction', 'bias', 'pull'],
  firstShotKickMs: ['first_shot', 'first_shot_kick', 'kick_delay', 'first_shot_ms'],
  notes: ['notes', 'comment', 'description']
};

function pick(obj, field) {
  const lowered = {};
  for (const [k, v] of Object.entries(obj)) lowered[k.toLowerCase().replace(/[\s-]+/g, '_')] = v;
  for (const alias of FIELD_ALIASES[field] || []) {
    const value = lowered[alias];
    // Aliases are deliberately loose, so an alias can collide with a nested
    // object on a normalised weapon (`recoil` -> the recoil block). Scalars only.
    if (value === undefined || value === null || value === '' || typeof value === 'object') continue;
    return value;
  }
  return undefined;
}

function num(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^\d.+-]/g, ''));
  return Number.isFinite(n) ? n : fallback;
}

export function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

export function slugify(str) {
  return String(str || 'weapon').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'weapon';
}

export function normalizeCategory(value) {
  if (!value) return 'other';
  const key = String(value).toLowerCase().trim();
  if (CATEGORY_ALIASES[key]) return CATEGORY_ALIASES[key];
  for (const [alias, id] of Object.entries(CATEGORY_ALIASES)) {
    if (key.includes(alias)) return id;
  }
  return 'other';
}

function normalizeDrift(value) {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return clamp(value, -1, 1);
  const key = String(value).toLowerCase().trim();
  if (key.startsWith('l')) return -1;
  if (key.startsWith('r')) return 1;
  if (key.startsWith('n') || key.startsWith('c')) return 0;
  const n = parseFloat(key);
  return Number.isFinite(n) ? clamp(n, -1, 1) : 0;
}

function normalizeFireMode(value, rpm) {
  const key = String(value || '').toLowerCase();
  if (key.startsWith('semi') || key.startsWith('single')) return 'semi';
  if (key.startsWith('burst')) return 'burst';
  if (key.startsWith('auto') || key.startsWith('full')) return 'auto';
  return rpm && rpm > 0 ? 'auto' : 'auto';
}

/**
 * Recoil stats arrive on wildly different scales depending on the source: a 0-1
 * float, a 0-10 rating, a 0-100 index, or raw degrees. Fold them all onto 0-100.
 */
export function normalizeRecoilScale(value, hint) {
  const n = num(value, undefined);
  if (n === undefined) return undefined;
  if (hint === 'percent' || n > 100) return clamp(n > 100 ? n / 10 : n, 0, 100);
  if (n <= 1 && n > 0 && !Number.isInteger(n)) return clamp(n * 100, 0, 100); // 0-1 float
  if (n <= 10 && Number.isInteger(n) && hint === 'rating') return clamp(n * 10, 0, 100);
  return clamp(n, 0, 100);
}

function normalizePattern(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const phases = raw
    .map((p, i) => {
      if (Array.isArray(p)) return { atMs: num(p[0], i * 100), vertical: num(p[1], 0), horizontal: num(p[2], 0) };
      return {
        atMs: num(p.atMs ?? p.at ?? p.t ?? p.ms ?? p.time, i * 100),
        vertical: normalizeRecoilScale(p.vertical ?? p.v ?? p.y, 0) ?? 0,
        horizontal: normalizeRecoilScale(p.horizontal ?? p.h ?? p.x, 0) ?? 0
      };
    })
    .filter((p) => Number.isFinite(p.atMs))
    .sort((a, b) => a.atMs - b.atMs);
  return phases.length ? phases : null;
}

/**
 * Per-weapon overrides.
 *
 * Anything set here replaces what the tuner calculated for that one weapon.
 * A key that is absent, null or '' means "leave it on auto", which is what
 * lets the UI offer an auto/manual switch per field without a second flag.
 */
export const OVERRIDE_SPEC = {
  antiRecoilVertical: { type: 'int', min: 0, max: 100, label: 'Vertical push' },
  antiRecoilHorizontal: { type: 'int', min: -60, max: 60, label: 'Horizontal push' },
  kickMs: { type: 'int', min: 0, max: 800, label: 'Start delay (ms)' },
  releaseThreshold: { type: 'int', min: 5, max: 100, label: 'Release threshold' },
  sticky: { type: 'mode', values: ['auto', 'on', 'off'], label: 'Sticky aim' },
  stickyRadius: { type: 'int', min: 1, max: 20, label: 'Sticky radius' },
  stickyPeriodMs: { type: 'int', min: 20, max: 400, label: 'Sticky step (ms)' },
  rapidFire: { type: 'mode', values: ['auto', 'on', 'off'], label: 'Rapid fire' }
};

export function normalizeOverrides(raw = {}) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [key, spec] of Object.entries(OVERRIDE_SPEC)) {
    const value = raw[key];
    if (value === undefined || value === null || value === '' || value === 'auto') continue;
    if (spec.type === 'mode') {
      if (spec.values.includes(value)) out[key] = value;
    } else {
      const n = num(value, undefined);
      if (n !== undefined) out[key] = Math.round(clamp(n, spec.min, spec.max));
    }
  }
  return out;
}

function normalizeAttachments(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (typeof a === 'string') return { name: a, recoilVertical: 0, recoilHorizontal: 0, rpm: 0, adsTime: 0 };
      return {
        name: String(a.name || a.attachment || 'attachment'),
        // Modifiers are fractions: -0.15 means "cuts 15% of the recoil".
        recoilVertical: clamp(num(a.recoilVertical ?? a.vertical ?? a.recoil, 0), -0.9, 2),
        recoilHorizontal: clamp(num(a.recoilHorizontal ?? a.horizontal, 0), -0.9, 2),
        rpm: clamp(num(a.rpm ?? a.fireRate, 0), -0.5, 1),
        adsTime: clamp(num(a.adsTime ?? a.ads, 0), -0.9, 2)
      };
    })
    .slice(0, 12);
}

/**
 * Coerce anything weapon-shaped into the canonical model.
 * Always returns a weapon; problems are reported in `warnings`.
 */
export function normalizeWeapon(raw = {}, { game = 'generic' } = {}) {
  const warnings = [];
  const name = String(pick(raw, 'name') ?? raw.name ?? 'Unnamed weapon').trim() || 'Unnamed weapon';
  const gameId = String(pick(raw, 'game') ?? game ?? 'generic');
  const resolvedGame = getGame(gameId).id;
  if (gameId && resolvedGame === 'generic' && gameId !== 'generic') {
    warnings.push(`Unknown game "${gameId}" - using the generic profile.`);
  }

  const category = normalizeCategory(pick(raw, 'category') ?? raw.category);
  if (category === 'other') warnings.push('Weapon class not recognised - falling back to neutral handling.');

  let rpm = num(pick(raw, 'rpm'), undefined);
  if (rpm === undefined) {
    rpm = defaultRpmFor(category);
    warnings.push(`No fire rate supplied - assuming ${rpm} RPM for a ${getCategory(category).label}.`);
  }
  rpm = clamp(rpm, 30, 2000);

  const fireMode = normalizeFireMode(pick(raw, 'fireMode') ?? raw.fireMode, rpm);
  const scaleHint = raw.recoilScale || raw.scale;

  // A weapon that has already been through here carries recoil.*; a freshly
  // imported row carries flat columns. Nested wins so edits round-trip intact.
  let vertical = normalizeRecoilScale(raw.recoil?.vertical ?? pick(raw, 'vertical'), scaleHint);
  let horizontal = normalizeRecoilScale(raw.recoil?.horizontal ?? pick(raw, 'horizontal'), scaleHint);
  if (vertical === undefined) {
    vertical = defaultRecoilFor(category);
    warnings.push(`No vertical recoil supplied - using the ${getCategory(category).label} baseline (${vertical}/100).`);
  }
  if (horizontal === undefined) horizontal = Math.round(vertical * 0.25);

  const pattern = normalizePattern(raw.pattern ?? raw.recoil?.pattern ?? raw.recoilPattern);

  const weapon = {
    id: raw.id && typeof raw.id === 'string' && raw.id.includes('-') ? raw.id : `${resolvedGame}-${slugify(name)}`,
    name,
    game: resolvedGame,
    category,
    fireMode,
    burstCount: clamp(Math.round(num(pick(raw, 'burstCount'), fireMode === 'burst' ? 3 : 0)), 0, 10),
    rpm: Math.round(rpm),
    magSize: Math.round(clamp(num(pick(raw, 'magSize'), 30), 1, 300)),
    adsTimeMs: Math.round(clamp(num(pick(raw, 'adsTimeMs'), defaultAdsFor(category)), 40, 1200)),
    recoil: {
      vertical: Math.round(vertical),
      horizontal: Math.round(horizontal),
      drift: normalizeDrift(raw.recoil?.drift ?? pick(raw, 'drift')),
      firstShotKickMs: Math.round(clamp(num(raw.recoil?.firstShotKickMs ?? pick(raw, 'firstShotKickMs'), 0), 0, 600)),
      pattern
    },
    attachments: normalizeAttachments(raw.attachments),
    overrides: normalizeOverrides(raw.overrides),
    notes: String(pick(raw, 'notes') ?? '').slice(0, 400),
    source: raw.source || 'manual',
    // true when the recoil / fire rate came from the weapon's class rather than
    // from measured numbers - the UI marks these and the tuner trusts them less
    estimated: Boolean(raw.estimated),
    confidence: raw.confidence === undefined ? undefined : clamp(num(raw.confidence, 0.5), 0, 1)
  };

  // Warnings describe what this pass had to guess. They are never inherited:
  // re-normalising an edited weapon must not stack the same note again.
  weapon.warnings = [...new Set(warnings)];
  return weapon;
}

export function defaultRpmFor(category) {
  return { ar: 650, smg: 850, lmg: 600, marksman: 350, sniper: 45, pistol: 400, shotgun: 90, battle: 450, other: 600 }[category] ?? 600;
}

export function defaultRecoilFor(category) {
  return { ar: 45, smg: 38, lmg: 60, marksman: 30, sniper: 70, pistol: 25, shotgun: 55, battle: 50, other: 40 }[category] ?? 40;
}

export function defaultAdsFor(category) {
  return { ar: 260, smg: 200, lmg: 420, marksman: 320, sniper: 520, pistol: 180, shotgun: 240, battle: 300, other: 260 }[category] ?? 260;
}

/* ------------------------------------------------------------------ */
/* Importers                                                           */
/* ------------------------------------------------------------------ */

export function importFromJson(text, { game = 'generic' } = {}) {
  let data;
  try {
    data = typeof text === 'string' ? JSON.parse(text) : text;
  } catch (err) {
    throw new Error(`That is not valid JSON: ${err.message}`);
  }
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data.weapons)
      ? data.weapons
      : Array.isArray(data.loadout)
        ? data.loadout
        : [data];
  return rows.map((row) => normalizeWeapon({ ...row, source: row.source || 'json' }, { game }));
}

/** Minimal RFC4180-ish CSV parser - handles quoted fields and embedded commas. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text).replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',' || c === '\t') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

export function importFromCsv(text, { game = 'generic' } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('CSV needs a header row and at least one weapon row.');
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (cells[i] ?? '').trim(); });
    obj.source = 'csv';
    return normalizeWeapon(obj, { game });
  });
}

/**
 * Best-effort offline parser for free text like
 *   "MCW, assault rifle, 750 rpm, vertical recoil 42, drifts right".
 * Used as the fallback when no Anthropic API key is configured.
 */
export function importFromTextHeuristic(text, { game = 'generic' } = {}) {
  const chunks = String(text)
    .split(/\n{2,}|\n(?=[-*\d]\s)|\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const weapons = [];
  for (const chunk of chunks) {
    const rpm = /(\d{2,4})\s*(?:rpm|rounds?\s*per\s*min)/i.exec(chunk);
    const vertical = /(?:vertical|v)[\s-]*recoil[^\d]{0,8}(\d{1,3})/i.exec(chunk);
    const horizontal = /(?:horizontal|h)[\s-]*recoil[^\d]{0,8}(\d{1,3})/i.exec(chunk);
    const mag = /(\d{1,3})\s*(?:round|rnd|mag|magazine)/i.exec(chunk);
    const nameMatch = /^[-*\d.\s]*([A-Za-z0-9][\w .'/-]{1,30}?)(?=\s*[,:(-]|\s+\d|\s*$)/.exec(chunk);
    const category = normalizeCategory(
      /(assault rifle|battle rifle|sniper|shotgun|marksman|pistol|revolver|smg|lmg|dmr|ar\b)/i.exec(chunk)?.[1]
    );
    if (!rpm && !vertical && !nameMatch) continue;
    weapons.push(normalizeWeapon({
      name: (nameMatch?.[1] || 'Imported weapon').trim(),
      category,
      rpm: rpm ? Number(rpm[1]) : undefined,
      vertical: vertical ? Number(vertical[1]) : undefined,
      horizontal: horizontal ? Number(horizontal[1]) : undefined,
      magSize: mag ? Number(mag[1]) : undefined,
      fireMode: /semi|single/i.test(chunk) ? 'semi' : /burst/i.test(chunk) ? 'burst' : 'auto',
      drift: /drift(?:s|ing)?\s*(left|right)/i.exec(chunk)?.[1],
      notes: chunk.slice(0, 200),
      source: 'text',
      confidence: 0.4
    }, { game }));
  }
  if (!weapons.length) throw new Error('Could not find a weapon in that text. Add a name, a fire rate and a recoil value.');
  return weapons;
}
