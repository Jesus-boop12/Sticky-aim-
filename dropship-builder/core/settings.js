/**
 * Store settings. Every field is optional: the whole point is that a product
 * link alone produces a complete store, and these only refine it.
 */

import { THEMES } from './catalog.js';

export const DEFAULT_SETTINGS = {
  storeName: '',
  theme: 'auto',
  currency: '',
  markup: 2.5,
  minProfit: 5,
  priceEnding: '.99',
  price: null,
  compareAt: null,
  freeShipping: true,
  shippingFee: 4.99,
  processingDays: '1-3',
  deliveryDays: '7-15',
  returnDays: 30,
  contactEmail: '',
  businessName: '',
  businessAddress: '',
  paypalMe: '',
  checkoutUrl: '',
  siteUrl: '',
  useAi: true,
  downloadImages: true
};

const str = (v, max = 200) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const num = (v, lo, hi, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : fallback;
};
const days = (v, fallback) => (/^\d{1,2}(\s*-\s*\d{1,2})?$/.test(String(v ?? '').trim()) ? String(v).replace(/\s+/g, '') : fallback);

function httpUrl(v) {
  const s = str(v, 500);
  if (!s) return '';
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : '';
  } catch {
    return '';
  }
}

export function normalizeSettings(raw = {}) {
  const d = DEFAULT_SETTINGS;
  const email = str(raw.contactEmail, 120);
  const paypal = str(raw.paypalMe, 120).replace(/^https?:\/\/(www\.)?paypal\.me\//i, '').replace(/[^\w.-]/g, '');
  const currency = str(raw.currency, 3).toUpperCase();
  return {
    storeName: str(raw.storeName, 60),
    theme: raw.theme && (raw.theme === 'auto' || THEMES[raw.theme]) ? raw.theme : d.theme,
    currency: /^[A-Z]{3}$/.test(currency) ? currency : '',
    markup: num(raw.markup, 1, 20, d.markup),
    minProfit: num(raw.minProfit, 0, 10000, d.minProfit),
    priceEnding: ['.99', '.95', '.00'].includes(raw.priceEnding) ? raw.priceEnding : d.priceEnding,
    price: num(raw.price, 0.01, 1e6, null),
    compareAt: num(raw.compareAt, 0.01, 1e6, null),
    freeShipping: raw.freeShipping === undefined ? d.freeShipping : Boolean(raw.freeShipping),
    shippingFee: num(raw.shippingFee, 0, 1000, d.shippingFee),
    processingDays: days(raw.processingDays, d.processingDays),
    deliveryDays: days(raw.deliveryDays, d.deliveryDays),
    returnDays: Math.round(num(raw.returnDays, 0, 365, d.returnDays)),
    contactEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    businessName: str(raw.businessName, 100),
    businessAddress: str(raw.businessAddress, 200),
    paypalMe: paypal,
    checkoutUrl: httpUrl(raw.checkoutUrl),
    siteUrl: httpUrl(raw.siteUrl).replace(/\/+$/, ''),
    useAi: raw.useAi === undefined ? d.useAi : Boolean(raw.useAi),
    downloadImages: raw.downloadImages === undefined ? d.downloadImages : Boolean(raw.downloadImages)
  };
}
