/**
 * Product + copy + settings -> a complete static storefront.
 *
 * The output is plain HTML/CSS/JS with no build step and no backend, so it
 * uploads as-is to Netlify, Vercel, GitHub Pages, Cloudflare Pages or any web
 * host. Checkout hands off to the owner's Stripe Payment Link or PayPal.me, or
 * falls back to an emailed order when neither is set.
 */

import { esc } from './html.js';
import { THEMES, icon } from './catalog.js';
import { policyFacts } from './copy.js';

const LOCALES = { USD: 'en-US', GBP: 'en-GB', CAD: 'en-CA', AUD: 'en-AU', NZD: 'en-NZ', INR: 'en-IN', EUR: 'en-IE' };

export function formatMoney(value, currency = 'USD') {
  if (value === null || value === undefined) return '';
  try {
    return new Intl.NumberFormat(LOCALES[currency] || 'en-US', { style: 'currency', currency }).format(value);
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

export function slugify(s) {
  return String(s || 'store').toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 40) || 'store';
}

function initials(name) {
  return String(name || 'S').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

/* ------------------------------------------------------------------ */
/* Shared layout                                                       */
/* ------------------------------------------------------------------ */

function layout(ctx, { title, description, body, file, extraHead = '', bodyClass = '' }) {
  const { copy, theme, settings, store } = ctx;
  const canonical = settings.siteUrl ? `${settings.siteUrl}/${file === 'index.html' ? '' : file}` : '';
  const ogImage = ctx.images[0] && settings.siteUrl && !/^https?:/.test(ctx.images[0]) ? `${settings.siteUrl}/${ctx.images[0]}` : /^https?:/.test(ctx.images[0] || '') ? ctx.images[0] : '';
  const nav = [
    ['index.html', 'Shop'], ['about.html', 'About'], ['faq.html', 'FAQ'], ['track-order.html', 'Track order'], ['contact.html', 'Contact']
  ];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:type" content="${file === 'index.html' ? 'product' : 'website'}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:site_name" content="${esc(copy.storeName)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="${theme.primary}">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${theme.fonts}&display=swap">
<link rel="stylesheet" href="assets/store.css">
${extraHead}
</head>
<body class="${bodyClass}">
<a class="skip" href="#main">Skip to content</a>
<div class="announce">${esc(copy.announcement)}</div>
<header class="site-header">
  <div class="wrap header-row">
    <a class="logo" href="index.html" aria-label="${esc(copy.storeName)} home"><span class="logo-mark">${esc(initials(copy.storeName))}</span><span>${esc(copy.storeName)}</span></a>
    <nav class="nav" aria-label="Main">
      ${nav.map(([href, label]) => `<a href="${href}"${href === file ? ' aria-current="page"' : ''}>${label}</a>`).join('\n      ')}
    </nav>
    <a class="cart-link" href="cart.html" aria-label="Cart">${icon('cart', 22)}<span class="cart-count" data-cart-count hidden>0</span></a>
    <button class="menu-btn" type="button" aria-label="Menu" aria-expanded="false" data-menu-btn><span></span><span></span><span></span></button>
  </div>
</header>
<main id="main">
${body}
</main>
<footer class="site-footer">
  <div class="wrap footer-grid">
    <div>
      <a class="logo" href="index.html"><span class="logo-mark">${esc(initials(copy.storeName))}</span><span>${esc(copy.storeName)}</span></a>
      <p class="muted">${esc(copy.tagline)}</p>
      ${settings.contactEmail ? `<p><a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a></p>` : ''}
    </div>
    <div>
      <h3>Shop</h3>
      <a href="index.html">${esc(copy.productTitle)}</a>
      <a href="about.html">About us</a>
      <a href="faq.html">FAQ</a>
      <a href="track-order.html">Track your order</a>
      <a href="contact.html">Contact</a>
    </div>
    <div>
      <h3>Policies</h3>
      <a href="shipping-policy.html">Shipping policy</a>
      <a href="refund-policy.html">Refund policy</a>
      <a href="privacy-policy.html">Privacy policy</a>
      <a href="terms-of-service.html">Terms of service</a>
    </div>
    <div>
      <h3>Secure checkout</h3>
      <p class="muted small">${icon('lock', 16)} Payments are processed securely by ${store.paymentLabel}.</p>
    </div>
  </div>
  <div class="wrap footer-base small muted">© <span data-year>${new Date().getFullYear()}</span> ${esc(settings.businessName || copy.storeName)}. All rights reserved.</div>
</footer>
<div class="toast" role="status" aria-live="polite" data-toast></div>
<script src="assets/config.js"></script>
<script src="assets/store.js"></script>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ */
/* Pages                                                               */
/* ------------------------------------------------------------------ */

function optionPickers(ctx) {
  const { product } = ctx;
  const options = product.options?.length ? product.options : [];
  if (!options.length) return '';
  return options
    .map((o, i) => `
      <fieldset class="option" data-option="${esc(o.name)}">
        <legend>${esc(o.name)}: <strong data-option-value>${esc(o.values[0])}</strong></legend>
        <div class="option-values">
          ${o.values.slice(0, 30).map((v, j) => `<label><input type="radio" name="opt-${i}" value="${esc(v)}"${j === 0 ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}
        </div>
      </fieldset>`)
    .join('');
}

function productJsonLd(ctx) {
  const { copy, pricing, settings, product } = ctx;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: copy.productTitle,
    description: copy.shortDescription,
    image: ctx.images.slice(0, 6).map((u) => (/^https?:/.test(u) || !settings.siteUrl ? u : `${settings.siteUrl}/${u}`)),
    ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
    offers: {
      '@type': 'Offer',
      price: pricing.price.toFixed(2),
      priceCurrency: ctx.currency,
      availability: 'https://schema.org/InStock',
      ...(settings.siteUrl ? { url: `${settings.siteUrl}/` } : {}),
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: { '@type': 'MonetaryAmount', value: settings.freeShipping ? 0 : settings.shippingFee, currency: ctx.currency }
      },
      ...(settings.returnDays > 0 ? {
        hasMerchantReturnPolicy: {
          '@type': 'MerchantReturnPolicy',
          returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
          merchantReturnDays: settings.returnDays
        }
      } : {})
    }
  };
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function homePage(ctx) {
  const { copy, pricing, settings, images, currency } = ctx;
  const facts = policyFacts(settings);
  const main = images[0] || 'images/placeholder.svg';
  const saving = pricing.compareAt ? Math.round((1 - pricing.price / pricing.compareAt) * 100) : 0;
  const detailImg = images[1] || images[0] || 'images/placeholder.svg';
  const ctaImg = images[2] || images[0] || 'images/placeholder.svg';

  const gallery = `
    <div class="gallery" data-gallery>
      <div class="gallery-main"><img src="${esc(main)}" alt="${esc(copy.productTitle)}" data-main-image width="800" height="800" fetchpriority="high"></div>
      ${images.length > 1 ? `<div class="thumbs" role="list">
        ${images.slice(0, 8).map((src, i) => `<button type="button" class="thumb${i === 0 ? ' is-active' : ''}" data-thumb="${esc(src)}" aria-label="Show photo ${i + 1}"><img src="${esc(src)}" alt="" loading="lazy" width="96" height="96"></button>`).join('\n        ')}
      </div>` : ''}
    </div>`;

  const buyBox = `
    <div class="buy-box" data-buy-box>
      <p class="kicker">${esc(copy.tagline)}</p>
      <h1>${esc(copy.productTitle)}</h1>
      <div class="price-row">
        <span class="price" data-price>${esc(formatMoney(pricing.price, currency))}</span>
        ${pricing.compareAt ? `<s class="compare" data-compare>${esc(formatMoney(pricing.compareAt, currency))}</s><span class="save">Save ${saving}%</span>` : ''}
      </div>
      <p class="lead">${esc(copy.shortDescription)}</p>
      <form class="add-form" data-add-form>
        ${optionPickers(ctx)}
        <div class="qty-row">
          <div class="qty" data-qty>
            <button type="button" data-qty-step="-1" aria-label="Decrease quantity">−</button>
            <input type="number" name="qty" value="1" min="1" max="99" inputmode="numeric" aria-label="Quantity">
            <button type="button" data-qty-step="1" aria-label="Increase quantity">+</button>
          </div>
          <button class="btn btn-primary btn-lg" type="submit" data-add>${esc(copy.ctaText)}</button>
        </div>
        <button class="btn btn-ghost btn-block" type="button" data-buy-now>Buy it now</button>
      </form>
      <p class="eta" data-eta>${icon('clock', 18)} Ships within ${esc(facts.processing)}</p>
      <ul class="trust">
        <li>${icon('truck', 20)} ${esc(facts.shipping)}</li>
        <li>${icon('return', 20)} ${esc(settings.returnDays > 0 ? `${settings.returnDays}-day returns` : 'Damaged items replaced')}</li>
        <li>${icon('lock', 20)} Secure checkout</li>
      </ul>
    </div>`;

  const specs = copy.specs.length ? `
  <section class="section">
    <div class="wrap narrow">
      <h2 class="section-title">Specifications</h2>
      <table class="specs">${copy.specs.map((s) => `<tr><th scope="row">${esc(s.label)}</th><td>${esc(s.value)}</td></tr>`).join('')}</table>
    </div>
  </section>` : '';

  const body = `
  <section class="product wrap">
    ${gallery}
    ${buyBox}
  </section>

  <section class="section band">
    <div class="wrap">
      <h2 class="section-title center">Why you'll love it</h2>
      <div class="benefits">
        ${copy.benefits.map((b) => `<article class="benefit"><div class="benefit-icon">${icon(b.icon, 26)}</div><h3>${esc(b.title)}</h3><p>${esc(b.text)}</p></article>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap split">
      <div class="split-media"><img src="${esc(detailImg)}" alt="${esc(copy.productTitle)} detail" loading="lazy" width="700" height="700"></div>
      <div class="split-copy">
        <h2>${esc(copy.heroHeadline)}</h2>
        ${copy.longDescription.map((p) => `<p>${esc(p)}</p>`).join('\n        ')}
        ${copy.features.length ? `<ul class="checklist">${copy.features.slice(0, 6).map((f) => `<li>${icon('check', 20)}<span>${esc(f)}</span></li>`).join('')}</ul>` : ''}
      </div>
    </div>
  </section>
${specs}
  <section class="section band">
    <div class="wrap">
      <h2 class="section-title center">From our door to yours</h2>
      <ol class="steps">
        <li><span class="step-n">1</span><h3>You order</h3><p>Checkout takes a minute and your payment is fully encrypted.</p></li>
        <li><span class="step-n">2</span><h3>We ship</h3><p>Your order is processed within ${esc(facts.processing)} and you get a tracking link by email.</p></li>
        <li><span class="step-n">3</span><h3>It arrives</h3><p>Delivery usually takes ${esc(facts.delivery)}. ${settings.freeShipping ? 'Shipping is on us.' : ''}</p></li>
      </ol>
    </div>
  </section>

  <section class="section">
    <div class="wrap narrow guarantee">
      <div class="guarantee-icon">${icon('shield', 40)}</div>
      <div>
        <h2>${esc(copy.guaranteeTitle)}</h2>
        <p>${esc(copy.guaranteeText)}</p>
      </div>
    </div>
  </section>

  <section class="section band">
    <div class="wrap narrow">
      <h2 class="section-title center">Questions, answered</h2>
      <div class="faq">
        ${copy.faq.slice(0, 5).map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n        ')}
      </div>
      <p class="center"><a class="text-link" href="faq.html">See all questions →</a></p>
    </div>
  </section>

  <section class="section">
    <div class="wrap cta">
      <img src="${esc(ctaImg)}" alt="" loading="lazy" width="480" height="480">
      <div>
        <h2>Ready when you are</h2>
        <p class="lead">${esc(copy.heroSubheadline)}</p>
        <p class="price big">${esc(formatMoney(pricing.price, currency))}</p>
        <a class="btn btn-primary btn-lg" href="#main" data-scroll-buy>Get yours</a>
      </div>
    </div>
  </section>

  <div class="sticky-buy" data-sticky-buy aria-hidden="true">
    <img src="${esc(main)}" alt="" width="44" height="44">
    <div><strong>${esc(copy.productTitle)}</strong><span data-price>${esc(formatMoney(pricing.price, currency))}</span></div>
    <button class="btn btn-primary" type="button" data-sticky-add tabindex="-1">${esc(copy.ctaText)}</button>
  </div>`;

  return layout(ctx, {
    title: copy.seoTitle,
    description: copy.seoDescription,
    file: 'index.html',
    bodyClass: 'page-home',
    extraHead: productJsonLd(ctx),
    body
  });
}

function simplePage(ctx, file, title, inner, description) {
  return layout(ctx, {
    title: `${title} | ${ctx.copy.storeName}`,
    description: description || `${title} – ${ctx.copy.storeName}`,
    file,
    body: `<section class="section page"><div class="wrap narrow">
  <h1>${esc(title)}</h1>
  ${inner}
</div></section>`
  });
}

function cartPage(ctx) {
  return simplePage(ctx, 'cart.html', 'Your cart', `
  <div class="cart" data-cart>
    <div class="cart-lines" data-cart-lines><p class="muted">Loading your cart…</p></div>
    <aside class="cart-summary" data-cart-summary hidden>
      <div class="sum-row"><span>Subtotal</span><span data-subtotal></span></div>
      <div class="sum-row"><span>Shipping</span><span data-shipping></span></div>
      <div class="sum-row total"><span>Total</span><span data-total></span></div>
      <a class="btn btn-primary btn-block btn-lg" href="checkout.html">Checkout</a>
      <p class="small muted center">${icon('lock', 14)} Secure checkout</p>
    </aside>
  </div>`);
}

function checkoutPage(ctx) {
  return simplePage(ctx, 'checkout.html', 'Checkout', `
  <div class="checkout">
    <form class="checkout-form" data-checkout-form novalidate>
      <h2>Contact</h2>
      <label>Email<input type="email" name="email" autocomplete="email" required></label>
      <h2>Shipping address</h2>
      <div class="two"><label>First name<input name="firstName" autocomplete="given-name" required></label><label>Last name<input name="lastName" autocomplete="family-name" required></label></div>
      <label>Address<input name="address1" autocomplete="address-line1" required></label>
      <label>Apartment, suite, etc. (optional)<input name="address2" autocomplete="address-line2"></label>
      <div class="three"><label>City<input name="city" autocomplete="address-level2" required></label><label>State / region<input name="region" autocomplete="address-level1"></label><label>ZIP / postcode<input name="postcode" autocomplete="postal-code" required></label></div>
      <label>Country<input name="country" autocomplete="country-name" required></label>
      <label>Phone (for delivery updates, optional)<input type="tel" name="phone" autocomplete="tel"></label>
      <p class="form-error" data-form-error hidden></p>
      <button class="btn btn-primary btn-lg btn-block" type="submit" data-pay>Continue to payment</button>
      <p class="small muted" data-pay-note></p>
    </form>
    <aside class="cart-summary" data-checkout-summary>
      <h2>Order summary</h2>
      <div data-summary-lines></div>
      <div class="sum-row"><span>Subtotal</span><span data-subtotal></span></div>
      <div class="sum-row"><span>Shipping</span><span data-shipping></span></div>
      <div class="sum-row total"><span>Total</span><span data-total></span></div>
    </aside>
  </div>`);
}

function thankYouPage(ctx) {
  const facts = policyFacts(ctx.settings);
  return simplePage(ctx, 'thank-you.html', 'Thank you for your order!', `
  <p class="lead">We have received your order and will email your confirmation and tracking number as soon as it ships.</p>
  <div class="card" data-last-order hidden></div>
  <p>Orders are processed within ${esc(facts.processing)} and usually arrive ${esc(facts.delivery)} after that.</p>
  <p><a class="btn btn-primary" href="index.html">Back to the shop</a></p>`);
}

function aboutPage(ctx) {
  const img = ctx.images[1] || ctx.images[0] || 'images/placeholder.svg';
  return simplePage(ctx, 'about.html', `About ${ctx.copy.storeName}`, `
  ${ctx.copy.aboutStory.map((p) => `<p class="lead">${esc(p)}</p>`).join('\n  ')}
  <img class="rounded" src="${esc(img)}" alt="${esc(ctx.copy.productTitle)}" loading="lazy">
  <p><a class="btn btn-primary" href="index.html">Shop the ${esc(ctx.copy.productTitle)}</a></p>`);
}

function contactPage(ctx) {
  const email = ctx.settings.contactEmail;
  return simplePage(ctx, 'contact.html', 'Contact us', `
  <p class="lead">Questions about a product or an order? Send us a message and we will get back to you within 1–2 business days.</p>
  ${email ? `<p>${icon('mail', 18)} <a href="mailto:${esc(email)}">${esc(email)}</a></p>` : ''}
  ${ctx.settings.businessAddress ? `<p class="muted">${esc(ctx.settings.businessAddress)}</p>` : ''}
  <form class="contact-form" data-contact-form>
    <div class="two"><label>Name<input name="name" autocomplete="name" required></label><label>Email<input type="email" name="email" autocomplete="email" required></label></div>
    <label>Order number (if you have one)<input name="order"></label>
    <label>Message<textarea name="message" rows="6" required></textarea></label>
    <button class="btn btn-primary" type="submit">Send message</button>
    <p class="small muted" data-contact-note></p>
  </form>`);
}

function faqPage(ctx) {
  return simplePage(ctx, 'faq.html', 'Frequently asked questions', `
  <div class="faq">
    ${ctx.copy.faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n    ')}
  </div>
  <p>Still have a question? <a class="text-link" href="contact.html">Contact us</a>.</p>`);
}

function trackPage(ctx) {
  return simplePage(ctx, 'track-order.html', 'Track your order', `
  <p class="lead">Enter the tracking number from your shipping confirmation email to see where your package is.</p>
  <form class="track-form" data-track-form>
    <label>Tracking number<input name="tracking" required autocomplete="off" placeholder="e.g. LP00123456789CN"></label>
    <button class="btn btn-primary" type="submit">Track package</button>
  </form>
  <p class="small muted">Tracking can take 2–5 days to show updates after your order ships. Can't find your tracking number? <a href="contact.html">Contact us</a>.</p>`);
}

/* ------------------------------------------------------------------ */
/* Policies                                                            */
/* ------------------------------------------------------------------ */

function policyPages(ctx) {
  const { settings, copy } = ctx;
  const biz = esc(settings.businessName || copy.storeName);
  const contact = settings.contactEmail
    ? `<a href="mailto:${esc(settings.contactEmail)}">${esc(settings.contactEmail)}</a>`
    : '<a href="contact.html">our contact page</a>';
  const facts = policyFacts(settings);
  const updated = new Date().toISOString().slice(0, 10);
  const stamp = `<p class="small muted">Last updated: ${updated}</p>`;

  const shipping = `${stamp}
  <h2>Processing time</h2>
  <p>Orders are processed within ${esc(facts.processing)} (excluding weekends and holidays). You will receive an email with your tracking number once your order ships.</p>
  <h2>Delivery time</h2>
  <p>After processing, delivery usually takes ${esc(facts.delivery)}. Delivery times are estimates and can be affected by carrier delays, customs and peak seasons.</p>
  <h2>Shipping costs</h2>
  <p>${settings.freeShipping ? 'Shipping is free on all orders.' : `Shipping is a flat ${esc(formatMoney(settings.shippingFee, ctx.currency))} per order.`}</p>
  <h2>Multiple packages</h2>
  <p>Orders with more than one item may arrive in separate packages from different warehouses.</p>
  <h2>Customs and import duties</h2>
  <p>International orders may be subject to import duties and taxes charged by the destination country. These charges are the customer's responsibility.</p>
  <h2>Lost or delayed packages</h2>
  <p>If your tracking has not updated for 10 days or your order has not arrived within 30 days, contact us at ${contact} and we will help.</p>
  <h2>Wrong address</h2>
  <p>Please double-check your shipping address at checkout. We cannot be responsible for orders shipped to an incorrect address provided by the customer, but contact us right away and we will try to update it before it ships.</p>`;

  const refunds = `${stamp}
  ${settings.returnDays > 0 ? `
  <h2>Returns</h2>
  <p>You can return an item within ${settings.returnDays} days of delivery. To be eligible, it must be unused, in the same condition you received it and in its original packaging.</p>
  <p>To start a return, contact us at ${contact} with your order number. We will reply with return instructions. Items sent back without first contacting us cannot be accepted.</p>
  <h2>Refunds</h2>
  <p>Once we receive and inspect your return, we will email you to confirm whether the refund is approved. Approved refunds go back to your original payment method within 5–10 business days. Return shipping costs are the customer's responsibility unless the item was damaged or incorrect.</p>` : `
  <h2>All sales final</h2>
  <p>Because of the nature of our products, we do not accept returns of change-of-mind purchases.</p>`}
  <h2>Damaged, defective or wrong items</h2>
  <p>If your order arrives damaged, defective or incorrect, contact us at ${contact} within 7 days of delivery with your order number and a photo, and we will send a replacement or a full refund at no cost to you.</p>
  <h2>Cancellations</h2>
  <p>You can cancel your order free of charge before it ships. Contact us as soon as possible at ${contact}.</p>
  <h2>Your statutory rights</h2>
  <p>Nothing in this policy affects your statutory rights under the consumer laws of your country.</p>`;

  const privacy = `${stamp}
  <p>This privacy policy explains how ${biz} ("we", "us") collects, uses and protects your personal information when you visit or buy from this website.</p>
  <h2>What we collect</h2>
  <ul><li>Contact and shipping details you give us at checkout or through our contact form: name, email, address and phone number.</li><li>Order details: the products you buy and the amount paid.</li><li>Payment information is entered directly with our payment provider (${esc(ctx.store.paymentLabel)}). We never see or store your full card number.</li><li>Your cart is stored in your own browser (local storage) so it is still there when you come back.</li></ul>
  <h2>How we use it</h2>
  <ul><li>To process, ship and deliver your order, including sharing your shipping details with our fulfilment partners and carriers.</li><li>To send order confirmations, tracking updates and answer your questions.</li><li>To prevent fraud and meet legal and tax obligations.</li></ul>
  <p>We do not sell your personal information.</p>
  <h2>How long we keep it</h2>
  <p>We keep order records for as long as required for accounting and tax purposes, and other information only as long as needed for the purposes above.</p>
  <h2>Your rights</h2>
  <p>Depending on where you live (for example under the GDPR or CCPA) you may have the right to access, correct, delete or export your personal information, and to object to how we use it. Contact us at ${contact} to make a request.</p>
  <h2>Contact</h2>
  <p>${biz}${settings.businessAddress ? `, ${esc(settings.businessAddress)}` : ''}. Questions about this policy: ${contact}.</p>`;

  const terms = `${stamp}
  <p>These terms apply to your use of this website and any purchase from ${biz}. By placing an order you agree to them.</p>
  <h2>Products and pricing</h2>
  <p>We do our best to describe and photograph products accurately. Colours may vary slightly between screens. Prices are shown in ${esc(ctx.currency)} and may change without notice, but changes never affect orders already placed.</p>
  <h2>Orders</h2>
  <p>We may refuse or cancel an order, for example if a product is out of stock, a price was listed in error or we suspect fraud. If we cancel after you have paid, you will receive a full refund.</p>
  <h2>Shipping, returns and refunds</h2>
  <p>See our <a href="shipping-policy.html">shipping policy</a> and <a href="refund-policy.html">refund policy</a>.</p>
  <h2>Payments</h2>
  <p>Payments are processed by ${esc(ctx.store.paymentLabel)}. By paying you also agree to their terms.</p>
  <h2>Limitation of liability</h2>
  <p>To the extent allowed by law, our liability for any claim relating to a product is limited to the amount you paid for it. Nothing in these terms limits liability that cannot be limited by law.</p>
  <h2>Contact</h2>
  <p>Questions about these terms: ${contact}.</p>`;

  return {
    'shipping-policy.html': simplePage(ctx, 'shipping-policy.html', 'Shipping policy', shipping),
    'refund-policy.html': simplePage(ctx, 'refund-policy.html', 'Refund policy', refunds),
    'privacy-policy.html': simplePage(ctx, 'privacy-policy.html', 'Privacy policy', privacy),
    'terms-of-service.html': simplePage(ctx, 'terms-of-service.html', 'Terms of service', terms)
  };
}

/* ------------------------------------------------------------------ */
/* Assets                                                              */
/* ------------------------------------------------------------------ */

function favicon(ctx) {
  const t = ctx.theme;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${t.primary}"/><text x="32" y="42" font-family="Arial, sans-serif" font-size="26" font-weight="700" text-anchor="middle" fill="${t.primaryInk}">${esc(initials(ctx.copy.storeName))}</text></svg>`;
}

function placeholder(ctx) {
  const t = ctx.theme;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800"><rect width="800" height="800" fill="${t.surface}"/><circle cx="400" cy="360" r="120" fill="${t.line}"/><text x="400" y="560" font-family="Arial, sans-serif" font-size="40" text-anchor="middle" fill="${t.muted}">${esc(ctx.copy.productTitle.slice(0, 32))}</text></svg>`;
}

function configJs(ctx) {
  const { settings, pricing, copy, currency, product } = ctx;
  const cfg = {
    storeName: copy.storeName,
    storeId: slugify(copy.storeName),
    currency,
    locale: LOCALES[currency] || 'en-US',
    product: {
      id: slugify(copy.productTitle),
      title: copy.productTitle,
      price: pricing.price,
      compareAt: pricing.compareAt,
      image: ctx.images[0] || 'images/placeholder.svg',
      options: (product.options || []).map((o) => o.name),
      variants: pricing.variants.map((v) => ({
        title: v.title,
        options: v.options,
        price: v.price,
        image: v.image ? ctx.imageFor(v.image) : '',
        available: v.available !== false
      }))
    },
    shipping: { free: settings.freeShipping, fee: settings.freeShipping ? 0 : settings.shippingFee, processingDays: settings.processingDays, deliveryDays: settings.deliveryDays },
    checkout: {
      stripePaymentLink: settings.checkoutUrl,
      paypalMe: settings.paypalMe,
      orderEmail: settings.contactEmail
    }
  };
  return `/*
 * ${copy.storeName} - store settings.
 *
 * To take payments, fill in ONE of these (see README.txt):
 *   stripePaymentLink  e.g. "https://buy.stripe.com/abc123"
 *   paypalMe           your PayPal.me username, e.g. "mystore"
 * With neither set, checkout emails the order to orderEmail and you send the
 * customer an invoice yourself.
 */
window.STORE_CONFIG = ${JSON.stringify(cfg, null, 2)};
`;
}

function readme(ctx) {
  const { copy, settings, pricing, product } = ctx;
  const lines = [
    `${copy.storeName} - your generated store`,
    '='.repeat(copy.storeName.length + 24),
    '',
    `Product: ${copy.productTitle}`,
    `Supplier link: ${product.sourceUrl}`,
    `Supplier price: ${pricing.cost ? formatMoney(pricing.cost, ctx.currency) : 'unknown'}   Your price: ${formatMoney(pricing.price, ctx.currency)}`,
    pricing.profit ? `Estimated profit per sale after card fees (before ads and shipping costs): ${formatMoney(pricing.profit.profit, ctx.currency)}` : '',
    '',
    'PUT IT ONLINE (free, about 2 minutes)',
    '-------------------------------------',
    '1. Go to https://app.netlify.com/drop',
    '2. Drag this whole folder onto the page.',
    '3. Your store is live. Rename the site or add your own domain in Netlify settings.',
    'Also works with Vercel, Cloudflare Pages, GitHub Pages or any web host - upload every file as-is.',
    '',
    'TAKE PAYMENTS',
    '-------------',
    'Open assets/config.js and fill in ONE of these:',
    '',
    '  stripePaymentLink (recommended, cards + Apple Pay + Google Pay)',
    '    1. Create a free account at https://stripe.com',
    `    2. Products > Add product: "${copy.productTitle}", price ${formatMoney(pricing.price, ctx.currency)}.`,
    '    3. Create a Payment Link for it. Turn on "Let customers adjust quantity" and',
    '       "Collect customers\' shipping addresses".',
    '    4. Under After payment, choose "Don\'t show confirmation page" and redirect to',
    '       https://YOUR-SITE/thank-you.html',
    '    5. Paste the link (https://buy.stripe.com/...) into stripePaymentLink.',
    '',
    '  paypalMe',
    '    Your PayPal.me username. Customers pay the cart total on PayPal.',
    '',
    `With neither set, checkout emails the order to ${settings.contactEmail || 'orderEmail (set it in config.js)'} and you invoice the customer.`,
    '',
    'FULFIL ORDERS',
    '-------------',
    `When an order comes in, buy the item from your supplier (${product.sourceSite || 'the supplier link above'}) using the`,
    "customer's shipping address, then email the customer the tracking number.",
    'Tools like DSers or AutoDS can automate this once you have steady orders.',
    '',
    'BEFORE YOU LAUNCH - CHECKLIST',
    '-----------------------------',
    '[ ] Order a sample yourself to check quality and real delivery times.',
    '[ ] Check the shipping and delivery times in the policies match your supplier.',
    '[ ] Read the policy pages and adjust them to your business and country.',
    '[ ] Set a contact email (contact form, policies and emailed orders use it).',
    '[ ] Make sure you have the right to use the supplier photos, or take your own.',
    '[ ] Test a purchase end to end.',
    '[ ] Add genuine customer reviews only once real customers leave them. Invented',
    '    reviews, fake "was" prices and fake countdowns break consumer-protection',
    '    law (e.g. the US FTC rule on fake reviews) and get ad accounts banned.',
    '',
    'FILES',
    '-----',
    'index.html            product landing page',
    'cart.html, checkout.html, thank-you.html',
    'about, contact, faq, track-order pages',
    'shipping/refund/privacy/terms policy pages',
    'assets/config.js      prices, payment links, shipping settings',
    'assets/store.css      design (colours are CSS variables at the top)',
    'assets/store.js       cart and checkout logic',
    'images/               product photos'
  ];
  return lines.filter((l) => l !== null).join('\n') + '\n';
}

function sitemap(ctx, files) {
  if (!ctx.settings.siteUrl) return null;
  const urls = files.filter((f) => f.endsWith('.html') && !['cart.html', 'checkout.html', 'thank-you.html'].includes(f));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((f) => `  <url><loc>${esc(`${ctx.settings.siteUrl}/${f === 'index.html' ? '' : f}`)}</loc></url>`).join('\n')}
</urlset>
`;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * @param {object} input
 * @param {object} input.product   normalised product (core/extract.js)
 * @param {object} input.copy      store copy (core/copy.js)
 * @param {object} input.settings  normalised settings (core/settings.js)
 * @param {object} input.pricing   priceProduct() result
 * @param {object} [input.imageMap] remote image URL -> local path inside the site
 * @returns {Record<string, string>} path -> file contents
 */
export function buildSite({ product, copy, settings, pricing, imageMap = {} }) {
  const themeId = settings.theme !== 'auto' ? settings.theme : copy.theme;
  const theme = THEMES[themeId] || THEMES.midnight;
  const imageFor = (u) => imageMap[u] || u;
  const images = (product.images || []).map(imageFor).filter(Boolean);
  const currency = settings.currency || product.currency || 'USD';
  const paymentLabel = settings.checkoutUrl && /stripe\.com/i.test(settings.checkoutUrl)
    ? 'Stripe'
    : !settings.checkoutUrl && settings.paypalMe ? 'PayPal' : 'our payment provider';

  const ctx = { product, copy, settings, pricing, theme, themeId, images, imageFor, currency, store: { paymentLabel } };

  const files = {
    'index.html': homePage(ctx),
    'cart.html': cartPage(ctx),
    'checkout.html': checkoutPage(ctx),
    'thank-you.html': thankYouPage(ctx),
    'about.html': aboutPage(ctx),
    'contact.html': contactPage(ctx),
    'faq.html': faqPage(ctx),
    'track-order.html': trackPage(ctx),
    ...policyPages(ctx),
    'assets/store.css': storeCss(theme),
    'assets/store.js': STORE_JS,
    'assets/config.js': configJs(ctx),
    'assets/favicon.svg': favicon(ctx),
    'images/placeholder.svg': placeholder(ctx),
    'robots.txt': `User-agent: *\nDisallow: /cart.html\nDisallow: /checkout.html\nDisallow: /thank-you.html\n${settings.siteUrl ? `Sitemap: ${settings.siteUrl}/sitemap.xml\n` : ''}`,
    'README.txt': readme(ctx)
  };
  const map = sitemap(ctx, Object.keys(files));
  if (map) files['sitemap.xml'] = map;
  return files;
}

/* ------------------------------------------------------------------ */
/* Stylesheet                                                          */
/* ------------------------------------------------------------------ */

function storeCss(t) {
  return `:root{
  --primary:${t.primary};--primary-ink:${t.primaryInk};--accent:${t.accent};
  --bg:${t.bg};--surface:${t.surface};--ink:${t.ink};--muted:${t.muted};--line:${t.line};
  --heading:${t.heading};--body:${t.body};
  --radius:14px;--shadow:0 10px 30px rgba(0,0,0,.08);--wrap:1160px;
}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 var(--body);-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
a{color:inherit}
h1,h2,h3{font-family:var(--heading);line-height:1.15;margin:0 0 .5em;letter-spacing:-.01em}
h1{font-size:clamp(1.8rem,3.5vw,2.6rem)}
h2{font-size:clamp(1.4rem,2.6vw,2rem)}
h3{font-size:1.1rem}
p{margin:0 0 1em}
.wrap{max-width:var(--wrap);margin:0 auto;padding:0 20px}
.narrow{max-width:820px}
.center{text-align:center}
.muted{color:var(--muted)}
.small{font-size:.875rem}
.lead{font-size:1.1rem;color:var(--muted)}
.ico{flex:none;vertical-align:middle}
.skip{position:absolute;left:-9999px}.skip:focus{left:12px;top:12px;z-index:100;background:#fff;padding:8px 12px;border-radius:8px}
.announce{background:var(--primary);color:var(--primary-ink);text-align:center;font-size:.85rem;font-weight:500;padding:8px 16px}
.site-header{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 92%,transparent);backdrop-filter:saturate(1.4) blur(10px);border-bottom:1px solid var(--line)}
.header-row{display:flex;align-items:center;gap:24px;height:68px}
.logo{display:inline-flex;align-items:center;gap:10px;font-family:var(--heading);font-weight:700;font-size:1.15rem;text-decoration:none}
.logo-mark{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--primary);color:var(--primary-ink);font-size:.85rem}
.nav{display:flex;gap:22px;margin-left:auto}
.nav a{text-decoration:none;color:var(--muted);font-weight:500;font-size:.95rem}
.nav a:hover,.nav a[aria-current]{color:var(--ink)}
.cart-link{position:relative;display:grid;place-items:center;width:42px;height:42px;border-radius:50%;text-decoration:none}
.cart-link:hover{background:var(--surface)}
.cart-count{position:absolute;top:2px;right:0;min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--accent);color:#fff;font-size:.7rem;font-weight:700;display:grid;place-items:center}
.menu-btn{display:none;background:none;border:0;width:42px;height:42px;padding:10px;cursor:pointer}
.menu-btn span{display:block;height:2px;background:var(--ink);margin:5px 0;border-radius:2px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:2px solid transparent;border-radius:999px;padding:12px 24px;font:600 1rem var(--body);text-decoration:none;cursor:pointer;transition:transform .15s ease,filter .15s ease,background .15s ease}
.btn:active{transform:scale(.98)}
.btn-primary{background:var(--primary);color:var(--primary-ink)}
.btn-primary:hover{filter:brightness(1.1)}
.btn-ghost{background:transparent;border-color:var(--ink);color:var(--ink)}
.btn-ghost:hover{background:var(--ink);color:var(--bg)}
.btn-lg{padding:15px 30px;font-size:1.05rem}
.btn-block{width:100%}
.text-link{color:var(--primary);font-weight:600;text-decoration:none}
.product{display:grid;grid-template-columns:1.1fr 1fr;gap:48px;padding-top:40px;padding-bottom:56px;align-items:start}
.gallery{position:sticky;top:92px}
.gallery-main{border-radius:var(--radius);overflow:hidden;background:var(--surface);aspect-ratio:1}
.gallery-main img{width:100%;height:100%;object-fit:cover}
.thumbs{display:flex;gap:10px;margin-top:12px;overflow-x:auto;padding-bottom:4px}
.thumb{flex:none;width:72px;height:72px;border-radius:10px;overflow:hidden;border:2px solid transparent;padding:0;cursor:pointer;background:var(--surface)}
.thumb img{width:100%;height:100%;object-fit:cover}
.thumb.is-active{border-color:var(--primary)}
.kicker{text-transform:uppercase;letter-spacing:.08em;font-size:.78rem;font-weight:600;color:var(--primary);margin-bottom:.6em}
.price-row{display:flex;align-items:baseline;gap:12px;margin:.2em 0 1em}
.price{font-size:1.8rem;font-weight:700;font-family:var(--heading)}
.price.big{font-size:2.2rem;margin:.2em 0 .6em}
.compare{color:var(--muted);font-size:1.1rem}
.save{background:var(--accent);color:#fff;border-radius:999px;padding:3px 10px;font-size:.8rem;font-weight:700}
.add-form{display:grid;gap:14px;margin:1.4em 0 1em}
.option{border:0;padding:0;margin:0}
.option legend{font-weight:500;margin-bottom:8px;padding:0}
.option-values{display:flex;flex-wrap:wrap;gap:8px}
.option-values input{position:absolute;opacity:0;pointer-events:none}
.option-values span{display:inline-block;border:1.5px solid var(--line);border-radius:999px;padding:8px 16px;cursor:pointer;font-size:.92rem;background:var(--bg)}
.option-values input:checked+span{border-color:var(--ink);background:var(--ink);color:var(--bg)}
.option-values input:focus-visible+span{outline:2px solid var(--primary);outline-offset:2px}
.qty-row{display:flex;gap:12px}
.qty-row .btn{flex:1}
.qty{display:flex;align-items:center;border:1.5px solid var(--line);border-radius:999px;overflow:hidden}
.qty button{width:40px;height:100%;border:0;background:none;font-size:1.2rem;cursor:pointer;color:var(--ink)}
.qty input{width:40px;border:0;text-align:center;font:600 1rem var(--body);background:none;color:var(--ink);-moz-appearance:textfield}
.qty input::-webkit-inner-spin-button{-webkit-appearance:none}
.eta{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:.95rem}
.trust{list-style:none;padding:16px 0 0;margin:0;border-top:1px solid var(--line);display:grid;gap:10px}
.trust li{display:flex;align-items:center;gap:10px;font-size:.95rem}
.trust .ico{color:var(--primary)}
.section{padding:72px 0}
.band{background:var(--surface)}
.section-title{margin-bottom:1.2em}
.benefits{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:20px}
.benefit{background:var(--bg);border-radius:var(--radius);padding:26px;box-shadow:var(--shadow)}
.benefit-icon{display:grid;place-items:center;width:50px;height:50px;border-radius:14px;background:color-mix(in srgb,var(--primary) 12%,transparent);color:var(--primary);margin-bottom:14px}
.benefit p{color:var(--muted);margin:0;font-size:.95rem}
.split{display:grid;grid-template-columns:1fr 1fr;gap:56px;align-items:center}
.split-media img,.rounded{border-radius:var(--radius);width:100%;aspect-ratio:1;object-fit:cover;background:var(--surface)}
.checklist{list-style:none;padding:0;margin:1.2em 0 0;display:grid;gap:10px}
.checklist li{display:flex;gap:10px;align-items:flex-start}
.checklist .ico{color:var(--primary);margin-top:2px}
.specs{width:100%;border-collapse:collapse;font-size:.95rem}
.specs th,.specs td{text-align:left;padding:12px 14px;border-bottom:1px solid var(--line);vertical-align:top}
.specs th{width:38%;color:var(--muted);font-weight:500}
.steps{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:20px;counter-reset:s}
.steps li{background:var(--bg);border-radius:var(--radius);padding:26px;box-shadow:var(--shadow)}
.steps p{color:var(--muted);margin:0}
.step-n{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:50%;background:var(--primary);color:var(--primary-ink);font-weight:700;margin-bottom:12px}
.guarantee{display:flex;gap:24px;align-items:center;border:2px dashed var(--line);border-radius:var(--radius);padding:32px}
.guarantee-icon{color:var(--primary)}
.guarantee p{margin:0;color:var(--muted)}
.faq{display:grid;gap:10px;margin-bottom:1.5em}
.faq details{background:var(--bg);border:1px solid var(--line);border-radius:12px;padding:0 20px}
.faq summary{cursor:pointer;font-weight:600;padding:18px 0;list-style:none;display:flex;justify-content:space-between;gap:16px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";font-size:1.4rem;line-height:1;color:var(--primary)}
.faq details[open] summary::after{content:"−"}
.faq details p{color:var(--muted);padding-bottom:18px;margin:0}
.cta{display:grid;grid-template-columns:auto 1fr;gap:48px;align-items:center;background:var(--surface);border-radius:24px;padding:40px}
.cta img{width:280px;aspect-ratio:1;object-fit:cover;border-radius:var(--radius)}
.sticky-buy{position:fixed;left:0;right:0;bottom:0;z-index:50;display:none;align-items:center;gap:12px;padding:10px 16px;background:var(--bg);border-top:1px solid var(--line);box-shadow:0 -6px 20px rgba(0,0,0,.08);transform:translateY(110%);transition:transform .25s ease}
.sticky-buy.show{transform:none}
.sticky-buy img{width:44px;height:44px;border-radius:8px;object-fit:cover}
.sticky-buy div{flex:1;min-width:0;display:grid;font-size:.9rem}
.sticky-buy strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.page h1{margin-bottom:.8em}
.page h2{font-size:1.25rem;margin-top:1.6em}
.page ul{padding-left:1.2em}
.page li{margin-bottom:.4em}
.page img.rounded{margin:1.5em 0;aspect-ratio:16/10}
.card{background:var(--surface);border-radius:var(--radius);padding:20px;margin:1em 0 1.5em}
label{display:grid;gap:6px;font-size:.9rem;font-weight:500;margin-bottom:14px}
input,textarea,select{font:1rem var(--body);padding:12px 14px;border:1.5px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink);width:100%}
input:focus,textarea:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--primary) 18%,transparent)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.three{display:grid;grid-template-columns:1.2fr 1fr 1fr;gap:12px}
.form-error{color:#c0392b;font-weight:500}
.cart,.checkout{display:grid;grid-template-columns:1.5fr 1fr;gap:40px;align-items:start}
.cart-summary{background:var(--surface);border-radius:var(--radius);padding:24px;position:sticky;top:92px}
.cart-summary h2{margin-top:0}
.sum-row{display:flex;justify-content:space-between;padding:8px 0}
.sum-row.total{border-top:1px solid var(--line);margin-top:8px;padding-top:14px;font-weight:700;font-size:1.15rem;margin-bottom:14px}
.line{display:grid;grid-template-columns:84px 1fr auto;gap:16px;align-items:center;padding:16px 0;border-bottom:1px solid var(--line)}
.line img{width:84px;height:84px;border-radius:10px;object-fit:cover;background:var(--surface)}
.line-title{font-weight:600}
.line-variant{color:var(--muted);font-size:.9rem}
.line .qty{height:38px;margin-top:8px;width:max-content}
.line-remove{background:none;border:0;color:var(--muted);text-decoration:underline;cursor:pointer;font-size:.85rem;padding:0;margin-left:12px}
.summary-line{display:flex;justify-content:space-between;gap:12px;font-size:.92rem;padding:6px 0}
.toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,calc(100% + 48px));visibility:hidden;background:var(--ink);color:var(--bg);padding:12px 18px;border-radius:999px;box-shadow:var(--shadow);z-index:60;transition:transform .25s ease,visibility .25s;display:flex;gap:14px;align-items:center;font-weight:500}
.toast.show{transform:translate(-50%,0);visibility:visible}
.toast a{color:var(--bg);font-weight:700}
.site-footer{background:var(--surface);padding:56px 0 24px;margin-top:40px}
.footer-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1.2fr;gap:32px}
.footer-grid h3{font-size:.95rem;margin-bottom:12px}
.footer-grid a:not(.logo){display:block;text-decoration:none;color:var(--muted);margin-bottom:8px;font-size:.95rem}
.footer-grid a:hover{color:var(--ink)}
.footer-base{border-top:1px solid var(--line);margin-top:32px;padding-top:20px}
@media (max-width:900px){
  .product,.split,.cart,.checkout{grid-template-columns:1fr;gap:28px}
  .gallery{position:static}
  .steps{grid-template-columns:1fr}
  .cta{grid-template-columns:1fr;text-align:center;padding:28px}
  .cta img{width:100%;max-width:320px;margin:0 auto}
  .footer-grid{grid-template-columns:1fr 1fr}
  .cart-summary{position:static}
  .sticky-buy{display:flex}
}
@media (max-width:720px){
  .menu-btn{display:block}
  .nav{display:none;position:absolute;top:68px;left:0;right:0;flex-direction:column;gap:0;background:var(--bg);border-bottom:1px solid var(--line);padding:8px 20px}
  .nav.open{display:flex}
  .nav a{padding:12px 0;border-bottom:1px solid var(--line)}
  .nav a:last-child{border-bottom:0}
  .cart-link{margin-left:auto}
  .section{padding:52px 0}
  .product{padding-top:20px}
  .two,.three{grid-template-columns:1fr;gap:0}
  .guarantee{flex-direction:column;text-align:center}
  .footer-grid{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important;scroll-behavior:auto!important}}
`;
}

/* ------------------------------------------------------------------ */
/* Storefront script (runs in the shopper's browser)                   */
/* ------------------------------------------------------------------ */

const STORE_JS = String.raw`(function () {
  'use strict';
  var C = window.STORE_CONFIG || {};
  var KEY = 'cart:' + (C.storeId || 'store');
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function money(n) {
    try { return new Intl.NumberFormat(C.locale || 'en-US', { style: 'currency', currency: C.currency || 'USD' }).format(n); }
    catch (e) { return (C.currency || '') + ' ' + Number(n).toFixed(2); }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) {} renderCount(); }
  function count(items) { return items.reduce(function (n, i) { return n + i.qty; }, 0); }
  function subtotal(items) { return Math.round(items.reduce(function (n, i) { return n + i.price * i.qty; }, 0) * 100) / 100; }
  function shippingFor(items) { return !items.length || C.shipping.free ? 0 : C.shipping.fee; }

  function renderCount() {
    var n = count(load());
    $$('[data-cart-count]').forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
  }

  var toastTimer;
  function toast(html) {
    var el = $('[data-toast]');
    if (!el) return;
    el.innerHTML = html;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
  }

  /* ---------- menu ---------- */
  var menuBtn = $('[data-menu-btn]');
  if (menuBtn) menuBtn.addEventListener('click', function () {
    var nav = $('.nav');
    var open = nav.classList.toggle('open');
    menuBtn.setAttribute('aria-expanded', String(open));
  });

  /* ---------- product page ---------- */
  var form = $('[data-add-form]');
  if (form) {
    var mainImg = $('[data-main-image]');
    var setImage = function (src) {
      if (!src || !mainImg) return;
      mainImg.src = src;
      $$('[data-thumb]').forEach(function (t) { t.classList.toggle('is-active', t.getAttribute('data-thumb') === src); });
    };
    $$('[data-thumb]').forEach(function (t) {
      t.addEventListener('click', function () { setImage(t.getAttribute('data-thumb')); });
    });

    var selected = function () {
      var out = {};
      $$('[data-option]', form).forEach(function (fs) {
        var checked = $('input:checked', fs);
        if (checked) out[fs.getAttribute('data-option')] = checked.value;
      });
      return out;
    };
    var currentVariant = function () {
      var sel = selected();
      var vs = C.product.variants || [];
      for (var i = 0; i < vs.length; i++) {
        var ok = true;
        for (var k in sel) if (vs[i].options[k] !== undefined && vs[i].options[k] !== sel[k]) ok = false;
        if (ok) return vs[i];
      }
      return null;
    };
    var addBtn = $('[data-add]', form);
    var addLabel = addBtn ? addBtn.textContent : '';
    var refresh = function () {
      var v = currentVariant();
      var price = v && v.price ? v.price : C.product.price;
      $$('[data-price]').forEach(function (el) { el.textContent = money(price); });
      $$('[data-option]', form).forEach(function (fs) {
        var checked = $('input:checked', fs);
        var label = $('[data-option-value]', fs);
        if (checked && label) label.textContent = checked.value;
      });
      if (v && v.image) setImage(v.image);
      var soldOut = v && v.available === false;
      if (addBtn) { addBtn.disabled = soldOut; addBtn.textContent = soldOut ? 'Sold out' : addLabel; }
    };
    form.addEventListener('change', refresh);

    var qtyInput = $('input[name=qty]', form);
    $$('[data-qty-step]', form).forEach(function (b) {
      b.addEventListener('click', function () {
        var q = Math.min(99, Math.max(1, (parseInt(qtyInput.value, 10) || 1) + Number(b.getAttribute('data-qty-step'))));
        qtyInput.value = q;
      });
    });

    var add = function () {
      var v = currentVariant();
      var sel = selected();
      var variantLabel = Object.keys(sel).map(function (k) { return sel[k]; }).join(' / ');
      var id = C.product.id + (variantLabel ? '::' + variantLabel : '');
      var qty = Math.min(99, Math.max(1, parseInt(qtyInput.value, 10) || 1));
      var items = load();
      var line = items.filter(function (i) { return i.id === id; })[0];
      if (line) line.qty = Math.min(99, line.qty + qty);
      else items.push({ id: id, title: C.product.title, variant: variantLabel, price: v && v.price ? v.price : C.product.price, qty: qty, image: (v && v.image) || C.product.image });
      save(items);
      return qty;
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = add();
      toast('Added ' + q + ' to your cart <a href="cart.html">View cart</a>');
    });
    var buyNow = $('[data-buy-now]');
    if (buyNow) buyNow.addEventListener('click', function () { add(); location.href = 'checkout.html'; });

    var stickyBar = $('[data-sticky-buy]');
    var box = $('[data-buy-box]');
    if (stickyBar && box && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var show = !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0;
        stickyBar.classList.toggle('show', show);
        stickyBar.setAttribute('aria-hidden', String(!show));
        $('[data-sticky-add]').tabIndex = show ? 0 : -1;
      }).observe(box);
      $('[data-sticky-add]').addEventListener('click', function () {
        add();
        toast('Added to your cart <a href="cart.html">View cart</a>');
      });
    }
    $$('[data-scroll-buy]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); box.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    });

    // Real delivery estimate from the store's processing + delivery days.
    var eta = $('[data-eta]');
    if (eta) {
      var span = function (s) { var p = String(s).split('-'); return [Number(p[0]) || 1, Number(p[1] || p[0]) || 1]; };
      var addBusinessDays = function (d, n) { d = new Date(d); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n--; } return d; };
      var proc = span(C.shipping.processingDays), del = span(C.shipping.deliveryDays);
      var fmt = function (d) { return d.toLocaleDateString(C.locale || 'en-US', { month: 'short', day: 'numeric' }); };
      var from = addBusinessDays(new Date(), proc[0] + del[0]);
      var to = addBusinessDays(new Date(), proc[1] + del[1]);
      eta.lastChild.textContent = ' Estimated delivery: ' + fmt(from) + ' – ' + fmt(to);
    }
    refresh();
  }

  /* ---------- cart page ---------- */
  function lineHtml(i, idx, editable) {
    return '<div class="line"><img src="' + esc(i.image) + '" alt="">' +
      '<div><div class="line-title">' + esc(i.title) + '</div>' +
      (i.variant ? '<div class="line-variant">' + esc(i.variant) + '</div>' : '') +
      (editable
        ? '<div style="display:flex;align-items:center"><div class="qty"><button type="button" data-line-step="-1" data-idx="' + idx + '" aria-label="Decrease">−</button><input value="' + i.qty + '" readonly aria-label="Quantity"><button type="button" data-line-step="1" data-idx="' + idx + '" aria-label="Increase">+</button></div><button class="line-remove" type="button" data-remove="' + idx + '">Remove</button></div>'
        : '<div class="line-variant">Qty ' + i.qty + '</div>') +
      '</div><strong>' + money(i.price * i.qty) + '</strong></div>';
  }
  function totals(scope) {
    var items = load();
    var sub = subtotal(items), ship = shippingFor(items);
    $$('[data-subtotal]', scope).forEach(function (el) { el.textContent = money(sub); });
    $$('[data-shipping]', scope).forEach(function (el) { el.textContent = ship ? money(ship) : 'Free'; });
    $$('[data-total]', scope).forEach(function (el) { el.textContent = money(sub + ship); });
    return Math.round((sub + ship) * 100) / 100;
  }

  var cartLines = $('[data-cart-lines]');
  if (cartLines) {
    var renderCart = function () {
      var items = load();
      var summary = $('[data-cart-summary]');
      if (!items.length) {
        cartLines.innerHTML = '<p class="lead">Your cart is empty.</p><p><a class="btn btn-primary" href="index.html">Continue shopping</a></p>';
        summary.hidden = true;
        return;
      }
      cartLines.innerHTML = items.map(function (i, idx) { return lineHtml(i, idx, true); }).join('');
      summary.hidden = false;
      totals(summary);
    };
    cartLines.addEventListener('click', function (e) {
      var t = e.target.closest('button');
      if (!t) return;
      var items = load();
      if (t.hasAttribute('data-remove')) items.splice(Number(t.getAttribute('data-remove')), 1);
      if (t.hasAttribute('data-line-step')) {
        var it = items[Number(t.getAttribute('data-idx'))];
        it.qty = Math.min(99, it.qty + Number(t.getAttribute('data-line-step')));
        if (it.qty < 1) items.splice(Number(t.getAttribute('data-idx')), 1);
      }
      save(items);
      renderCart();
    });
    renderCart();
  }

  /* ---------- checkout ---------- */
  var co = $('[data-checkout-form]');
  if (co) {
    var summaryBox = $('[data-checkout-summary]');
    var items = load();
    if (!items.length) {
      co.innerHTML = '<p class="lead">Your cart is empty.</p><p><a class="btn btn-primary" href="index.html">Continue shopping</a></p>';
      summaryBox.hidden = true;
    } else {
      $('[data-summary-lines]').innerHTML = items.map(function (i) {
        return '<div class="summary-line"><span>' + esc(i.title) + (i.variant ? ' – ' + esc(i.variant) : '') + ' × ' + i.qty + '</span><span>' + money(i.price * i.qty) + '</span></div>';
      }).join('');
      var total = totals(summaryBox);
      var ck = C.checkout || {};
      var note = $('[data-pay-note]');
      var payBtn = $('[data-pay]');
      if (ck.stripePaymentLink) { payBtn.textContent = 'Continue to secure payment'; note.textContent = 'You will complete payment on Stripe. Cards, Apple Pay and Google Pay accepted.'; }
      else if (ck.paypalMe) { payBtn.textContent = 'Pay ' + money(total) + ' with PayPal'; note.textContent = 'You will complete payment on PayPal.'; }
      else if (ck.orderEmail) { payBtn.textContent = 'Place order'; note.textContent = 'We will email you a secure payment link to complete your order.'; }
      else { payBtn.textContent = 'Place order'; note.textContent = ''; }

      co.addEventListener('submit', function (e) {
        e.preventDefault();
        var err = $('[data-form-error]');
        var missing = $$('input[required]', co).filter(function (i) { return !i.value.trim(); });
        var email = co.email.value.trim();
        if (missing.length || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          err.textContent = missing.length ? 'Please fill in all required fields.' : 'Please enter a valid email address.';
          err.hidden = false;
          (missing[0] || co.email).focus();
          return;
        }
        err.hidden = true;
        var data = {};
        $$('input', co).forEach(function (i) { data[i.name] = i.value.trim(); });
        var order = { ref: 'ORD-' + Date.now().toString(36).toUpperCase(), items: load(), total: total, customer: data, at: new Date().toISOString() };
        try { localStorage.setItem(KEY + ':last-order', JSON.stringify(order)); } catch (x) {}

        var summaryText = order.items.map(function (i) { return '- ' + i.title + (i.variant ? ' (' + i.variant + ')' : '') + ' x' + i.qty + ' = ' + money(i.price * i.qty); }).join('\n');
        var address = [data.firstName + ' ' + data.lastName, data.address1, data.address2, data.city + ' ' + data.region + ' ' + data.postcode, data.country, data.phone].filter(function (x) { return x && x.trim(); }).join('\n');

        if (ck.stripePaymentLink) {
          var u = ck.stripePaymentLink + (ck.stripePaymentLink.indexOf('?') < 0 ? '?' : '&') + 'prefilled_email=' + encodeURIComponent(email) + '&client_reference_id=' + encodeURIComponent(order.ref);
          location.href = u;
        } else if (ck.paypalMe) {
          location.href = 'https://www.paypal.me/' + encodeURIComponent(ck.paypalMe) + '/' + total.toFixed(2) + (C.currency || 'USD');
        } else if (ck.orderEmail) {
          var body = 'New order ' + order.ref + '\n\n' + summaryText + '\nTotal: ' + money(total) + '\n\nShip to:\n' + address + '\n\nEmail: ' + email;
          location.href = 'mailto:' + ck.orderEmail + '?subject=' + encodeURIComponent('Order ' + order.ref) + '&body=' + encodeURIComponent(body);
          setTimeout(function () { save([]); location.href = 'thank-you.html'; }, 800);
        } else {
          err.textContent = 'Online payment is not set up yet. Store owner: add a payment link in assets/config.js.';
          err.hidden = false;
        }
      });
    }
  }

  /* ---------- thank you ---------- */
  var last = $('[data-last-order]');
  if (last) {
    try {
      var o = JSON.parse(localStorage.getItem(KEY + ':last-order'));
      if (o) {
        last.innerHTML = '<p><strong>Order ' + esc(o.ref) + '</strong></p>' + o.items.map(function (i) {
          return '<div class="summary-line"><span>' + esc(i.title) + (i.variant ? ' – ' + esc(i.variant) : '') + ' × ' + i.qty + '</span><span>' + money(i.price * i.qty) + '</span></div>';
        }).join('') + '<div class="summary-line"><strong>Total</strong><strong>' + money(o.total) + '</strong></div>';
        last.hidden = false;
        save([]);
      }
    } catch (e) {}
  }

  /* ---------- contact + tracking ---------- */
  var cf = $('[data-contact-form]');
  if (cf) cf.addEventListener('submit', function (e) {
    e.preventDefault();
    var to = (C.checkout && C.checkout.orderEmail) || '';
    var note = $('[data-contact-note]');
    if (!to) { note.textContent = 'Thanks! Our contact inbox is not connected yet - please try again soon.'; return; }
    var body = cf.message.value + '\n\n- ' + cf.name.value + ' (' + cf.email.value + ')' + (cf.order.value ? '\nOrder: ' + cf.order.value : '');
    location.href = 'mailto:' + to + '?subject=' + encodeURIComponent('Question from ' + cf.name.value) + '&body=' + encodeURIComponent(body);
    note.textContent = 'Your email app should open with your message ready to send.';
  });
  var tf = $('[data-track-form]');
  if (tf) tf.addEventListener('submit', function (e) {
    e.preventDefault();
    var n = tf.tracking.value.trim();
    if (n) window.open('https://t.17track.net/en#nums=' + encodeURIComponent(n), '_blank', 'noopener');
  });

  renderCount();
})();
`;
