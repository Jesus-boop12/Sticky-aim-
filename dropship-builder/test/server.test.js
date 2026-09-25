import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import * as F from './fixtures.js';

// The fake supplier shop runs on 127.0.0.1, which the link guard normally refuses.
process.env.DROPSHIP_ALLOW_PRIVATE = '1';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;
const { createServer } = await import('../server/index.js');

async function listen(server) {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${server.address().port}`;
}

function fakeShop() {
  const server = http.createServer((req, res) => {
    const base = `http://127.0.0.1:${server.address().port}`;
    if (req.url === '/products/glow-sunset-lamp.json') {
      const j = structuredClone(F.SHOPIFY_JSON);
      j.product.images.forEach((im, i) => (im.src = `${base}/img/${i}.jpg`));
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(j));
    }
    if (req.url === '/products/glow-sunset-lamp') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end(F.SHOPIFY_HTML);
    }
    if (req.url === '/moved') {
      res.writeHead(301, { location: '/products/glow-sunset-lamp' });
      return res.end();
    }
    if (req.url.startsWith('/img/')) {
      res.writeHead(200, { 'content-type': 'image/jpeg' });
      return res.end(F.FAKE_JPEG);
    }
    if (req.url === '/blocked') {
      res.writeHead(403);
      return res.end();
    }
    res.writeHead(404);
    res.end();
  });
  return server;
}

async function generate(base, body) {
  const res = await fetch(`${base}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(res.status, 200);
  const lines = (await res.text()).trim().split('\n').map((l) => JSON.parse(l));
  return { progress: lines.filter((l) => l.type === 'progress'), last: lines.at(-1) };
}

test('end to end: link in, previewable store and ZIP out', async () => {
  const shop = fakeShop();
  const app = createServer();
  const shopUrl = await listen(shop);
  const base = await listen(app);
  try {
    const meta = await (await fetch(`${base}/api/meta`)).json();
    assert.equal(meta.ai.enabled, false);
    assert.ok(meta.themes.length >= 6);

    const home = await fetch(`${base}/`);
    assert.match(await home.text(), /Paste a product link/);

    const { progress, last } = await generate(base, { url: `${shopUrl}/moved`, settings: { contactEmail: 'hi@glow.example' } });
    assert.deepEqual(progress.map((p) => p.step), ['read', 'price', 'copy', 'images', 'build']);
    assert.equal(last.type, 'result', JSON.stringify(last));
    const r = last.result;
    assert.equal(r.product.title, 'Glow Sunset Projection Lamp');
    assert.equal(r.mode.read, 'page');
    assert.equal(r.mode.copy, 'template');
    assert.ok(r.files.some((f) => f.path === 'images/product-1.jpg'), 'photos downloaded into the store');

    const page = await fetch(`${base}/preview/${r.id}/index.html`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Glow Sunset Projection Lamp/);
    assert.match(html, /images\/product-1\.jpg/);
    assert.equal((await fetch(`${base}/preview/${r.id}/images/product-1.jpg`)).headers.get('content-type'), 'image/jpeg');
    assert.equal((await fetch(`${base}/preview/${r.id}/nope.html`)).status, 404);

    const zip = await fetch(`${base}/api/download/${r.id}`);
    assert.equal(zip.status, 200);
    assert.equal(zip.headers.get('content-type'), 'application/zip');
    const buf = Buffer.from(await zip.arrayBuffer());
    assert.equal(buf.readUInt32LE(0), 0x04034b50);

    // Rebuild with edits: reuses the downloaded photos, keeps the edited copy.
    const edited = await generate(base, {
      product: { ...r.product, price: 10 },
      copy: { ...r.copy, storeName: 'Sunbeam', heroHeadline: 'Golden hour, every hour' },
      settings: { ...r.settings, theme: 'ocean', paypalMe: 'sunbeam' },
      from: r.id
    });
    assert.equal(edited.last.type, 'result');
    const e = edited.last.result;
    assert.ok(!edited.progress.some((p) => p.step === 'images'), 'no re-download');
    assert.equal(e.copy.storeName, 'Sunbeam');
    assert.equal(e.mode.copy, 'edited');
    assert.equal(e.pricing.price, 25.99);
    const html2 = await (await fetch(`${base}/preview/${e.id}/index.html`)).text();
    assert.match(html2, /Golden hour, every hour/);
    assert.match(html2, /images\/product-1\.jpg/);
    const cfg = await (await fetch(`${base}/preview/${e.id}/assets/config.js`)).text();
    assert.match(cfg, /"paypalMe": "sunbeam"/);
  } finally {
    app.close();
    shop.close();
  }
});

test('an unreadable link returns a helpful error and the partial product', async () => {
  const shop = fakeShop();
  const app = createServer();
  const shopUrl = await listen(shop);
  const base = await listen(app);
  try {
    const { last } = await generate(base, { url: `${shopUrl}/blocked` });
    assert.equal(last.type, 'error');
    assert.equal(last.code, 'unreadable');
    assert.match(last.error, /fill in the product details by hand/);
    assert.ok(last.product);

    const manual = await generate(base, { product: { title: 'Heated Eye Mask', price: '8.5', bullets: ['Warms in 30 seconds and switches off after 20 minutes.'] } });
    assert.equal(manual.last.type, 'result');
    assert.equal(manual.last.result.pricing.price, 21.99);
  } finally {
    app.close();
    shop.close();
  }
});

test('bad input is rejected cleanly', async () => {
  const app = createServer();
  const base = await listen(app);
  try {
    const { last } = await generate(base, { url: 'file:///etc/passwd' });
    assert.equal(last.type, 'error');
    assert.match(last.error, /http/);
    const missing = await generate(base, {});
    assert.match(missing.last.error, /Paste a product link/);
    assert.equal((await fetch(`${base}/api/download/0123456789abcdef`)).status, 404);
    const esc = await fetch(`${base}/..%2f..%2fpackage.json`);
    assert.ok([403, 404].includes(esc.status));
  } finally {
    app.close();
  }
});
