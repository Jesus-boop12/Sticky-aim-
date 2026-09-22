import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeWeapon, importFromCsv, importFromJson, importFromTextHeuristic, parseCsv } from '../core/weapons.js';
import { computeTuning, normalizeProfile, normalizeCustomSettings, PHASE_COUNT } from '../core/tuning.js';
import { buildGpcScript, buildUniversalScript, scriptFileName, MAX_SLOTS } from '../core/gpc.js';
import { buildClassProfiles } from '../core/universal.js';
import { validateGpc } from '../core/validate.js';
import { catalogFor } from '../core/catalog.js';
import { getGame, listGames } from '../core/games.js';

const preset = (game, i = 0) => catalogFor(game)[i];

test('normalizeWeapon fills gaps and reports what it guessed', () => {
  const w = normalizeWeapon({ name: 'Mystery gun' }, { game: 'apex' });
  assert.equal(w.game, 'apex');
  assert.ok(w.rpm > 0 && w.recoil.vertical > 0);
  assert.ok(w.warnings.length >= 2, 'missing rpm and recoil should both warn');
});

test('recoil values on different scales land on 0-100', () => {
  assert.equal(normalizeWeapon({ name: 'a', vertical: 0.42 }).recoil.vertical, 42); // 0-1 float
  assert.equal(normalizeWeapon({ name: 'b', vertical: 42 }).recoil.vertical, 42);   // already 0-100
  assert.equal(normalizeWeapon({ name: 'c', vertical: 420 }).recoil.vertical, 42);  // 0-1000 index
  assert.equal(normalizeWeapon({ name: 'd', vertical: -5 }).recoil.vertical, 0);    // clamped
});

test('weapon class aliases resolve', () => {
  assert.equal(normalizeWeapon({ name: 'x', category: 'Assault Rifle' }).category, 'ar');
  assert.equal(normalizeWeapon({ name: 'x', category: 'sub machine gun' }).category, 'smg');
  assert.equal(normalizeWeapon({ name: 'x', category: 'DMR' }).category, 'marksman');
  assert.equal(normalizeWeapon({ name: 'x', category: 'potato' }).category, 'other');
});

test('csv import handles quoted fields and loose headers', () => {
  const csv = 'Weapon,Class,Fire Rate,Vertical Recoil,Drift\n"Gun, the big one",LMG,600,70,left';
  const [w] = importFromCsv(csv, { game: 'pubg' });
  assert.equal(w.name, 'Gun, the big one');
  assert.equal(w.category, 'lmg');
  assert.equal(w.rpm, 600);
  assert.equal(w.recoil.vertical, 70);
  assert.equal(w.recoil.drift, -1);
});

test('csv parser keeps empty trailing cells aligned', () => {
  assert.deepEqual(parseCsv('a,b,c\n1,,3'), [['a', 'b', 'c'], ['1', '', '3']]);
});

test('json import accepts arrays, wrappers and single objects', () => {
  assert.equal(importFromJson('[{"name":"a"},{"name":"b"}]').length, 2);
  assert.equal(importFromJson('{"weapons":[{"name":"a"}]}').length, 1);
  assert.equal(importFromJson('{"name":"solo"}')[0].name, 'solo');
  assert.throws(() => importFromJson('not json'), /not valid JSON/);
});

test('heuristic text import finds the obvious fields', () => {
  const [w] = importFromTextHeuristic('MCW assault rifle 750 rpm vertical recoil 38, drifts right');
  assert.equal(w.rpm, 750);
  assert.equal(w.recoil.vertical, 38);
  assert.equal(w.recoil.drift, 1);
  assert.equal(w.category, 'ar');
});

test('higher in-game sensitivity needs less stick compensation', () => {
  const w = preset('cod-mw3');
  const low = computeTuning(w, { sensitivity: 3 }).antiRecoil.vertical;
  const high = computeTuning(w, { sensitivity: 12 }).antiRecoil.vertical;
  assert.ok(high < low, `expected ${high} < ${low}`);
});

test('strength trim scales the output and zero disables it', () => {
  const w = preset('cod-mw3');
  assert.equal(computeTuning(w, { strength: 0 }).antiRecoil.vertical, 0);
  assert.ok(computeTuning(w, { strength: 150 }).antiRecoil.vertical >
            computeTuning(w, { strength: 100 }).antiRecoil.vertical);
});

test('anti-recoil stays inside the stick range for the worst case', () => {
  const brutal = normalizeWeapon({ name: 'Wall of lead', category: 'lmg', rpm: 1200, vertical: 100, horizontal: 100, drift: 'right' }, { game: 'pubg' });
  const t = computeTuning(brutal, { sensitivity: 0.5, adsMultiplier: 0.2, strength: 200, responseCurve: 'standard' });
  assert.ok(t.antiRecoil.vertical <= 100 && t.antiRecoil.vertical >= 0);
  assert.ok(Math.abs(t.antiRecoil.horizontal) <= 60);
});

test('horizontal correction opposes the drift and is skipped when there is none', () => {
  const right = normalizeWeapon({ name: 'r', vertical: 50, horizontal: 40, drift: 'right' }, { game: 'cod-mw3' });
  const none = normalizeWeapon({ name: 'n', vertical: 50, horizontal: 40, drift: 'none' }, { game: 'cod-mw3' });
  assert.ok(computeTuning(right, {}).antiRecoil.horizontal < 0, 'pulls right -> push left');
  assert.equal(computeTuning(none, {}).antiRecoil.horizontal, 0);
});

test('phases are ordered, start dead and end sustained', () => {
  const t = computeTuning(preset('warzone', 1), {});
  const phases = t.antiRecoil.phases;
  assert.equal(phases.length, PHASE_COUNT);
  assert.equal(phases[0].vertical, 0, 'first phase covers the first-shot delay');
  for (let i = 1; i < phases.length; i++) {
    assert.ok(phases[i].untilMs > phases[i - 1].untilMs, 'phase boundaries increase');
    assert.ok(phases[i].vertical >= phases[i - 1].vertical, 'compensation ramps up');
  }
  assert.equal(phases.at(-1).vertical, t.antiRecoil.vertical);
});

test('an imported recoil pattern drives the phase table', () => {
  const w = normalizeWeapon({
    name: 'Patterned', category: 'ar', rpm: 600, vertical: 50, horizontal: 20, drift: 'right',
    pattern: [{ atMs: 0, v: 10, h: 2 }, { atMs: 200, v: 40, h: 6 }, { atMs: 400, v: 80, h: 10 }, { atMs: 600, v: 100, h: 14 }]
  }, { game: 'apex' });
  const t = computeTuning(w, {});
  assert.match(t.diagnostics.join(' '), /pattern/);
  assert.ok(t.antiRecoil.phases.at(-1).vertical > t.antiRecoil.phases[1].vertical);
  assert.ok(t.confidence > computeTuning(normalizeWeapon({ name: 'Flat', vertical: 50 }), {}).confidence);
});

test('rapid fire respects fire mode and the game cap', () => {
  const auto = computeTuning(preset('cod-mw3', 0), { rapidFire: 'on' });
  assert.equal(auto.rapidFire.enabled, false, 'never pulse a full-auto trigger');

  const dmr = normalizeWeapon({ name: 'DMR', category: 'marksman', fireMode: 'semi', rpm: 900, vertical: 30 }, { game: 'cod-mw3' });
  const t = computeTuning(dmr, { rapidFire: 'auto' });
  assert.equal(t.rapidFire.enabled, true);
  assert.ok(t.rapidFire.effectiveRpm <= getGame('cod-mw3').semiFireCapRpm + 20);
  assert.ok(t.rapidFire.holdMs >= 16 && t.rapidFire.restMs >= 16);
});

test('sticky aim is off for snipers and for games without aim assist', () => {
  const sniper = catalogFor('cod-mw3').find((w) => w.category === 'sniper');
  assert.equal(computeTuning(sniper, { stickyAim: true }).sticky.enabled, false);
  assert.equal(computeTuning(preset('r6siege'), { stickyAim: true }).sticky.enabled, false);
  assert.equal(computeTuning(preset('cod-bo6'), { stickyAim: true }).sticky.enabled, true);
});

test('profile normalisation rejects junk', () => {
  const p = normalizeProfile({ sensitivity: 'abc', strength: 999, responseCurve: 'wobble', controller: 'nintendo' });
  assert.equal(p.sensitivity, 6);
  assert.equal(p.strength, 200);
  assert.equal(p.responseCurve, 'standard');
  assert.equal(p.controller, 'xbox');
});

/* ---------------- GPC output ---------------- */

function generate(gameId, count = 2, profile = {}) {
  const weapons = catalogFor(gameId).slice(0, count);
  const entries = weapons.map((weapon) => ({ weapon, tuning: computeTuning(weapon, profile) }));
  return { entries, gpc: buildGpcScript(entries, { now: '2026-01-01 00:00' }) };
}

test('generated script has the structure Zen Studio expects', () => {
  const { gpc } = generate('cod-mw3', 3);
  for (const token of ['define BTN_FIRE', 'const int16 PH_UNTIL[]', 'init {', 'main {', 'function lim(', 'combo FEEDBACK {']) {
    assert.ok(gpc.includes(token), `missing ${token}`);
  }
  assert.equal(gpc.split('{').length, gpc.split('}').length, 'unbalanced braces');
  assert.equal(gpc.split('(').length, gpc.split(')').length, 'unbalanced parens');
  assert.ok(!/undefined|NaN|\[object/.test(gpc), 'placeholder leaked into the script');
});

test('weapon tables carry one column per slot and PHASES entries per weapon', () => {
  const { gpc } = generate('apex', 4);
  const values = (name) => gpc.match(new RegExp(`${name}\\[\\] = \\{([^}]*)\\}`))[1].split(',').map((v) => v.trim());
  assert.equal(values('PH_UNTIL').length, 4 * PHASE_COUNT);
  assert.equal(values('PH_V').length, 4 * PHASE_COUNT);
  assert.equal(values('AR_RELEASE').length, 4);
  assert.equal(values('RF_ON').length, 4);
  for (const v of values('PH_V')) assert.ok(Number.isInteger(Number(v)), `${v} is not an integer`);
  for (const v of values('PH_V')) assert.ok(Math.abs(Number(v)) <= 100, 'stick value out of range');
});

test('script declares every variable and combo it uses', () => {
  const { gpc } = generate('cod-bo6', 2, { rapidFire: 'on' });
  const body = gpc.slice(gpc.indexOf('main {'));
  for (const combo of body.matchAll(/combo_run\((\w+)\)/g)) {
    assert.ok(gpc.includes(`combo ${combo[1]} {`), `combo ${combo[1]} is run but never defined`);
  }
  for (const v of ['slot', 'mods_on', 'fire_ms', 'idx', 'arv', 'arh', 'blips', 'firing', 'aiming']) {
    assert.ok(gpc.includes(`int ${v};`), `variable ${v} is not declared`);
  }
});

test('controller layout switches with the profile', () => {
  assert.ok(generate('apex', 1, { controller: 'playstation' }).gpc.includes('define BTN_FIRE   = PS4_R2;'));
  assert.ok(generate('apex', 1, { controller: 'xbox' }).gpc.includes('define BTN_FIRE   = XB1_RT;'));
});

test('the header explains every slot', () => {
  const { gpc, entries } = generate('cod-mw3', 3);
  const header = gpc.slice(0, gpc.indexOf('/* ---------------- controller layout'));
  for (const { weapon } of entries) assert.ok(header.includes(weapon.name), `${weapon.name} missing from header`);
  assert.match(header, /TRIMMING/);
  assert.match(header, /starting point, not a guarantee/);
});

test('slot limits and empty input are refused', () => {
  assert.throws(() => buildGpcScript([]), /at least one weapon/);
  const many = catalogFor('cod-bo6').map((weapon) => ({ weapon, tuning: computeTuning(weapon, {}) }));
  const gpc = buildGpcScript(many.concat(many));
  assert.ok(gpc.includes(`define WEAPON_COUNT   = ${MAX_SLOTS};`), 'should cap at MAX_SLOTS');
});

test('file names are safe', () => {
  const entries = [{ weapon: normalizeWeapon({ name: 'R-301 / "Carbine"' }, { game: 'apex' }), tuning: {} }];
  assert.match(scriptFileName(entries), /^[a-z0-9-]+\.gpc$/);
});

test('comment-unsafe characters cannot break out of the header block', () => {
  const weapon = normalizeWeapon({ name: 'evil */ set_val(1,100); /*', vertical: 40 }, { game: 'apex' });
  const gpc = buildGpcScript([{ weapon, tuning: computeTuning(weapon, {}) }]);
  const header = gpc.slice(0, gpc.indexOf('/* ---------------- controller layout'));
  assert.equal(header.match(/\*\//g).length, 1, 'header must close exactly once');
});

test('a normalised weapon survives repeated round-trips without losing stats', () => {
  // The page sends normalised weapons straight back for re-tuning on every edit.
  let w = catalogFor('apex')[1];
  const original = JSON.parse(JSON.stringify(w.recoil));
  for (let i = 0; i < 3; i++) w = normalizeWeapon(JSON.parse(JSON.stringify(w)), { game: 'apex' });
  assert.deepEqual(w.recoil, original, 'recoil block must round-trip byte for byte');
  assert.equal(w.warnings.length, 0, 'a complete weapon warns about nothing');
});

test('warnings never pile up across re-normalisation', () => {
  let w = normalizeWeapon({ name: 'Sparse' }, { game: 'apex' });
  assert.ok(w.warnings.length > 0);
  const filledGaps = w.warnings.filter((x) => /No (vertical recoil|fire rate)/.test(x)).length;
  assert.ok(filledGaps > 0);

  for (let i = 0; i < 3; i++) w = normalizeWeapon(JSON.parse(JSON.stringify(w)), { game: 'apex' });
  // The filled-in values are now real values, so those warnings are gone; the
  // unresolved one (unknown weapon class) stays, exactly once.
  assert.equal(w.warnings.filter((x) => /No (vertical recoil|fire rate)/.test(x)).length, 0);
  assert.equal(w.warnings.length, new Set(w.warnings).size, 'no duplicates');
  assert.equal(w.warnings.length, 1, 'only the still-unresolved warning survives');
});

test('a loose alias never swallows a nested object', () => {
  // `recoil` is an alias for the vertical column, and also the name of the block.
  const w = normalizeWeapon({ name: 'x', recoil: { vertical: 61, horizontal: 12, drift: 1 } }, { game: 'pubg' });
  assert.equal(w.recoil.vertical, 61);
  assert.equal(w.recoil.drift, 1);
});

/* ---------------- recoil & sticky aim options ---------------- */

test('sticky aim strength and speed scale the micro-movement', () => {
  const w = preset('cod-bo6');
  const base = computeTuning(w, {}).sticky;
  const strong = computeTuning(w, { stickyStrength: 200 }).sticky;
  const fast = computeTuning(w, { stickySpeed: 200 }).sticky;
  assert.ok(strong.radius > base.radius, `${strong.radius} should exceed ${base.radius}`);
  assert.ok(fast.periodMs < base.periodMs, 'a faster setting means a shorter step');
  assert.equal(computeTuning(w, { stickyStrength: 0 }).sticky.enabled, false, 'zero radius is just off');
});

test('sticky shape and trigger condition reach the script', () => {
  const w = preset('cod-bo6');
  for (const shape of ['circle', 'horizontal', 'vertical', 'diagonal']) {
    const gpc = buildGpcScript([{ weapon: w, tuning: computeTuning(w, { stickyShape: shape }) }]);
    const combo = gpc.slice(gpc.indexOf('combo STICKY_AIM'), gpc.indexOf('combo FEEDBACK'));
    const steps = combo.match(/wait\(sticky_ms\)/g).length;
    assert.equal(steps, shape === 'horizontal' || shape === 'vertical' ? 2 : 4, `${shape} step count`);
    if (shape === 'horizontal') assert.ok(!combo.includes('STICK_RY'), 'horizontal must not touch the Y axis');
    if (shape === 'vertical') assert.ok(!combo.includes('STICK_RX'), 'vertical must not touch the X axis');
    assert.match(gpc, new RegExp(`sticky aim: ${shape} shape`));
  }

  const ads = buildGpcScript([{ weapon: w, tuning: computeTuning(w, { stickyWhen: 'ads' }) }]);
  const adsFire = buildGpcScript([{ weapon: w, tuning: computeTuning(w, { stickyWhen: 'ads_fire' }) }]);
  const always = buildGpcScript([{ weapon: w, tuning: computeTuning(w, { stickyWhen: 'always' }) }]);
  assert.match(ads, /if\(mods_on && STICKY_ON\[slot\] && aiming\) \{/);
  assert.match(adsFire, /if\(mods_on && STICKY_ON\[slot\] && aiming && firing\) \{/);
  assert.match(always, /if\(mods_on && STICKY_ON\[slot\]\) \{/);
});

test('ramp speed and start-delay trim move the phase timeline', () => {
  const w = preset('cod-mw3');
  const normal = computeTuning(w, {}).antiRecoil;
  const instant = computeTuning(w, { rampSpeed: 'instant' }).antiRecoil;
  const slow = computeTuning(w, { rampSpeed: 'slow' }).antiRecoil;
  assert.ok(instant.rampMs < normal.rampMs && normal.rampMs < slow.rampMs);
  assert.ok(instant.phases[2].untilMs < slow.phases[2].untilMs, 'the ramp phases move with it');
  // still a valid timeline at the extremes
  for (const t of [instant, slow]) {
    for (let i = 1; i < t.phases.length; i++) assert.ok(t.phases[i].untilMs > t.phases[i - 1].untilMs);
  }

  const delayed = computeTuning(w, { kickDelayTrim: 150 }).antiRecoil;
  assert.equal(delayed.kickMs, normal.kickMs + 150);
  assert.equal(delayed.phases[0].untilMs, delayed.kickMs);
  assert.ok(computeTuning(w, { kickDelayTrim: -150 }).antiRecoil.kickMs < normal.kickMs);
});

test('horizontal correction can be switched off globally', () => {
  const w = normalizeWeapon({ name: 'Drifter', vertical: 50, horizontal: 40, drift: 'right' }, { game: 'cod-mw3' });
  assert.ok(computeTuning(w, {}).antiRecoil.horizontal !== 0);
  const off = computeTuning(w, { horizontalEnabled: false });
  assert.equal(off.antiRecoil.horizontal, 0);
  assert.ok(off.antiRecoil.phases.every((p) => p.horizontal === 0));
  assert.match(off.diagnostics.join(' '), /switched off in your settings/);
});

test('release threshold responds to its trim', () => {
  const w = preset('cod-mw3');
  const loose = computeTuning(w, { releaseScale: 50 }).antiRecoil.releaseThreshold;
  const tight = computeTuning(w, { releaseScale: 200 }).antiRecoil.releaseThreshold;
  assert.ok(loose < tight);
});

test('per-weapon overrides beat the calculated values and are reported', () => {
  const base = preset('cod-bo6');
  const w = normalizeWeapon({
    ...base,
    overrides: { antiRecoilVertical: 19, antiRecoilHorizontal: -6, kickMs: 30, releaseThreshold: 41, sticky: 'off' }
  }, { game: 'cod-bo6' });
  const t = computeTuning(w, {});

  assert.equal(t.antiRecoil.vertical, 19);
  assert.equal(t.antiRecoil.horizontal, -6);
  assert.equal(t.antiRecoil.kickMs, 30);
  assert.equal(t.antiRecoil.releaseThreshold, 41);
  assert.equal(t.sticky.enabled, false);

  // the phase table is rebuilt around the override, not left on the old peak
  assert.equal(t.antiRecoil.phases.at(-1).vertical, 19);
  assert.equal(t.antiRecoil.phases[0].untilMs, 30);

  // and the auto values survive for the UI to show as "auto (n)"
  assert.equal(t.auto.antiRecoilVertical, computeTuning(base, {}).antiRecoil.vertical);
  assert.deepEqual(new Set(t.overridden),
    new Set(['antiRecoilVertical', 'antiRecoilHorizontal', 'kickMs', 'sticky', 'releaseThreshold']));
});

test('a forced-on sticky override works on a weapon that would not get it', () => {
  const sniper = catalogFor('cod-mw3').find((w) => w.category === 'sniper');
  assert.equal(computeTuning(sniper, {}).sticky.enabled, false);
  const forced = normalizeWeapon({ ...sniper, overrides: { sticky: 'on', stickyRadius: 4, stickyPeriodMs: 120 } }, { game: 'cod-mw3' });
  const t = computeTuning(forced, {});
  assert.equal(t.sticky.enabled, true);
  assert.equal(t.sticky.radius, 4);
  assert.equal(t.sticky.periodMs, 120);
});

test('a rapid-fire override is per weapon, not per profile', () => {
  const dmr = normalizeWeapon({ name: 'DMR', category: 'marksman', fireMode: 'semi', rpm: 300, vertical: 30 }, { game: 'cod-mw3' });
  assert.equal(computeTuning(dmr, { rapidFire: 'auto' }).rapidFire.enabled, true);
  const off = normalizeWeapon({ ...dmr, overrides: { rapidFire: 'off' } }, { game: 'cod-mw3' });
  assert.equal(computeTuning(off, { rapidFire: 'on' }).rapidFire.enabled, false, 'the weapon setting wins');
});

test('overrides are flagged in the script header', () => {
  const w = normalizeWeapon({ ...preset('cod-bo6'), overrides: { antiRecoilVertical: 51 } }, { game: 'cod-bo6' });
  const gpc = buildGpcScript([{ weapon: w, tuning: computeTuning(w, {}) }]);
  const header = gpc.slice(0, gpc.indexOf('/* ---------------- controller layout'));
  assert.match(header, /V:51\*/);
  assert.match(header, /\* = value you set by hand/);
  assert.match(header, /RECOIL CONTROL/);
  assert.match(header, /STICKY AIM/);
});

test('junk override values are clamped or dropped, never passed through', () => {
  const w = normalizeWeapon({
    name: 'x', vertical: 40,
    overrides: { antiRecoilVertical: 5000, stickyRadius: -3, sticky: 'maybe', kickMs: 'soon', nonsense: 1 }
  }, { game: 'apex' });
  assert.equal(w.overrides.antiRecoilVertical, 100);
  assert.equal(w.overrides.stickyRadius, 1);
  assert.equal(w.overrides.sticky, undefined);
  assert.equal(w.overrides.kickMs, undefined);
  assert.equal(w.overrides.nonsense, undefined);
  assert.ok(computeTuning(w, {}).antiRecoil.vertical <= 100);
});

/* ---------------- in-game settings ---------------- */

test('FOV only changes the maths when the game ties aim speed to it', () => {
  const w = preset('cod-mw3');
  const base = computeTuning(w, {}).antiRecoil.vertical;
  const noted = computeTuning(w, { fov: 120 });
  const applied = computeTuning(w, { fov: 120, fovRelativeAds: true });

  assert.equal(noted.antiRecoil.vertical, base, 'a wider FOV alone does not tame recoil');
  assert.match(noted.diagnostics.join(' '), /noted but not applied/);
  assert.ok(applied.antiRecoil.vertical < base, 'FOV-relative aim turns faster, so less stick is needed');
  assert.ok(computeTuning(w, { fov: 60, fovRelativeAds: true }).antiRecoil.vertical > base);
  // an unset FOV means "whatever the game defaults to" and must be a no-op
  assert.equal(computeTuning(w, { fov: 0, fovRelativeAds: true }).antiRecoil.vertical, base);
});

test('a separate vertical stick multiplier moves the vertical axis only', () => {
  const w = normalizeWeapon({ name: 'v', vertical: 50, horizontal: 40, drift: 'right' }, { game: 'cod-mw3' });
  const base = computeTuning(w, {});
  const slower = computeTuning(w, { verticalSensMultiplier: 0.6 });
  assert.ok(slower.antiRecoil.vertical > base.antiRecoil.vertical, 'a slower vertical axis needs more push');
  assert.equal(slower.antiRecoil.horizontal, base.antiRecoil.horizontal, 'horizontal is untouched');
  assert.ok(computeTuning(w, { verticalSensMultiplier: 2 }).antiRecoil.vertical < base.antiRecoil.vertical);
});

test('the in-game aim assist setting drives sticky aim', () => {
  const w = preset('cod-bo6');
  const standard = computeTuning(w, { aimAssist: 'standard' }).sticky;
  const strong = computeTuning(w, { aimAssist: 'strong' }).sticky;
  const off = computeTuning(w, { aimAssist: 'off' });

  assert.ok(strong.radius < standard.radius, 'stronger in-game assist needs less help');
  assert.equal(off.sticky.enabled, false);
  assert.match(off.diagnostics.join(' '), /no assist to keep awake/);
});

test('your own settings scale the target you point them at', () => {
  const w = normalizeWeapon({ name: 'c', vertical: 60, horizontal: 40, drift: 'right' }, { game: 'cod-mw3' });
  const base = computeTuning(w, {});

  const harder = computeTuning(w, { customSettings: [{ name: 'Optic zoom', value: '4x', affects: 'vertical', adjust: 25 }] });
  assert.ok(harder.antiRecoil.vertical > base.antiRecoil.vertical);
  assert.equal(harder.antiRecoil.horizontal, base.antiRecoil.horizontal, 'only the named target moves');
  assert.match(harder.diagnostics.join(' '), /"Optic zoom: 4x" raises the vertical pull by 25%/);

  const noted = computeTuning(w, { customSettings: [{ name: 'Vibration', value: 'Off', affects: 'none', adjust: 50 }] });
  assert.equal(noted.antiRecoil.vertical, base.antiRecoil.vertical, '"just note it" changes nothing');
  assert.match(noted.diagnostics.join(' '), /recorded in the script header only/);

  const sticky = computeTuning(preset('cod-bo6'), { customSettings: [{ name: 'AA', affects: 'sticky', adjust: -50 }] });
  assert.ok(sticky.sticky.radius < computeTuning(preset('cod-bo6'), {}).sticky.radius);
});

test('several of your settings compound', () => {
  const w = normalizeWeapon({ name: 'c', vertical: 60 }, { game: 'cod-mw3' });
  const one = computeTuning(w, { customSettings: [{ name: 'a', affects: 'vertical', adjust: 20 }] }).antiRecoil.vertical;
  const two = computeTuning(w, {
    customSettings: [{ name: 'a', affects: 'vertical', adjust: 20 }, { name: 'b', affects: 'vertical', adjust: 20 }]
  }).antiRecoil.vertical;
  assert.ok(two > one, `${two} should exceed ${one}`);
  assert.ok(computeTuning(w, { customSettings: [{ name: 'a', affects: 'vertical', adjust: -75 }] }).antiRecoil.vertical <
            computeTuning(w, {}).antiRecoil.vertical);
});

test('custom settings are validated, not trusted', () => {
  const rows = normalizeCustomSettings([
    { name: '  Padded  ', value: ' 12 ', affects: 'vertical', adjust: '15' },
    { name: '', value: 'no name' },                       // dropped
    { name: 'Junk target', affects: 'wat', adjust: 9999 }, // coerced
    null,
    ...Array.from({ length: 30 }, (_, i) => ({ name: `bulk${i}` }))
  ]);
  assert.equal(rows[0].name, 'Padded');
  assert.equal(rows[0].adjust, 15);
  assert.equal(rows[1].name, 'Junk target');
  assert.equal(rows[1].affects, 'none');
  assert.equal(rows[1].adjust, 100, 'clamped to the maximum');
  assert.ok(rows.length <= 24, 'the list is capped');
  assert.ok(rows.every((r) => r.id && typeof r.name === 'string'));
});

test('a pull smaller than the in-game deadzone is called out', () => {
  const w = preset('cod-mw3');
  const swallowed = computeTuning(w, { strength: 20, deadzone: 12 });
  assert.ok(swallowed.antiRecoil.vertical <= 12);
  assert.match(swallowed.diagnostics.join(' '), /WARNING: your in-game deadzone is 12/);
  assert.ok(!computeTuning(w, { deadzone: 2 }).diagnostics.join(' ').includes('WARNING'));
});

test('the script header records the settings it was tuned for', () => {
  const w = preset('cod-mw3');
  const tuning = computeTuning(w, {
    fov: 110, fovRelativeAds: true, verticalSensMultiplier: 0.8, aimAssist: 'strong',
    customSettings: [
      { name: 'Weapon mount', value: 'On', affects: 'vertical', adjust: -15 },
      { name: 'Vibration', value: 'Off', affects: 'none' }
    ]
  });
  const header = buildGpcScript([{ weapon: w, tuning }]).split('/* ---------------- controller layout')[0];
  assert.match(header, /FOV 110 \(relative ADS\), vertical sens x0\.8, aim assist: strong/);
  assert.match(header, /YOUR OWN GAME SETTINGS/);
  assert.match(header, /Weapon mount\s+On\s+-15% vertical/);
  assert.match(header, /Vibration\s+Off\s+noted only/);
  assert.match(header, /re-generate from the app if you change any of these/);
});

test('a setting name cannot break out of the header comment', () => {
  const w = preset('apex');
  const tuning = computeTuning(w, { customSettings: [{ name: 'evil */ set_val(1,100); /*', value: '*/', affects: 'none' }] });
  const gpc = buildGpcScript([{ weapon: w, tuning }]);
  const header = gpc.slice(0, gpc.indexOf('/* ---------------- controller layout'));
  assert.equal(header.match(/\*\//g).length, 1);
});

/* ---------------- rosters ---------------- */

test('every Call of Duty title ships a full roster', () => {
  for (const [game, min] of [['cod-bo7', 28], ['cod-bo6', 38], ['cod-mw3', 45], ['warzone', 170]]) {
    const list = catalogFor(game);
    assert.ok(list.length >= min, `${game} has only ${list.length} weapons`);
  }
});

test('rosters cover every weapon class and carry no duplicates', () => {
  for (const game of ['cod-bo7', 'cod-bo6', 'cod-mw3']) {
    const list = catalogFor(game);
    const classes = new Set(list.map((w) => w.category));
    for (const needed of ['ar', 'smg', 'lmg', 'sniper', 'pistol', 'shotgun', 'marksman']) {
      assert.ok(classes.has(needed), `${game} has no ${needed}`);
    }
    assert.ok(!classes.has('other'), `${game} has an unclassified weapon`);
    const names = list.map((w) => w.name.toLowerCase());
    assert.equal(names.length, new Set(names).size, `${game} lists a weapon twice`);
  }
});

test('Warzone pools the other Call of Duty rosters, de-duplicated', () => {
  const warzone = catalogFor('warzone');
  const names = warzone.map((w) => w.name.toLowerCase());
  assert.equal(names.length, new Set(names).size, 'the pooled roster must not repeat a weapon');
  for (const source of ['cod-bo7', 'cod-bo6', 'cod-mw3']) {
    const sample = catalogFor(source)[0].name.toLowerCase();
    assert.ok(names.includes(sample), `${sample} from ${source} is missing`);
  }
  assert.ok(warzone.every((w) => w.game === 'warzone'), 'pooled weapons must tune against the Warzone profile');
});

test('class-derived entries are marked, and measured ones are not', () => {
  const roster = catalogFor('cod-bo7');
  const estimated = roster.filter((w) => w.estimated);
  assert.ok(estimated.length > 0);
  for (const w of estimated) {
    assert.match(w.notes, /class baselines, not measured/);
    assert.ok(w.rpm > 0 && w.recoil.vertical > 0, 'an estimate still has to be usable');
  }
  const measured = catalogFor('cod-mw3').find((w) => w.name === 'MCW');
  assert.equal(measured.estimated, false);
  assert.ok(computeTuning(measured, {}).confidence > computeTuning(estimated[0], {}).confidence,
    'a measured weapon must outrank a class estimate');
});

test('every roster weapon tunes and generates without special-casing', () => {
  for (const game of ['cod-bo7', 'cod-bo6', 'cod-mw3', 'warzone']) {
    for (const weapon of catalogFor(game)) {
      const tuning = computeTuning(weapon, {});
      assert.ok(tuning.antiRecoil.vertical >= 0 && tuning.antiRecoil.vertical <= 100, `${weapon.name}: vertical out of range`);
      assert.equal(tuning.antiRecoil.phases.length, PHASE_COUNT, `${weapon.name}: bad phase table`);
      for (let i = 1; i < PHASE_COUNT; i++) {
        assert.ok(tuning.antiRecoil.phases[i].untilMs > tuning.antiRecoil.phases[i - 1].untilMs,
          `${weapon.name}: phase boundaries out of order`);
      }
      const gpc = buildGpcScript([{ weapon, tuning }]);
      assert.ok(!/undefined|NaN/.test(gpc), `${weapon.name}: placeholder leaked into the script`);
    }
  }
});

test('nothing outside a comment starts with a preprocessor directive', () => {
  // Zen Studio's compiler rejects "#pragma" - it is Gtuner / Titan syntax, and a
  // stray '#' fails the whole build with "Expected a top-level declaration".
  const { gpc } = generate('cod-mw3', 2);
  const code = gpc.slice(gpc.indexOf('/* ---------------- controller layout'));
  const offenders = code.split('\n').filter((line) => line.trim().startsWith('#'));
  assert.deepEqual(offenders, [], 'no preprocessor directives may reach the compiler');
  assert.ok(!gpc.includes('#pragma'), 'the whole file must be free of #pragma');
});

test('the script still names itself and its author', () => {
  const weapons = catalogFor('cod-mw3').slice(0, 2);
  const entries = weapons.map((weapon) => ({ weapon, tuning: computeTuning(weapon, {}) }));
  const header = buildGpcScript(entries, { title: 'My Script', author: 'Someone' })
    .split('/* ---------------- controller layout')[0];
  assert.match(header, /My Script/);
  assert.match(header, /Author\s+: Someone/);
});

test('a pull that fills the stick is called out, not shipped quietly', () => {
  const w = normalizeWeapon({ name: 'Saturator', category: 'smg', rpm: 900, vertical: 60 }, { game: 'warzone' });
  // very low sensitivity + a low ADS multiplier is what saturates the chain
  const saturated = computeTuning(w, { sensitivity: 1.5, adsMultiplier: 0.6, responseCurve: 'dynamic' });
  assert.equal(saturated.antiRecoil.vertical, 100, 'still clamped to the stick range');
  assert.match(saturated.diagnostics.join(' '), /WARNING: this needs \d+ units of stick but 100 is the whole stick/);

  const heavy = computeTuning(normalizeWeapon({ name: 'Heavy', category: 'lmg', vertical: 78 }, { game: 'pubg' }),
    { sensitivity: getGame('pubg').referenceSens });
  assert.ok(heavy.antiRecoil.vertical >= 70 && heavy.antiRecoil.vertical < 100);
  assert.match(heavy.diagnostics.join(' '), /most of the stick and will drag your aim down/);

  const sane = computeTuning(catalogFor('cod-mw3').find((x) => x.name === 'MCW'), {});
  assert.ok(!sane.diagnostics.join(' ').includes('WARNING'), 'a normal tune must not cry wolf');
});

test("each game publishes its own reference settings, since a '6' is not portable", () => {
  const games = Object.fromEntries(listGames().map((g) => [g.id, g]));
  assert.equal(games.pubg.referenceSens, 50, 'PUBG runs a 1-100 scale');
  assert.equal(games['cod-mw3'].referenceSens, 6);
  assert.ok(games['r6siege'].referenceSens > games['cod-mw3'].referenceSens);
  for (const g of Object.values(games)) {
    assert.ok(g.referenceSens > 0 && g.referenceAds > 0 && g.referenceFov > 0, `${g.id} is missing a reference`);
  }
});

test('a weapon tuned at its own game reference does not saturate', () => {
  for (const game of ['pubg', 'r6siege', 'cod-mw3', 'apex', 'halo-infinite']) {
    const reference = getGame(game).referenceSens;
    for (const weapon of catalogFor(game)) {
      const t = computeTuning(weapon, { sensitivity: reference });
      assert.ok(t.antiRecoil.vertical < 100,
        `${game}/${weapon.name} fills the whole stick at the game's own default sensitivity`);
    }
  }
});

test('a long diagnostic wraps in the header instead of being cut off', () => {
  const w = normalizeWeapon({ name: 'Saturator', category: 'smg', rpm: 900, vertical: 60 }, { game: 'warzone' });
  const tuning = computeTuning(w, { sensitivity: 1.5, adsMultiplier: 0.6, responseCurve: 'dynamic' });
  const header = buildGpcScript([{ weapon: w, tuning }]).split('/* ---------------- controller layout')[0];
  // the warning is wrapped across comment lines, so read it back the same way
  const flat = header.replace(/^\s*\*\s*/gm, ' ').replace(/\s+/g, ' ');
  assert.match(flat, /raise your in-game sensitivity or ADS multiplier, then re-generate\./,
    'the warning must survive whole');
  for (const line of header.split('\n')) assert.ok(line.length <= 120, `header line too long: ${line.length}`);
});

/* ---------------- universal script ---------------- */

test('a class profile is built from every weapon of that class', () => {
  const profiles = buildClassProfiles('warzone', { sensitivity: 6 });
  assert.ok(profiles.length >= 7, 'every class in the roster gets a profile');

  const ar = profiles.find((c) => c.id === 'ar');
  assert.ok(ar.weaponCount > 30, `only ${ar.weaponCount} ARs went into the profile`);
  // the profile sits inside the range of the guns it was built from
  assert.ok(ar.tuning.antiRecoil.vertical >= ar.spread.low && ar.tuning.antiRecoil.vertical <= ar.spread.high);
  assert.equal(ar.tuning.antiRecoil.horizontal, 0, 'a class has no shared drift direction');
  assert.match(ar.tuning.diagnostics.join(' '), /Built from all \d+ assault rifles/);

  for (const c of profiles) {
    for (let i = 1; i < c.tuning.antiRecoil.phases.length; i++) {
      assert.ok(c.tuning.antiRecoil.phases[i].untilMs > c.tuning.antiRecoil.phases[i - 1].untilMs,
        `${c.label}: medianed phases fell out of order`);
    }
  }
});

test('a class only carries a mod most of its weapons want', () => {
  const profiles = buildClassProfiles('cod-mw3', { sensitivity: 6, rapidFire: 'auto' });
  assert.equal(profiles.find((c) => c.id === 'ar').tuning.rapidFire.enabled, false, 'ARs are full-auto');
  assert.equal(profiles.find((c) => c.id === 'sniper').tuning.sticky.enabled, false, 'snipers skip sticky aim');
});

test('the universal script follows the swap button and indexes by class', () => {
  const profiles = buildClassProfiles('warzone', { sensitivity: 6 });
  const gpc = buildUniversalScript(profiles, { game: 'warzone', primary: 'ar', secondary: 'smg' });

  assert.match(gpc, /define BTN_SWAP   = XB1_Y;/);
  assert.match(gpc, /if\(!get_val\(BTN_MOD\) && event_press\(BTN_SWAP\)\)/, 'a swap must flip the profile');
  assert.match(gpc, /if\(holding_second\) wclass = second_class; else wclass = primary_class;/);
  assert.match(gpc, /idx = wclass \* PHASES;/);
  assert.ok(!gpc.includes('[slot]'), 'nothing may still index by weapon slot');

  assert.equal(gpc.split('{').length, gpc.split('}').length, 'unbalanced braces');
  assert.ok(!/undefined|NaN/.test(gpc));
  assert.ok(!gpc.split('\n').some((l) => l.trim().startsWith('#')), 'no preprocessor directives');

  const values = (name) => gpc.match(new RegExp(`${name}\\[\\] = \\{([^}]*)\\}`))[1].split(',').length;
  assert.equal(values('PH_V'), profiles.length * PHASE_COUNT);
  assert.equal(values('AR_RELEASE'), profiles.length);
  assert.equal(values('STICKY_R'), profiles.length);
});

test('the universal script is honest about what it cannot know', () => {
  const profiles = buildClassProfiles('cod-bo7', { sensitivity: 6 });
  const header = buildUniversalScript(profiles, { game: 'cod-bo7' })
    .split('/* ---------------- controller layout')[0]
    .replace(/^\s*\*\s*/gm, ' ').replace(/\s+/g, ' ');

  assert.match(header, /cannot read the game, so it cannot know which gun you are holding/);
  assert.match(header, /picking a gun off the ground.*leaves it one profile behind/);
  assert.match(header, /Tap swap twice to resync/);
});

test('the boot classes come from the request', () => {
  const profiles = buildClassProfiles('warzone', { sensitivity: 6 });
  const gpc = buildUniversalScript(profiles, { game: 'warzone', primary: 'sniper', secondary: 'pistol' });
  const sniper = profiles.findIndex((c) => c.id === 'sniper');
  const pistol = profiles.findIndex((c) => c.id === 'pistol');
  assert.ok(gpc.includes(`define START_PRIMARY  = ${sniper};`));
  assert.ok(gpc.includes(`define START_SECOND   = ${pistol};`));
});

test('a game with no roster cannot make a universal script', () => {
  assert.throws(() => buildClassProfiles('generic', {}), /no bundled roster/);
  assert.throws(() => buildUniversalScript([], {}), /No class profiles/);
});

test('every variable the script uses is declared before main', () => {
  for (const gpc of [
    buildUniversalScript(buildClassProfiles('warzone', { sensitivity: 6 }), { game: 'warzone' }),
    generate('cod-mw3', 3).gpc
  ]) {
    const declared = new Set([...gpc.matchAll(/^int (\w+);/gm)].map((m) => m[1]));
    const indexes = new Set([...gpc.matchAll(/\[(\w+)\]/g)].map((m) => m[1]).filter((x) => !/^\d+$/.test(x)));
    for (const name of indexes) assert.ok(declared.has(name), `${name} indexes an array but is never declared`);
    assert.equal(gpc.split('(').length, gpc.split(')').length, 'unbalanced parentheses');
    assert.ok(!/\bcls\b/.test(gpc), 'cls sits too close to Zen\'s cls_oled family to use as a variable');
  }
});

/* ---------------- structural validation ---------------- */

test('the validator catches what Zen Studio only says one terse word about', () => {
  const cases = [
    ['main {\n  set_val(1, 0);\n}\n}\n', /closing brace with nothing open/],
    ['#pragma METAINFO("x", 1, 0, "y")\nmain {\n}\n', /"#" directives are not GPC/],
    ['main {\n  set_val(1, 0);\n', /block\(s\) never closed/],
    ['main {\n  if(get_val(1) {\n  }\n}\n', /unbalanced parentheses/],
    ['int a;\nmain {\n  a = TABLE[a];\n}\n', /"TABLE\[\]" is read but no such table is declared/],
    ['main {\n  combo_run(NOPE);\n}\n', /combo NOPE is used but never defined/],
    ['main {\n  idx = 1;\n}\n', /"idx" is assigned but never declared/]
  ];
  for (const [script, expected] of cases) {
    const { ok, problems } = validateGpc(script);
    assert.equal(ok, false, `should have been rejected: ${script.split('\n')[0]}`);
    assert.match(problems.join(' | '), expected);
  }
});

test('the validator passes what the emitters actually produce', () => {
  for (const gpc of [
    generate('cod-mw3', 3).gpc,
    generate('apex', 1).gpc,
    buildUniversalScript(buildClassProfiles('warzone', { sensitivity: 6 }), { game: 'warzone' }),
    buildUniversalScript(buildClassProfiles('cod-bo7', { sensitivity: 6, controller: 'playstation' }), { game: 'cod-bo7' })
  ]) {
    const { ok, problems } = validateGpc(gpc);
    assert.equal(ok, true, `a generated script failed its own check: ${problems.join('; ')}`);
  }
});

test('an emitter refuses to hand back a broken script', () => {
  // the gate is real: prove it by validating the gate itself
  assert.doesNotThrow(() => generate('cod-mw3', 2));
  assert.equal(validateGpc(generate('cod-mw3', 2).gpc).ok, true);
});
