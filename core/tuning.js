/**
 * Stats -> script parameters.
 *
 * The whole tuner is one multiplier chain applied to a weapon's normalised
 * recoil, plus a 4-phase timeline that describes how the correction ramps in.
 * Every step pushes a human-readable line into `diagnostics` so the UI and the
 * generated script header can explain where a number came from.
 */

import { getCategory, getGame } from './games.js';
import { clamp } from './weapons.js';

export const DEFAULT_PROFILE = {
  controller: 'xbox',          // 'xbox' | 'playstation'
  sensitivity: 6,
  adsMultiplier: 0.85,
  responseCurve: 'standard',   // 'standard' | 'linear' | 'dynamic'
  strength: 100,               // global trim, %
  deadzone: 5,                 // in-game right stick deadzone, %
  adsOnly: true,               // only compensate while aiming down sights
  rapidFire: 'auto',           // 'auto' | 'on' | 'off'
  stickyAim: true,
  hairTrigger: true,
  antiDeadzone: false,
  adsSlowPercent: 100          // 100 = off; 80 = right stick runs at 80% while firing
};

export function normalizeProfile(raw = {}) {
  const p = { ...DEFAULT_PROFILE, ...raw };
  return {
    controller: p.controller === 'playstation' ? 'playstation' : 'xbox',
    game: p.game || 'generic',
    sensitivity: clamp(Number(p.sensitivity) || DEFAULT_PROFILE.sensitivity, 0.5, 100),
    adsMultiplier: clamp(Number(p.adsMultiplier) || DEFAULT_PROFILE.adsMultiplier, 0.2, 2),
    responseCurve: ['standard', 'linear', 'dynamic'].includes(p.responseCurve) ? p.responseCurve : 'standard',
    strength: clamp(Math.round(Number(p.strength) ?? 100), 0, 200),
    deadzone: clamp(Math.round(Number(p.deadzone) ?? 5), 0, 30),
    adsOnly: p.adsOnly !== false,
    rapidFire: ['auto', 'on', 'off'].includes(p.rapidFire) ? p.rapidFire : 'auto',
    stickyAim: p.stickyAim !== false,
    hairTrigger: p.hairTrigger !== false,
    antiDeadzone: Boolean(p.antiDeadzone),
    adsSlowPercent: clamp(Math.round(Number(p.adsSlowPercent) ?? 100), 50, 100)
  };
}

const round = (n) => Math.round(n);

/** Shots per minute -> ms between rounds. */
export function shotPeriodMs(rpm) {
  return 60000 / clamp(rpm, 30, 2000);
}

/**
 * @param {object} weapon  normalised weapon
 * @param {object} rawProfile user settings
 * @returns tuning parameters + the phase timeline the GPC emitter consumes
 */
export function computeTuning(weapon, rawProfile = {}) {
  const profile = normalizeProfile({ ...rawProfile, game: rawProfile.game || weapon.game });
  const game = getGame(weapon.game || profile.game);
  const category = getCategory(weapon.category);
  const diagnostics = [];

  /* ---- multiplier chain -------------------------------------------- */
  const base = weapon.recoil.vertical;
  const period = shotPeriodMs(weapon.rpm);

  // Faster guns stack more kick between polls, so they need a bigger hold.
  const rpmFactor = clamp(Math.sqrt(weapon.rpm / 600), 0.7, 1.5);

  // Higher in-game sensitivity means the same stick deflection turns further,
  // so the required stick value shrinks.
  const sensFactor = clamp(Math.pow(game.referenceSens / profile.sensitivity, game.sensExponent), 0.4, 2.5);

  // Same idea for the ADS multiplier.
  const adsFactor = clamp(game.referenceAds / profile.adsMultiplier, 0.5, 2);

  // Curves that soften small stick inputs need a larger raw value to move the same amount.
  const curveFactor = game.responseCurves[profile.responseCurve] ?? 1;

  const attachV = weapon.attachments.reduce((acc, a) => acc * (1 + a.recoilVertical), 1);
  const attachH = weapon.attachments.reduce((acc, a) => acc * (1 + a.recoilHorizontal), 1);

  const trim = profile.strength / 100;

  const peakV = clamp(
    round(base * game.recoilGain * rpmFactor * sensFactor * adsFactor * curveFactor * attachV * trim),
    0,
    100
  );

  diagnostics.push(
    `Vertical ${peakV}/100 = recoil ${base} x gain ${game.recoilGain} x rpm ${rpmFactor.toFixed(2)} ` +
    `x sens ${sensFactor.toFixed(2)} x ads ${adsFactor.toFixed(2)} x curve ${curveFactor.toFixed(2)}` +
    (attachV !== 1 ? ` x attachments ${attachV.toFixed(2)}` : '') +
    (trim !== 1 ? ` x trim ${trim.toFixed(2)}` : '')
  );

  // Horizontal is only worth correcting when the weapon pulls consistently to
  // one side. Random shake averages out and fighting it just adds sway.
  const drift = weapon.recoil.drift || 0;
  // push against the drift: a weapon that pulls right needs a stick push left
  const peakH =
    clamp(
      round(weapon.recoil.horizontal * game.recoilGain * rpmFactor * sensFactor * adsFactor * attachH * trim * Math.abs(drift)),
      0,
      60
    ) * Math.sign(drift) * -1 || 0; // `|| 0` collapses -0, which would serialise oddly
  if (drift === 0) {
    diagnostics.push('Horizontal correction off: this weapon has no consistent drift direction.');
  } else {
    diagnostics.push(`Horizontal ${peakH} - countering a ${drift < 0 ? 'left' : 'right'} drift of ${Math.abs(drift).toFixed(2)}.`);
  }

  /* ---- timeline ----------------------------------------------------- */
  // Nothing to correct until the gun has actually kicked: at minimum one round,
  // plus whatever first-shot delay the game and the weapon add.
  const kickMs = round(clamp(Math.max(weapon.recoil.firstShotKickMs, game.kickDelayMs, period * 0.9), 20, 400));
  // Most patterns reach full strength around the 4th round.
  const rampMs = round(clamp(period * 4, 120, 600));
  const phases = weapon.recoil.pattern
    ? phasesFromPattern(weapon, { peakV, peakH, kickMs })
    : syntheticPhases({ peakV, peakH, kickMs, rampMs });

  diagnostics.push(
    weapon.recoil.pattern
      ? `Phase table built from the imported ${weapon.recoil.pattern.length}-point recoil pattern.`
      : `No pattern data - ramping in over ${rampMs}ms after a ${kickMs}ms first-shot delay.`
  );

  /* ---- rapid fire ---------------------------------------------------- */
  const wantsRapid =
    profile.rapidFire === 'on' ||
    (profile.rapidFire === 'auto' && weapon.fireMode === 'semi' && category.rapidFireDefault);
  const rapidTargetRpm = clamp(Math.min(weapon.rpm, game.semiFireCapRpm), 60, game.semiFireCapRpm);
  const rapidPeriod = shotPeriodMs(rapidTargetRpm);
  const holdMs = round(clamp(rapidPeriod * 0.45, 16, 60));
  const restMs = round(Math.max(rapidPeriod - holdMs, 16));
  const rapidFire = {
    enabled: wantsRapid && weapon.fireMode !== 'auto',
    holdMs,
    restMs,
    effectiveRpm: round(60000 / (holdMs + restMs)),
    capRpm: game.semiFireCapRpm
  };
  if (rapidFire.enabled) {
    diagnostics.push(`Rapid fire ${holdMs}ms hold / ${restMs}ms rest = ~${rapidFire.effectiveRpm} RPM (game cap ${game.semiFireCapRpm}).`);
  } else if (weapon.fireMode === 'auto' && profile.rapidFire === 'on') {
    diagnostics.push('Rapid fire skipped: the weapon is already full-auto, pulsing the trigger would slow it down.');
  }

  /* ---- burst assist --------------------------------------------------- */
  const burst = {
    enabled: weapon.fireMode === 'burst' && weapon.burstCount > 1,
    count: weapon.burstCount,
    gapMs: round(clamp(period * 1.6, 60, 400))
  };
  if (burst.enabled) diagnostics.push(`Burst weapon: correction restarts every ${burst.count} rounds with a ${burst.gapMs}ms gap.`);

  /* ---- sticky aim ----------------------------------------------------- */
  const stickyEnabled = profile.stickyAim && game.aimAssist.type !== 'none' && category.stickyScale > 0;
  const sticky = {
    enabled: stickyEnabled,
    radius: stickyEnabled ? clamp(round(game.aimAssist.radius * category.stickyScale * trim), 2, 14) : 0,
    periodMs: stickyEnabled ? clamp(round(game.aimAssist.periodMs), 40, 250) : 0,
    mode: game.aimAssist.type
  };
  if (stickyEnabled) {
    diagnostics.push(`Sticky aim: +/-${sticky.radius} circular micro-movement every ${sticky.periodMs}ms to keep ${game.aimAssist.type} aim assist alive.`);
  } else if (profile.stickyAim) {
    diagnostics.push(`Sticky aim off for this weapon (${game.aimAssist.type === 'none' ? 'game has no aim assist' : category.label + ' handles better without it'}).`);
  }

  /* ---- misc ------------------------------------------------------------ */
  const antiDeadzone = {
    enabled: profile.antiDeadzone && profile.deadzone > 0,
    value: clamp(round(profile.deadzone * 0.9), 0, 25)
  };

  // Releasing the correction when the player makes a real stick input keeps
  // manual tracking from fighting the script.
  const releaseThreshold = clamp(round(20 + peakV * 0.35), 18, 60);

  return {
    weaponId: weapon.id,
    weaponName: weapon.name,
    game: game.id,
    profile,
    antiRecoil: {
      vertical: peakV,
      horizontal: peakH,
      kickMs,
      rampMs,
      releaseThreshold,
      adsOnly: profile.adsOnly,
      phases
    },
    rapidFire,
    burst,
    sticky,
    antiDeadzone,
    hairTrigger: { enabled: profile.hairTrigger, threshold: 12 },
    adsSlow: { enabled: profile.adsSlowPercent < 100, percent: profile.adsSlowPercent },
    shotPeriodMs: round(period),
    diagnostics,
    confidence: estimateConfidence(weapon)
  };
}

function estimateConfidence(weapon) {
  let score = 0.35;
  if (weapon.source === 'preset') score += 0.2;
  if (weapon.recoil.pattern) score += 0.25;
  if (weapon.attachments.length) score += 0.05;
  if (weapon.warnings?.length) score -= 0.1 * weapon.warnings.length;
  if (typeof weapon.confidence === 'number') score = (score + weapon.confidence) / 2;
  return Number(clamp(score, 0.05, 0.95).toFixed(2));
}

/** Fixed 4-slot timeline: [until, vertical, horizontal]. The last slot sustains. */
export const PHASE_COUNT = 4;
const SUSTAIN = 32000; // ms - effectively "forever" for one magazine

function syntheticPhases({ peakV, peakH, kickMs, rampMs }) {
  return [
    { untilMs: kickMs, vertical: 0, horizontal: 0 },
    { untilMs: kickMs + round(rampMs * 0.4), vertical: round(peakV * 0.65), horizontal: round(peakH * 0.5) },
    { untilMs: kickMs + rampMs, vertical: round(peakV * 0.88), horizontal: round(peakH * 0.85) },
    { untilMs: SUSTAIN, vertical: peakV, horizontal: peakH }
  ];
}

/**
 * Collapse an imported recoil pattern into the 4 slots the script carries.
 * Pattern values are relative to the weapon's own peak, so they are rescaled
 * onto the tuned peak rather than used raw.
 */
function phasesFromPattern(weapon, { peakV, peakH, kickMs }) {
  const pattern = weapon.recoil.pattern;
  const maxV = Math.max(...pattern.map((p) => Math.abs(p.vertical)), 1);
  const maxH = Math.max(...pattern.map((p) => Math.abs(p.horizontal)), 1);
  const endMs = Math.max(pattern[pattern.length - 1].atMs, kickMs + 200);
  const usable = pattern.filter((p) => p.atMs >= kickMs);
  const buckets = [];
  const slots = PHASE_COUNT - 1; // slot 0 is always the pre-kick dead zone
  for (let i = 0; i < slots; i++) {
    const from = kickMs + ((endMs - kickMs) * i) / slots;
    const to = kickMs + ((endMs - kickMs) * (i + 1)) / slots;
    const inBucket = usable.filter((p) => p.atMs >= from && p.atMs <= to);
    const sample = inBucket.length ? inBucket : [usable[Math.min(i, usable.length - 1)] || pattern[pattern.length - 1]];
    const avgV = sample.reduce((s, p) => s + p.vertical, 0) / sample.length;
    const avgH = sample.reduce((s, p) => s + p.horizontal, 0) / sample.length;
    buckets.push({
      untilMs: i === slots - 1 ? SUSTAIN : round(to),
      vertical: clamp(round((avgV / maxV) * peakV), 0, 100),
      horizontal: clamp(round((avgH / maxH) * Math.abs(peakH)), 0, 60) * (peakH < 0 ? -1 : 1)
    });
  }
  return [{ untilMs: round(kickMs), vertical: 0, horizontal: 0 }, ...buckets];
}
