/* Sticky Aim Weapon Studio - front end.
   State lives here; all maths happen server-side in core/ so the CLI, the tests
   and the page can never disagree about what a weapon tunes to. */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  meta: null,
  game: 'cod-mw3',
  profile: {},
  weapons: [],
  entries: [],
  script: '',
  fileName: 'weapon.gpc',
  selected: 0,
  scriptOptions: { title: '', author: '', modButton: 'view', startSlot: 0 }
};

const SETUP_STORE = 'stickyaim.setups.v1';

/* ------------------------------------------------------------------ */
/* plumbing                                                            */
/* ------------------------------------------------------------------ */

async function api(path, body) {
  const res = await fetch(path, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

let toastTimer;
function toast(message, isError = false) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.toggle('err', isError);
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 3200);
}

async function withBusy(button, fn) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Working…';
  try {
    await fn();
  } catch (err) {
    toast(err.message, true);
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

/** Live text for each range control, so the sliders read as values not numbers. */
const RANGE_LABELS = {
  strength: (v) => `${v}%`,
  releaseScale: (v) => (v === 100 ? 'normal' : v > 100 ? `${v}% (harder to cancel)` : `${v}% (easier to cancel)`),
  stickyStrength: (v) => (Number(v) === 0 ? 'off' : `${v}%`),
  stickySpeed: (v) => `${v}%`,
  adsSlowPercent: (v) => (v >= 100 ? 'off' : `${v}%`)
};

const SHAPE_LABELS = {
  circle: 'Circle — even coverage',
  horizontal: 'Horizontal — left/right only',
  vertical: 'Vertical — up/down only',
  diagonal: 'Diagonal — corners, widest sweep'
};

const TARGET_LABELS = {
  none: 'Just note it',
  vertical: 'Vertical pull',
  horizontal: 'Horizontal pull',
  sticky: 'Sticky aim radius',
  rapidFire: 'Fire rate'
};

/* Settings people actually have to think about, per game family. Starting points
   for the "add common ones" button - all of them still need a value and a call
   on what they should do. */
const SUGGESTED_SETTINGS = {
  cod: [
    { name: 'Aim Response Curve Slope', value: '', affects: 'none' },
    { name: 'ADS Sens Multiplier (low zoom)', value: '', affects: 'none' },
    { name: 'Target Aim Assist', value: '', affects: 'sticky', adjust: -10 },
    { name: 'Weapon Mount Activation', value: '', affects: 'none' }
  ],
  apex: [
    { name: 'Per-optic ADS sensitivity', value: '', affects: 'none' },
    { name: 'Deadzone setting', value: '', affects: 'none' },
    { name: 'Response curve', value: '', affects: 'none' }
  ],
  generic: [
    { name: 'Aim acceleration', value: '', affects: 'vertical', adjust: 10 },
    { name: 'Scope / optic zoom', value: '', affects: 'vertical', adjust: 15 },
    { name: 'Controller vibration', value: '', affects: 'none' }
  ]
};

const WHEN_LABELS = {
  ads: 'While aiming (ADS)',
  ads_fire: 'While aiming and firing',
  always: 'All the time'
};

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ */
/* boot                                                                */
/* ------------------------------------------------------------------ */

async function boot() {
  state.meta = await api('/api/meta');
  state.profile = { ...state.meta.defaultProfile };

  $('#game').innerHTML = state.meta.games.map((g) => `<option value="${g.id}">${escapeHtml(g.name)}</option>`).join('');
  $('#game').value = state.game;

  $('#m-category').innerHTML = state.meta.categories.map((c) => `<option value="${c.id}">${escapeHtml(c.label)}</option>`).join('');
  $('#p-controller').innerHTML = state.meta.layouts.map((l) => `<option value="${l.id}">${escapeHtml(l.label)}</option>`).join('');
  $('#p-stickyShape').innerHTML = state.meta.options.stickyShapes
    .map((id) => `<option value="${id}">${escapeHtml(SHAPE_LABELS[id] || id)}</option>`).join('');
  $('#p-stickyWhen').innerHTML = state.meta.options.stickyWhen
    .map((id) => `<option value="${id}">${escapeHtml(WHEN_LABELS[id] || id)}</option>`).join('');
  $('#p-aimAssist').innerHTML = state.meta.options.aimAssist
    .map((a) => `<option value="${a.id}">${escapeHtml(a.label)}</option>`).join('');

  const badge = $('#ai-badge');
  badge.textContent = state.meta.ai.enabled ? `AI: ${state.meta.ai.model}` : 'AI: off (no API key)';
  badge.classList.toggle('on', state.meta.ai.enabled);
  if (!state.meta.ai.enabled) {
    $('#btn-shot').disabled = true;
    $('#describe-mode').textContent = 'No API key - text will be parsed locally.';
  }

  syncProfileInputs();
  renderCustomSettings();
  renderSetupList();
  renderCatalog();
  renderSlots();
  renderModButtons();
  wire();
}

function syncProfileInputs() {
  for (const [key, value] of Object.entries(state.profile)) {
    const el = $(`#p-${key}`);
    if (!el || Array.isArray(value)) continue;
    if (el.type === 'checkbox') el.checked = Boolean(value);
    else el.value = value;
  }
  for (const [key, format] of Object.entries(RANGE_LABELS)) {
    const out = $(`#p-${key}-val`);
    if (out) out.textContent = format(state.profile[key]);
  }
}

/* ------------------------------------------------------------------ */
/* rendering                                                           */
/* ------------------------------------------------------------------ */

function renderCatalog() {
  const list = state.meta.catalog[state.game] || [];
  const box = $('#catalog');
  if (!list.length) {
    box.innerHTML = '<div class="empty">No bundled presets for this game yet - use Describe, JSON, CSV or Manual.</div>';
    return;
  }
  box.innerHTML = list.map((w, i) => `
    <button data-preset="${i}">
      <span class="cname">${escapeHtml(w.name)}</span>
      <span class="cmeta">${w.rpm} rpm · V${w.recoil.vertical} H${w.recoil.horizontal}</span>
    </button>`).join('');
}

function renderSlots() {
  const box = $('#slot-list');
  $('#slot-count').textContent = `${state.weapons.length} / ${state.meta.maxSlots}`;
  if (!state.weapons.length) {
    box.innerHTML = '<div class="empty">No weapons yet.<br>Import one to start.</div>';
    return;
  }
  box.innerHTML = state.weapons.map((w, i) => {
    const t = state.entries[i]?.tuning;
    return `
      <div class="slot" aria-current="${i === state.selected}" data-slot="${i}">
        <span class="idx">${i}</span>
        <span>
          <span class="name">${escapeHtml(w.name)}</span><br>
          <span class="meta">${w.rpm}rpm${t ? ` · V${t.antiRecoil.vertical} H${t.antiRecoil.horizontal}` : ''} · ${escapeHtml(w.source)}</span>
        </span>
        <span>
          <button class="drag" data-move="${i}" data-dir="-1" title="Move up">&#9650;</button>
          <button class="drag" data-move="${i}" data-dir="1" title="Move down">&#9660;</button>
          <button class="drag danger" data-remove="${i}" title="Remove">&times;</button>
        </span>
      </div>`;
  }).join('');
  renderStartSlots();
}

function renderModButtons() {
  const layout = state.meta.layouts.find((l) => l.id === state.profile.controller) || state.meta.layouts[0];
  $('#s-mod').innerHTML = layout.modButtons
    .map((b) => `<option value="${b.key}">${escapeHtml(b.name)}</option>`).join('');
  $('#s-mod').value = state.scriptOptions.modButton;
}

function renderStartSlots() {
  $('#s-start').innerHTML = state.weapons
    .map((w, i) => `<option value="${i}">${i} - ${escapeHtml(w.name)}</option>`).join('') || '<option value="0">0</option>';
  $('#s-start').value = Math.min(state.scriptOptions.startSlot, Math.max(state.weapons.length - 1, 0));
}

function renderScript() {
  $('#script-out').textContent = state.script || 'Add a weapon, then press Generate script.';
  $('#script-meta').textContent = state.script
    ? `${state.fileName} · ${state.script.split('\n').length} lines · ${state.weapons.length} slot(s)`
    : '';
}

/* ---- tune detail ---- */

function renderTune() {
  const box = $('#tune-detail');
  const entry = state.entries[state.selected];
  if (!entry) {
    box.innerHTML = '<div class="empty">Add a weapon to see its tuning.</div>';
    return;
  }
  const { weapon, tuning } = entry;
  const ar = tuning.antiRecoil;

  box.innerHTML = `
    <div class="row" style="justify-content:space-between;align-items:baseline">
      <h2>Slot ${state.selected} — ${escapeHtml(weapon.name)}</h2>
      <span class="hint">confidence ${Math.round(tuning.confidence * 100)}% · source ${escapeHtml(weapon.source)}</span>
    </div>

    <div class="stat-row" style="margin:12px 0">
      <div class="stat"><div class="k">Vertical</div><div class="v">${ar.vertical}</div><div class="u">stick units</div></div>
      <div class="stat"><div class="k">Horizontal</div><div class="v">${ar.horizontal}</div><div class="u">${ar.horizontal === 0 ? 'no drift' : ar.horizontal > 0 ? 'push right' : 'push left'}</div></div>
      <div class="stat"><div class="k">Starts after</div><div class="v">${ar.kickMs}</div><div class="u">ms</div></div>
      <div class="stat"><div class="k">Rapid fire</div><div class="v">${tuning.rapidFire.enabled ? tuning.rapidFire.effectiveRpm : '—'}</div><div class="u">${tuning.rapidFire.enabled ? 'rpm' : 'off'}</div></div>
      <div class="stat"><div class="k">Sticky aim</div><div class="v">${tuning.sticky.enabled ? '±' + tuning.sticky.radius : '—'}</div><div class="u">${tuning.sticky.enabled ? tuning.sticky.periodMs + 'ms' : 'off'}</div></div>
    </div>

    <h3>Compensation over one trigger pull</h3>
    <div class="legend">
      <span><i style="background:var(--series-1)"></i>Vertical push</span>
      ${ar.phases.some((p) => p.horizontal !== 0)
        ? '<span><i style="background:var(--series-2)"></i>Horizontal push</span>'
        : '<span style="color:var(--text-muted)">no horizontal correction</span>'}
    </div>
    <div class="chart-wrap" id="chart-wrap">${phaseChart(ar.phases)}<div class="tooltip" id="chart-tip"></div></div>

    <table style="margin-top:14px">
      <thead><tr><th>Phase</th><th class="num">Until (ms)</th><th class="num">Vertical</th><th class="num">Horizontal</th></tr></thead>
      <tbody>
        ${ar.phases.map((p, i) => `<tr>
          <td>${i === 0 ? 'dead time' : i === ar.phases.length - 1 ? 'sustained' : 'ramp ' + i}</td>
          <td class="num">${p.untilMs >= 32000 ? '∞' : p.untilMs}</td>
          <td class="num">${p.vertical}</td>
          <td class="num">${p.horizontal}</td>
        </tr>`).join('')}
      </tbody>
    </table>

    <h3 style="margin-top:18px">Why these numbers</h3>
    <ul class="diagnostics">
      ${tuning.diagnostics.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}
      ${(weapon.warnings || []).map((w) => `<li class="warn">⚠ ${escapeHtml(w)}</li>`).join('')}
    </ul>

    <h3 style="margin-top:18px">Weapon stats (edit to re-tune)</h3>
    <div class="grid-2">
      <label class="field">Name <input data-w="name" value="${escapeHtml(weapon.name)}"></label>
      <label class="field">Class <select data-w="category">${state.meta.categories.map((c) =>
        `<option value="${c.id}"${c.id === weapon.category ? ' selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}</select></label>
      <label class="field">Fire mode <select data-w="fireMode">${['auto', 'semi', 'burst'].map((m) =>
        `<option value="${m}"${m === weapon.fireMode ? ' selected' : ''}>${m}</option>`).join('')}</select></label>
      <label class="field">RPM <input data-w="rpm" type="number" value="${weapon.rpm}" min="30" max="2000"></label>
      <label class="field">Vertical recoil <input data-w="vertical" type="number" value="${weapon.recoil.vertical}" min="0" max="100"></label>
      <label class="field">Horizontal recoil <input data-w="horizontal" type="number" value="${weapon.recoil.horizontal}" min="0" max="100"></label>
      <label class="field">Drift (-1 left … +1 right)
        <input data-w="drift" type="number" step="0.1" min="-1" max="1" value="${weapon.recoil.drift}">
      </label>
      <label class="field">First-shot delay (ms) <input data-w="firstShotKickMs" type="number" value="${weapon.recoil.firstShotKickMs}" min="0" max="600"></label>
    </div>

    <h3 style="margin-top:18px">Overrides for this weapon</h3>
    <p class="hint">Leave a box empty to keep the calculated value. Anything you set here wins for this slot only,
      and is marked with a <b>*</b> in the script header.</p>
    <div class="grid-2">
      ${overrideNumber('antiRecoilVertical', 'Vertical push', tuning, weapon)}
      ${overrideNumber('antiRecoilHorizontal', 'Horizontal push', tuning, weapon)}
      ${overrideNumber('kickMs', 'Start delay (ms)', tuning, weapon)}
      ${overrideNumber('releaseThreshold', 'Release threshold', tuning, weapon)}
      ${overrideMode('sticky', 'Sticky aim', tuning, weapon)}
      ${overrideNumber('stickyRadius', 'Sticky radius', tuning, weapon)}
      ${overrideNumber('stickyPeriodMs', 'Sticky step (ms)', tuning, weapon)}
      ${overrideMode('rapidFire', 'Rapid fire', tuning, weapon)}
    </div>
    <div class="row" style="margin-top:10px">
      <button class="ghost" id="btn-reset-overrides"${Object.keys(weapon.overrides || {}).length ? '' : ' disabled'}>
        Reset this weapon to auto
      </button>
      <span class="hint">${(tuning.overridden || []).length} value(s) set by hand</span>
    </div>`;

  wireWeaponEditor();
  wireOverrides();
  wireChart(ar.phases);
}

/**
 * Step chart of the correction applied over one trigger pull.
 * One y-axis (stick units) shared by both series - they are the same unit.
 */
function phaseChart(phases) {
  const W = 680, H = 190, L = 42, R = 46, T = 12, B = 26;   // R leaves a gutter for the direct labels
  const last = phases[phases.length - 1];
  const visibleEnd = Math.max(phases[phases.length - 2]?.untilMs ?? 400, 200) * 1.45;
  const maxY = Math.max(10, ...phases.map((p) => Math.max(p.vertical, p.horizontal)));
  const minY = Math.min(0, ...phases.map((p) => p.horizontal));
  const x = (ms) => L + (Math.min(ms, visibleEnd) / visibleEnd) * (W - L - R);
  const y = (v) => T + (1 - (v - minY) / (maxY - minY || 1)) * (H - T - B);

  const steps = (key) => {
    let d = `M ${x(0)} ${y(phases[0][key])}`;
    let prev = phases[0][key];
    for (const p of phases) {
      d += ` L ${x(p.untilMs)} ${y(prev)}`;
      const next = p === last ? p[key] : phases[phases.indexOf(p) + 1][key];
      d += ` L ${x(p.untilMs)} ${y(next)}`;
      prev = next;
    }
    d += ` L ${x(visibleEnd)} ${y(last[key])}`;
    return d;
  };

  // Direct labels sit in the right gutter; nudge them apart if the two series end close together.
  const labelY = { v: y(last.vertical) + 4, h: y(last.horizontal) + 4 };
  if (Math.abs(labelY.v - labelY.h) < 14) labelY.h = labelY.v + 14;

  const hasH = phases.some((p) => p.horizontal !== 0);
  const gridY = [minY, Math.round((minY + maxY) / 2), maxY];
  const ticks = [0, Math.round(visibleEnd / 2), Math.round(visibleEnd)];

  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Correction applied over time; the table below has the same values.">
    ${gridY.map((v) => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/>
      <text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" fill="var(--text-muted)" font-size="11">${v}</text>`).join('')}
    ${ticks.map((t, i) => `<text x="${x(t)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle'}" fill="var(--text-muted)" font-size="11">${t}ms</text>`).join('')}
    ${hasH ? `<path d="${steps('horizontal')}" fill="none" stroke="var(--series-2)" stroke-width="2" stroke-linejoin="round"/>` : ''}
    <path d="${steps('vertical')}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round"/>
    <text x="${W - R + 7}" y="${labelY.v}" fill="var(--series-1)" font-size="12" font-weight="600">${last.vertical}</text>
    ${hasH ? `<text x="${W - R + 7}" y="${labelY.h}" fill="var(--series-2)" font-size="12" font-weight="600">${last.horizontal}</text>` : ''}
    ${phases.map((p, i) => {
      const from = i === 0 ? 0 : phases[i - 1].untilMs;
      return `<rect class="hit" data-phase="${i}" x="${x(from)}" y="${T}" width="${Math.max(x(p.untilMs) - x(from), 1)}" height="${H - T - B}" fill="transparent"/>`;
    }).join('')}
  </svg>`;
}

function wireChart(phases) {
  const wrap = $('#chart-wrap');
  const tip = $('#chart-tip');
  if (!wrap) return;
  wrap.addEventListener('mousemove', (e) => {
    const hit = e.target.closest('.hit');
    if (!hit) { tip.classList.remove('on'); return; }
    const p = phases[Number(hit.dataset.phase)];
    const from = Number(hit.dataset.phase) === 0 ? 0 : phases[Number(hit.dataset.phase) - 1].untilMs;
    tip.innerHTML = `${from}–${p.untilMs >= 32000 ? '∞' : p.untilMs}ms<br>V ${p.vertical} · H ${p.horizontal}`;
    const box = wrap.getBoundingClientRect();
    tip.style.left = `${e.clientX - box.left}px`;
    tip.style.top = `${e.clientY - box.top}px`;
    tip.classList.add('on');
  });
  wrap.addEventListener('mouseleave', () => tip.classList.remove('on'));
}

/* ------------------------------------------------------------------ */
/* actions                                                             */
/* ------------------------------------------------------------------ */

function addWeapons(weapons, note) {
  const room = state.meta.maxSlots - state.weapons.length;
  if (room <= 0) return toast(`A script holds ${state.meta.maxSlots} slots - remove one first.`, true);
  const added = weapons.slice(0, room);
  state.weapons.push(...added);
  state.selected = state.weapons.length - 1;
  toast(note || `Added ${added.length} weapon${added.length === 1 ? '' : 's'}.`);
  if (added.length < weapons.length) toast(`Only ${added.length} fitted - ${state.meta.maxSlots} slot limit.`, true);
  refresh();
}

let refreshTimer;
function refresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (!state.weapons.length) {
      state.entries = [];
      state.script = '';
      renderSlots(); renderTune(); renderScript();
      return;
    }
    try {
      const result = await api('/api/generate', {
        weapons: state.weapons,
        profile: { ...state.profile, game: state.game },
        ...state.scriptOptions
      });
      state.entries = result.entries;
      state.script = result.gpc;
      state.fileName = result.fileName;
      // keep the canonical (normalised) weapons so edits round-trip cleanly
      state.weapons = result.entries.map((e) => e.weapon);
      renderSlots(); renderTune(); renderScript();
    } catch (err) {
      toast(err.message, true);
    }
  }, 120);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

/* ------------------------------------------------------------------ */
/* wiring                                                              */
/* ------------------------------------------------------------------ */

function wire() {
  // tabs
  $$('.tabs [role="tab"]').forEach((btn) => btn.addEventListener('click', () => {
    $$('.tabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    ['import', 'tune', 'script', 'coach'].forEach((id) => { $(`#tab-${id}`).hidden = id !== btn.dataset.tab; });
  }));
  $$('.subtabs [role="tab"]').forEach((btn) => btn.addEventListener('click', () => {
    $$('.subtabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
    ['catalog', 'describe', 'screenshot', 'json', 'csv', 'manual']
      .forEach((id) => { $(`#sub-${id}`).hidden = id !== btn.dataset.sub; });
  }));

  // game
  $('#game').addEventListener('change', (e) => {
    state.game = e.target.value;
    renderCatalog();
    refresh();
  });

  // catalog
  $('#catalog').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    const weapon = state.meta.catalog[state.game][Number(btn.dataset.preset)];
    addWeapons([structuredClone(weapon)]);
  });

  // slot list
  $('#slot-list').addEventListener('click', (e) => {
    const remove = e.target.closest('[data-remove]');
    const move = e.target.closest('[data-move]');
    const slot = e.target.closest('[data-slot]');
    if (remove) {
      state.weapons.splice(Number(remove.dataset.remove), 1);
      state.selected = Math.max(0, Math.min(state.selected, state.weapons.length - 1));
      return refresh();
    }
    if (move) {
      const i = Number(move.dataset.move);
      const j = i + Number(move.dataset.dir);
      if (j < 0 || j >= state.weapons.length) return;
      [state.weapons[i], state.weapons[j]] = [state.weapons[j], state.weapons[i]];
      state.selected = j;
      return refresh();
    }
    if (slot) {
      state.selected = Number(slot.dataset.slot);
      renderSlots();
      renderTune();
    }
  });

  $('#btn-clear').addEventListener('click', () => {
    if (!state.weapons.length) return;
    state.weapons = [];
    state.selected = 0;
    refresh();
    toast('Loadout cleared.');
  });

  $('#btn-export-weapons').addEventListener('click', () => {
    if (!state.weapons.length) return toast('Nothing to export.', true);
    download(JSON.stringify({ game: state.game, profile: state.profile, weapons: state.weapons }, null, 2),
      'sticky-aim-loadout.json', 'application/json');
  });

  // profile inputs
  $$('[id^="p-"]').forEach((el) => {
    if (!el.id.match(/^p-[a-zA-Z]+$/)) return;
    const key = el.id.slice(2);
    el.addEventListener('input', () => {
      state.profile[key] = el.type === 'checkbox' ? el.checked : (el.type === 'number' || el.type === 'range' ? Number(el.value) : el.value);
      const out = $(`#p-${key}-val`);
      if (out && RANGE_LABELS[key]) out.textContent = RANGE_LABELS[key](Number(el.value));
      if (key === 'controller') renderModButtons();
      refresh();
    });
  });

  // your own settings
  $('#btn-add-setting').addEventListener('click', () => addCustomSetting());

  $('#btn-suggest-settings').addEventListener('click', () => {
    const family = (state.meta.games.find((g) => g.id === state.game)?.id || '').split('-')[0];
    const list = SUGGESTED_SETTINGS[family] || SUGGESTED_SETTINGS[state.game] || SUGGESTED_SETTINGS.generic;
    const existing = new Set((state.profile.customSettings || []).map((r) => r.name.toLowerCase()));
    const added = list.filter((row) => !existing.has(row.name.toLowerCase()));
    added.forEach((row) => addCustomSetting(row));
    toast(added.length ? `Added ${added.length} - fill in your values.` : 'Those are already in the list.');
  });

  // saved setups
  $('#btn-save-setup').addEventListener('click', () => {
    const name = ($('#setup-name').value || '').trim() || `${state.game} setup`;
    const setups = readSetups();
    setups[name] = { game: state.game, profile: state.profile, savedAt: new Date().toISOString() };
    if (!writeSetups(setups)) return;
    renderSetupList(name);
    toast(`Saved "${name}".`);
  });

  $('#btn-load-setup').addEventListener('click', () => {
    const name = $('#setup-list').value;
    const setup = readSetups()[name];
    if (!setup) return toast('Nothing to load.', true);
    state.profile = { ...state.meta.defaultProfile, ...setup.profile };
    if (setup.game && state.meta.games.some((g) => g.id === setup.game)) {
      state.game = setup.game;
      $('#game').value = setup.game;
      renderCatalog();
    }
    syncProfileInputs();
    renderCustomSettings();
    renderModButtons();
    refresh();
    toast(`Loaded "${name}".`);
  });

  $('#btn-delete-setup').addEventListener('click', () => {
    const name = $('#setup-list').value;
    if (!name) return;
    const setups = readSetups();
    delete setups[name];
    writeSetups(setups);
    renderSetupList();
    toast(`Deleted "${name}".`);
  });

  // script options
  $('#s-title').addEventListener('input', (e) => { state.scriptOptions.title = e.target.value; refresh(); });
  $('#s-author').addEventListener('input', (e) => { state.scriptOptions.author = e.target.value; refresh(); });
  $('#s-mod').addEventListener('change', (e) => { state.scriptOptions.modButton = e.target.value; refresh(); });
  $('#s-start').addEventListener('change', (e) => { state.scriptOptions.startSlot = Number(e.target.value); refresh(); });

  $('#btn-generate').addEventListener('click', () => {
    if (!state.weapons.length) return toast('Add a weapon first.', true);
    $$('.tabs [role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === 'script')));
    ['import', 'tune', 'script', 'coach'].forEach((id) => { $(`#tab-${id}`).hidden = id !== 'script'; });
    refresh();
  });

  $('#btn-copy').addEventListener('click', async () => {
    if (!state.script) return toast('Nothing to copy yet.', true);
    try {
      await navigator.clipboard.writeText(state.script);
      toast('Script copied - paste it into Zen Studio.');
    } catch {
      toast('Clipboard blocked - select the text and copy manually.', true);
    }
  });

  $('#btn-download').addEventListener('click', () => {
    if (!state.script) return toast('Nothing to download yet.', true);
    download(state.script, state.fileName, 'text/plain');
  });

  // importers
  $('#btn-json').addEventListener('click', (e) => withBusy(e.target, async () => {
    const { weapons } = await api('/api/import', { kind: 'json', payload: $('#json-text').value, game: state.game });
    addWeapons(weapons);
  }));

  $('#btn-csv').addEventListener('click', (e) => withBusy(e.target, async () => {
    const { weapons } = await api('/api/import', { kind: 'csv', payload: $('#csv-text').value, game: state.game });
    addWeapons(weapons);
  }));

  $('#btn-describe').addEventListener('click', (e) => withBusy(e.target, async () => {
    const result = await api('/api/import', { kind: 'text', payload: $('#describe-text').value, game: state.game });
    $('#describe-mode').textContent = result.mode === 'ai' ? 'Read by Claude.' : 'Parsed locally.';
    if (result.notes) toast(result.notes);
    addWeapons(result.weapons);
  }));

  $('#shot-file').addEventListener('change', (e) => {
    $('#shot-name').textContent = e.target.files[0]?.name || '';
  });

  $('#btn-shot').addEventListener('click', (e) => withBusy(e.target, async () => {
    const file = $('#shot-file').files[0];
    if (!file) throw new Error('Choose a screenshot first.');
    const result = await api('/api/import', {
      kind: 'image',
      payload: await fileToBase64(file),
      mediaType: file.type || 'image/png',
      hint: $('#shot-hint').value,
      game: state.game
    });
    if (result.notes) toast(result.notes);
    addWeapons(result.weapons);
  }));

  $('#btn-manual').addEventListener('click', (e) => withBusy(e.target, async () => {
    const { weapons } = await api('/api/import', {
      kind: 'manual',
      game: state.game,
      weapon: {
        name: $('#m-name').value || 'Custom weapon',
        category: $('#m-category').value,
        fireMode: $('#m-firemode').value,
        rpm: Number($('#m-rpm').value),
        vertical: Number($('#m-vertical').value),
        horizontal: Number($('#m-horizontal').value),
        drift: $('#m-drift').value,
        magSize: Number($('#m-mag').value)
      }
    });
    addWeapons(weapons);
  }));

  // coach
  $('#btn-coach').addEventListener('click', (e) => withBusy(e.target, async () => {
    if (!state.weapons.length) throw new Error('Add a weapon first.');
    const result = await api('/api/coach', {
      weapons: state.weapons,
      profile: { ...state.profile, game: state.game },
      question: $('#coach-q').value
    });
    $('#coach-mode').textContent = result.mode === 'ai' ? 'Reviewed by Claude.' : 'Offline notes.';
    $('#coach-out').innerHTML = miniMarkdown(result.text);
  }));
}



/* ---------------- your own in-game settings ---------------- */

function renderCustomSettings() {
  const rows = state.profile.customSettings || [];
  const box = $('#custom-settings');
  if (!rows.length) {
    box.innerHTML = '<div class="empty">No settings of your own yet. Add the ones from your options menu that ' +
      'change how a gun handles.</div>';
    return;
  }
  box.innerHTML = rows.map((row, i) => `
    <div class="setting-row" data-row="${i}">
      <input data-cs="name" value="${escapeHtml(row.name)}" placeholder="Setting name" aria-label="Setting name">
      <input data-cs="value" value="${escapeHtml(row.value)}" placeholder="Value" aria-label="Value">
      <select data-cs="affects" aria-label="What it changes">${state.meta.options.customTargets.map((t) =>
        `<option value="${t}"${t === row.affects ? ' selected' : ''}>${escapeHtml(TARGET_LABELS[t] || t)}</option>`).join('')}</select>
      <span class="adjust${row.affects === 'none' ? ' off' : ''}">
        <input data-cs="adjust" type="number" step="5" min="-75" max="100" value="${row.adjust}"
          ${row.affects === 'none' ? 'disabled' : ''} aria-label="Percent change">
        <span class="hint">%</span>
      </span>
      <button class="drag danger" data-remove-cs="${i}" title="Remove">&times;</button>
    </div>`).join('');

  $$('#custom-settings [data-cs]').forEach((el) => {
    el.addEventListener('change', () => {
      const i = Number(el.closest('[data-row]').dataset.row);
      const key = el.dataset.cs;
      state.profile.customSettings[i][key] = key === 'adjust' ? Number(el.value) : el.value;
      if (key === 'affects') renderCustomSettings();   // enable/disable the % box
      refresh();
    });
  });

  $$('#custom-settings [data-remove-cs]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.profile.customSettings.splice(Number(btn.dataset.removeCs), 1);
      renderCustomSettings();
      refresh();
    });
  });
}

function addCustomSetting(row = {}) {
  state.profile.customSettings = state.profile.customSettings || [];
  if (state.profile.customSettings.length >= 24) return toast('24 settings is the limit.', true);
  state.profile.customSettings.push({
    id: `cs${Date.now()}${state.profile.customSettings.length}`,
    name: row.name || '',
    value: row.value || '',
    affects: row.affects || 'none',
    adjust: row.adjust ?? 0
  });
  renderCustomSettings();
  refresh();
}

/* ---------------- saved setups ---------------- */

function readSetups() {
  try {
    return JSON.parse(localStorage.getItem(SETUP_STORE) || '{}');
  } catch {
    return {};   // private mode, cleared storage, corrupt entry - all the same to us
  }
}

function writeSetups(setups) {
  try {
    localStorage.setItem(SETUP_STORE, JSON.stringify(setups));
    return true;
  } catch {
    toast('This browser will not let the page save settings.', true);
    return false;
  }
}

function renderSetupList(selected) {
  const names = Object.keys(readSetups()).sort();
  $('#setup-list').innerHTML = names.length
    ? names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')
    : '<option value="">no saved setups</option>';
  if (selected && names.includes(selected)) $('#setup-list').value = selected;
  for (const id of ['#btn-load-setup', '#btn-delete-setup']) $(id).disabled = !names.length;
}

/** One override input: empty means "auto", and the placeholder shows what auto is. */
function overrideNumber(key, label, tuning, weapon) {
  const spec = state.meta.options.overrides[key];
  const current = weapon.overrides?.[key];
  const autoValue = tuning.auto?.[key];
  return `<label class="field">${escapeHtml(label)}
    <input data-ov="${key}" type="number" min="${spec.min}" max="${spec.max}"
      value="${current ?? ''}" placeholder="auto${autoValue === undefined ? '' : ` (${autoValue})`}">
  </label>`;
}

function overrideMode(key, label, tuning, weapon) {
  const current = weapon.overrides?.[key] || 'auto';
  const autoValue = tuning.auto?.[key];
  const options = [
    ['auto', `Auto${autoValue ? ` (${autoValue})` : ''}`],
    ['on', 'Force on'],
    ['off', 'Force off']
  ];
  return `<label class="field">${escapeHtml(label)}
    <select data-ov="${key}">${options.map(([v, text]) =>
      `<option value="${v}"${v === current ? ' selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select>
  </label>`;
}

function wireOverrides() {
  $$('#tune-detail [data-ov]').forEach((el) => {
    el.addEventListener('change', () => {
      const weapon = state.weapons[state.selected];
      weapon.overrides = { ...(weapon.overrides || {}) };
      const key = el.dataset.ov;
      const raw = el.value;
      if (raw === '' || raw === 'auto') delete weapon.overrides[key];
      else weapon.overrides[key] = el.type === 'number' ? Number(raw) : raw;
      refresh();
    });
  });

  const reset = $('#btn-reset-overrides');
  if (reset) reset.addEventListener('click', () => {
    state.weapons[state.selected].overrides = {};
    toast('Back to the calculated values.');
    refresh();
  });
}

function wireWeaponEditor() {
  $$('#tune-detail [data-w]').forEach((el) => {
    el.addEventListener('change', () => {
      const weapon = state.weapons[state.selected];
      const key = el.dataset.w;
      const value = el.type === 'number' ? Number(el.value) : el.value;
      if (key === 'vertical' || key === 'horizontal') weapon.recoil[key] = value;
      else if (key === 'drift') weapon.recoil.drift = Number(value);
      else if (key === 'firstShotKickMs') weapon.recoil.firstShotKickMs = value;
      else weapon[key] = value;
      weapon.source = 'manual';
      refresh();
    });
  });
}

function download(text, fileName, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Saved ${fileName}`);
}

/** Just enough markdown for the coach output - bullets, bold, code. */
function miniMarkdown(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

boot().catch((err) => {
  document.body.insertAdjacentHTML('afterbegin',
    `<div class="card" style="margin:20px">Could not start: ${escapeHtml(err.message)}</div>`);
});
