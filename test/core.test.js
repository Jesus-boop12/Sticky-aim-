import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeWeapon, importFromCsv, importFromJson, importFromTextHeuristic, parseCsv } from '../core/weapons.js';
import { computeTuning, normalizeProfile, PHASE_COUNT } from '../core/tuning.js';
import { buildGpcScript, scriptFileName, MAX_SLOTS } from '../core/gpc.js';
import { catalogFor } from '../core/catalog.js';
import { getGame } from '../core/games.js';

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
  for (const token of ['#pragma METAINFO', 'define BTN_FIRE', 'const int16 PH_UNTIL[]', 'init {', 'main {', 'function lim(', 'combo FEEDBACK {']) {
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
  const header = gpc.slice(0, gpc.indexOf('#pragma'));
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
  const header = gpc.slice(0, gpc.indexOf('#pragma'));
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
  const header = gpc.slice(0, gpc.indexOf('#pragma'));
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
