# Dropship Store Builder

Paste a product link. Get a complete, ready-to-upload online store.

The builder reads the product page, then does the rest for you:

- **Prices it.** Your price is the supplier price × your markup, with a minimum-profit floor and a .99 ending. A profit calculator shows what you keep per sale.
- **Writes it.** Store name, headline, product story, benefits, feature list, specs, FAQ, About page and SEO tags. Claude writes it when you add an API key; built-in templates write it when you don't.
- **Designs it.** It picks one of 8 colour themes to suit the product. Every page works on phones.
- **Downloads the photos** into the store, so it doesn't depend on the supplier's image links.
- **Builds every page** a store needs: the product page, cart, checkout, thank-you, About, Contact, FAQ, Track order, and shipping, refund, privacy and terms policies.
- **Hands you a ZIP** that goes online by dragging it onto Netlify. There is no build step and no server to run.

## Quick start

```bash
cd dropship-builder
npm install
npm start
```

Open http://localhost:5174, paste a product link and press **Build my store**.

Optional: let Claude write the copy and read pages that block normal downloads.

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

## What links work

| Source | How it's read |
| --- | --- |
| Any Shopify store (`/products/...`) | Shopify's public product data: every variant, price and photo |
| AliExpress | The data embedded in the page, plus the separate description document |
| Amazon | Title, bullet points, high-resolution photos, price and spec table |
| Most other shops (eBay, Walmart, Etsy, WooCommerce, BigCommerce…) | schema.org product data and OpenGraph tags |
| Pages that block downloads or show a bot check | Claude reads the page with web fetch (needs an API key). Without a key, you get a short form pre-filled with what was found. |

Every field can be edited after generation: text, prices, photos, theme, shipping times and payment links.

## Taking payments

The generated store is static, so payment goes through a provider you already trust. Add one of these in the **Checkout** tab, or later in `assets/config.js` inside the ZIP:

- **Stripe Payment Link** (recommended): cards, Apple Pay and Google Pay. The README inside the ZIP explains how to set it up.
- **PayPal.me username**: customers pay the cart total on PayPal.
- **Neither**: the order is emailed to your contact address and you send the customer an invoice.

## What it deliberately does not generate

It generates no fake reviews, star ratings, "X people viewing" counters, countdown timers or invented "was" prices. These are illegal in the US under the FTC's 2024 rule on fake reviews, and in the EU and UK. They also get ad accounts banned. The "compare at" price field exists, but use it only for a real former price. Add genuine reviews once real customers leave them.

## Settings

All settings are optional.

| Setting | Default |
| --- | --- |
| Markup | 2.5× supplier price, minimum profit 5 |
| Price ending | .99 |
| Shipping | free; processing 1–3 business days; delivery 7–15 business days |
| Returns | 30 days |
| Theme | chosen from the product category |

Environment variables:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Turns on AI copywriting and AI page reading |
| `DROPSHIP_MODEL` | Claude model, default `claude-opus-5` |
| `PORT` | Server port, default `5174` |

## Project layout

```
core/extract.js   product link -> product data (Shopify, JSON-LD, Amazon, AliExpress, meta tags)
core/net.js       safe fetching: public http(s) only, redirects re-checked, size and time limits
core/pricing.js   markup, charm pricing, profit after card fees
core/copy.js      offline copywriter + merging AI copy safely over it
core/catalog.js   categories, colour themes, icons
core/site.js      the generated store: pages, CSS, cart/checkout script
core/zip.js       dependency-free ZIP writer
server/ai.js      Claude copywriting and page reading
server/pipeline.js  orchestration, photo download, build cache
server/index.js   HTTP server: /api/generate (streams progress), /preview, /api/download
web/              the builder's own interface
```

## Tests

```bash
npm test
```

The tests cover each page reader against sample Shopify, schema.org, Amazon and AliExpress pages. They also cover pricing, copy honesty rules, HTML escaping of hostile product text, the ZIP format and the private-address guard. Two end-to-end runs go through the HTTP server against a local fake shop. The Claude paths run against a local stand-in for the API, which checks the request shape, the fallback to templates, and reading a blocked page.
