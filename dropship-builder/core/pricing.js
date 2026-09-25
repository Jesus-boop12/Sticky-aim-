/**
 * Supplier cost -> retail price. Dropshipping margins have to cover the
 * product, card fees, ads and the occasional refund, so the default is a 2.5x
 * markup with a minimum profit floor, finished with a charm ending.
 */

export const CARD_FEE_RATE = 0.029;
export const CARD_FEE_FIXED = 0.3;

const round2 = (n) => Math.round(n * 100) / 100;

/** 23.4 -> 23.99 ; 20 -> 20.99 (".99") ; 23.4 -> 24.00 (".00") ; 23.4 -> 23.95 (".95") */
export function charm(value, ending = '.99') {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value < 2) return round2(value);
  if (ending === '.00') return Math.ceil(value);
  const cents = ending === '.95' ? 0.95 : 0.99;
  const whole = Math.floor(value);
  return round2(whole + cents >= value ? whole + cents : whole + 1 + cents);
}

/** Price for one supplier cost under the store's pricing settings. */
export function retailPrice(cost, settings = {}) {
  const markup = Number(settings.markup) > 0 ? Number(settings.markup) : 2.5;
  const minProfit = Number(settings.minProfit) >= 0 ? Number(settings.minProfit) : 5;
  if (!cost) return null;
  const target = Math.max(cost * markup, cost + minProfit + CARD_FEE_FIXED);
  return charm(target, settings.priceEnding);
}

export function profitFor(price, cost, shippingCharged = 0) {
  if (!price || !cost) return null;
  const gross = price + shippingCharged;
  const fees = gross * CARD_FEE_RATE + CARD_FEE_FIXED;
  const profit = round2(gross - cost - fees);
  return { profit, fees: round2(fees), margin: round2(profit / gross) };
}

/**
 * Work out the storefront prices for a product.
 * `settings.price` (a manual override) always wins over the markup.
 */
export function priceProduct(product, settings = {}) {
  const cost = product.price || null;
  const override = Number(settings.price) > 0 ? round2(Number(settings.price)) : null;
  const price = override || retailPrice(cost, settings) || 29.99;
  const ratio = cost && price ? price / cost : null;

  const compareAt = Number(settings.compareAt) > price ? round2(Number(settings.compareAt)) : null;

  const variants = (product.variants || []).map((v) => {
    let vp = price;
    if (v.price && cost && v.price !== cost) vp = override ? charm(v.price * ratio, settings.priceEnding) : retailPrice(v.price, settings);
    return { ...v, cost: v.price || cost, price: vp };
  });

  return {
    cost,
    price,
    compareAt,
    manual: Boolean(override),
    estimated: !cost && !override,
    profit: profitFor(price, cost),
    variants
  };
}
