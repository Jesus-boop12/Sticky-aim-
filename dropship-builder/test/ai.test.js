/**
 * The Claude code paths, run against a local stand-in for the Messages API
 * (the SDK honours ANTHROPIC_BASE_URL). Checks the request we send and how the
 * replies are used; it does not judge the model's writing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import * as F from './fixtures.js';

const requests = [];
let replies = [];
const api = http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  requests.push({ headers: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) });
  const next = replies.shift();
  res.writeHead(next.status || 200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(next.body));
});
await new Promise((r) => api.listen(0, '127.0.0.1', r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${api.address().port}`;
process.env.ANTHROPIC_API_KEY = 'test-key';
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { generateStore } = await import('../server/pipeline.js');
const { MODEL } = await import('../server/ai.js');

const message = (content, stop_reason = 'end_turn') => ({
  body: {
    id: 'msg_1', type: 'message', role: 'assistant', model: MODEL, content, stop_reason, stop_details: null,
    usage: { input_tokens: 10, output_tokens: 10 }
  }
});

const AI_COPY = {
  storeName: 'Should Be Overridden', tagline: 'Pet hair, handled', announcement: 'Free shipping on every order',
  productTitle: 'Pet Hair Roller', heroHeadline: 'Fur-free sofas in seconds', heroSubheadline: 'Roll, collect, empty. No refills.',
  shortDescription: 'A reusable roller that lifts pet hair from sofas and beds.', longDescription: ['One.', 'Two.'],
  benefits: [
    { icon: 'leaf', title: 'No refills', text: 'Reusable, so there is no sticky tape to buy.' },
    { icon: 'sparkle', title: 'Works everywhere', text: 'Sofas, beds, carpets and clothes.' },
    { icon: 'check', title: 'One-click empty', text: 'Open the chamber and the hair drops out.' },
    { icon: 'heart', title: 'Pet friendly', text: 'Nothing touches your pet.' }
  ],
  features: ['Reusable', 'No tape'], specs: [{ label: 'Material', value: 'ABS' }],
  faq: [{ q: 'Q1?', a: 'A1.' }, { q: 'Q2?', a: 'A2.' }, { q: 'Q3?', a: 'A3.' }],
  aboutStory: ['About.'], guaranteeTitle: '30-day returns', guaranteeText: 'Send it back.', ctaText: 'Add to cart',
  seoTitle: 'Pet Hair Roller', seoDescription: 'Reusable pet hair roller.', category: 'pets', theme: 'citrus'
};

test('AI copy: request shape, store name override, and the copy lands on the site', async () => {
  requests.length = 0;
  replies = [message([{ type: 'text', text: JSON.stringify(AI_COPY) }])];
  const fetcher = F.fixtureFetcher({
    'https://www.aliexpress.com/item/1005001.html': { body: F.ALIEXPRESS_HTML },
    'https://aeproductsourcesite.alicdn.com/product/description/pc/v2/en_US/desc.htm?productId=1': { body: F.ALIEXPRESS_DESC }
  });
  const r = await generateStore(
    { url: 'https://www.aliexpress.com/item/1005001.html', settings: { storeName: 'Furfree', downloadImages: false } },
    () => {},
    { fetcher }
  );
  assert.equal(requests.length, 1, 'the page read fine, so only the copywriter was called');
  const { headers, body } = requests[0];
  assert.equal(body.model, MODEL);
  assert.equal(body.fallbacks, 'default');
  assert.match(headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.equal(body.output_config.format.type, 'json_schema');
  assert.match(body.system, /No customer reviews/);
  assert.match(body.messages[0].content, /Store name: Furfree/);
  assert.match(body.messages[0].content, /<supplier_product>/);

  assert.equal(r.mode.copy, 'ai');
  assert.equal(r.copy.storeName, 'Furfree', "the owner's name beats the model's");
  assert.equal(r.copy.heroHeadline, 'Fur-free sofas in seconds');
  assert.equal(r.copy.theme, 'citrus');
});

test('AI copy failure falls back to templates with a note', async () => {
  replies = [message([{ type: 'text', text: 'not json' }])];
  const r = await generateStore({ product: { title: 'Dog Chew Toy', price: 3 }, settings: { downloadImages: false } });
  assert.equal(r.mode.copy, 'template');
  assert.ok(r.warnings.some((w) => /AI copywriting failed/.test(w)));
});

test('a blocked page is read by Claude with web fetch, continuing after pause_turn', async () => {
  requests.length = 0;
  const read = {
    title: 'Cool Ice Face Roller', description: 'Chilled stainless roller for puffy mornings.',
    bullets: ['Stays cold for 20 minutes'], images: ['https://img.example/roller.jpg', 'not-a-url'],
    price: 4.5, currency: 'USD', brand: '', specs: [], options: []
  };
  replies = [
    message([{ type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_fetch', input: { url: 'https://shop.example/products/cool-ice-roller' } }], 'pause_turn'),
    message([{ type: 'text', text: 'Here it is:\n' + JSON.stringify(read) }]),
    message([{ type: 'text', text: JSON.stringify(AI_COPY) }])
  ];
  const fetcher = F.fixtureFetcher({ 'https://shop.example/products/cool-ice-roller': { status: 403 } });
  const r = await generateStore({ url: 'https://shop.example/products/cool-ice-roller', settings: { downloadImages: false } }, () => {}, { fetcher });

  assert.equal(requests.length, 3);
  assert.equal(requests[0].body.tools[0].type, 'web_fetch_20260209');
  assert.match(requests[0].body.messages[0].content, /https:\/\/shop\.example\/products\/cool-ice-roller/);
  assert.equal(requests[1].body.messages.length, 2, 'paused turn is continued with the assistant content');
  assert.equal(r.mode.read, 'ai');
  assert.equal(r.product.title, 'Cool Ice Face Roller', "Claude's read beats a title guessed from the link");
  assert.equal(r.product.price, 4.5);
  assert.deepEqual(r.product.images, ['https://img.example/roller.jpg']);
  assert.ok(r.warnings.some((w) => /403/.test(w)));
});

test.after(() => api.close());
