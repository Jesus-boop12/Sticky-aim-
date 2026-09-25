import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import zlib from 'node:zlib';

import * as F from './fixtures.js';
import { parseProductHtml, extractProduct, parsePrice, cleanTitle, titleFromUrl, productWarnings, isSupplierSite } from '../core/extract.js';
import { charm, retailPrice, priceProduct } from '../core/pricing.js';
import { normalizeSettings } from '../core/settings.js';
import { templateCopy, normalizeCopy, shortTitle } from '../core/copy.js';
import { detectCategory } from '../core/catalog.js';
import { buildSite, formatMoney } from '../core/site.js';
import { createZip, crc32 } from '../core/zip.js';
import { assertPublicUrl } from '../core/net.js';

/* ---------------- extraction ---------------- */

test('Shopify: JSON endpoint gives title, variants, options and images', () => {
  const p = parseProductHtml(F.SHOPIFY_HTML, 'https://glowco.example/products/glow-sunset-lamp', { shopify: F.SHOPIFY_JSON });
  assert.equal(p.title, 'Glow Sunset Projection Lamp');
  assert.equal(p.price, 12.5);
  assert.equal(p.currency, 'USD');
  assert.equal(p.brand, 'GlowCo');
  assert.deepEqual(p.options, [{ name: 'Color', values: ['Sunset', 'Rainbow'] }]);
  assert.equal(p.variants.length, 2);
  assert.equal(p.variants[1].available, false);
  assert.equal(p.images.length, 3);
  assert.ok(p.bullets.some((b) => b.startsWith('USB powered')));
});

test('JSON-LD: finds the Product inside @graph and resolves relative images', () => {
  const p = parseProductHtml(F.JSONLD_HTML, 'https://kitchenplace.example/p/bamboo-board');
  assert.equal(p.title, 'Bamboo Cutting Board Set with Juice Groove, 3 Pieces');
  assert.equal(p.price, 19.99);
  assert.deepEqual(p.images, ['https://kitchenplace.example/img/board-1.jpg', 'https://kitchenplace.example/img/board-2.jpg']);
  assert.equal(p.brand, 'KitchenPlace');
  assert.equal(p.bullets.length, 3);
  assert.deepEqual(p.specs, [{ label: 'Material', value: 'Bamboo' }]);
});

test('Amazon: title, bullets, hi-res images, price and specs (no brand/review rows)', () => {
  const p = parseProductHtml(F.AMAZON_HTML, 'https://www.amazon.com/Portable-Neck-Fan/dp/B0TEST');
  assert.equal(p.title, 'Portable Neck Fan, Hands Free Bladeless Fan, 4000 mAh Battery Operated');
  assert.equal(p.price, 24.99);
  assert.equal(p.brand, 'COOLBREEZE');
  assert.equal(p.bullets.length, 3);
  assert.ok(p.images[0].includes('SL1500'), 'hi-res first');
  assert.deepEqual(p.specs, [{ label: 'Battery Capacity', value: '4000 Milliamp Hours' }]);
  assert.equal(p.description, '', '"Buy ..." meta descriptions are dropped');
});

test('AliExpress: embedded state plus the separate description document', async () => {
  const fetcher = F.fixtureFetcher({
    'https://www.aliexpress.com/item/1005001.html': { body: F.ALIEXPRESS_HTML },
    'https://aeproductsourcesite.alicdn.com/product/description/pc/v2/en_US/desc.htm?productId=1': { body: F.ALIEXPRESS_DESC }
  });
  const { product: p, fetchError } = await extractProduct('https://www.aliexpress.com/item/1005001.html', { fetcher });
  assert.equal(fetchError, null);
  assert.equal(p.title, 'Pet Hair Remover Roller Reusable Lint Brush For Dog Cat & Furniture');
  assert.equal(p.price, 3.21);
  assert.equal(p.images.length, 3);
  assert.deepEqual(p.options, [{ name: 'Color', values: ['Blue', 'Grey'] }], '"Ships From" is not a shopper option');
  assert.ok(p.specs.some((s) => s.label === 'Material'));
  assert.ok(!p.specs.some((s) => /brand/i.test(s.label)));
  assert.ok(p.description.includes('No sticky tape'));
  assert.equal(p.bullets.length, 3);
  assert.equal('descriptionUrl' in p, false);
});

test('meta tags only: European price format, protocol-relative image', () => {
  const p = parseProductHtml(F.OG_ONLY_HTML, 'https://gearly.example/magnetic-phone-mount');
  assert.equal(p.title, 'Magnetic Phone Mount for Car');
  assert.equal(p.price, 1299);
  assert.equal(p.currency, 'EUR');
  assert.deepEqual(p.images, ['https://cdn.gearly.example/mount.webp']);
});

test('a blocked page still yields a title from the link, and says why', async () => {
  const fetcher = F.fixtureFetcher({ 'https://shop.example/products/cool-ice-roller-for-face': { status: 403 } });
  const r = await extractProduct('https://shop.example/products/cool-ice-roller-for-face', { fetcher });
  assert.equal(r.product.title, 'Cool Ice Roller For Face');
  assert.equal(r.blocked, true);
  assert.match(r.fetchError, /403/);
});

test('a bot-check page is treated as blocked, not as a product', async () => {
  const fetcher = F.fixtureFetcher({ 'https://www.amazon.com/dp/B0X': { body: F.CAPTCHA_HTML } });
  const r = await extractProduct('https://www.amazon.com/dp/B0X', { fetcher });
  assert.equal(r.blocked, true);
  assert.notEqual(r.product.title, 'Robot Check');
});

test('parsePrice, cleanTitle, titleFromUrl', () => {
  assert.equal(parsePrice('$1,299.99'), 1299.99);
  assert.equal(parsePrice('1.299,99 €'), 1299.99);
  assert.equal(parsePrice('12,5'), 12.5);
  assert.equal(parsePrice('US $3.21'), 3.21);
  assert.equal(parsePrice('free'), null);
  assert.equal(parsePrice(0), null);
  assert.equal(cleanTitle('Amazon.com: Neck Fan : Home & Kitchen'), 'Neck Fan');
  assert.equal(cleanTitle('Lint Roller - AliExpress 15'), 'Lint Roller');
  assert.equal(cleanTitle('Lamp – GlowCo', 'GlowCo'), 'Lamp');
  assert.equal(titleFromUrl('https://x.example/products/bamboo-cutting-board-set?variant=1'), 'Bamboo Cutting Board Set');
  assert.equal(titleFromUrl('https://www.aliexpress.com/item/1005001.html'), '');
});

test('retail-store links get a warning that their price is not your cost', () => {
  assert.ok(isSupplierSite('www.aliexpress.com'));
  assert.ok(!isSupplierSite('glowco.example'));
  const retail = productWarnings({ title: 'x', price: 12.5, currency: 'USD', images: ['a'], bullets: ['b'], description: 'd', sourceSite: 'glowco.example' });
  assert.match(retail[0], /12\.50 USD is probably its selling price/);
  const supplier = productWarnings({ title: 'x', price: 3, images: ['a'], bullets: ['b'], description: 'd', sourceSite: 'aliexpress.com' });
  assert.deepEqual(supplier, []);
});

/* ---------------- pricing ---------------- */

test('charm pricing and markup', () => {
  assert.equal(charm(23.4), 23.99);
  assert.equal(charm(20), 20.99);
  assert.equal(charm(23.4, '.00'), 24);
  assert.equal(charm(23.97, '.95'), 24.95);
  assert.equal(retailPrice(10, { markup: 2.5 }), 25.99);
  assert.equal(retailPrice(2, { markup: 2.5, minProfit: 5 }), 7.99, 'minimum profit floor beats a tiny markup');
  assert.equal(retailPrice(null, {}), null);
});

test('priceProduct: override, variants, unknown cost', () => {
  const settings = normalizeSettings({});
  const shop = parseProductHtml(F.SHOPIFY_HTML, 'https://glowco.example/products/glow-sunset-lamp', { shopify: F.SHOPIFY_JSON });
  const p = priceProduct(shop, settings);
  assert.equal(p.cost, 12.5);
  assert.equal(p.price, 31.99);
  assert.equal(p.variants[1].price, 35.99, 'dearer variant keeps its own markup');
  assert.ok(p.profit.profit > 15);

  const fixed = priceProduct(shop, normalizeSettings({ price: 29 }));
  assert.equal(fixed.price, 29);
  assert.equal(fixed.manual, true);

  const unknown = priceProduct({ price: null, variants: [] }, settings);
  assert.equal(unknown.price, 29.99);
  assert.equal(unknown.estimated, true);

  assert.equal(priceProduct(shop, normalizeSettings({ compareAt: 10 })).compareAt, null, 'a "compare at" below the price is ignored');
});

/* ---------------- settings ---------------- */

test('normalizeSettings rejects junk and keeps sane defaults', () => {
  const s = normalizeSettings({ markup: 'abc', contactEmail: 'nope', checkoutUrl: 'javascript:alert(1)', paypalMe: 'https://paypal.me/My.Store', deliveryDays: '5 - 9', theme: 'hacker', currency: 'eur' });
  assert.equal(s.markup, 2.5);
  assert.equal(s.contactEmail, '');
  assert.equal(s.checkoutUrl, '');
  assert.equal(s.paypalMe, 'My.Store');
  assert.equal(s.deliveryDays, '5-9');
  assert.equal(s.theme, 'auto');
  assert.equal(s.currency, 'EUR');
});

/* ---------------- copy ---------------- */

test('category detection and short titles', () => {
  assert.equal(detectCategory({ title: 'Pet Hair Remover Roller For Dog Cat' }), 'pets');
  assert.equal(detectCategory({ title: 'Bamboo Cutting Board Set' }), 'kitchen');
  assert.equal(detectCategory({ title: 'Portable Neck Fan' }), 'tech');
  assert.equal(detectCategory({ title: 'Mystery Thing' }), 'general');
  assert.equal(shortTitle('2024 NEW Upgraded Portable Blender USB Rechargeable Juicer Cup 380ml'), 'Blender USB Rechargeable Juicer Cup 380ml');
  assert.equal(shortTitle('Bamboo Cutting Board Set with Juice Groove, 3 Pieces'), 'Bamboo Cutting Board Set');
});

test('template copy is complete, honest and uses the store facts', () => {
  const product = parseProductHtml(F.AMAZON_HTML, 'https://www.amazon.com/Portable-Neck-Fan/dp/B0TEST');
  const settings = normalizeSettings({ deliveryDays: '5-9', returnDays: 14 });
  const c = templateCopy(product, settings);
  for (const key of ['storeName', 'productTitle', 'heroHeadline', 'shortDescription', 'seoTitle', 'seoDescription', 'guaranteeText']) {
    assert.ok(c[key], `${key} filled`);
  }
  assert.equal(c.benefits.length, 4);
  assert.equal(c.benefits[0].title, 'Bladeless Design');
  assert.ok(c.faq.length >= 5);
  const all = JSON.stringify(c);
  assert.match(all, /5-9 business days/);
  assert.match(all, /14 days/);
  assert.doesNotMatch(all, /review|rating|stars?\b|only \d+ left|hurry/i, 'no fake social proof or urgency');
  assert.doesNotMatch(all, /amazon|aliexpress|dropship/i, 'never names the supplier');
});

test('normalizeCopy keeps good AI fields and falls back for missing or bad ones', () => {
  const fallback = templateCopy({ title: 'Dog Chew Toy', bullets: [], images: [], specs: [] }, normalizeSettings({}));
  const merged = normalizeCopy({
    storeName: 'Chewtopia', heroHeadline: '   ', theme: 'not-a-theme',
    benefits: [{ icon: 'rocket', title: 'Tough', text: 'Built for chewers.' }, { title: 'x' }],
    faq: [{ q: 'Only one?', a: 'Yes.' }], source: 'ai'
  }, fallback);
  assert.equal(merged.storeName, 'Chewtopia');
  assert.equal(merged.heroHeadline, fallback.heroHeadline);
  assert.equal(merged.theme, fallback.theme);
  assert.deepEqual(merged.benefits, fallback.benefits, 'fewer than 3 valid benefits falls back');
  assert.deepEqual(merged.faq, fallback.faq);
  assert.equal(merged.source, 'ai');
  assert.equal(normalizeCopy(null, fallback), fallback);
  const edited = normalizeCopy({ faq: [{ q: 'Only one?', a: 'Yes.' }] }, fallback, { minItems: 1 });
  assert.deepEqual(edited.faq, [{ q: 'Only one?', a: 'Yes.' }], "the owner's short FAQ is kept");
});

/* ---------------- site ---------------- */

function sampleSite(overrides = {}, productOverrides = {}) {
  const product = { ...parseProductHtml(F.SHOPIFY_HTML, 'https://glowco.example/products/glow-sunset-lamp', { shopify: F.SHOPIFY_JSON }), ...productOverrides };
  const settings = normalizeSettings({ contactEmail: 'hi@glow.example', ...overrides });
  const copy = templateCopy(product, settings);
  const pricing = priceProduct(product, settings);
  return { files: buildSite({ product, copy, settings, pricing, imageMap: { [product.images[0]]: 'images/product-1.jpg' } }), copy, pricing };
}

test('buildSite writes every page a store needs', () => {
  const { files } = sampleSite();
  for (const f of ['index.html', 'cart.html', 'checkout.html', 'thank-you.html', 'about.html', 'contact.html', 'faq.html', 'track-order.html',
    'shipping-policy.html', 'refund-policy.html', 'privacy-policy.html', 'terms-of-service.html',
    'assets/store.css', 'assets/store.js', 'assets/config.js', 'assets/favicon.svg', 'robots.txt', 'README.txt']) {
    assert.ok(files[f], `${f} generated`);
  }
  assert.equal(files['sitemap.xml'], undefined, 'no sitemap without a site URL');
  for (const [name, html] of Object.entries(files).filter(([n]) => n.endsWith('.html'))) {
    assert.match(html, /^<!doctype html>/, name);
    for (const link of html.matchAll(/href="([\w-]+\.html)"/g)) assert.ok(files[link[1]], `${name} links to missing ${link[1]}`);
  }
  assert.match(files['index.html'], /images\/product-1\.jpg/, 'downloaded photo is used');
  assert.match(files['index.html'], /\$31\.99/);
});

test('product JSON-LD is valid and carries no invented ratings', () => {
  const { files } = sampleSite({ siteUrl: 'https://glow.example' });
  const ld = JSON.parse(files['index.html'].match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'Product');
  assert.equal(ld.offers.price, '31.99');
  assert.equal(ld.offers.hasMerchantReturnPolicy.merchantReturnDays, 30);
  assert.equal(ld.aggregateRating, undefined);
  assert.ok(ld.image[0].startsWith('https://glow.example/images/'));
  assert.match(files['sitemap.xml'], /<loc>https:\/\/glow\.example\/faq\.html<\/loc>/);
  assert.doesNotMatch(files['sitemap.xml'], /checkout/);
});

test('hostile product text is escaped everywhere', () => {
  const evil = '<img src=x onerror=alert(1)>Lamp</script><script>alert(2)</script>';
  const { files } = sampleSite({}, { title: evil, bullets: [evil], description: evil, specs: [{ label: evil, value: evil }] });
  for (const [name, content] of Object.entries(files)) {
    if (typeof content !== 'string') continue;
    assert.doesNotMatch(content, /<img src=x/, name);
    assert.doesNotMatch(content, /<script>alert/, name);
  }
});

test('config.js and store.js are valid JavaScript and expose the settings', () => {
  const { files, pricing } = sampleSite({ paypalMe: 'glowshop' });
  const sandbox = { window: {} };
  vm.runInNewContext(files['assets/config.js'], sandbox);
  const cfg = sandbox.window.STORE_CONFIG;
  assert.equal(cfg.product.price, pricing.price);
  assert.equal(cfg.checkout.paypalMe, 'glowshop');
  assert.equal(cfg.product.variants.length, 2);
  assert.doesNotThrow(() => new vm.Script(files['assets/store.js']));
});

test('policies reflect the settings', () => {
  const none = sampleSite({ returnDays: 0, freeShipping: false, shippingFee: 6 }).files;
  assert.match(none['refund-policy.html'], /All sales final/);
  assert.match(none['shipping-policy.html'], /\$6\.00 per order/);
  const some = sampleSite({ returnDays: 45 }).files;
  assert.match(some['refund-policy.html'], /within 45 days of delivery/);
  assert.match(some['privacy-policy.html'], /mailto:hi@glow\.example/);
});

test('formatMoney', () => {
  assert.equal(formatMoney(31.99, 'USD'), '$31.99');
  assert.equal(formatMoney(12, 'GBP'), '£12.00');
  assert.equal(formatMoney(null, 'USD'), '');
});

/* ---------------- zip ---------------- */

function readZip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = {};
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const nlen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.slice(p + 46, p + 46 + nlen).toString('utf8');
    const lnlen = buf.readUInt16LE(local + 26);
    const data = buf.slice(local + 30 + lnlen, local + 30 + lnlen + csize);
    const raw = method === 8 ? zlib.inflateRawSync(data) : data;
    assert.equal(crc32(raw), crc, `${name} crc`);
    out[name] = raw;
    p += 46 + nlen;
  }
  return out;
}

test('createZip round-trips text and binary files under a folder', () => {
  const files = { 'index.html': '<h1>Hi ✓</h1>'.repeat(50), 'images/a.png': Buffer.from([1, 2, 3, 4, 5]) };
  const entries = readZip(createZip(files, 'my-store'));
  assert.deepEqual(Object.keys(entries), ['my-store/index.html', 'my-store/images/a.png']);
  assert.equal(entries['my-store/index.html'].toString(), files['index.html']);
  assert.deepEqual([...entries['my-store/images/a.png']], [1, 2, 3, 4, 5]);
});

/* ---------------- net guard ---------------- */

test('links to private addresses and odd schemes are refused', async () => {
  const saved = process.env.DROPSHIP_ALLOW_PRIVATE;
  delete process.env.DROPSHIP_ALLOW_PRIVATE;
  try {
    for (const bad of ['http://localhost:8080/x', 'http://127.0.0.1/x', 'http://10.1.2.3/', 'http://169.254.169.254/latest/meta-data', 'http://[::1]/', 'file:///etc/passwd', 'not a url']) {
      await assert.rejects(assertPublicUrl(bad), undefined, bad);
    }
    assert.equal((await assertPublicUrl('https://93.184.216.34/product')).hostname, '93.184.216.34');
  } finally {
    if (saved !== undefined) process.env.DROPSHIP_ALLOW_PRIVATE = saved;
  }
});
