/**
 * Stats -> script parameters.
 *
 * The whole tuner is one multiplier chain applied to a weapon's normalised
 * recoil, plus a 4-phase timeline that describes how the correction ramps in.
 * Every step pushes a human-readable line into `diagnostics` so the UI and the
 * generated script header can explain where a number came from.
 */

import { getCategory, getGame } from './games.js';
import { clamp, OVERRIDE_SPEC } from './weapons.js';

export const DEFAULT_PROFILE = {
  controller: 'xbox',          // 'xbox' | 'playstation'
  sensitivity: 6,
  adsMultiplier: 0.85,
  responseCurve: 'standard',   // 'standard' | 'linear' | 'dynamic'
  verticalSensMultiplier: 1,   // games with a separate vertical stick multiplier
  fov: 0,                      // 0 = "use the game default"; otherwise your FOV slider
  fovRelativeAds: false,       // the game's "ADS sens relative to FOV" style setting
  aimAssist: 'standard',       // 'off' | 'standard' | 'strong' | 'precision'
  strength: 100,               // global trim, %
  deadzone: 5,                 // in-game right stick deadzone, %

  /**
   * Anything the tuner does not model natively. Each entry names a setting from
   * your game, records its value, and says what it should do to the script:
   * { id, name, value, affects: 'vertical'|'horizontal'|'sticky'|'rapidFire'|'none', adjust: -75..100 }
   * `adjust` is a percentage applied to that target, so a setting you know makes
   * a gun kick 10% harder is {affects: 'vertical', adjust: 10}.
   */
  customSettings: [],
  adsOnly: true,               // only compensate while aiming down sights
  rapidFire: 'auto',           // 'auto' | 'on' | 'off'
  hairTrigger: true,
  antiDeadzone: false,
  adsSlowPercent: 100,         // 100 = off; 80 = right stick runs at 80% while firing

  /* ---- recoil control ---- */
  horizontalEnabled: true,     // apply horizontal correction at all
  rampSpeed: 'normal',         // 'instant' | 'fast' | 'normal' | 'slow' - how fast the pull fades in
  kickDelayTrim: 0,            // ms added to (or taken off) the first-shot delay
  releaseScale: 100,           // % trim on how much of your own stick input cancels the pull

  /* ---- sticky aim ---- */
  stickyAim: true,
  stickyStrength: 100,         // % trim on the micro-movement radius
  stickySpeed: 100,            // % - higher is a faster circle (shorter step)
  stickyShape: 'circle',       // 'circle' | 'horizontal' | 'vertical' | 'diagonal'
  stickyWhen: 'ads'            // 'ads' | 'ads_fire' | 'always'
};

export const RAMP_SPEEDS = { instant: 0.25, fast: 0.6, normal: 1, slow: 1.7 };

/** In-game aim assist setting -> how much artificial movement is still worth adding. */
export const AIM_ASSIST_SETTINGS = {
  off: { label: 'Off / none', sticky: 0 },
  standard: { label: 'Standard', sticky: 1 },
  strong: { label: 'Strong / high', sticky: 0.8 },
  precision: { label: 'Precision / focusing', sticky: 0.85 }
};

export const CUSTOM_TARGETS = ['vertical', 'horizontal', 'sticky', 'rapidFire', 'none'];

let customSeq = 0;

/** Validate the user's own settings list; anything unusable is dropped, not guessed at. */
export function normalizeCustomSettings(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && String(row.name || '').trim())
    .slice(0, 24)
    .map((row) => ({
      id: String(row.id || `cs${++customSeq}`).slice(0, 40),
      name: String(row.name).trim().slice(0, 48),
      value: String(row.value ?? '').trim().slice(0, 32),
      affects: CUSTOM_TARGETS.includes(row.affects) ? row.affects : 'none',
      adjust: clamp(Math.round(Number(row.adjust) || 0), -75, 100)
    }));
}
export const STICKY_SHAPES = ['circle', 'horizontal', 'vertical', 'diagonal'];
export const STICKY_WHEN = ['ads', 'ads_fire', 'always'];

export function normalizeProfile(raw = {}) {
  const p = { ...DEFAULT_PROFILE, ...raw };
  return {
    controller: p.controller === 'playstation' ? 'playstation' : 'xbox',
    game: p.game || 'generic',
    sensitivity: clamp(Number(p.sensitivity) || DEFAULT_PROFILE.sensitivity, 0.5, 100),
    adsMultiplier: clamp(Number(p.adsMultiplier) || DEFAULT_PROFILE.adsMultiplier, 0.2, 2),
    responseCurve: ['standard', 'linear', 'dynamic'].includes(p.responseCurve) ? p.responseCurve : 'standard',
    verticalSensMultiplier: clamp(Number(p.verticalSensMultiplier) || 1, 0.2, 3),
    fov: p.fov ? clamp(Math.round(Number(p.fov)), 50, 150) : 0,
    fovRelativeAds: Boolean(p.fovRelativeAds),
    aimAssist: AIM_ASSIST_SETTINGS[p.aimAssist] ? p.aimAssist : 'standard',
    customSettings: normalizeCustomSettings(p.customSettings),
    strength: clamp(Math.round(Number(p.strength) ?? 100), 0, 200),
    deadzone: clamp(Math.round(Number(p.deadzone) ?? 5), 0, 30),
    adsOnly: p.adsOnly !== false,
    rapidFire: ['auto', 'on', 'off'].includes(p.rapidFire) ? p.rapidFire : 'auto',
    stickyAim: p.stickyAim !== false,
    hairTrigger: p.hairTrigger !== false,
    antiDeadzone: Boolean(p.antiDeadzone),
    adsSlowPercent: clamp(Math.round(Number(p.adsSlowPercent) ?? 100), 50, 100),

    horizontalEnabled: p.horizontalEnabled !== false,
    rampSpeed: RAMP_SPEEDS[p.rampSpeed] ? p.rampSpeed : 'normal',
    kickDelayTrim: clamp(Math.round(Number(p.kickDelayTrim) || 0), -150, 400),
    releaseScale: clamp(Math.round(Number(p.releaseScale) ?? 100), 50, 200),

    stickyStrength: clamp(Math.round(Number(p.stickyStrength) ?? 100), 0, 200),
    stickySpeed: clamp(Math.round(Number(p.stickySpeed) ?? 100), 50, 200),
    stickyShape: STICKY_SHAPES.includes(p.stickyShape) ? p.stickyShape : 'circle',
    stickyWhen: STICKY_WHEN.includes(p.stickyWhen) ? p.stickyWhen : 'ads'
  };
}

const round = (n) => Math.round(n);

const TARGET_LABEL = {
  vertical: 'the vertical pull',
  horizontal: 'the horizontal pull',
  sticky: 'the sticky aim radius',
  rapidFire: 'the fire rate'
};

/** Combined multiplier from the player's own settings for one target. */
function customFactor(profile, target) {
  return (profile.customSettings || [])
    .filter((setting) => setting.affects === target)
    .reduce((acc, setting) => acc * (1 + setting.adjust / 100), 1);
}

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

  // A separate vertical stick multiplier moves the vertical axis only.
  const vertSensFactor = clamp(1 / profile.verticalSensMultiplier, 0.33, 3);

  // FOV only changes the maths when the game ties aim speed to it ("relative"
  // ADS sensitivity). On a fixed-sensitivity setup a wider FOV does not make the
  // gun any easier to hold, however much it looks that way.
  const fov = profile.fov || game.referenceFov;
  const fovFactor = profile.fovRelativeAds ? clamp(game.referenceFov / fov, 0.5, 2) : 1;

  const attachV = weapon.attachments.reduce((acc, a) => acc * (1 + a.recoilVertical), 1);
  const attachH = weapon.attachments.reduce((acc, a) => acc * (1 + a.recoilHorizontal), 1);

  const trim = profile.strength / 100;
  const ov = weapon.overrides || {};
  const overridden = [];
  // What the tuner worked out on its own. Overrides replace the live values but
  // never these, so the UI can always show "auto (32)" next to a hand-set field.
  const auto = {};

  const customV = customFactor(profile, 'vertical');
  const customH = customFactor(profile, 'horizontal');

  let peakV = clamp(
    round(base * game.recoilGain * rpmFactor * sensFactor * adsFactor * curveFactor *
          vertSensFactor * fovFactor * attachV * trim * customV),
    0,
    100
  );

  diagnostics.push(
    `Vertical ${peakV}/100 = recoil ${base} x gain ${game.recoilGain} x rpm ${rpmFactor.toFixed(2)} ` +
    `x sens ${sensFactor.toFixed(2)} x ads ${adsFactor.toFixed(2)} x curve ${curveFactor.toFixed(2)}` +
    (attachV !== 1 ? ` x attachments ${attachV.toFixed(2)}` : '') +
    (vertSensFactor !== 1 ? ` x vertical sens ${vertSensFactor.toFixed(2)}` : '') +
    (fovFactor !== 1 ? ` x fov ${fovFactor.toFixed(2)}` : '') +
    (attachV !== 1 ? '' : '') +
    (trim !== 1 ? ` x trim ${trim.toFixed(2)}` : '') +
    (customV !== 1 ? ` x your settings ${customV.toFixed(2)}` : '')
  );

  if (profile.fov && !profile.fovRelativeAds) {
    diagnostics.push(`FOV ${profile.fov} noted but not applied - your game's aim speed is not tied to FOV, so the pull is unchanged.`);
  } else if (fovFactor !== 1) {
    diagnostics.push(`FOV ${fov} vs the ${game.referenceFov} these stats assume, with FOV-relative aim: pull scaled by ${fovFactor.toFixed(2)}.`);
  }

  auto.antiRecoilVertical = peakV;
  if (ov.antiRecoilVertical !== undefined) {
    diagnostics.push(`Vertical set by hand: ${peakV} -> ${ov.antiRecoilVertical} (calculated value ignored).`);
    peakV = ov.antiRecoilVertical;
    overridden.push('antiRecoilVertical');
  }

  // Horizontal is only worth correcting when the weapon pulls consistently to
  // one side. Random shake averages out and fighting it just adds sway.
  const drift = weapon.recoil.drift || 0;
  // push against the drift: a weapon that pulls right needs a stick push left
  let peakH =
    clamp(
      round(weapon.recoil.horizontal * game.recoilGain * rpmFactor * sensFactor * adsFactor * fovFactor *
            attachH * trim * customH * Math.abs(drift)),
      0,
      60
    ) * Math.sign(drift) * -1 || 0; // `|| 0` collapses -0, which would serialise oddly
  if (!profile.horizontalEnabled && peakH !== 0) {
    diagnostics.push(`Horizontal correction switched off in your settings (would have been ${peakH}).`);
    peakH = 0;
  } else if (drift === 0) {
    diagnostics.push('Horizontal correction off: this weapon has no consistent drift direction.');
  } else {
    diagnostics.push(`Horizontal ${peakH} - countering a ${drift < 0 ? 'left' : 'right'} drift of ${Math.abs(drift).toFixed(2)}.`);
  }

  auto.antiRecoilHorizontal = peakH;
  if (ov.antiRecoilHorizontal !== undefined) {
    diagnostics.push(`Horizontal set by hand: ${peakH} -> ${ov.antiRecoilHorizontal}.`);
    peakH = ov.antiRecoilHorizontal;
    overridden.push('antiRecoilHorizontal');
  }

  /* ---- timeline ----------------------------------------------------- */
  // Nothing to correct until the gun has actually kicked: at minimum one round,
  // plus whatever first-shot delay the game and the weapon add.
  let kickMs = round(clamp(
    Math.max(weapon.recoil.firstShotKickMs, game.kickDelayMs, period * 0.9) + profile.kickDelayTrim,
    0, 800
  ));
  if (profile.kickDelayTrim !== 0) {
    diagnostics.push(`Start delay trimmed by ${profile.kickDelayTrim > 0 ? '+' : ''}${profile.kickDelayTrim}ms -> ${kickMs}ms.`);
  }
  auto.kickMs = kickMs;
  if (ov.kickMs !== undefined) {
    diagnostics.push(`Start delay set by hand: ${kickMs}ms -> ${ov.kickMs}ms.`);
    kickMs = ov.kickMs;
    overridden.push('kickMs');
  }

  // Most patterns reach full strength around the 4th round; ramp speed scales that.
  const rampScale = RAMP_SPEEDS[profile.rampSpeed];
  const rampMs = round(clamp(period * 4 * rampScale, 60, 900));
  if (profile.rampSpeed !== 'normal') {
    diagnostics.push(`Ramp speed "${profile.rampSpeed}" - full strength ${rampMs}ms after the pull instead of ${round(clamp(period * 4, 60, 900))}ms.`);
  }
  const phases = weapon.recoil.pattern
    ? phasesFromPattern(weapon, { peakV, peakH, kickMs })
    : syntheticPhases({ peakV, peakH, kickMs, rampMs });

  diagnostics.push(
    weapon.recoil.pattern
      ? `Phase table built from the imported ${weapon.recoil.pattern.length}-point recoil pattern.`
      : `No pattern data - ramping in over ${rampMs}ms after a ${kickMs}ms first-shot delay.`
  );

  /* ---- rapid fire ---------------------------------------------------- */
  const rapidMode = ov.rapidFire || profile.rapidFire;
  if (ov.rapidFire) overridden.push('rapidFire');
  const wantsRapid =
    rapidMode === 'on' ||
    (rapidMode === 'auto' && weapon.fireMode === 'semi' && category.rapidFireDefault);
  const rapidTargetRpm = clamp(
    Math.min(weapon.rpm, game.semiFireCapRpm) * customFactor(profile, 'rapidFire'),
    60,
    game.semiFireCapRpm
  );
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
  } else if (weapon.fireMode === 'auto' && rapidMode === 'on') {
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
  const aimAssistSetting = AIM_ASSIST_SETTINGS[profile.aimAssist] || AIM_ASSIST_SETTINGS.standard;
  const autoSticky =
    profile.stickyAim && game.aimAssist.type !== 'none' && category.stickyScale > 0 && aimAssistSetting.sticky > 0;
  if (profile.stickyAim && profile.aimAssist === 'off' && game.aimAssist.type !== 'none') {
    diagnostics.push('Aim assist is off in your settings, so sticky aim is skipped - there is no assist to keep awake.');
  }
  let stickyEnabled = autoSticky;
  if (ov.sticky) {
    stickyEnabled = ov.sticky === 'on';
    overridden.push('sticky');
  }

  const stickyTrim = (profile.stickyStrength / 100) * aimAssistSetting.sticky * customFactor(profile, 'sticky');
  let stickyRadius = stickyEnabled
    ? clamp(round((game.aimAssist.radius || 5) * category.stickyScale * stickyTrim || 0), 0, 20)
    : 0;
  let stickyPeriod = stickyEnabled
    ? clamp(round((game.aimAssist.periodMs || 100) * (100 / profile.stickySpeed)), 20, 400)
    : 0;

  auto.sticky = autoSticky ? 'on' : 'off';
  auto.stickyRadius = stickyRadius;
  auto.stickyPeriodMs = stickyPeriod;
  if (stickyEnabled && ov.stickyRadius !== undefined) {
    stickyRadius = ov.stickyRadius;
    overridden.push('stickyRadius');
  }
  if (stickyEnabled && ov.stickyPeriodMs !== undefined) {
    stickyPeriod = ov.stickyPeriodMs;
    overridden.push('stickyPeriodMs');
  }
  if (stickyEnabled && stickyRadius === 0) stickyEnabled = false;   // 0 radius is just "off"

  const sticky = {
    enabled: stickyEnabled,
    radius: stickyEnabled ? stickyRadius : 0,
    periodMs: stickyEnabled ? stickyPeriod : 0,
    shape: profile.stickyShape,
    when: profile.stickyWhen,
    mode: game.aimAssist.type
  };

  const WHEN_LABEL = { ads: 'while aiming', ads_fire: 'while aiming and firing', always: 'all the time' };
  if (stickyEnabled) {
    diagnostics.push(
      `Sticky aim: +/-${sticky.radius} ${sticky.shape} micro-movement every ${sticky.periodMs}ms ${WHEN_LABEL[sticky.when]}, ` +
      `keeping ${game.aimAssist.type} aim assist alive.`
    );
  } else if (ov.sticky === 'off') {
    diagnostics.push('Sticky aim switched off for this weapon.');
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
  let releaseThreshold = clamp(round((20 + peakV * 0.35) * (profile.releaseScale / 100)), 5, 100);
  auto.releaseThreshold = releaseThreshold;
  if (ov.releaseThreshold !== undefined) {
    releaseThreshold = ov.releaseThreshold;
    overridden.push('releaseThreshold');
  }
  if (profile.releaseScale !== 100 || ov.releaseThreshold !== undefined) {
    diagnostics.push(`Your own stick input cancels the pull past ${releaseThreshold} units.`);
  }

  for (const setting of profile.customSettings) {
    if (setting.affects === 'none') {
      diagnostics.push(`Your setting "${setting.name}${setting.value ? `: ${setting.value}` : ''}" is recorded in the script header only.`);
    } else {
      diagnostics.push(
        `Your setting "${setting.name}${setting.value ? `: ${setting.value}` : ''}" ` +
        `${setting.adjust >= 0 ? 'raises' : 'lowers'} ${TARGET_LABEL[setting.affects]} by ${Math.abs(setting.adjust)}%.`
      );
    }
  }

  // A pull smaller than the in-game deadzone never reaches the game at all.
  if (peakV > 0 && peakV <= profile.deadzone) {
    diagnostics.push(
      `WARNING: your in-game deadzone is ${profile.deadzone} and the pull is only ${peakV}, so the game will ` +
      'ignore it. Turn on anti-deadzone, raise the strength trim, or lower the deadzone.'
    );
  }

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
    overridden,
    auto,
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
