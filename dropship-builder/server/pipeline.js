/**
 * Link in, store out. Orchestrates reading, pricing, copywriting, image
 * download and page generation, reporting progress as it goes.
 */

import crypto from 'node:crypto';
import { extractProduct, productWarnings, completeness, bulletsFrom, parsePrice } from '../core/extract.js';
import { normalizeSettings } from '../core/settings.js';
import { priceProduct } from '../core/pricing.js';
import { templateCopy, normalizeCopy } from '../core/copy.js';
import { buildSite, slugify } from '../core/site.js';
import { safeFetch } from '../core/net.js';
import { clean } from '../core/html.js';
import { aiEnabled, writeCopy, readProductPage } from './ai.js';

const MAX_BUILDS = 30;
const builds = new Map();

export function getBuild(id) {
  return builds.get(id) || null;
}

function remember(build) {
  builds.set(build.id, build);
  while (builds.size > MAX_BUILDS) builds.delete(builds.keys().next().value);
}

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif', 'image/gif': 'gif' };

/** Download product photos so the store does not hot-link the supplier. */
async function downloadImages(urls, referer, fetcher) {
  const imageMap = {};
  const binaries = {};
  let n = 0;
  const queue = [...new Set(urls)].slice(0, 14);
  const worker = async () => {
    while (queue.length) {
      const url = queue.shift();
      try {
        const res = await fetcher(url, { timeoutMs: 15000, maxBytes: 8 * 1024 * 1024, headers: { accept: 'image/avif,image/webp,image/*,*/*;q=0.8', referer } });
        const type = res.contentType.split(';')[0].trim();
        const ext = IMAGE_TYPES[type];
        if (!ext || res.body.length < 1500) continue;
        const path = `images/product-${++n}.${ext}`;
        imageMap[url] = path;
        binaries[path] = res.body;
      } catch { /* keep the remote URL */ }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { imageMap, binaries };
}

/** Sanitise a product object that came back from the browser for a rebuild. */
export function normalizeProduct(raw = {}) {
  const list = (v) => (Array.isArray(v) ? v : []);
  const images = list(raw.images).map(String).filter((u) => /^(https?:\/\/|images\/)/.test(u)).slice(0, 14);
  return {
    sourceUrl: String(raw.sourceUrl || ''),
    sourceSite: String(raw.sourceSite || ''),
    title: clean(raw.title).slice(0, 300),
    description: String(raw.description || '').slice(0, 6000),
    bullets: list(raw.bullets).map((b) => clean(b).slice(0, 300)).filter(Boolean).slice(0, 10),
    images,
    price: parsePrice(raw.price),
    currency: /^[A-Z]{3}$/.test(raw.currency || '') ? raw.currency : '',
    brand: clean(raw.brand).slice(0, 80),
    sku: clean(raw.sku).slice(0, 80),
    category: clean(raw.category).slice(0, 80),
    tags: list(raw.tags).map(String).slice(0, 30),
    specs: list(raw.specs).filter((s) => s && s.label && s.value).map((s) => ({ label: clean(s.label), value: clean(s.value) })).slice(0, 16),
    options: list(raw.options).filter((o) => o && o.name && Array.isArray(o.values))
      .map((o) => ({ name: clean(o.name), values: o.values.map(clean).filter(Boolean).slice(0, 30) })).filter((o) => o.values.length).slice(0, 3),
    variants: list(raw.variants).slice(0, 100).map((v) => ({
      title: clean(v?.title),
      options: Object.fromEntries(Object.entries(v?.options || {}).map(([k, val]) => [clean(k), clean(val)])),
      price: parsePrice(v?.cost ?? v?.price),
      image: /^https?:\/\//.test(v?.image || '') ? v.image : '',
      available: v?.available !== false
    }))
  };
}

function mergeAiRead(product, read, { pageFailed = false } = {}) {
  const out = { ...product };
  // A title guessed from the link is weaker than one read from the page itself.
  if (pageFailed && read.title) out.title = read.title;
  for (const key of ['title', 'description', 'price', 'currency', 'brand']) if (!out[key] && read[key]) out[key] = read[key];
  if (!out.images.length) out.images = read.images;
  if (out.bullets.length < 3 && read.bullets.length) out.bullets = read.bullets;
  if (!out.bullets.length) out.bullets = bulletsFrom(out.description);
  if (!out.specs.length) out.specs = read.specs;
  if (!out.options.length) out.options = read.options;
  return out;
}

/**
 * Build a store.
 * @param {object} req
 * @param {string} [req.url]       product link (required unless `product` is given)
 * @param {object} [req.product]   an already-read product (rebuilds / manual edits)
 * @param {object} [req.copy]      edited copy to keep instead of writing new copy
 * @param {object} [req.settings]
 * @param {string} [req.from]      previous build id whose downloaded images can be reused
 * @param {(step: string, detail?: string) => void} [onProgress]
 */
export async function generateStore(req, onProgress = () => {}, { fetcher = safeFetch } = {}) {
  const settings = normalizeSettings(req.settings || {});
  const notes = [];
  const mode = { read: 'provided', copy: 'template' };

  /* 1. read the product */
  let product;
  if (req.product) {
    product = normalizeProduct(req.product);
  } else {
    if (!req.url) throw new Error('Paste a product link first.');
    onProgress('read', 'Reading the product page');
    const res = await extractProduct(req.url, { fetcher });
    product = res.product;
    mode.read = 'page';
    if (res.fetchError) notes.push(`Couldn't download the page directly: ${res.fetchError}`);
    if (completeness(product) < 0.8 && aiEnabled()) {
      onProgress('read', 'The page is hard to read - asking Claude to read it');
      try {
        product = mergeAiRead(product, await readProductPage(req.url), { pageFailed: Boolean(res.fetchError) });
        mode.read = 'ai';
      } catch (err) {
        notes.push(`Claude could not read the page either (${err.message}).`);
      }
    }
    // A title guessed from the link alone is not enough to build a store worth showing.
    if (completeness(product) < 0.5) {
      const hint = aiEnabled() ? '' : ' Adding an ANTHROPIC_API_KEY lets the builder read pages that block downloads.';
      throw Object.assign(new Error(`Could not read a product from that link.${hint} You can fill in the product details by hand instead.`), { product, code: 'unreadable' });
    }
  }

  /* 2. price it */
  onProgress('price', 'Setting your prices');
  const pricing = priceProduct(product, settings);

  /* 3. write the copy */
  const template = templateCopy(product, settings);
  let copy;
  if (req.copy) {
    copy = normalizeCopy(req.copy, template, { minItems: 1 });
    mode.copy = req.copy.source === 'ai' ? 'ai' : 'edited';
  } else if (settings.useAi && aiEnabled()) {
    onProgress('copy', 'Claude is writing your store copy');
    try {
      copy = normalizeCopy(await writeCopy(product, settings), template);
      if (settings.storeName) copy.storeName = settings.storeName;
      mode.copy = 'ai';
    } catch (err) {
      notes.push(`AI copywriting failed (${err.message}), so the built-in templates were used.`);
      copy = template;
    }
  } else {
    onProgress('copy', 'Writing your store copy');
    copy = template;
  }

  /* 4. photos */
  let imageMap = {};
  let binaries = {};
  const failedImages = new Set();
  const previous = req.from ? getBuild(req.from) : null;
  if (previous) {
    for (const u of previous.failedImages || []) failedImages.add(u);
    imageMap = { ...previous.imageMap };
    for (const [remote, local] of Object.entries(imageMap)) {
      if (previous.binaries[local]) binaries[local] = previous.binaries[local];
      else delete imageMap[remote];
    }
  }
  const wanted = [...product.images, ...product.variants.map((v) => v.image)].filter((u) => /^https?:/.test(u || '') && !imageMap[u] && !failedImages.has(u));
  if (settings.downloadImages && wanted.length) {
    onProgress('images', `Downloading ${Math.min(wanted.length, 14)} product photos`);
    const got = await downloadImages(wanted, product.sourceUrl, fetcher);
    const offset = Object.keys(binaries).length;
    for (const [remote, path] of Object.entries(got.imageMap)) {
      const renamed = offset ? path.replace(/product-(\d+)/, (m, d) => `product-${Number(d) + offset}`) : path;
      imageMap[remote] = renamed;
      binaries[renamed] = got.binaries[path];
    }
    const missedList = wanted.filter((u) => !imageMap[u]);
    missedList.forEach((u) => failedImages.add(u));
    const missed = missedList.length;
    if (missed) notes.push(`${missed} photo(s) could not be downloaded and are linked from the supplier instead.`);
  }

  /* 5. pages */
  onProgress('build', 'Building your pages');
  const files = buildSite({ product, copy, settings, pricing, imageMap });
  const id = crypto.randomBytes(8).toString('hex');
  const build = {
    id,
    createdAt: Date.now(),
    slug: slugify(copy.storeName),
    product,
    copy,
    settings,
    pricing,
    imageMap,
    binaries,
    failedImages: [...failedImages],
    files: { ...files, ...binaries }
  };
  remember(build);

  return {
    id,
    slug: build.slug,
    product,
    copy,
    settings,
    pricing,
    mode,
    aiAvailable: aiEnabled(),
    warnings: [...productWarnings(product), ...notes],
    files: Object.entries(build.files).map(([path, content]) => ({ path, bytes: Buffer.byteLength(content) })).sort((a, b) => a.path.localeCompare(b.path))
  };
}
