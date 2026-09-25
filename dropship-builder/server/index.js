/**
 * Dropship Store Builder - local server.
 *
 *   npm start   then open http://localhost:5174
 *
 * Paste a product link; the server reads the page, prices the product, writes
 * the copy, downloads the photos and builds a complete static store you can
 * preview in the browser and download as a ZIP.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { THEMES, CATEGORIES } from '../core/catalog.js';
import { DEFAULT_SETTINGS } from '../core/settings.js';
import { createZip } from '../core/zip.js';
import { generateStore, getBuild } from './pipeline.js';
import { aiEnabled, MODEL } from './ai.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.join(HERE, '..', 'web');
const PORT = Number(process.env.PORT) || 5174;
const MAX_BODY = 2 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error('Request too large.'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Request body was not valid JSON.'), { status: 400 });
  }
}

function meta() {
  return {
    ai: { enabled: aiEnabled(), model: aiEnabled() ? MODEL : null },
    defaults: DEFAULT_SETTINGS,
    themes: Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name, primary: t.primary, accent: t.accent, surface: t.surface })),
    categories: Object.entries(CATEGORIES).map(([id, c]) => ({ id, label: c.label }))
  };
}

/** POST /api/generate streams newline-delimited JSON: progress lines, then one result or error line. */
async function handleGenerate(req, res) {
  const body = await readBody(req);
  res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' });
  const write = (obj) => res.write(JSON.stringify(obj) + '\n');
  try {
    const result = await generateStore(body, (step, detail) => write({ type: 'progress', step, detail }));
    write({ type: 'result', result });
  } catch (err) {
    write({ type: 'error', error: err.message, code: err.code || null, product: err.product || null });
  }
  res.end();
}

async function serveBuildFile(res, id, rel) {
  const build = getBuild(id);
  if (!build) return sendJson(res, 404, { error: 'That preview has expired. Generate the store again.' });
  const file = rel || 'index.html';
  const content = build.files[file];
  if (content === undefined) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(content);
}

async function serveStatic(res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '');
  const full = path.resolve(WEB_DIR, rel);
  if (!full.startsWith(WEB_DIR + path.sep)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  try {
    const data = await fs.readFile(full);
    res.writeHead(200, { 'content-type': MIME[path.extname(full)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/meta') return sendJson(res, 200, meta());

      if (req.method === 'POST' && url.pathname === '/api/generate') return await handleGenerate(req, res);

      const dl = url.pathname.match(/^\/api\/download\/([a-f0-9]{16})$/);
      if (req.method === 'GET' && dl) {
        const build = getBuild(dl[1]);
        if (!build) return sendJson(res, 404, { error: 'That build has expired. Generate the store again.' });
        const zip = createZip(build.files, build.slug);
        res.writeHead(200, {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="${build.slug}-store.zip"`,
          'content-length': zip.length
        });
        return res.end(zip);
      }

      const pv = url.pathname.match(/^\/preview\/([a-f0-9]{16})(?:\/(.*))?$/);
      if (req.method === 'GET' && pv) {
        if (pv[2] === undefined) {
          res.writeHead(302, { location: `/preview/${pv[1]}/` });
          return res.end();
        }
        return await serveBuildFile(res, pv[1], decodeURIComponent(pv[2] || ''));
      }

      if (req.method === 'GET') return await serveStatic(res, url.pathname);
      sendJson(res, 405, { error: 'Method not allowed' });
    } catch (err) {
      if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message || 'Something went wrong.' });
      else res.end();
    }
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const server = createServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n  Port ${PORT} is already in use. Start on another port with:  PORT=5175 npm start\n`);
    } else {
      console.error(`\n  Could not start the server: ${err.message}\n`);
    }
    process.exit(1);
  });
  server.listen(PORT, () => {
    console.log(`\n  Dropship Store Builder running at http://localhost:${PORT}`);
    console.log(`  AI copywriting: ${aiEnabled() ? `on (${MODEL})` : 'off - using built-in templates (set ANTHROPIC_API_KEY to enable)'}\n`);
  });
}
