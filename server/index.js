/**
 * Sticky Aim Weapon Studio - local server.
 *
 * Deliberately dependency-free apart from the Anthropic SDK: `npm start` and
 * open the page. Nothing is uploaded anywhere except the AI import/coach calls,
 * and those only happen when you press the button and have a key configured.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listGames, CATEGORIES } from '../core/games.js';
import { fullCatalog } from '../core/catalog.js';
import { importFromCsv, importFromJson, normalizeWeapon, OVERRIDE_SPEC } from '../core/weapons.js';
import { computeTuning, normalizeProfile, DEFAULT_PROFILE, RAMP_SPEEDS, STICKY_SHAPES, STICKY_WHEN,
         AIM_ASSIST_SETTINGS, CUSTOM_TARGETS } from '../core/tuning.js';
import { buildGpcScript, scriptFileName, listLayouts, MAX_SLOTS } from '../core/gpc.js';
import { aiEnabled, extractWeaponsFromText, extractWeaponsFromImage, coach, MODEL } from './ai.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(HERE, '..', 'web');
const PORT = Number(process.env.PORT) || 5173;
const MAX_BODY = 12 * 1024 * 1024; // screenshots

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8'
};

function send(res, status, body, headers = {}) {
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new Error('Request too large (12MB limit).');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('Request body was not valid JSON.');
  }
}

/** weapons + profile -> [{weapon, tuning}] */
function prepareEntries(body) {
  const profile = normalizeProfile(body.profile || {});
  const rawWeapons = Array.isArray(body.weapons) ? body.weapons : [];
  if (!rawWeapons.length) throw new Error('Add at least one weapon first.');
  if (rawWeapons.length > MAX_SLOTS) throw new Error(`A script holds at most ${MAX_SLOTS} weapon slots.`);
  return rawWeapons.map((raw) => {
    const weapon = normalizeWeapon(raw, { game: raw.game || profile.game });
    return { weapon, tuning: computeTuning(weapon, { ...profile, game: weapon.game }) };
  });
}

const ROUTES = {
  'GET /api/meta': async () => ({
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
    ai: { enabled: aiEnabled(), model: aiEnabled() ? MODEL : null }
  }),

  'POST /api/import': async (body) => {
    const game = body.game || 'generic';
    switch (body.kind) {
      case 'json':
        return { weapons: importFromJson(body.payload, { game }), mode: 'local' };
      case 'csv':
        return { weapons: importFromCsv(body.payload, { game }), mode: 'local' };
      case 'text':
        return extractWeaponsFromText(body.payload, { game });
      case 'image':
        return extractWeaponsFromImage({
          data: String(body.payload || '').replace(/^data:[^,]+,/, ''),
          mediaType: body.mediaType || 'image/png',
          hint: body.hint || '',
          game
        });
      case 'manual':
        return { weapons: [normalizeWeapon({ ...body.weapon, source: 'manual' }, { game })], mode: 'local' };
      default:
        throw new Error(`Unknown import kind "${body.kind}".`);
    }
  },

  'POST /api/tune': async (body) => {
    const entries = prepareEntries(body);
    return { entries };
  },

  'POST /api/generate': async (body) => {
    const entries = prepareEntries(body);
    const options = {
      title: body.title,
      author: body.author,
      modButton: body.modButton,
      startSlot: body.startSlot
    };
    return {
      gpc: buildGpcScript(entries, options),
      fileName: scriptFileName(entries, options),
      entries
    };
  },

  'POST /api/coach': async (body) => {
    const entries = prepareEntries(body);
    const result = await coach({ entries, profile: normalizeProfile(body.profile || {}), question: body.question });
    return result;
  }
};

async function serveStatic(req, res, url) {
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.replace(/^\/+/, '');
  const filePath = path.join(WEB_DIR, rel);
  if (!filePath.startsWith(WEB_DIR)) return send(res, 403, { error: 'Forbidden' });
  try {
    const data = await fs.readFile(filePath);
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const key = `${req.method} ${url.pathname}`;
    const handler = ROUTES[key];

    if (!handler) {
      if (url.pathname.startsWith('/api/')) return send(res, 404, { error: `No route for ${key}` });
      if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
      return serveStatic(req, res, url);
    }

    try {
      const body = req.method === 'GET' ? {} : await readBody(req);
      send(res, 200, await handler(body));
    } catch (err) {
      const status = /too large|not valid|Unknown import|at least one|at most/i.test(err.message) ? 400 : 500;
      send(res, status, { error: err.message });
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

/** Startup problems should read as instructions, not as a stack trace. */
function start() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) {
    console.error(
      `\n  This needs Node 20 or newer - you are on ${process.versions.node}.` +
      '\n  Install a current version from https://nodejs.org and run "npm start" again.\n'
    );
    process.exit(1);
  }

  const server = createServer();

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `\n  Port ${PORT} is already taken - something else is using it` +
        (PORT === 5173 ? ' (a Vite dev server, most likely).' : '.') +
        `\n  Start it somewhere else instead:\n\n      PORT=5174 npm start\n` +
        '\n  (on Windows PowerShell:  $env:PORT=5174; npm start)\n'
      );
    } else if (err.code === 'EACCES') {
      console.error(`\n  Not allowed to listen on port ${PORT}. Try a port above 1024, e.g. PORT=5174 npm start\n`);
    } else {
      console.error(`\n  Could not start the server: ${err.message}\n`);
    }
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`\n  Sticky Aim Weapon Studio  ->  http://localhost:${PORT}`);
    console.log(`  AI features: ${aiEnabled() ? `on (${MODEL})` : 'off (set ANTHROPIC_API_KEY to enable)'}`);
    console.log('  Open that address in a browser. Ctrl+C here stops it.\n');
  });
}

if (isMain) start();
