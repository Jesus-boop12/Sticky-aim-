/**
 * GPC emitter.
 *
 * Produces a single Cronus (Zen / Titan) GPC script that carries one tuned
 * profile per weapon slot, switchable on the controller. The script sticks to
 * core GPC only - define / const arrays / main / combo / set_val / get_val /
 * get_rtime / event_press / combo_run - so it compiles on any Cronus firmware
 * without per-device extensions.
 *
 * Layout of the generated file:
 *   1. header comment  - what was generated, from which stats, and how to trim it
 *   2. layout defines  - controller bindings
 *   3. switches        - global on/off values you can edit by hand
 *   4. weapon tables   - one column per slot, PHASES entries per slot
 *   5. main            - hair trigger -> anti-deadzone -> ADS slow -> anti-recoil
 *   6. combos          - rapid fire, sticky aim, rumble feedback
 */

import { PHASE_COUNT } from './tuning.js';
import { UNIVERSAL_CLASSES } from './universal.js';
import { getCategory, getGame } from './games.js';

const MAX_SLOTS = 8;

const LAYOUTS = {
  xbox: {
    label: 'Xbox / PC (XB1 layout)',
    fire: 'XB1_RT', ads: 'XB1_LT', rx: 'XB1_RX', ry: 'XB1_RY',
    up: 'XB1_UP', down: 'XB1_DOWN', left: 'XB1_LEFT', right: 'XB1_RIGHT', swap: 'XB1_Y',
    mods: { view: 'XB1_VIEW', menu: 'XB1_MENU', lb: 'XB1_LB', rb: 'XB1_RB', ls: 'XB1_LS', rs: 'XB1_RS' }
  },
  playstation: {
    label: 'PlayStation (PS4/PS5 layout)',
    fire: 'PS4_R2', ads: 'PS4_L2', rx: 'PS4_RX', ry: 'PS4_RY',
    up: 'PS4_UP', down: 'PS4_DOWN', left: 'PS4_LEFT', right: 'PS4_RIGHT', swap: 'PS4_TRIANGLE',
    mods: { view: 'PS4_SHARE', menu: 'PS4_OPTIONS', lb: 'PS4_L1', rb: 'PS4_R1', ls: 'PS4_L3', rs: 'PS4_R3' }
  }
};

export function listLayouts() {
  return Object.entries(LAYOUTS).map(([id, l]) => ({
    id,
    label: l.label,
    modButtons: Object.entries(l.mods).map(([key, name]) => ({ key, name }))
  }));
}

/**
 * The micro-movement each sticky-aim shape traces. Every step is additive and
 * clamped, so it rides on top of whatever the player and the anti-recoil are
 * already doing to the stick.
 */
const STICKY_STEPS = {
  circle:     [['RX', 1], ['RY', 1], ['RX', -1], ['RY', -1]],
  horizontal: [['RX', 1], ['RX', -1]],
  vertical:   [['RY', 1], ['RY', -1]],
  diagonal:   [['RX', 1, 'RY', 1], ['RX', -1, 'RY', 1], ['RX', -1, 'RY', -1], ['RX', 1, 'RY', -1]]
};

const STICKY_WHEN_TEXT = {
  ads: 'while aiming down sights',
  ads_fire: 'while aiming AND firing',
  always: 'at all times'
};

function stickyComboBody(shape) {
  const steps = STICKY_STEPS[shape] || STICKY_STEPS.circle;
  const lines = [];
  for (const step of steps) {
    for (let i = 0; i < step.length; i += 2) {
      const axis = `STICK_${step[i]}`;
      const sign = step[i + 1] > 0 ? '+' : '-';
      lines.push(`    set_val(${axis}, lim(get_val(${axis}) ${sign} sticky_r));`);
    }
    lines.push('    wait(sticky_ms);');
  }
  return lines;
}

function stickyCondition(when) {
  if (when === 'always') return 'mods_on && STICKY_ON[slot]';
  if (when === 'ads_fire') return 'mods_on && STICKY_ON[slot] && aiming && firing';
  return 'mods_on && STICKY_ON[slot] && aiming';
}

const pad = (s, n) => String(s).padEnd(n);
const gpcBool = (v) => (v ? 'TRUE' : 'FALSE');

function sanitize(text, max = 60) {
  return String(text).replace(/[^\x20-\x7E]/g, '').replace(/\*\//g, '* /').slice(0, max);
}

/** Fold a long diagnostic across comment lines instead of truncating it. */
function wrapComment(text, width) {
  const words = sanitize(text, 400).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && (line + ' ' + word).length > width) {
      lines.push(line);
      line = '  ' + word;   // indent the continuation
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function table(type, name, values, comment) {
  return `const ${type} ${name}[] = { ${values.join(', ')} };${comment ? `   // ${comment}` : ''}`;
}

/**
 * @param {Array<{weapon:object, tuning:object}>} entries  one per slot
 * @param {object} options { title, modButton, author, tickTune }
 */
export function buildGpcScript(entries, options = {}) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('Add at least one weapon before generating a script.');
  }
  const slots = entries.slice(0, MAX_SLOTS);
  const first = slots[0].tuning;
  const layout = LAYOUTS[first.profile.controller] || LAYOUTS.xbox;
  const modKey = options.modButton && layout.mods[options.modButton] ? options.modButton : 'view';
  const modButton = layout.mods[modKey];
  const game = getGame(slots[0].weapon.game);
  const title = sanitize(options.title || `${game.name} - ${slots.map((s) => s.weapon.name).join(' / ')}`, 58);
  const author = sanitize(options.author || 'Sticky Aim Studio', 30);
  const generated = options.now || new Date().toISOString().replace('T', ' ').slice(0, 16);

  const anyRapid = slots.some((s) => s.tuning.rapidFire.enabled);
  const anySticky = slots.some((s) => s.tuning.sticky.enabled);
  const anyBurst = slots.some((s) => s.tuning.burst.enabled);

  /* ---------------- header ---------------- */
  const head = [];
  head.push('/* ==========================================================================');
  head.push(` *  ${title}`);
  head.push(' *  --------------------------------------------------------------------------');
  head.push(` *  Game        : ${sanitize(game.name)}`);
  head.push(` *  Controller  : ${layout.label}`);
  head.push(` *  Author      : ${author}`);
  head.push(` *  Generated   : ${generated} by Sticky Aim Weapon Studio`);
  head.push(` *  Settings    : sens ${first.profile.sensitivity}, ADS x${first.profile.adsMultiplier}, ` +
            `${first.profile.responseCurve} curve, deadzone ${first.profile.deadzone}, trim ${first.profile.strength}%`);
  const extra = [];
  if (first.profile.fov) extra.push(`FOV ${first.profile.fov}${first.profile.fovRelativeAds ? ' (relative ADS)' : ''}`);
  if (first.profile.verticalSensMultiplier !== 1) extra.push(`vertical sens x${first.profile.verticalSensMultiplier}`);
  if (first.profile.aimAssist !== 'standard') extra.push(`aim assist: ${first.profile.aimAssist}`);
  if (extra.length) head.push(` *                ${sanitize(extra.join(', '), 90)}`);
  if (first.profile.customSettings?.length) {
    head.push(' *');
    head.push(' *  YOUR OWN GAME SETTINGS');
    first.profile.customSettings.forEach((setting) => {
      const effect = setting.affects === 'none'
        ? 'noted only'
        : `${setting.adjust >= 0 ? '+' : ''}${setting.adjust}% ${setting.affects}`;
      head.push(` *   ${pad(sanitize(setting.name, 26), 26)} ${pad(sanitize(setting.value, 18), 18)} ${effect}`);
    });
    head.push(' *   (re-generate from the app if you change any of these in game)');
  }
  head.push(' *');
  head.push(' *  SLOTS');
  const anyOverride = slots.some(({ tuning }) => (tuning.overridden || []).length > 0);
  slots.forEach(({ weapon, tuning }, i) => {
    const set = new Set(tuning.overridden || []);
    const mark = (key, value) => `${value}${set.has(key) ? '*' : ''}`;
    head.push(
      ` *   ${i} ${pad(sanitize(weapon.name, 22), 22)} ${pad(getCategory(weapon.category).label, 14)}` +
      ` V:${pad(mark('antiRecoilVertical', tuning.antiRecoil.vertical), 4)}` +
      ` H:${pad(mark('antiRecoilHorizontal', tuning.antiRecoil.horizontal), 5)}` +
      ` RF:${pad(mark('rapidFire', tuning.rapidFire.enabled ? tuning.rapidFire.effectiveRpm + 'rpm' : 'off'), 9)}` +
      ` Sticky:${mark('sticky', tuning.sticky.enabled ? '+/-' + tuning.sticky.radius : 'off')}`
    );
  });
  if (anyOverride) head.push(' *   (* = value you set by hand; the calculated one was ignored)');
  head.push(' *');
  head.push(' *  RECOIL CONTROL');
  head.push(` *   Applied        : ${first.antiRecoil.adsOnly ? 'while aiming down sights' : 'whenever you fire'}`);
  head.push(` *   Ramp speed     : ${first.profile.rampSpeed} (correction fades in over the PH_UNTIL phases)`);
  head.push(` *   Horizontal     : ${first.profile.horizontalEnabled ? 'on, only for weapons with a consistent drift' : 'off (your setting)'}`);
  head.push(` *   Release        : your own stick input past AR_RELEASE cancels the pull`);
  head.push(' *');
  head.push(' *  STICKY AIM');
  if (anySticky) {
    head.push(` *   Shape          : ${first.sticky.shape} micro-movement`);
    head.push(` *   Active         : ${STICKY_WHEN_TEXT[first.sticky.when] || 'while aiming down sights'}`);
    head.push(' *   Size / speed   : STICKY_R[] units per step, STICKY_MS[] ms per step');
  } else {
    head.push(' *   Off for every slot in this script.');
  }
  head.push(' *');
  head.push(' *  CONTROLS');
  head.push(` *   Hold ${pad(modButton, 12)} + D-PAD RIGHT/LEFT : next / previous weapon slot`);
  head.push(` *   Hold ${pad(modButton, 12)} + D-PAD DOWN       : master on/off`);
  head.push(` *   Hold ${pad(modButton, 12)} + D-PAD UP         : rumble out the current slot number`);
  head.push(' *   (the modifier button itself is blocked while held, so nothing fires in game)');
  head.push(' *');
  head.push(' *  TRIMMING');
  head.push(' *   Too much correction -> lower the numbers in PH_V[] for that slot.');
  head.push(' *   Gun still climbs    -> raise them, ~2 units at a time.');
  head.push(' *   Correction too soon -> raise the first value in PH_UNTIL[] for that slot.');
  head.push(' *   Fighting your aim   -> lower AR_RELEASE[] for that slot.');
  head.push(' *');
  head.push(' *  HOW EACH SLOT WAS DERIVED');
  slots.forEach(({ weapon, tuning }, i) => {
    head.push(` *   [${i}] ${sanitize(weapon.name, 30)} - ${weapon.rpm} RPM, ${weapon.fireMode}, ` +
              `recoil ${weapon.recoil.vertical}/${weapon.recoil.horizontal} (source: ${weapon.source}, confidence ${tuning.confidence})`);
    tuning.diagnostics.forEach((d) => wrapComment(d, 96).forEach((line) => head.push(` *        ${line}`)));
    (weapon.warnings || []).forEach((w) => head.push(` *        ! ${sanitize(w, 100)}`));
  });
  head.push(' *');
  head.push(' *  These values are a calculated starting point, not a guarantee. Verify every');
  head.push(' *  slot on a practice range and trim before you rely on it.');
  head.push(' * ========================================================================== */');

  /* ---------------- tables ---------------- */
  const phUntil = [];
  const phV = [];
  const phH = [];
  slots.forEach(({ tuning }) => {
    const phases = tuning.antiRecoil.phases.slice(0, PHASE_COUNT);
    while (phases.length < PHASE_COUNT) phases.push(phases[phases.length - 1]);
    phases.forEach((p) => {
      phUntil.push(Math.round(p.untilMs));
      phV.push(Math.round(p.vertical));
      phH.push(Math.round(p.horizontal));
    });
  });

  const body = [];
  body.push('');
  // No #pragma METAINFO here: that is Gtuner / Titan syntax, and Zen Studio's
  // compiler rejects it outright ("Expected a top-level declaration. Got
  // 'pragma'"). The name and author live in the header comment instead.
  body.push('/* ---------------- controller layout ---------------- */');
  body.push(`define BTN_FIRE   = ${layout.fire};`);
  body.push(`define BTN_ADS    = ${layout.ads};`);
  body.push(`define STICK_RX   = ${layout.rx};`);
  body.push(`define STICK_RY   = ${layout.ry};   // positive = down, which is what fights muzzle climb`);
  body.push(`define BTN_MOD    = ${modButton};`);
  body.push(`define DPAD_UP    = ${layout.up};`);
  body.push(`define DPAD_DOWN  = ${layout.down};`);
  body.push(`define DPAD_LEFT  = ${layout.left};`);
  body.push(`define DPAD_RIGHT = ${layout.right};`);
  body.push('');
  body.push('/* ---------------- global switches ---------------- */');
  body.push(`define WEAPON_COUNT   = ${slots.length};`);
  body.push(`define PHASES         = ${PHASE_COUNT};`);
  body.push(`define ADS_ONLY       = ${gpcBool(first.antiRecoil.adsOnly)};   // compensate only while aiming down sights`);
  body.push('define FIRE_POINT     = 10;      // trigger value that counts as "firing"');
  body.push('define ADS_POINT      = 10;');
  body.push(`define HAIR_TRIGGER   = ${gpcBool(first.hairTrigger.enabled)};`);
  body.push(`define HAIR_POINT     = ${first.hairTrigger.threshold};      // pull past this and the trigger goes to 100%`);
  body.push(`define ANTI_DEADZONE  = ${first.antiDeadzone.enabled ? first.antiDeadzone.value : 0};       // 0 = off`);
  body.push(`define ADS_SLOW       = ${first.adsSlow.enabled ? first.adsSlow.percent : 100};     // right stick % while aiming (100 = off)`);
  body.push(`define START_SLOT     = ${Math.min(Math.max(Number(options.startSlot) || 0, 0), slots.length - 1)};`);
  if (anySticky) {
    body.push(`/* sticky aim: ${first.sticky.shape} shape, active ${STICKY_WHEN_TEXT[first.sticky.when] || 'while aiming'} */`);
  }
  body.push('');
  body.push('/* ---------------- weapon tables (one block of PHASES per slot) ---------------- */');
  body.push(table('int16', 'PH_UNTIL', phUntil, 'ms since trigger pull that each phase ends'));
  body.push(table('int8 ', 'PH_V', phV, 'vertical stick push for that phase'));
  body.push(table('int8 ', 'PH_H', phH, 'horizontal stick push (+ = right)'));
  body.push(table('int8 ', 'AR_RELEASE', slots.map((s) => s.tuning.antiRecoil.releaseThreshold), 'your own stick input that cancels the pull'));
  body.push(table('int8 ', 'RF_ON', slots.map((s) => (s.tuning.rapidFire.enabled ? 1 : 0)), 'rapid fire per slot'));
  body.push(table('int16', 'RF_HOLD', slots.map((s) => s.tuning.rapidFire.holdMs), 'ms the trigger is held'));
  body.push(table('int16', 'RF_REST', slots.map((s) => s.tuning.rapidFire.restMs), 'ms the trigger is released'));
  body.push(table('int8 ', 'STICKY_ON', slots.map((s) => (s.tuning.sticky.enabled ? 1 : 0)), 'sticky aim per slot'));
  body.push(table('int8 ', 'STICKY_R', slots.map((s) => s.tuning.sticky.radius), 'micro-movement radius'));
  body.push(table('int16', 'STICKY_MS', slots.map((s) => s.tuning.sticky.periodMs || 100), 'ms per step'));
  if (anyBurst) {
    body.push(table('int16', 'BURST_CYCLE', slots.map((s) => (s.tuning.burst.enabled
      ? Math.round(s.tuning.shotPeriodMs * s.tuning.burst.count + s.tuning.burst.gapMs)
      : 0)), 'burst length + gap; 0 = not a burst weapon'));
  }
  body.push('');
  body.push('/* ---------------- state ---------------- */');
  body.push('int slot;');
  body.push('int mods_on;');
  body.push('int fire_ms;');
  body.push('int idx;');
  body.push('int arv;');
  body.push('int arh;');
  body.push('int rf_hold;');
  body.push('int rf_rest;');
  body.push('int sticky_r;');
  body.push('int sticky_ms;');
  body.push('int blips;');
  body.push('int firing;');
  body.push('int aiming;');
  body.push('');
  body.push('init {');
  body.push('    slot = START_SLOT;');
  body.push('    mods_on = TRUE;');
  body.push('    blips = START_SLOT + 1;');
  body.push('}');
  body.push('');
  body.push('main {');
  body.push('    /* ---- modifier layer: slot select + master toggle ---- */');
  body.push('    if(get_val(BTN_MOD)) {');
  body.push('        set_val(BTN_MOD, 0);            // swallow the button so the game never sees it');
  body.push('        set_val(DPAD_UP, 0);');
  body.push('        set_val(DPAD_DOWN, 0);');
  body.push('        set_val(DPAD_LEFT, 0);');
  body.push('        set_val(DPAD_RIGHT, 0);');
  body.push('        if(event_press(DPAD_RIGHT)) {');
  body.push('            slot = slot + 1;');
  body.push('            if(slot >= WEAPON_COUNT) slot = 0;');
  body.push('            blips = slot + 1;');
  body.push('        }');
  body.push('        if(event_press(DPAD_LEFT)) {');
  body.push('            slot = slot - 1;');
  body.push('            if(slot < 0) slot = WEAPON_COUNT - 1;');
  body.push('            blips = slot + 1;');
  body.push('        }');
  body.push('        if(event_press(DPAD_DOWN)) {');
  body.push('            if(mods_on) { mods_on = FALSE; blips = 3; }');
  body.push('            else        { mods_on = TRUE;  blips = 1; }');
  body.push('        }');
  body.push('        if(event_press(DPAD_UP)) blips = slot + 1;');
  body.push('    }');
  body.push('');
  body.push('    if(blips > 0 && !combo_running(FEEDBACK)) combo_run(FEEDBACK);');
  body.push('');
  body.push('    /* ---- hair trigger: kill the dead travel on the analog triggers ---- */');
  body.push('    if(HAIR_TRIGGER && mods_on) {');
  body.push('        if(get_val(BTN_FIRE) > HAIR_POINT) set_val(BTN_FIRE, 100);');
  body.push('        if(get_val(BTN_ADS) > HAIR_POINT) set_val(BTN_ADS, 100);');
  body.push('    }');
  body.push('');
  body.push('    if(get_val(BTN_FIRE) > FIRE_POINT) firing = TRUE; else firing = FALSE;');
  body.push('    if(get_val(BTN_ADS) > ADS_POINT) aiming = TRUE; else aiming = FALSE;');
  body.push('');
  body.push('    /* every block below is gated on mods_on - master off passes the pad straight through */');
  body.push('    /* ---- anti-deadzone: small stick inputs actually move the camera ---- */');
  body.push('    if(mods_on && ANTI_DEADZONE > 0) {');
  body.push('        if(get_val(STICK_RX) > 0 && get_val(STICK_RX) < ANTI_DEADZONE) set_val(STICK_RX, ANTI_DEADZONE);');
  body.push('        if(get_val(STICK_RX) < 0 && get_val(STICK_RX) > (0 - ANTI_DEADZONE)) set_val(STICK_RX, 0 - ANTI_DEADZONE);');
  body.push('        if(get_val(STICK_RY) > 0 && get_val(STICK_RY) < ANTI_DEADZONE) set_val(STICK_RY, ANTI_DEADZONE);');
  body.push('        if(get_val(STICK_RY) < 0 && get_val(STICK_RY) > (0 - ANTI_DEADZONE)) set_val(STICK_RY, 0 - ANTI_DEADZONE);');
  body.push('    }');
  body.push('');
  body.push('    /* ---- ADS slow: steadier tracking while aiming ---- */');
  body.push('    if(mods_on && ADS_SLOW < 100 && aiming) {');
  body.push('        set_val(STICK_RX, (get_val(STICK_RX) * ADS_SLOW) / 100);');
  body.push('        set_val(STICK_RY, (get_val(STICK_RY) * ADS_SLOW) / 100);');
  body.push('    }');
  body.push('');
  body.push('    /* ---- anti-recoil ---- */');
  body.push('    if(mods_on && firing && (!ADS_ONLY || aiming)) {');
  body.push('        fire_ms = fire_ms + get_rtime();');
  if (anyBurst) {
    body.push('        if(BURST_CYCLE[slot] > 0 && fire_ms > BURST_CYCLE[slot]) fire_ms = 0;   // next burst starts clean');
  }
  body.push('        idx = slot * PHASES;');
  body.push('        if(fire_ms < PH_UNTIL[idx]) {');
  body.push('            arv = PH_V[idx];');
  body.push('            arh = PH_H[idx];');
  body.push('        } else if(fire_ms < PH_UNTIL[idx + 1]) {');
  body.push('            arv = PH_V[idx + 1];');
  body.push('            arh = PH_H[idx + 1];');
  body.push('        } else if(fire_ms < PH_UNTIL[idx + 2]) {');
  body.push('            arv = PH_V[idx + 2];');
  body.push('            arh = PH_H[idx + 2];');
  body.push('        } else {');
  body.push('            arv = PH_V[idx + 3];');
  body.push('            arh = PH_H[idx + 3];');
  body.push('        }');
  body.push('        /* your own stick input always wins past the release threshold */');
  body.push('        if(abs(get_val(STICK_RY)) < AR_RELEASE[slot]) set_val(STICK_RY, lim(get_val(STICK_RY) + arv));');
  body.push('        if(arh != 0 && abs(get_val(STICK_RX)) < AR_RELEASE[slot]) set_val(STICK_RX, lim(get_val(STICK_RX) + arh));');
  body.push('    } else {');
  body.push('        fire_ms = 0;');
  body.push('    }');
  body.push('');
  if (anyRapid) {
    body.push('    /* ---- rapid fire ---- */');
    body.push('    if(mods_on && RF_ON[slot] && firing) {');
    body.push('        rf_hold = RF_HOLD[slot];');
    body.push('        rf_rest = RF_REST[slot];');
    body.push('        combo_run(RAPID_FIRE);');
    body.push('    } else if(combo_running(RAPID_FIRE)) {');
    body.push('        combo_stop(RAPID_FIRE);');
    body.push('    }');
    body.push('');
  }
  if (anySticky) {
    body.push('    /* ---- sticky aim: keep the game\'s aim assist bubble awake ---- */');
    body.push(`    if(${stickyCondition(first.sticky.when)}) {`);
    body.push('        sticky_r = STICKY_R[slot];');
    body.push('        sticky_ms = STICKY_MS[slot];');
    body.push('        combo_run(STICKY_AIM);');
    body.push('    } else if(combo_running(STICKY_AIM)) {');
    body.push('        combo_stop(STICKY_AIM);');
    body.push('    }');
    body.push('');
  }
  body.push('}');
  body.push('');
  body.push('/* clamp to the stick range so a correction never wraps around */');
  body.push('function lim(value) {');
  body.push('    if(value > 100) return 100;');
  body.push('    if(value < -100) return -100;');
  body.push('    return value;');
  body.push('}');
  body.push('');
  if (anyRapid) {
    body.push('combo RAPID_FIRE {');
    body.push('    set_val(BTN_FIRE, 100);');
    body.push('    wait(rf_hold);');
    body.push('    set_val(BTN_FIRE, 0);');
    body.push('    wait(rf_rest);');
    body.push('    set_val(BTN_FIRE, 0);');
    body.push('}');
    body.push('');
  }
  if (anySticky) {
    body.push(`/* ${first.sticky.shape} micro-movement - one full loop per ${STICKY_STEPS[first.sticky.shape]?.length || 4} steps */`);
    body.push('combo STICKY_AIM {');
    stickyComboBody(first.sticky.shape).forEach((line) => body.push(line));
    body.push('}');
    body.push('');
  }
  body.push('/* one rumble pulse per pending blip - slot 3 buzzes three times */');
  body.push('combo FEEDBACK {');
  body.push('    set_rumble(RUMBLE_A, 60);');
  body.push('    wait(90);');
  body.push('    reset_rumble();');
  body.push('    wait(140);');
  body.push('    blips = blips - 1;');
  body.push('}');
  body.push('');

  return head.concat(body).join('\n');
}

export function scriptFileName(entries, options = {}) {
  const base = options.title
    ? options.title
    : entries.length === 1
      ? `${entries[0].weapon.game}-${entries[0].weapon.name}`
      : `${entries[0].weapon.game}-loadout-${entries.length}`;
  return `${String(base).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'weapon'}.gpc`;
}

export { MAX_SLOTS };

/* ==================================================================== *
 * Universal script: one profile per weapon class, following your swap  *
 * button instead of a slot you pick by hand.                           *
 * ==================================================================== */

/**
 * @param {Array} classProfiles from buildClassProfiles()
 * @param {object} options { title, author, modButton, game, primary, secondary }
 */
export function buildUniversalScript(classProfiles, options = {}) {
  if (!Array.isArray(classProfiles) || !classProfiles.length) {
    throw new Error('No class profiles to build from.');
  }
  const first = classProfiles[0].tuning;
  const layout = LAYOUTS[first.profile.controller] || LAYOUTS.xbox;
  const modKey = options.modButton && layout.mods[options.modButton] ? options.modButton : 'view';
  const modButton = layout.mods[modKey];
  const game = getGame(options.game || first.game);
  const title = sanitize(options.title || `${game.name} - universal`, 58);
  const author = sanitize(options.author || 'Sticky Aim Studio', 30);
  const generated = options.now || new Date().toISOString().replace('T', ' ').slice(0, 16);

  const index = (id) => Math.max(classProfiles.findIndex((c) => c.id === id), 0);
  const primary = index(options.primary || 'ar');
  const secondary = index(options.secondary || 'smg');

  const anyRapid = classProfiles.some((c) => c.tuning.rapidFire.enabled);
  const anySticky = classProfiles.some((c) => c.tuning.sticky.enabled);

  /* ---------------- header ---------------- */
  const head = [];
  head.push('/* ==========================================================================');
  head.push(` *  ${title}`);
  head.push(' *  --------------------------------------------------------------------------');
  head.push(` *  Game        : ${sanitize(game.name)}`);
  head.push(` *  Controller  : ${layout.label}`);
  head.push(` *  Author      : ${author}`);
  head.push(` *  Generated   : ${generated} by Sticky Aim Weapon Studio`);
  head.push(` *  Settings    : sens ${first.profile.sensitivity}, ADS x${first.profile.adsMultiplier}, ` +
            `${first.profile.responseCurve} curve, deadzone ${first.profile.deadzone}, trim ${first.profile.strength}%`);
  head.push(' *');
  head.push(' *  HOW "AUTOMATIC" WORKS HERE - READ THIS FIRST');
  wrapComment(
    'A Cronus only sees your controller. It cannot read the game, so it cannot know which gun you are ' +
    'holding. What it can do is watch your weapon-swap button: tell it what your primary and secondary ' +
    'are once, and every swap flips the profile with you. Nothing else about the game is visible to it.',
    96
  ).forEach((line) => head.push(` *   ${line}`));
  head.push(' *');
  wrapComment(
    'Anything that changes your weapon WITHOUT a swap press - picking a gun off the ground, a killstreak, ' +
    'respawning onto your other slot - leaves it one profile behind. Tap swap twice to resync.',
    96
  ).forEach((line) => head.push(` *   ${line}`));
  head.push(' *');
  head.push(' *  CLASS PROFILES');
  classProfiles.forEach((c, i) => {
    head.push(
      ` *   ${i} ${pad(sanitize(c.label, 16), 16)} V:${pad(c.tuning.antiRecoil.vertical, 4)}` +
      ` from ${pad(c.weaponCount + ' weapons', 12)} (they run ${c.spread.low}-${c.spread.high})` +
      ` ${c.tuning.sticky.enabled ? 'sticky ' + c.tuning.sticky.radius : 'no sticky'}` +
      `${c.tuning.rapidFire.enabled ? ', rapid fire' : ''}`
    );
  });
  head.push(' *');
  head.push(` *  Boots as: primary = ${sanitize(classProfiles[primary].label)}, secondary = ${sanitize(classProfiles[secondary].label)}`);
  head.push(' *');
  head.push(' *  CONTROLS');
  head.push(` *   ${pad(layout.swap, 14)}                 : your normal weapon swap - the profile follows it`);
  head.push(` *   Hold ${pad(modButton, 9)} + D-PAD RIGHT/LEFT : change the class of the weapon you are holding`);
  head.push(` *   Hold ${pad(modButton, 9)} + D-PAD UP         : rumble out the class you are on`);
  head.push(` *   Hold ${pad(modButton, 9)} + D-PAD DOWN       : master on/off`);
  head.push(` *   Hold ${pad(modButton, 9)} + ${pad(layout.swap, 12)}  : resync without swapping in game`);
  head.push(' *');
  head.push(' *  TRIMMING');
  head.push(' *   A class profile sits in the middle of its class, so a gun at the edge of that');
  head.push(' *   range will be over- or under-corrected. Raise or lower that class\'s numbers in');
  head.push(' *   PH_V[] - the block of 4 starting at (class number x 4) - or build a');
  head.push(' *   single-weapon script for the gun you actually live on.');
  head.push(' *');
  classProfiles.forEach((c, i) => {
    head.push(` *   [${i}] ${sanitize(c.label, 20)} - e.g. ${sanitize(c.examples.join(', '), 60)}`);
    c.tuning.diagnostics.slice(0, 2).forEach((d) => wrapComment(d, 92).forEach((line) => head.push(` *        ${line}`)));
  });
  head.push(' *');
  head.push(' *  These values are a calculated starting point, not a guarantee. Verify on a');
  head.push(' *  practice range and trim before you rely on it.');
  head.push(' * ========================================================================== */');

  /* ---------------- tables ---------------- */
  const phUntil = [];
  const phV = [];
  const phH = [];
  classProfiles.forEach(({ tuning }) => {
    const phases = tuning.antiRecoil.phases.slice(0, PHASE_COUNT);
    while (phases.length < PHASE_COUNT) phases.push(phases[phases.length - 1]);
    phases.forEach((p) => {
      phUntil.push(Math.round(p.untilMs));
      phV.push(Math.round(p.vertical));
      phH.push(Math.round(p.horizontal));
    });
  });

  const body = [];
  body.push('');
  body.push('/* ---------------- controller layout ---------------- */');
  body.push(`define BTN_FIRE   = ${layout.fire};`);
  body.push(`define BTN_ADS    = ${layout.ads};`);
  body.push(`define STICK_RX   = ${layout.rx};`);
  body.push(`define STICK_RY   = ${layout.ry};   // positive = down, which is what fights muzzle climb`);
  body.push(`define BTN_SWAP   = ${layout.swap};   // your in-game weapon swap`);
  body.push(`define BTN_MOD    = ${modButton};`);
  body.push(`define DPAD_UP    = ${layout.up};`);
  body.push(`define DPAD_DOWN  = ${layout.down};`);
  body.push(`define DPAD_LEFT  = ${layout.left};`);
  body.push(`define DPAD_RIGHT = ${layout.right};`);
  body.push('');
  body.push('/* ---------------- global switches ---------------- */');
  body.push(`define CLASS_COUNT    = ${classProfiles.length};`);
  body.push(`define PHASES         = ${PHASE_COUNT};`);
  body.push(`define ADS_ONLY       = ${gpcBool(first.antiRecoil.adsOnly)};`);
  body.push('define FIRE_POINT     = 10;');
  body.push('define ADS_POINT      = 10;');
  body.push(`define HAIR_TRIGGER   = ${gpcBool(first.hairTrigger.enabled)};`);
  body.push(`define HAIR_POINT     = ${first.hairTrigger.threshold};`);
  body.push(`define ANTI_DEADZONE  = ${first.antiDeadzone.enabled ? first.antiDeadzone.value : 0};`);
  body.push(`define ADS_SLOW       = ${first.adsSlow.enabled ? first.adsSlow.percent : 100};`);
  body.push(`define START_PRIMARY  = ${primary};    // ${sanitize(classProfiles[primary].label)}`);
  body.push(`define START_SECOND   = ${secondary};    // ${sanitize(classProfiles[secondary].label)}`);
  body.push('');
  body.push('/* ---------------- class tables (one block of PHASES per class) ---------------- */');
  classProfiles.forEach((c, i) => body.push(`/*  ${i} = ${sanitize(c.label, 20)} */`));
  body.push(table('int16', 'PH_UNTIL', phUntil, 'ms since trigger pull that each phase ends'));
  body.push(table('int8 ', 'PH_V', phV, 'vertical stick push for that phase'));
  body.push(table('int8 ', 'PH_H', phH, 'horizontal - always 0 for a class profile'));
  body.push(table('int8 ', 'AR_RELEASE', classProfiles.map((c) => c.tuning.antiRecoil.releaseThreshold), 'your own stick input that cancels the pull'));
  body.push(table('int8 ', 'RF_ON', classProfiles.map((c) => (c.tuning.rapidFire.enabled ? 1 : 0)), 'rapid fire per class'));
  body.push(table('int16', 'RF_HOLD', classProfiles.map((c) => c.tuning.rapidFire.holdMs), 'ms the trigger is held'));
  body.push(table('int16', 'RF_REST', classProfiles.map((c) => c.tuning.rapidFire.restMs), 'ms the trigger is released'));
  body.push(table('int8 ', 'STICKY_ON', classProfiles.map((c) => (c.tuning.sticky.enabled ? 1 : 0)), 'sticky aim per class'));
  body.push(table('int8 ', 'STICKY_R', classProfiles.map((c) => c.tuning.sticky.radius), 'micro-movement radius'));
  body.push(table('int16', 'STICKY_MS', classProfiles.map((c) => c.tuning.sticky.periodMs || 100), 'ms per step'));
  body.push('');
  body.push('/* ---------------- state ---------------- */');
  body.push('int primary_class;');
  body.push('int second_class;');
  body.push('int holding_second;   // FALSE = primary in hand, TRUE = secondary');
  body.push('int cls;');
  body.push('int mods_on;');
  body.push('int fire_ms;');
  body.push('int idx;');
  body.push('int arv;');
  body.push('int arh;');
  body.push('int rf_hold;');
  body.push('int rf_rest;');
  body.push('int sticky_r;');
  body.push('int sticky_ms;');
  body.push('int blips;');
  body.push('int firing;');
  body.push('int aiming;');
  body.push('');
  body.push('init {');
  body.push('    primary_class = START_PRIMARY;');
  body.push('    second_class = START_SECOND;');
  body.push('    holding_second = FALSE;');
  body.push('    mods_on = TRUE;');
  body.push('    blips = 1;');
  body.push('}');
  body.push('');
  body.push('main {');
  body.push('    /* ---- follow the weapon swap: this is the whole "automatic" part ---- */');
  body.push('    if(!get_val(BTN_MOD) && event_press(BTN_SWAP)) {');
  body.push('        if(holding_second) holding_second = FALSE;');
  body.push('        else holding_second = TRUE;');
  body.push('    }');
  body.push('');
  body.push('    /* ---- modifier layer ---- */');
  body.push('    if(get_val(BTN_MOD)) {');
  body.push('        set_val(BTN_MOD, 0);');
  body.push('        set_val(DPAD_UP, 0);');
  body.push('        set_val(DPAD_DOWN, 0);');
  body.push('        set_val(DPAD_LEFT, 0);');
  body.push('        set_val(DPAD_RIGHT, 0);');
  body.push('        set_val(BTN_SWAP, 0);');
  body.push('        if(event_press(BTN_SWAP)) {                 // resync without swapping in game');
  body.push('            if(holding_second) holding_second = FALSE;');
  body.push('            else holding_second = TRUE;');
  body.push('            blips = 1;');
  body.push('        }');
  body.push('        if(event_press(DPAD_RIGHT)) {               // next class for the gun in hand');
  body.push('            if(holding_second) {');
  body.push('                second_class = second_class + 1;');
  body.push('                if(second_class >= CLASS_COUNT) second_class = 0;');
  body.push('                blips = second_class + 1;');
  body.push('            } else {');
  body.push('                primary_class = primary_class + 1;');
  body.push('                if(primary_class >= CLASS_COUNT) primary_class = 0;');
  body.push('                blips = primary_class + 1;');
  body.push('            }');
  body.push('        }');
  body.push('        if(event_press(DPAD_LEFT)) {');
  body.push('            if(holding_second) {');
  body.push('                second_class = second_class - 1;');
  body.push('                if(second_class < 0) second_class = CLASS_COUNT - 1;');
  body.push('                blips = second_class + 1;');
  body.push('            } else {');
  body.push('                primary_class = primary_class - 1;');
  body.push('                if(primary_class < 0) primary_class = CLASS_COUNT - 1;');
  body.push('                blips = primary_class + 1;');
  body.push('            }');
  body.push('        }');
  body.push('        if(event_press(DPAD_DOWN)) {');
  body.push('            if(mods_on) { mods_on = FALSE; blips = 3; }');
  body.push('            else        { mods_on = TRUE;  blips = 1; }');
  body.push('        }');
  body.push('        if(event_press(DPAD_UP)) blips = cls + 1;');
  body.push('    }');
  body.push('');
  body.push('    if(holding_second) cls = second_class; else cls = primary_class;');
  body.push('');
  body.push('    if(blips > 0 && !combo_running(FEEDBACK)) combo_run(FEEDBACK);');
  body.push('');
  body.push('    /* ---- hair trigger ---- */');
  body.push('    if(HAIR_TRIGGER && mods_on) {');
  body.push('        if(get_val(BTN_FIRE) > HAIR_POINT) set_val(BTN_FIRE, 100);');
  body.push('        if(get_val(BTN_ADS) > HAIR_POINT) set_val(BTN_ADS, 100);');
  body.push('    }');
  body.push('');
  body.push('    if(get_val(BTN_FIRE) > FIRE_POINT) firing = TRUE; else firing = FALSE;');
  body.push('    if(get_val(BTN_ADS) > ADS_POINT) aiming = TRUE; else aiming = FALSE;');
  body.push('');
  body.push('    /* ---- anti-deadzone ---- */');
  body.push('    if(mods_on && ANTI_DEADZONE > 0) {');
  body.push('        if(get_val(STICK_RX) > 0 && get_val(STICK_RX) < ANTI_DEADZONE) set_val(STICK_RX, ANTI_DEADZONE);');
  body.push('        if(get_val(STICK_RX) < 0 && get_val(STICK_RX) > (0 - ANTI_DEADZONE)) set_val(STICK_RX, 0 - ANTI_DEADZONE);');
  body.push('        if(get_val(STICK_RY) > 0 && get_val(STICK_RY) < ANTI_DEADZONE) set_val(STICK_RY, ANTI_DEADZONE);');
  body.push('        if(get_val(STICK_RY) < 0 && get_val(STICK_RY) > (0 - ANTI_DEADZONE)) set_val(STICK_RY, 0 - ANTI_DEADZONE);');
  body.push('    }');
  body.push('');
  body.push('    /* ---- ADS slow ---- */');
  body.push('    if(mods_on && ADS_SLOW < 100 && aiming) {');
  body.push('        set_val(STICK_RX, (get_val(STICK_RX) * ADS_SLOW) / 100);');
  body.push('        set_val(STICK_RY, (get_val(STICK_RY) * ADS_SLOW) / 100);');
  body.push('    }');
  body.push('');
  body.push('    /* ---- anti-recoil for the class in your hands ---- */');
  body.push('    if(mods_on && firing && (!ADS_ONLY || aiming)) {');
  body.push('        fire_ms = fire_ms + get_rtime();');
  body.push('        idx = cls * PHASES;');
  body.push('        if(fire_ms < PH_UNTIL[idx]) {');
  body.push('            arv = PH_V[idx];');
  body.push('            arh = PH_H[idx];');
  body.push('        } else if(fire_ms < PH_UNTIL[idx + 1]) {');
  body.push('            arv = PH_V[idx + 1];');
  body.push('            arh = PH_H[idx + 1];');
  body.push('        } else if(fire_ms < PH_UNTIL[idx + 2]) {');
  body.push('            arv = PH_V[idx + 2];');
  body.push('            arh = PH_H[idx + 2];');
  body.push('        } else {');
  body.push('            arv = PH_V[idx + 3];');
  body.push('            arh = PH_H[idx + 3];');
  body.push('        }');
  body.push('        if(abs(get_val(STICK_RY)) < AR_RELEASE[cls]) set_val(STICK_RY, lim(get_val(STICK_RY) + arv));');
  body.push('        if(arh != 0 && abs(get_val(STICK_RX)) < AR_RELEASE[cls]) set_val(STICK_RX, lim(get_val(STICK_RX) + arh));');
  body.push('    } else {');
  body.push('        fire_ms = 0;');
  body.push('    }');
  body.push('');
  if (anyRapid) {
    body.push('    /* ---- rapid fire ---- */');
    body.push('    if(mods_on && RF_ON[cls] && firing) {');
    body.push('        rf_hold = RF_HOLD[cls];');
    body.push('        rf_rest = RF_REST[cls];');
    body.push('        combo_run(RAPID_FIRE);');
    body.push('    } else if(combo_running(RAPID_FIRE)) {');
    body.push('        combo_stop(RAPID_FIRE);');
    body.push('    }');
    body.push('');
  }
  if (anySticky) {
    body.push('    /* ---- sticky aim ---- */');
    body.push(`    if(${stickyCondition(first.sticky.when).replace(/STICKY_ON\[slot\]/, 'STICKY_ON[cls]')}) {`);
    body.push('        sticky_r = STICKY_R[cls];');
    body.push('        sticky_ms = STICKY_MS[cls];');
    body.push('        combo_run(STICKY_AIM);');
    body.push('    } else if(combo_running(STICKY_AIM)) {');
    body.push('        combo_stop(STICKY_AIM);');
    body.push('    }');
    body.push('');
  }
  body.push('}');
  body.push('');
  body.push('/* clamp to the stick range so a correction never wraps around */');
  body.push('function lim(value) {');
  body.push('    if(value > 100) return 100;');
  body.push('    if(value < -100) return -100;');
  body.push('    return value;');
  body.push('}');
  body.push('');
  if (anyRapid) {
    body.push('combo RAPID_FIRE {');
    body.push('    set_val(BTN_FIRE, 100);');
    body.push('    wait(rf_hold);');
    body.push('    set_val(BTN_FIRE, 0);');
    body.push('    wait(rf_rest);');
    body.push('    set_val(BTN_FIRE, 0);');
    body.push('}');
    body.push('');
  }
  if (anySticky) {
    body.push(`/* ${first.sticky.shape} micro-movement */`);
    body.push('combo STICKY_AIM {');
    stickyComboBody(first.sticky.shape).forEach((line) => body.push(line));
    body.push('}');
    body.push('');
  }
  body.push('/* one rumble pulse per pending blip - class 3 buzzes three times */');
  body.push('combo FEEDBACK {');
  body.push('    set_rumble(RUMBLE_A, 60);');
  body.push('    wait(90);');
  body.push('    reset_rumble();');
  body.push('    wait(140);');
  body.push('    blips = blips - 1;');
  body.push('}');
  body.push('');

  return head.concat(body).join('\n');
}

export { UNIVERSAL_CLASSES };
