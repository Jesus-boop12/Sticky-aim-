import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildStandalone } from '../tools/build-standalone.js';

const html = buildStandalone();
const script = html.slice(html.indexOf('<script type="module">') + '<script type="module">'.length, html.lastIndexOf('</script>'));

test('the standalone build is a single self-contained page', () => {
  assert.match(html, /^<title>Zen Strike<\/title>/);
  // careful: <header> starts with "<head"
  assert.ok(!/<(html|head|body)[\s>]/i.test(html), 'the artifact skeleton supplies those tags');
  // the page's own CSS must be inlined; Google Fonts is the one stylesheet host
  // the artifact CSP allows, so a link there is legitimate
  const sheets = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  for (const href of sheets) {
    assert.match(href, /^https:\/\/fonts\.googleapis\.com\//, `stylesheet from a blocked host: ${href}`);
  }
  assert.ok(!html.includes('href="/styles.css"'), "the app's own CSS must be inlined");
  assert.equal(html.match(/<script/g).length, 1, 'exactly one script block');
});

test('no module syntax survives the bundle', () => {
  assert.ok(!/^\s*import\s/m.test(script), 'an import would abort the whole script');
  assert.ok(!/^\s*export\s/m.test(script));
  assert.doesNotThrow(() => new vm.Script(script), 'the bundled script must parse');
});

test('the whole core is bundled, in dependency order', () => {
  for (const marker of ['core/games.js', 'core/weapons.js', 'core/catalog.js', 'core/tuning.js', 'core/gpc.js', 'core/coach.js']) {
    assert.ok(script.includes(marker), `${marker} is missing`);
  }
  assert.ok(script.indexOf('core/games.js') < script.indexOf('core/weapons.js'));
  assert.ok(script.indexOf('core/tuning.js') < script.indexOf('core/gpc.js'));
});

test('it answers its own API calls instead of a server', () => {
  assert.ok(script.includes('window.stickyAimApi'));
  for (const route of ['/api/meta', '/api/import', '/api/generate', '/api/coach']) {
    assert.ok(script.includes(route), `${route} is not handled locally`);
  }
  assert.match(script, /ai: \{ enabled: false/, 'the AI importers cannot work without the server');
});

test('it tells the viewer what this build cannot do', () => {
  assert.match(html, /Running entirely in this browser/);
  assert.match(html, /AI importers/);
});

test('saving goes through the host, since a sandboxed viewer blocks anchor downloads', () => {
  assert.match(script, /claude\?\.use\?\.\('downloads'\)/);
  assert.match(script, /window\.stickyAimSave/);
  assert.match(script, /fileName \+ '\.txt'/, '.gpc is not an allowed download extension');
  assert.match(script, /button\.hidden = true/, 'hide the affordance when the capability is absent');
  for (const code of ['declined', 'rate_limited']) assert.ok(script.includes(code), `${code} is unhandled`);
});

test('the page markup and its controls survive', () => {
  for (const id of ['id="catalog"', 'id="tune-detail"', 'id="script-out"', 'id="custom-settings"', 'id="p-stickyShape"']) {
    assert.ok(html.includes(id), `${id} is missing from the standalone page`);
  }
});

test('the bundler refuses two modules that declare the same name', () => {
  // concatenation shares one scope; this guard is what stopped `BY_ID` from
  // being declared by both games.js and attachments.js
  const html = buildStandalone();
  const script = html.slice(html.indexOf('<script type="module">'), html.lastIndexOf('</script>'));
  const declarations = [...script.matchAll(/^(?:const|let|var|function|class)\s+(\w+)/gm)].map((m) => m[1]);
  const duplicates = declarations.filter((n, i) => declarations.indexOf(n) !== i);
  assert.deepEqual([...new Set(duplicates)], [], 'a duplicate top-level name would shadow or throw');
});

test('the standalone build carries the logo and the brand', () => {
  assert.match(html, /^<title>Zen Strike<\/title>/);
  assert.match(html, /src="data:image\/png;base64,/, 'the logo must be inlined - external images are blocked');
  assert.ok(!html.includes('src="/assets/'), 'no external asset path may survive the bundle');
  assert.match(html, /fonts\.googleapis\.com/, 'the display face is loaded from the one allowed font host');
});
