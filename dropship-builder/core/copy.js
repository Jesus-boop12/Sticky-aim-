/**
 * Store copy: every word on the generated site.
 *
 * `templateCopy` writes it offline from the product data and category, so the
 * builder works with no API key. The AI writer (server/ai.js) produces the same
 * shape and is passed through `normalizeCopy`, which fills any gaps from the
 * template so a partial AI answer can never leave a hole in the site.
 *
 * Deliberately absent: customer reviews, ratings, "X people are viewing",
 * countdown timers and invented "was" prices. Fake social proof is illegal in
 * the US (FTC rule on fake reviews, 2024), the EU and the UK, and gets ad
 * accounts banned. Add real reviews once real customers leave them.
 */

import { CATEGORIES, THEMES, ICON_NAMES, detectCategory } from './catalog.js';
import { clean } from './html.js';

const STOP = new Set(('a an the and or for with of to in on by from at as is it this that your you our new hot sale best top ' +
  'premium quality high upgraded upgrade portable mini multifunctional multifunction multi-purpose universal professional ' +
  'set pack pcs pc piece pieces kit 1 2 3 4 5 6 8 10 12 20 50 100 inch cm mm ml l oz lb men women mens womens unisex ' +
  '2023 2024 2025 2026 free shipping original genuine official item product').split(' '));

const FILLER = new Set(('new hot sale best top premium quality high-quality upgraded upgrade reusable portable multifunctional ' +
  'multifunction multi-purpose universal professional original genuine official 2023 2024 2025 2026 1pc 1pcs 2pcs').split(' '));

function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

/** Title Case that keeps short acronyms (USB, LED, UV) and fixes SHOUTED words. */
const titleCase = (s) => s.replace(/[^\s-]+/g, (w) => {
  if (/^[A-Z0-9°]{2,4}$/.test(w) && /[A-Z]/.test(w)) return w;
  return w[0].toUpperCase() + w.slice(1).toLowerCase();
});

/** Long marketplace title -> a short, human product name. */
export function shortTitle(title, brand = '') {
  let t = clean(title);
  if (brand && t.toLowerCase().startsWith(brand.toLowerCase() + ' ')) t = t.slice(brand.length + 1);
  const cut = t.split(/\s*(?:[,|(\[]|\s[-–—]\s|\bwith\b|\bfor\b)\s*/i)[0] || t;
  let words = cut.split(/\s+/).filter(Boolean);
  const trimmed = words.filter((w) => !FILLER.has(w.toLowerCase().replace(/[^a-z0-9-]/g, '')));
  if (trimmed.length >= 2) words = trimmed;
  while (words.length > 3 && (words.length > 6 || words.join(' ').length > 44)) words.pop();
  let out = words.join(' ').replace(/[\s:;,.-]+$/, '');
  if (out.length < 8) out = t.slice(0, 60);
  if (out === out.toUpperCase() || out === out.toLowerCase()) out = titleCase(out);
  return out.slice(0, 70);
}

/** The "thing" a product is: "Bamboo Cutting Board Set" -> "Cutting Board". */
export function headNoun(title) {
  const words = shortTitle(title).split(/\s+/).map((w) => w.replace(/[^\w'-]/g, '')).filter((w) => w && !STOP.has(w.toLowerCase()) && !/\d/.test(w));
  return titleCase(words.slice(-2).join(' ') || 'Everyday');
}

/** A short brandable name like "Pawnest" or "Glow Studio". Always rename-able. */
export function autoStoreName(product, categoryId) {
  const cat = CATEGORIES[categoryId] || CATEGORIES.general;
  const h = hash(product.title || 'store');
  const prefix = cat.prefixes[h % cat.prefixes.length];
  const ending = cat.endings[(h >>> 8) % cat.endings.length];
  return (prefix + ending).slice(0, 40);
}

function splitBullet(b) {
  const m = b.match(/^([^:–—]{3,48})\s*[:–—]\s*(.{10,})$/);
  return m ? { title: titleCase(m[1].replace(/[【】\[\]]/g, '').trim()), text: m[2].trim() } : null;
}

const sentence = (s) => {
  const t = clean(s);
  if (!t) return '';
  const cap = t[0].toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : cap + '.';
};

function daysLabel(range) {
  return `${range} business day${range === '1' ? '' : 's'}`;
}

export function policyFacts(settings) {
  return {
    processing: daysLabel(settings.processingDays),
    delivery: daysLabel(settings.deliveryDays),
    shipping: settings.freeShipping ? 'Free tracked shipping on every order' : 'Tracked shipping on every order',
    returns: settings.returnDays > 0 ? `${settings.returnDays}-day returns` : 'All sales final'
  };
}

/** Everything the store needs, written offline. */
export function templateCopy(product, settings) {
  const categoryId = detectCategory(product);
  const cat = CATEGORIES[categoryId];
  const name = shortTitle(product.title || 'Our product', product.brand);
  const storeName = settings.storeName || autoStoreName(product, categoryId);
  const facts = policyFacts(settings);

  const bullets = (product.bullets || []).map(clean).filter(Boolean);
  // Only "Title: detail" bullets make good benefit cards; the rest go in the feature list.
  const benefits = bullets.map(splitBullet).filter(Boolean).slice(0, 4).map(({ title, text }, i) => (
    { icon: cat.icons[i % cat.icons.length], title, text: sentence(text).slice(0, 220) }
  ));
  const fillers = [
    { icon: 'truck', title: settings.freeShipping ? 'Free shipping' : 'Tracked shipping', text: `Every order ships with tracking and arrives in about ${facts.delivery}.` },
    { icon: 'return', title: settings.returnDays > 0 ? `${settings.returnDays}-day returns` : 'Here to help', text: settings.returnDays > 0 ? `Not the right fit? Send it back within ${settings.returnDays} days of delivery.` : 'Questions about your order? Our team answers every message.' },
    { icon: 'lock', title: 'Secure checkout', text: 'Payments are processed by trusted, encrypted payment providers.' },
    { icon: 'mail', title: 'Real support', text: 'Questions before or after you buy? Email us and a real person will answer.' }
  ];
  for (const f of fillers) if (benefits.length < 4) benefits.push(f);

  const firstSentence = (product.description || bullets[0] || '').split(/(?<=[.!?])\s/)[0];
  const heroSub = sentence(firstSentence).slice(0, 180) || `${cat.tagline}. ${facts.shipping}.`;

  const paragraphs = String(product.description || '')
    .split('\n')
    .filter((p) => !/^•/.test(p.trim()))
    .map((p) => p.trim())
    .filter((p) => p.length > 40)
    .slice(0, 3)
    .map(sentence);
  const longDescription = paragraphs.length ? paragraphs : [
    `The ${name} is here to make life a little easier. ${bullets[0] ? sentence(bullets[0]) : ''}`.trim(),
    `Order today and we will get it on its way within ${facts.processing}, with tracking the whole way.`
  ];

  const faq = [
    { q: 'How long does shipping take?', a: `Orders are processed within ${facts.processing} and usually arrive ${facts.delivery} after that. You get a tracking number by email as soon as your order ships.` },
    { q: 'How much is shipping?', a: settings.freeShipping ? 'Shipping is free on every order.' : `Shipping is a flat ${settings.shippingFee.toFixed(2)} per order.` },
    { q: 'Can I return it?', a: settings.returnDays > 0 ? `Yes. You can return unused items within ${settings.returnDays} days of delivery. See our returns policy for the details.` : 'All sales are final, but if your item arrives damaged or faulty, contact us and we will make it right.' },
    { q: 'How do I track my order?', a: 'You will get a tracking link by email once your order ships. Can’t find it? Check your spam folder or contact us with your order details.' },
    { q: 'Is checkout secure?', a: 'Yes. Payments are handled by a trusted payment provider over an encrypted connection. We never see or store your full card number.' }
  ];
  if ((product.specs || []).length) {
    faq.splice(1, 0, { q: `What are the ${name}'s specifications?`, a: product.specs.slice(0, 4).map((s) => `${s.label}: ${s.value}`).join('. ') + '.' });
  }

  return {
    category: categoryId,
    theme: cat.theme,
    storeName,
    tagline: cat.tagline,
    announcement: `${facts.shipping} · ${facts.returns}`,
    productTitle: name,
    heroHeadline: cat.verb,
    heroSubheadline: heroSub,
    shortDescription: heroSub,
    longDescription,
    benefits,
    features: bullets
      .filter((b) => !longDescription.some((p) => p.toLowerCase().includes(b.toLowerCase().slice(0, 40))))
      .slice(0, 8)
      .map((b) => clean(b).replace(/^[【\[][^】\]]*[】\]]\s*/, '')),
    specs: (product.specs || []).slice(0, 10),
    faq,
    aboutStory: [
      `${storeName} started with a simple idea: find genuinely useful products and make buying them easy. No clutter, no hard sell – just things we would happily use ourselves.`,
      `Every order is packed with care and shipped with tracking. If anything is not right, write to us and a real person will help you sort it out.`
    ],
    guaranteeTitle: settings.returnDays > 0 ? `${settings.returnDays}-day hassle-free returns` : 'We make it right',
    guaranteeText: settings.returnDays > 0
      ? `Try it at home. If you are not happy, send it back within ${settings.returnDays} days of delivery under our returns policy.`
      : 'If your order arrives damaged or faulty, contact us and we will replace it or refund you.',
    ctaText: 'Add to cart',
    seoTitle: `${name} | ${storeName}`.slice(0, 65),
    seoDescription: (heroSub + ' ' + facts.shipping + '.').slice(0, 158),
    source: 'template'
  };
}

const arr = (v) => (Array.isArray(v) ? v : []);
const s = (v, max) => clean(v).slice(0, max);

/**
 * Merge a (possibly partial or untrusted) copy object over the template.
 * `minItems` guards AI output against thin lists; the owner's own edits use 1.
 */
export function normalizeCopy(raw, fallback, { minItems = 3 } = {}) {
  if (!raw || typeof raw !== 'object') return fallback;
  const pick = (key, max) => s(raw[key], max) || fallback[key];
  const benefits = arr(raw.benefits)
    .map((b) => ({ icon: ICON_NAMES.includes(b?.icon) ? b.icon : 'check', title: s(b?.title, 60), text: s(b?.text, 260) }))
    .filter((b) => b.title && b.text)
    .slice(0, 6);
  const faq = arr(raw.faq).map((f) => ({ q: s(f?.q, 160), a: s(f?.a, 700) })).filter((f) => f.q && f.a).slice(0, 10);
  const features = arr(raw.features).map((f) => s(f, 200)).filter(Boolean).slice(0, 10);
  const specs = arr(raw.specs).map((x) => ({ label: s(x?.label, 40), value: s(x?.value, 120) })).filter((x) => x.label && x.value).slice(0, 12);
  const paras = (v, fb) => {
    const p = arr(v).map((x) => s(x, 900)).filter(Boolean).slice(0, 5);
    return p.length ? p : fb;
  };
  return {
    category: CATEGORIES[raw.category] ? raw.category : fallback.category,
    theme: THEMES[raw.theme] ? raw.theme : fallback.theme,
    storeName: pick('storeName', 40),
    tagline: pick('tagline', 90),
    announcement: pick('announcement', 90),
    productTitle: pick('productTitle', 80),
    heroHeadline: pick('heroHeadline', 90),
    heroSubheadline: pick('heroSubheadline', 220),
    shortDescription: pick('shortDescription', 320),
    longDescription: paras(raw.longDescription, fallback.longDescription),
    benefits: benefits.length >= minItems ? benefits : fallback.benefits,
    features: features.length ? features : fallback.features,
    specs: specs.length ? specs : fallback.specs,
    faq: faq.length >= minItems ? faq : fallback.faq,
    aboutStory: paras(raw.aboutStory, fallback.aboutStory),
    guaranteeTitle: pick('guaranteeTitle', 70),
    guaranteeText: pick('guaranteeText', 300),
    ctaText: pick('ctaText', 30),
    seoTitle: pick('seoTitle', 70),
    seoDescription: pick('seoDescription', 170),
    source: raw.source === 'ai' ? 'ai' : fallback.source
  };
}
