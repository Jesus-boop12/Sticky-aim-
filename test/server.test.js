import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/index.js';

async function withServer(fn) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const post = async (base, path, body) => {
  const res = await fetch(base + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
};

test('GET /api/meta describes everything the page needs', async () => {
  await withServer(async (base) => {
    const meta = await (await fetch(`${base}/api/meta`)).json();
    assert.ok(meta.games.length > 5);
    assert.ok(meta.catalog['cod-mw3'].length > 0);
    assert.ok(meta.layouts.some((l) => l.id === 'playstation'));
    assert.equal(typeof meta.ai.enabled, 'boolean');
    assert.equal(meta.maxSlots, 8);
  });
});

test('the page itself is served', async () => {
  await withServer(async (base) => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Sticky Aim Weapon Studio/);
    assert.equal((await fetch(base + '/styles.css')).status, 200);
    assert.equal((await fetch(base + '/app.js')).status, 200);
  });
});

test('static serving cannot escape the web directory', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/..%2f..%2fpackage.json`);
    assert.ok(res.status === 403 || res.status === 404, `got ${res.status}`);
  });
});

test('POST /api/generate returns a script and the tuning behind it', async () => {
  await withServer(async (base) => {
    const { status, body } = await post(base, '/api/generate', {
      weapons: [{ name: 'Test AR', category: 'ar', rpm: 700, vertical: 45, horizontal: 12, drift: 'right' }],
      profile: { sensitivity: 5, controller: 'playstation', game: 'cod-mw3' },
      title: 'My Script'
    });
    assert.equal(status, 200);
    assert.match(body.gpc, /#pragma METAINFO\("My Script"/);
    assert.equal(body.fileName, 'my-script.gpc');
    assert.equal(body.entries.length, 1);
    assert.ok(body.entries[0].tuning.antiRecoil.vertical > 0);
  });
});

test('imports round-trip through the API', async () => {
  await withServer(async (base) => {
    const csv = await post(base, '/api/import', { kind: 'csv', payload: 'name,class,rpm,vertical\nA,smg,900,30', game: 'apex' });
    assert.equal(csv.body.weapons[0].category, 'smg');

    const json = await post(base, '/api/import', { kind: 'json', payload: '[{"name":"B","rpm":600}]', game: 'apex' });
    assert.equal(json.body.weapons[0].name, 'B');

    const manual = await post(base, '/api/import', { kind: 'manual', weapon: { name: 'C', vertical: 20 }, game: 'apex' });
    assert.equal(manual.body.weapons[0].recoil.vertical, 20);
  });
});

test('bad input gets a 400 with a readable message, not a stack trace', async () => {
  await withServer(async (base) => {
    assert.equal((await post(base, '/api/generate', { weapons: [] })).status, 400);
    assert.equal((await post(base, '/api/import', { kind: 'nonsense' })).status, 400);
    const badJson = await post(base, '/api/import', { kind: 'json', payload: '{{{' });
    assert.match(badJson.body.error, /not valid JSON/);
    assert.equal((await fetch(base + '/api/nope')).status, 404);
  });
});

test('more weapons than slots is refused', async () => {
  await withServer(async (base) => {
    const weapons = Array.from({ length: 9 }, (_, i) => ({ name: `W${i}`, rpm: 600, vertical: 40 }));
    const { status, body } = await post(base, '/api/generate', { weapons });
    assert.equal(status, 400);
    assert.match(body.error, /at most 8/);
  });
});

test('coach falls back to offline notes without an API key', async (t) => {
  if (process.env.ANTHROPIC_API_KEY) return t.skip('API key present - skipping offline path');
  await withServer(async (base) => {
    const { status, body } = await post(base, '/api/coach', {
      weapons: [{ name: 'Test', rpm: 700, vertical: 45 }], profile: { game: 'cod-mw3' }
    });
    assert.equal(status, 200);
    assert.equal(body.mode, 'offline');
    assert.match(body.text, /Test/);
  });
});

test('sticky and recoil options survive the API round trip', async () => {
  await withServer(async (base) => {
    const { body } = await post(base, '/api/generate', {
      weapons: [{
        name: 'Optioned', category: 'ar', rpm: 700, vertical: 45, horizontal: 20, drift: 'right',
        overrides: { antiRecoilVertical: 23, stickyRadius: 9 }
      }],
      profile: { game: 'cod-bo6', stickyShape: 'diagonal', stickyWhen: 'always', rampSpeed: 'slow', horizontalEnabled: false }
    });
    const tuning = body.entries[0].tuning;
    assert.equal(tuning.antiRecoil.vertical, 23, 'override applied');
    assert.equal(tuning.antiRecoil.horizontal, 0, 'horizontal switched off');
    assert.equal(tuning.sticky.radius, 9);
    assert.equal(tuning.sticky.shape, 'diagonal');
    assert.match(body.gpc, /sticky aim: diagonal shape, active at all times/);
    assert.match(body.gpc, /V:23\*/);
  });
});

test('meta publishes the option vocabularies the page builds its controls from', async () => {
  await withServer(async (base) => {
    const meta = await (await fetch(`${base}/api/meta`)).json();
    assert.deepEqual(meta.options.stickyShapes, ['circle', 'horizontal', 'vertical', 'diagonal']);
    assert.deepEqual(meta.options.stickyWhen, ['ads', 'ads_fire', 'always']);
    assert.ok(meta.options.rampSpeeds.includes('instant'));
    assert.ok(meta.options.overrides.antiRecoilVertical.max === 100);
    for (const key of Object.keys(meta.options.overrides)) {
      assert.ok(meta.defaultProfile !== undefined && meta.options.overrides[key].label, `${key} needs a label`);
    }
  });
});
