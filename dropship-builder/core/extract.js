/**
 * Product link -> normalised product record.
 *
 * Tries, in order of reliability:
 *   1. Shopify's public `/products/<handle>.json` endpoint
 *   2. schema.org Product data (JSON-LD) - used by most modern shops, eBay, Walmart, Etsy...
 *   3. Site-specific readers for Amazon and AliExpress page markup
 *   4. OpenGraph / Twitter / microdata meta tags
 *   5. The link itself (a readable slug still gives us a title)
 * Results are merged field by field, the most reliable source winning.
 */

import {
  clean, htmlToText, findTags, metaContent, metaAll, titleTag, absUrl, sliceBalanced, tryJson, decodeEntities
} from './html.js';
import { safeFetch, FetchError } from './net.js';

/* ------------------------------------------------------------------ */
/* Small parsers                                                       */
/* ------------------------------------------------------------------ */

const CURRENCY_SYMBOLS = [
  ['US $', 'USD'], ['US$', 'USD'], ['CA$', 'CAD'], ['C$', 'CAD'], ['A$', 'AUD'], ['AU$', 'AUD'], ['NZ$', 'NZD'],
  ['R$', 'BRL'], ['MX$', 'MXN'], ['HK$', 'HKD'], ['S$', 'SGD'], ['€', 'EUR'], ['£', 'GBP'], ['¥', 'JPY'],
  ['₹', 'INR'], ['₩', 'KRW'], ['zł', 'PLN'], ['kr', 'SEK'], ['CHF', 'CHF'], ['$', 'USD']
];

/** "$1,299.99" / "1.299,99 €" / 12 -> number, or null. */
export function parsePrice(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  let s = String(value).replace(/[^\d.,]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    // "1.299,99" or "12,99" -> comma is the decimal mark when followed by 1-2 digits
    s = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

export function currencyFromText(text) {
  const s = String(text || '');
  const code = s.match(/\b(USD|EUR|GBP|CAD|AUD|NZD|JPY|CNY|INR|BRL|MXN|SEK|NOK|DKK|CHF|PLN|SGD|HKD|KRW|ZAR)\b/);
  if (code) return code[1];
  for (const [sym, iso] of CURRENCY_SYMBOLS) if (s.includes(sym)) return iso;
  return '';
}

const JUNK_IMAGE = /(\.svg|\.gif)(\?|$)|sprite|logo|favicon|icon[-_]|placeholder|blank\.|pixel|1x1|spacer|badge|flag|payment|avatar|loading|transparent/i;

function normaliseImages(list, base) {
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const u = absUrl(typeof raw === 'string' ? raw : raw?.url || raw?.contentUrl || raw?.src, base);
    if (!u || JUNK_IMAGE.test(u)) continue;
    const key = u.replace(/[?#].*$/, '').replace(/_\d+x\d*(?=\.\w+$)/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

/** Clean shop names and marketplace noise off a product title. */
export function cleanTitle(title, siteName = '') {
  let t = clean(title);
  t = t.replace(/^Amazon\.[a-z.]+\s*:\s*/i, '');
  t = t.replace(/\s*:\s*[A-Z][\w &,'-]{2,40}$/, (m) => (/(Home|Kitchen|Beauty|Sports|Toys|Electronics|Pet|Health|Clothing|Tools|Automotive|Baby|Garden|Office|Industrial)/i.test(m) ? '' : m));
  t = t.replace(/\s*[-|–—:]\s*(AliExpress|Amazon(\.[a-z.]+)?|eBay|Walmart(\.com)?|Etsy|Temu|Alibaba(\.com)?)\b.*$/i, '');
  if (siteName && siteName.length > 1) {
    const escaped = siteName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(`\\s*[-|–—:]\\s*${escaped}\\s*$`, 'i'), '').replace(new RegExp(`^${escaped}\\s*[-|–—:]\\s*`, 'i'), '');
  }
  return t.trim();
}

/** Readable title from a URL slug, e.g. /products/bamboo-cutting-board-set -> "Bamboo Cutting Board Set". */
export function titleFromUrl(raw) {
  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    const slug = parts
      .filter((p) => /[a-z]{3,}.*-.*[a-z]/i.test(p) && !/^(dp|gp|item|items|product|products|p|itm|listing)$/i.test(p))
      .sort((a, b) => b.length - a.length)[0];
    if (!slug) return '';
    return slug
      .replace(/\.(html?|php|aspx?)$/i, '')
      .replace(/[-_+]+/g, ' ')
      .replace(/\b\d{6,}\b/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return '';
  }
}

/** Plain description -> short bullet points. */
export function bulletsFrom(text, max = 8) {
  if (!text) return [];
  const lines = String(text).split('\n').map((l) => l.replace(/^[•\-*✓✔►▶→·]\s*/, '').trim());
  let bullets = lines.filter((l) => l.length >= 12 && l.length <= 220);
  if (bullets.length < 3) {
    bullets = String(text)
      .replace(/\n/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 20 && s.length <= 220);
  }
  const seen = new Set();
  return bullets
    .filter((b) => {
      const k = b.toLowerCase().slice(0, 40);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, max);
}

/* ------------------------------------------------------------------ */
/* Strategy: JSON-LD                                                   */
/* ------------------------------------------------------------------ */

function jsonLdBlocks(html) {
  const out = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim().replace(/^<!--|-->$/g, '');
    const parsed = tryJson(raw) || tryJson(raw.replace(/[\u0000-\u001f]+/g, ' '));
    if (parsed) out.push(parsed);
  }
  return out;
}

function hasType(node, type) {
  const t = node && node['@type'];
  return Array.isArray(t) ? t.some((x) => String(x).toLowerCase() === type) : String(t || '').toLowerCase() === type;
}

function walk(node, visit, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit, depth + 1));
  visit(node);
  for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, visit, depth + 1);
}

function offerPrice(offers) {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const o of list) {
    const p = parsePrice(o.price ?? o.lowPrice ?? o.priceSpecification?.price ?? o.priceSpecification?.[0]?.price);
    if (p) return { price: p, currency: o.priceCurrency || o.priceSpecification?.priceCurrency || '', availability: o.availability };
  }
  return { price: null, currency: '' };
}

function fromJsonLd(html, base) {
  let product = null;
  let group = null;
  for (const block of jsonLdBlocks(html)) {
    walk(block, (n) => {
      if (!group && hasType(n, 'productgroup')) group = n;
      if (!product && hasType(n, 'product')) product = n;
    });
  }
  const main = group || product;
  if (!main) return {};
  const variantsRaw = Array.isArray(group?.hasVariant) ? group.hasVariant : [];
  const first = variantsRaw[0] || product || {};
  const { price, currency } = offerPrice(main.offers || first.offers);
  const images = [];
  for (const src of [main.image, first.image, ...variantsRaw.map((v) => v.image)]) {
    if (Array.isArray(src)) images.push(...src);
    else if (src) images.push(src);
  }
  const brand = typeof main.brand === 'string' ? main.brand : main.brand?.name || '';
  const specs = [];
  const props = Array.isArray(main.additionalProperty) ? main.additionalProperty : [];
  for (const p of props) if (p?.name && p?.value !== undefined) specs.push({ label: clean(p.name), value: clean(String(p.value)) });
  for (const [key, label] of [['material', 'Material'], ['color', 'Color'], ['size', 'Size'], ['weight', 'Weight']]) {
    const v = main[key];
    if (typeof v === 'string' && v && !variantsRaw.length) specs.push({ label, value: clean(v) });
  }

  const variants = [];
  const optionMap = new Map();
  for (const v of variantsRaw) {
    const opts = {};
    for (const key of ['color', 'size', 'material', 'pattern']) {
      if (typeof v[key] === 'string' && v[key]) {
        const name = key[0].toUpperCase() + key.slice(1);
        opts[name] = clean(v[key]);
        if (!optionMap.has(name)) optionMap.set(name, new Set());
        optionMap.get(name).add(clean(v[key]));
      }
    }
    const vp = offerPrice(v.offers);
    variants.push({
      title: clean(v.name) || Object.values(opts).join(' / '),
      options: opts,
      price: vp.price,
      image: absUrl(Array.isArray(v.image) ? v.image[0] : v.image?.url || v.image, base),
      available: !/OutOfStock|SoldOut/i.test(String(vp.availability || ''))
    });
  }

  return {
    title: clean(main.name),
    description: htmlToText(main.description || first.description || ''),
    images,
    price,
    currency,
    brand: clean(brand),
    sku: clean(main.sku || main.productGroupID || main.mpn || ''),
    category: clean(typeof main.category === 'string' ? main.category : ''),
    specs,
    options: [...optionMap].map(([name, values]) => ({ name, values: [...values] })),
    variants: variants.length > 1 ? variants : []
  };
}

/* ------------------------------------------------------------------ */
/* Strategy: meta tags                                                 */
/* ------------------------------------------------------------------ */

function fromMeta(html, base) {
  const metas = findTags(html, 'meta');
  const siteName = metaContent(metas, 'og:site_name', 'application-name');
  const title = metaContent(metas, 'og:title', 'twitter:title') || titleTag(html);
  const priceRaw = metaContent(metas, 'product:price:amount', 'og:price:amount', 'price', 'twitter:data1');
  const currency = metaContent(metas, 'product:price:currency', 'og:price:currency', 'pricecurrency', 'currency');
  const images = [
    ...metaAll(metas, 'og:image:secure_url'),
    ...metaAll(metas, 'og:image'),
    ...metaAll(metas, 'twitter:image'),
    ...metaAll(metas, 'twitter:image:src'),
    ...findTags(html, 'link').filter((l) => /image_src/i.test(l.rel || '')).map((l) => l.href)
  ];
  // itemprop="price" often lives on a span/content attribute rather than a meta tag.
  let micro = null;
  const mp = html.match(/itemprop\s*=\s*["']price["'][^>]*content\s*=\s*["']([^"']+)["']/i) ||
    html.match(/content\s*=\s*["']([^"']+)["'][^>]*itemprop\s*=\s*["']price["']/i);
  if (mp) micro = parsePrice(mp[1]);
  return {
    siteName,
    title: cleanTitle(title, siteName),
    description: metaContent(metas, 'og:description', 'description', 'twitter:description').replace(/^(buy|shop|order)\b.*$/i, ''),
    images,
    price: parsePrice(priceRaw) || micro,
    currency: currency || currencyFromText(priceRaw),
    brand: metaContent(metas, 'product:brand', 'og:brand', 'brand')
  };
}

/* ------------------------------------------------------------------ */
/* Strategy: Amazon                                                    */
/* ------------------------------------------------------------------ */

function fromAmazon(html) {
  const out = {};
  const t = html.match(/id\s*=\s*["']productTitle["'][^>]*>([\s\S]*?)<\//i);
  if (t) out.title = clean(t[1]);
  const hi = [...html.matchAll(/"hiRes"\s*:\s*"(https:[^"]+)"/g)].map((m) => m[1]);
  const large = [...html.matchAll(/"large"\s*:\s*"(https:[^"]+)"/g)].map((m) => m[1]);
  const dyn = html.match(/data-a-dynamic-image\s*=\s*["']([^"']+)["']/i);
  const dynUrls = dyn ? Object.keys(tryJson(decodeEntities(dyn[1])) || {}) : [];
  out.images = [...hi, ...large, ...dynUrls];
  const fb = html.match(/id\s*=\s*["']feature-bullets["'][\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/i);
  if (fb) {
    out.bullets = [...fb[1].matchAll(/<span[^>]*class\s*=\s*["'][^"']*a-list-item[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi)]
      .map((m) => clean(htmlToText(m[1])))
      .filter((b) => b.length > 5);
  }
  const d = html.match(/id\s*=\s*["']productDescription["'][^>]*>([\s\S]*?)<\/div>/i);
  if (d) out.description = htmlToText(d[1]);
  const p = html.match(/class\s*=\s*["']a-offscreen["'][^>]*>\s*([^<]+)</i);
  if (p) {
    out.price = parsePrice(p[1]);
    out.currency = currencyFromText(p[1]);
  }
  const b = html.match(/id\s*=\s*["']bylineInfo["'][^>]*>([\s\S]*?)<\/a>/i);
  if (b) out.brand = clean(htmlToText(b[1])).replace(/^(Visit the|Brand:)\s*/i, '').replace(/\s*Store$/i, '');
  const specs = [];
  for (const m of html.matchAll(/<tr[^>]*>\s*<t[hd][^>]*class\s*=\s*["'][^"']*(?:prodDetSectionEntry|a-span3)[^"']*["'][^>]*>([\s\S]*?)<\/t[hd]>\s*<td[^>]*>([\s\S]*?)<\/td>/gi)) {
    const label = clean(htmlToText(m[1]));
    const value = clean(htmlToText(m[2]));
    if (label && value && label.length < 40 && value.length < 120 && !/review|rank|asin|brand|manufacturer/i.test(label)) specs.push({ label, value });
  }
  if (specs.length) out.specs = specs.slice(0, 12);
  return out;
}

/* ------------------------------------------------------------------ */
/* Strategy: AliExpress (embedded page state)                          */
/* ------------------------------------------------------------------ */

function jsonString(src, key) {
  const m = src.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!m) return '';
  const v = tryJson(`"${m[1]}"`);
  return clean(v ?? m[1]);
}

function fromAliExpress(html) {
  const out = {};
  out.title = jsonString(html, 'subject') || jsonString(html, 'title');
  const list = html.match(/"imagePathList"\s*:\s*\[/);
  if (list) {
    const arr = tryJson(sliceBalanced(html, list.index + list[0].length - 1) || '');
    if (Array.isArray(arr)) out.images = arr;
  }
  const priceText =
    jsonString(html, 'formatedActivityPrice') || jsonString(html, 'formatedAmount') || jsonString(html, 'formatedPrice') ||
    jsonString(html, 'salePriceString');
  if (priceText) {
    out.price = parsePrice(priceText.split(/\s+-\s+/)[0]);
    out.currency = currencyFromText(priceText);
  }
  const specs = [];
  for (const m of html.matchAll(/"attrName"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"attrNameId"[^}]*?"attrValue"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
    specs.push({ label: clean(tryJson(`"${m[1]}"`) ?? m[1]), value: clean(tryJson(`"${m[2]}"`) ?? m[2]) });
  }
  if (!specs.length) {
    for (const m of html.matchAll(/"attrName"\s*:\s*"((?:[^"\\]|\\.)*)"[^{}]*?"attrValue"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) {
      specs.push({ label: clean(tryJson(`"${m[1]}"`) ?? m[1]), value: clean(tryJson(`"${m[2]}"`) ?? m[2]) });
    }
  }
  if (specs.length) out.specs = specs.filter((s) => s.label && s.value && !/brand name|origin|model number/i.test(s.label)).slice(0, 12);
  const options = [];
  for (const m of html.matchAll(/"skuPropertyName"\s*:\s*"([^"]+)"\s*,\s*"skuPropertyValues"\s*:\s*\[/g)) {
    const arr = tryJson(sliceBalanced(html, m.index + m[0].length - 1) || '');
    if (Array.isArray(arr)) {
      const values = arr.map((v) => clean(v.propertyValueDisplayName || v.propertyValueName || '')).filter(Boolean);
      if (values.length) options.push({ name: clean(m[1]), values: [...new Set(values)] });
    }
  }
  if (options.length) out.options = options.filter((o) => !/ships from/i.test(o.name));
  const desc = html.match(/"descriptionUrl"\s*:\s*"([^"]+)"/);
  if (desc) out.descriptionUrl = desc[1].replace(/\\u002F/g, '/');
  return out;
}

/* ------------------------------------------------------------------ */
/* Strategy: Shopify JSON                                              */
/* ------------------------------------------------------------------ */

export function shopifyJsonUrl(raw) {
  try {
    const url = new URL(raw);
    const m = url.pathname.match(/^(.*\/products\/[^/?#.]+)/);
    return m ? `${url.origin}${m[1]}.json` : '';
  } catch {
    return '';
  }
}

export function fromShopifyJson(data, base) {
  const p = data?.product;
  if (!p?.title) return {};
  const imageById = new Map((p.images || []).map((i) => [i.id, i.src]));
  const options = (p.options || [])
    .filter((o) => o.name && !(o.name === 'Title' && (o.values || []).join() === 'Default Title'))
    .map((o) => ({ name: clean(o.name), values: (o.values || []).map(clean) }));
  const variants = (p.variants || []).map((v) => {
    const opts = {};
    options.forEach((o, i) => {
      const val = v[`option${i + 1}`];
      if (val) opts[o.name] = clean(val);
    });
    return {
      title: clean(v.title),
      options: opts,
      price: parsePrice(v.price),
      image: absUrl(imageById.get(v.image_id) || v.featured_image?.src || '', base),
      available: v.available !== false
    };
  });
  const description = htmlToText(p.body_html || '');
  return {
    title: clean(p.title),
    description,
    images: (p.images || []).map((i) => i.src),
    price: variants.map((v) => v.price).filter(Boolean).sort((a, b) => a - b)[0] || null,
    brand: clean(p.vendor),
    category: clean(p.product_type),
    tags: Array.isArray(p.tags) ? p.tags : String(p.tags || '').split(',').map((t) => t.trim()).filter(Boolean),
    options,
    variants: options.length ? variants : []
  };
}

/* ------------------------------------------------------------------ */
/* Merge                                                               */
/* ------------------------------------------------------------------ */

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (Array.isArray(v) ? v.length : v) return v;
  }
  return Array.isArray(vals[0]) ? [] : vals.find((v) => v !== undefined) ?? '';
}

/** Parse one page of HTML (and optional Shopify JSON) into a product. Pure; used by tests. */
export function parseProductHtml(html, pageUrl, { shopify = null } = {}) {
  const host = (() => { try { return new URL(pageUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  const shop = shopify ? fromShopifyJson(shopify, pageUrl) : {};
  const ld = html ? fromJsonLd(html, pageUrl) : {};
  const meta = html ? fromMeta(html, pageUrl) : {};
  const site = !html ? {} : /amazon\./i.test(host) ? fromAmazon(html) : /aliexpress\./i.test(host) ? fromAliExpress(html) : {};

  const sources = [shop, ld, site, meta];
  const pick = (key) => firstNonEmpty(...sources.map((s) => s[key]));

  const rawTitle = pick('title') || titleFromUrl(pageUrl);
  const description = firstNonEmpty(shop.description, ld.description, site.description, meta.description);
  const images = normaliseImages([...(shop.images || []), ...(ld.images || []), ...(site.images || []), ...(meta.images || [])], pageUrl);
  const bullets = firstNonEmpty(site.bullets, bulletsFrom(description));
  const shopCurrency = html ? (html.match(/Shopify\.currency\s*=\s*\{[^}]*"active"\s*:\s*"([A-Z]{3})"/) || [])[1] : '';

  const product = {
    sourceUrl: pageUrl,
    sourceSite: host,
    title: cleanTitle(rawTitle, meta.siteName),
    description: String(description || '').slice(0, 6000),
    bullets,
    images: images.slice(0, 12),
    price: pick('price'),
    currency: (firstNonEmpty(ld.currency, site.currency, meta.currency, shopCurrency) || '').toUpperCase().slice(0, 3),
    brand: pick('brand'),
    sku: ld.sku || '',
    category: pick('category'),
    tags: shop.tags || [],
    specs: pick('specs') || [],
    options: pick('options') || [],
    variants: pick('variants') || [],
    descriptionUrl: site.descriptionUrl || ''
  };
  // Options without per-variant data (AliExpress) are kept: the store still lets shoppers pick them.
  return product;
}

const SUPPLIER_SITES = /(aliexpress|alibaba|1688|cjdropshipping|temu|dhgate|banggood|zendrop|spocket|autods|made-in-china|shein|wish)\./i;

/** True when the link is a supplier marketplace rather than someone's retail store. */
export function isSupplierSite(host) {
  return SUPPLIER_SITES.test(`${host || ''}.`.replace(/^www\./, ''));
}

export function productWarnings(p) {
  const w = [];
  if (p.price && p.sourceSite && !isSupplierSite(p.sourceSite)) {
    w.push(`${p.sourceSite} looks like a retail store, so ${p.price.toFixed(2)}${p.currency ? ` ${p.currency}` : ''} is probably its selling price, not your cost. Enter your real supplier price in the Pricing tab.`);
  }
  if (!p.title) w.push('No product name found - add one before publishing.');
  if (!p.price) w.push('No supplier price found - set your selling price by hand.');
  if (!p.images.length) w.push('No product photos found - the store will use a placeholder until you add images.');
  if (!p.description && !p.bullets.length) w.push('No product description found - the copy is written from the title alone.');
  return w;
}

/** How much of a product we actually recovered, 0-1. */
export function completeness(p) {
  let s = 0;
  if (p.title) s += 0.3;
  if (p.images.length) s += 0.3;
  if (p.price) s += 0.2;
  if (p.description || p.bullets.length) s += 0.2;
  return Math.round(s * 100) / 100;
}

/**
 * Fetch and read a product link. Never throws for a blocked/failed page: it
 * returns whatever it could recover plus `fetchError`, so the caller can fall
 * back to the AI page reader or ask the user to fill the gaps.
 */
export async function extractProduct(link, { fetcher = safeFetch } = {}) {
  const pageUrl = String(link || '').trim();
  let html = '';
  let finalUrl = pageUrl;
  let shopify = null;
  let fetchError = null;

  const jsonUrl = shopifyJsonUrl(pageUrl);
  const [pageRes, jsonRes] = await Promise.allSettled([
    fetcher(pageUrl),
    jsonUrl ? fetcher(jsonUrl, { headers: { accept: 'application/json' } }) : Promise.resolve(null)
  ]);

  if (pageRes.status === 'fulfilled') {
    html = pageRes.value.body.toString('utf8');
    finalUrl = pageRes.value.url || pageUrl;
  } else {
    fetchError = pageRes.reason;
    if (fetchError instanceof FetchError && !fetchError.status && !fetchError.blocked && /not look like a link|Only http|private|local/.test(fetchError.message)) {
      throw fetchError; // bad input, not a bad page
    }
  }
  if (jsonRes.status === 'fulfilled' && jsonRes.value) {
    shopify = tryJson(jsonRes.value.body.toString('utf8'));
  }
  // Short or tracking links often redirect to a Shopify product page.
  const finalJsonUrl = shopifyJsonUrl(finalUrl);
  if (!shopify && finalJsonUrl && finalJsonUrl !== jsonUrl) {
    try {
      shopify = tryJson((await fetcher(finalJsonUrl, { headers: { accept: 'application/json' } })).body.toString('utf8'));
    } catch { /* not Shopify after all */ }
  }

  if (html && /captcha|robot check|are you a human|access denied|unusual traffic/i.test(titleTag(html)) && !/"@type"\s*:\s*"Product/i.test(html)) {
    fetchError = new FetchError('The store showed a bot check instead of the product page.', { blocked: true });
    html = '';
  }

  const product = parseProductHtml(html, finalUrl, { shopify });

  // AliExpress loads the long description from a separate document.
  if (product.descriptionUrl && product.description.length < 200) {
    try {
      const res = await fetcher(product.descriptionUrl, { timeoutMs: 10000 });
      const text = htmlToText(res.body.toString('utf8')).slice(0, 6000);
      if (text.length > product.description.length) {
        product.description = text;
        if (product.bullets.length < 3) product.bullets = bulletsFrom(text);
      }
    } catch { /* optional */ }
  }
  delete product.descriptionUrl;

  return { product, fetchError: fetchError ? fetchError.message : null, blocked: Boolean(fetchError?.blocked) };
}
