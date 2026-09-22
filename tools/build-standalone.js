/**
 * Build a single self-contained HTML file.
 *
 * The result runs the whole studio - catalog, importers, tuner, GPC emitter -
 * in the browser with no server and no network, so it can be opened from a
 * phone, a shared link, or a file on a USB stick. The AI importers are the one
 * thing left behind: they need an API key, which means they need the server.
 *
 *   node tools/build-standalone.js [outfile]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/** Dependency order matters: concatenation replaces the module graph. */
const CORE_MODULES = ['core/games.js', 'core/weapons.js', 'core/catalog.js', 'core/tuning.js', 'core/gpc.js', 'core/coach.js'];

/** Flatten one ES module into plain top-level code. */
function inlineModule(src) {
  return src
    .replace(/^import[\s\S]*?from\s+'[^']+';\s*$/gm, '')
    .replace(/^export\s+(const|function|class|let|var)\b/gm, '$1')
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, '')
    .trim();
}

export function buildStandalone() {
  const html = read('web/index.html');
  const css = read('web/styles.css');
  const app = read('web/app.js');

  const body = html.slice(html.indexOf('<body>') + '<body>'.length, html.lastIndexOf('</body>'))
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .trim();

  const core = CORE_MODULES.map((file) => `/* ---- ${file} ---- */\n${inlineModule(read(file))}`).join('\n\n');

  // The served app asks a Node server these questions; here they are answered in-page.
  const transport = `
window.stickyAimApi = async function stickyAimApi(path, body) {
  const profile = () => normalizeProfile(body.profile || {});
  const entries = () => {
    const p = profile();
    const weapons = Array.isArray(body.weapons) ? body.weapons : [];
    if (!weapons.length) throw new Error('Add at least one weapon first.');
    if (weapons.length > MAX_SLOTS) throw new Error('A script holds at most ' + MAX_SLOTS + ' weapon slots.');
    return weapons.map((raw) => {
      const weapon = normalizeWeapon(raw, { game: raw.game || p.game });
      return { weapon, tuning: computeTuning(weapon, { ...p, game: weapon.game }) };
    });
  };

  switch (path) {
    case '/api/meta':
      return {
        games: listGames(),
        categories: Object.entries(CATEGORIES).map(([id, c]) => ({ id, label: c.label })),
        catalog: fullCatalog(),
        layouts: listLayouts(),
        defaultProfile: DEFAULT_PROFILE,
        options: {
          rampSpeeds: Object.keys(RAMP_SPEEDS),
          stickyShapes: STICKY_SHAPES,
          stickyWhen: STICKY_WHEN,
          aimAssist: Object.entries(AIM_ASSIST_SETTINGS).map(([id, a]) => ({ id, label: a.label })),
          customTargets: CUSTOM_TARGETS,
          overrides: OVERRIDE_SPEC
        },
        maxSlots: MAX_SLOTS,
        ai: { enabled: false, model: null }
      };

    case '/api/import': {
      const game = body.game || 'generic';
      if (body.kind === 'json') return { weapons: importFromJson(body.payload, { game }), mode: 'local' };
      if (body.kind === 'csv') return { weapons: importFromCsv(body.payload, { game }), mode: 'local' };
      if (body.kind === 'manual') return { weapons: [normalizeWeapon({ ...body.weapon, source: 'manual' }, { game })], mode: 'local' };
      if (body.kind === 'text') {
        return { weapons: importFromTextHeuristic(body.payload, { game }), mode: 'heuristic',
                 notes: 'Read by the built-in parser. The AI importers need the local server.' };
      }
      if (body.kind === 'image') throw new Error('Screenshot import needs the local server and an API key.');
      throw new Error('Unknown import kind "' + body.kind + '".');
    }

    case '/api/tune':
      return { entries: entries() };

    case '/api/generate': {
      const list = entries();
      const options = { title: body.title, author: body.author, modButton: body.modButton, startSlot: body.startSlot };
      return { gpc: buildGpcScript(list, options), fileName: scriptFileName(list, options), entries: list };
    }

    case '/api/coach':
      return { text: offlineCoachNotes(entries()), mode: 'offline' };

    default:
      throw new Error('No route for ' + path);
  }
};`;

  // Adjustments the artifact/standalone context needs, kept out of the served app.
  const standaloneCss = `
/* ---------- standalone build ---------- */
html, body { background: var(--surface-0); }
.topbar { top: env(safe-area-inset-top, 0px); }
.standalone-note {
  margin: 0 20px 14px; padding: 10px 14px; font-size: 13px; color: var(--text-secondary);
  border: 1px solid var(--line); border-left: 3px solid var(--accent);
  border-radius: 8px; background: var(--surface-1);
}
@media (max-width: 900px) { .standalone-note { margin: 0 16px 12px; } }`;

  const note = `<div class="standalone-note">
  Running entirely in this browser — nothing is uploaded and no server is needed. Build your script, then
  <b>Copy script</b> and paste it into Zen Studio (or <b>Save script</b>, which hands you a .gpc.txt to rename).
  The AI importers — screenshot reading and the tuning review — need the local Node app; everything else works here.
</div>`;

  // A sandboxed viewer blocks anchor downloads, so saving goes through the host.
  // ".gpc" is not an allowed extension there - the file is offered as .gpc.txt.
  const saveGlue = `
(async () => {
  const button = document.querySelector('#btn-download');
  const downloads = await (window.claude?.use?.('downloads') ?? Promise.resolve(null));
  if (!downloads) {
    if (button) button.hidden = true;       // no way to hand over a file in this view
    return;
  }
  if (button) button.textContent = 'Save script';

  window.stickyAimSave = async (text, fileName) => {
    const filename = fileName.endsWith('.gpc') ? fileName + '.txt' : fileName;
    try {
      await downloads.save({ filename, data: text });
      toast('Saved ' + filename + (filename.endsWith('.gpc.txt') ? ' - rename it to .gpc for Zen Studio' : ''));
    } catch (err) {
      if (err?.code === 'declined') return;
      if (err?.code === 'rate_limited') return toast('Give the last save a moment, then try again.', true);
      toast('Could not save here - use Copy script instead.', true);
    }
  };
})();`;

  return `<title>Sticky Aim Weapon Studio</title>
<style>
${css}
${standaloneCss}
</style>

${note}
${body}

<script type="module">
${core}

${transport}

${app}

${saveGlue}
</script>
`;
}

const outfile = process.argv[2] || 'dist/sticky-aim-studio.html';
const target = path.isAbsolute(outfile) ? outfile : path.join(ROOT, outfile);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, buildStandalone());
const kb = (fs.statSync(target).size / 1024).toFixed(1);
console.log(`Wrote ${path.relative(ROOT, target)} (${kb} KB)`);
