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
import { getCategory, getGame } from './games.js';

const MAX_SLOTS = 8;

const LAYOUTS = {
  xbox: {
    label: 'Xbox / PC (XB1 layout)',
    fire: 'XB1_RT', ads: 'XB1_LT', rx: 'XB1_RX', ry: 'XB1_RY',
    up: 'XB1_UP', down: 'XB1_DOWN', left: 'XB1_LEFT', right: 'XB1_RIGHT',
    mods: { view: 'XB1_VIEW', menu: 'XB1_MENU', lb: 'XB1_LB', rb: 'XB1_RB', ls: 'XB1_LS', rs: 'XB1_RS' }
  },
  playstation: {
    label: 'PlayStation (PS4/PS5 layout)',
    fire: 'PS4_R2', ads: 'PS4_L2', rx: 'PS4_RX', ry: 'PS4_RY',
    up: 'PS4_UP', down: 'PS4_DOWN', left: 'PS4_LEFT', right: 'PS4_RIGHT',
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

const pad = (s, n) => String(s).padEnd(n);
const gpcBool = (v) => (v ? 'TRUE' : 'FALSE');

function sanitize(text, max = 60) {
  return String(text).replace(/[^\x20-\x7E]/g, '').replace(/\*\//g, '* /').slice(0, max);
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
  head.push(` *  Generated   : ${generated} by Sticky Aim Weapon Studio`);
  head.push(` *  Settings    : sens ${first.profile.sensitivity}, ADS x${first.profile.adsMultiplier}, ` +
            `${first.profile.responseCurve} curve, trim ${first.profile.strength}%`);
  head.push(' *');
  head.push(' *  SLOTS');
  slots.forEach(({ weapon, tuning }, i) => {
    head.push(
      ` *   ${i} ${pad(sanitize(weapon.name, 22), 22)} ${pad(getCategory(weapon.category).label, 14)}` +
      ` V:${pad(tuning.antiRecoil.vertical, 3)} H:${pad(tuning.antiRecoil.horizontal, 4)}` +
      ` RF:${pad(tuning.rapidFire.enabled ? tuning.rapidFire.effectiveRpm + 'rpm' : 'off', 8)}` +
      ` Sticky:${tuning.sticky.enabled ? tuning.sticky.radius : 'off'}`
    );
  });
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
    tuning.diagnostics.forEach((d) => head.push(` *        ${sanitize(d, 100)}`));
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
  body.push(`#pragma METAINFO("${title}", 1, 0, "${author}")`);
  body.push('');
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
  body.push(table('int16', 'STICKY_MS', slots.map((s) => s.tuning.sticky.periodMs || 100), 'ms per quarter circle'));
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
    body.push('    if(mods_on && STICKY_ON[slot] && aiming) {');
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
    body.push('combo STICKY_AIM {');
    body.push('    set_val(STICK_RX, lim(get_val(STICK_RX) + sticky_r));');
    body.push('    wait(sticky_ms);');
    body.push('    set_val(STICK_RY, lim(get_val(STICK_RY) + sticky_r));');
    body.push('    wait(sticky_ms);');
    body.push('    set_val(STICK_RX, lim(get_val(STICK_RX) - sticky_r));');
    body.push('    wait(sticky_ms);');
    body.push('    set_val(STICK_RY, lim(get_val(STICK_RY) - sticky_r));');
    body.push('    wait(sticky_ms);');
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
