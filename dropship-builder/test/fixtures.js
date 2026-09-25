/**
 * Product pages modelled on real markup from the sites the builder targets.
 * Trimmed to the parts the readers look at, plus enough noise to keep them honest.
 */

export const SHOPIFY_JSON = {
  product: {
    id: 7001,
    title: 'Glow Sunset Projection Lamp',
    body_html: '<p>Turn any room into a golden-hour dream with a <strong>180° rotating</strong> head.</p><ul><li>180° rotating head: aim the sunset glow at any wall or ceiling.</li><li>USB powered: plug into any USB port, power bank or laptop.</li><li>Four colour modes: sunset, sun, rainbow and sunset red.</li></ul>',
    vendor: 'GlowCo',
    product_type: 'Lamp',
    tags: 'home, decor, light',
    options: [{ name: 'Color', values: ['Sunset', 'Rainbow'] }],
    variants: [
      { id: 1, title: 'Sunset', option1: 'Sunset', price: '12.50', available: true, image_id: 11 },
      { id: 2, title: 'Rainbow', option1: 'Rainbow', price: '14.00', available: false, image_id: 12 }
    ],
    images: [
      { id: 11, src: 'https://cdn.shopify.com/s/files/1/lamp-sunset.jpg?v=1' },
      { id: 12, src: 'https://cdn.shopify.com/s/files/1/lamp-rainbow.jpg?v=1' },
      { id: 13, src: 'https://cdn.shopify.com/s/files/1/lamp-room.jpg?v=1' }
    ]
  }
};

export const SHOPIFY_HTML = `<!doctype html><html><head>
<title>Glow Sunset Projection Lamp &ndash; GlowCo</title>
<meta property="og:site_name" content="GlowCo">
<meta property="og:title" content="Glow Sunset Projection Lamp">
<meta property="og:image" content="https://cdn.shopify.com/s/files/1/lamp-sunset.jpg?v=1">
<meta property="og:price:amount" content="12.50">
<meta property="og:price:currency" content="USD">
<script>var Shopify = Shopify || {}; Shopify.shop = "glowco.myshopify.com"; Shopify.currency = {"active":"USD","rate":"1.0"};</script>
</head><body><h1>Glow Sunset Projection Lamp</h1></body></html>`;

export const JSONLD_HTML = `<!doctype html><html><head>
<title>Bamboo Cutting Board Set with Juice Groove | KitchenPlace</title>
<meta name="description" content="Three organic bamboo boards.">
<meta property="og:site_name" content="KitchenPlace">
<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>
<script type="application/ld+json">
{"@context":"https://schema.org","@graph":[{"@type":"WebPage","name":"x"},{"@type":"Product",
 "name":"Bamboo Cutting Board Set with Juice Groove, 3 Pieces",
 "description":"Three organic bamboo boards in small, medium and large.\\nDeep juice grooves catch liquids so your counter stays clean.\\nKnife-friendly surface that will not dull your blades.",
 "image":["/img/board-1.jpg",{"@type":"ImageObject","url":"https://kitchenplace.example/img/board-2.jpg"}],
 "brand":{"@type":"Brand","name":"KitchenPlace"},
 "sku":"KB-3",
 "material":"Bamboo",
 "aggregateRating":{"@type":"AggregateRating","ratingValue":"4.8","reviewCount":"1200"},
 "offers":{"@type":"Offer","price":"19.99","priceCurrency":"USD","availability":"https://schema.org/InStock"}}]}
</script></head><body>
<img src="/img/logo.svg"><img src="/img/board-1.jpg">
</body></html>`;

export const AMAZON_HTML = `<!doctype html><html><head><title>Amazon.com: Portable Neck Fan, Hands Free Bladeless Fan, 4000 mAh Battery Operated : Home &amp; Kitchen</title>
<meta name="description" content="Buy Portable Neck Fan...">
</head><body>
<span id="productTitle" class="a-size-large">   Portable Neck Fan, Hands Free Bladeless Fan, 4000 mAh Battery Operated   </span>
<a id="bylineInfo" href="/stores/x">Visit the COOLBREEZE Store</a>
<span class="a-price"><span class="a-offscreen">$24.99</span></span>
<img id="landingImage" data-a-dynamic-image="{&quot;https://m.media-amazon.com/images/I/61fan-main._AC_SX679_.jpg&quot;:[679,679]}">
<script>var data = {"colorImages":{"initial":[{"hiRes":"https://m.media-amazon.com/images/I/71fan-1._AC_SL1500_.jpg","large":"https://m.media-amazon.com/images/I/41fan-1._AC_.jpg"},{"hiRes":"https://m.media-amazon.com/images/I/71fan-2._AC_SL1500_.jpg"}]}};</script>
<div id="feature-bullets"><ul class="a-unordered-list">
<li><span class="a-list-item"> BLADELESS DESIGN: No blades means no hair getting caught, safe for kids and long hair. </span></li>
<li><span class="a-list-item"> 4000MAH BATTERY: Up to 16 hours of cooling on the lowest setting. </span></li>
<li><span class="a-list-item"> 3 SPEEDS: Switch between gentle, normal and strong airflow. </span></li>
</ul></div>
<table id="productDetails_techSpec_section_1"><tr><th class="a-color-secondary a-size-base prodDetSectionEntry"> Brand </th><td class="a-size-base prodDetAttrValue"> COOLBREEZE </td></tr>
<tr><th class="a-color-secondary a-size-base prodDetSectionEntry"> Battery Capacity </th><td class="a-size-base prodDetAttrValue"> 4000 Milliamp Hours </td></tr>
<tr><th class="a-color-secondary a-size-base prodDetSectionEntry"> Customer Reviews </th><td> 4.3 out of 5 </td></tr></table>
</body></html>`;

export const ALIEXPRESS_HTML = `<!doctype html><html><head>
<title>Pet Hair Remover Roller Reusable Lint Brush For Dog Cat - AliExpress 15</title>
<meta property="og:title" content="Pet Hair Remover Roller Reusable Lint Brush For Dog Cat - AliExpress">
<meta property="og:image" content="https://ae01.alicdn.com/kf/Sroller-main.jpg">
</head><body><script>
window.runParams = {"data":{"titleModule":{"subject":"Pet Hair Remover Roller Reusable Lint Brush For Dog Cat \\u0026 Furniture"},
"imageModule":{"imagePathList":["https://ae01.alicdn.com/kf/Sroller-main.jpg","https://ae01.alicdn.com/kf/Sroller-2.jpg","https://ae01.alicdn.com/kf/Sroller-3.jpg"]},
"priceModule":{"formatedActivityPrice":"US $3.21","formatedPrice":"US $6.42"},
"skuModule":{"productSKUPropertyList":[{"skuPropertyName":"Color","skuPropertyValues":[{"propertyValueDisplayName":"Blue"},{"propertyValueDisplayName":"Grey"}]},{"skuPropertyName":"Ships From","skuPropertyValues":[{"propertyValueDisplayName":"China"}]}]},
"specsModule":{"props":[{"attrName":"Brand Name","attrNameId":2,"attrValue":"NONE"},{"attrName":"Material","attrNameId":10,"attrValue":"ABS"},{"attrName":"Size","attrNameId":11,"attrValue":"20 x 11 cm"}]},
"descriptionModule":{"descriptionUrl":"https://aeproductsourcesite.alicdn.com/product/description/pc/v2/en_US/desc.htm?productId=1"}}};
</script></body></html>`;

export const ALIEXPRESS_DESC = `<div><p>Reusable pet hair roller that works on sofas, beds, carpets and clothes.</p>
<p>No sticky tape or refills needed: roll back and forth and the hair collects in the chamber.</p>
<p>Empty the chamber with one click and it is ready to use again.</p></div>`;

export const OG_ONLY_HTML = `<!doctype html><html><head>
<title>Magnetic Phone Mount for Car | Gearly</title>
<meta property="og:title" content="Magnetic Phone Mount for Car">
<meta property="og:description" content="Strong N52 magnets hold your phone steady on bumpy roads. Installs on any air vent in seconds.">
<meta property="og:image" content="//cdn.gearly.example/mount.webp">
<meta property="product:price:amount" content="1.299,00">
<meta property="product:price:currency" content="EUR">
</head><body></body></html>`;

export const CAPTCHA_HTML = `<!doctype html><html><head><title>Robot Check</title></head><body>Enter the characters you see below</body></html>`;

/** A fetcher that serves fixtures by URL, mimicking core/net.js safeFetch. */
export function fixtureFetcher(routes) {
  const calls = [];
  const fn = async (url, opts = {}) => {
    calls.push(url);
    const hit = routes[url];
    if (!hit) {
      const err = new Error(`${new URL(url).hostname} answered 404.`);
      err.status = 404;
      throw err;
    }
    if (hit.status && hit.status >= 400) {
      const err = new Error(`${new URL(url).hostname} answered ${hit.status}.`);
      err.status = hit.status;
      err.blocked = [401, 403, 429, 503].includes(hit.status);
      throw err;
    }
    const body = Buffer.isBuffer(hit.body) ? hit.body : Buffer.from(typeof hit.body === 'string' ? hit.body : JSON.stringify(hit.body));
    return { url, status: 200, contentType: hit.type || 'text/html; charset=utf-8', body };
  };
  fn.calls = calls;
  return fn;
}

/** Something that passes for an image: correct content type, realistic size. */
export const FAKE_JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(4000, 7)]);
