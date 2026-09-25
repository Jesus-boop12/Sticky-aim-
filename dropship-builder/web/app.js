const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = { meta: null, build: null, device: 'desktop', page: 'index.html', lastRequest: null };

const sections = ['start', 'progress', 'manual', 'result'];
function show(id) {
  for (const s of sections) $(`#${s}`).hidden = s !== id;
  window.scrollTo({ top: 0 });
}

function money(n, currency) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency || 'USD' }).format(n);
  } catch {
    return `${currency} ${Number(n).toFixed(2)}`;
  }
}

const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/* ---------------------------------------------------------------- */
/* Boot                                                              */
/* ---------------------------------------------------------------- */

async function boot() {
  try {
    state.meta = await (await fetch('/api/meta')).json();
  } catch {
    state.meta = { ai: { enabled: false }, themes: [], defaults: {} };
  }
  const pill = $('#ai-pill');
  pill.hidden = false;
  pill.textContent = state.meta.ai.enabled ? 'AI copywriting on' : 'Template copy (no API key)';
  pill.classList.toggle('on', state.meta.ai.enabled);
  if (!state.meta.ai.enabled) $('#ai-toggle').hidden = true;

  const sel = $('#theme-select');
  for (const t of state.meta.themes) sel.insertAdjacentHTML('beforeend', `<option value="${t.id}">${escapeHtml(t.name)}</option>`);

  const params = new URLSearchParams(location.search);
  if (params.get('url')) {
    $('#url').value = params.get('url');
  }
}

/* ---------------------------------------------------------------- */
/* Generation                                                        */
/* ---------------------------------------------------------------- */

function startSettings() {
  const f = $('#link-form').closest('section');
  const get = (n) => $(`[name="${n}"]`, f);
  const out = {};
  for (const n of ['storeName', 'theme', 'markup', 'price', 'contactEmail', 'checkoutUrl', 'paypalMe', 'deliveryDays', 'returnDays']) {
    const v = get(n).value.trim();
    if (v !== '') out[n] = v;
  }
  out.freeShipping = get('freeShipping').checked;
  out.useAi = get('useAi').checked;
  return out;
}

function markStep(step) {
  let reached = false;
  for (const li of $$('#steps li').reverse()) {
    if (li.dataset.step === step) {
      li.className = 'active';
      reached = true;
    } else if (reached) {
      li.className = 'done';
    }
  }
}

async function runGenerate(body, { background = false } = {}) {
  state.lastRequest = body;
  if (!background) {
    show('progress');
    $$('#steps li').forEach((li) => (li.className = ''));
    $('#progress-title').textContent = 'Building your store…';
  }
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok || !res.body) throw new Error(`Server error ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let final = null;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === 'progress') {
        if (!background) {
          markStep(msg.step);
          if (msg.detail) $(`#steps li[data-step="${msg.step}"]`).textContent = msg.detail;
        } else {
          $('#apply-status').textContent = msg.detail || '';
        }
      } else {
        final = msg;
      }
    }
  }
  if (!final) throw new Error('The server stopped responding.');
  return final;
}

async function generateFromLink(url) {
  try {
    const msg = await runGenerate({ url, settings: startSettings() });
    if (msg.type === 'error') {
      if (msg.code === 'unreadable') return openManual(msg.error, msg.product, url);
      throw new Error(msg.error);
    }
    history.replaceState(null, '', `?url=${encodeURIComponent(url)}`);
    showResult(msg.result);
  } catch (err) {
    show('start');
    alertBox(err.message);
  }
}

function alertBox(message) {
  const old = $('.start .error');
  if (old) old.remove();
  $('#link-form').insertAdjacentHTML('afterend', `<p class="error" role="alert">${escapeHtml(message)}</p>`);
}

/* ---------------------------------------------------------------- */
/* Manual entry                                                      */
/* ---------------------------------------------------------------- */

let manualBase = null;
function openManual(reason, partial, url) {
  manualBase = { ...(partial || {}), sourceUrl: url };
  $('#manual-reason').textContent = reason;
  const f = $('#manual-form');
  f.title.value = partial?.title || '';
  f.price.value = partial?.price || '';
  f.images.value = (partial?.images || []).join('\n');
  f.description.value = partial?.description || '';
  show('manual');
}

$('#manual-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  const description = f.description.value.trim();
  const product = {
    ...manualBase,
    title: f.title.value.trim(),
    price: f.price.value,
    images: f.images.value.split(/\s+/).filter((u) => /^https?:\/\//.test(u)),
    description,
    bullets: description.split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter((l) => l.length > 8)
  };
  try {
    const msg = await runGenerate({ product, settings: startSettings() });
    if (msg.type === 'error') throw new Error(msg.error);
    showResult(msg.result);
  } catch (err) {
    show('manual');
    $('#manual-reason').textContent = err.message;
  }
});

/* ---------------------------------------------------------------- */
/* Result view                                                       */
/* ---------------------------------------------------------------- */

function showResult(result) {
  state.build = result;
  show('result');
  $('#store-title').textContent = result.copy.storeName;
  renderNotices(result);
  fillForm(result);
  refreshFrame();
  $('#download').href = `/api/download/${result.id}`;
  $('#download').setAttribute('download', `${result.slug}-store.zip`);
}

function renderNotices(r) {
  const items = [];
  const readLabel = { page: 'read from the product page', ai: 'read by Claude', provided: 'from your details' }[r.mode.read];
  const copyLabel = { ai: 'written by Claude', template: 'written from built-in templates', edited: 'your edits' }[r.mode.copy];
  items.push(`<p class="ok">Product ${readLabel}. Copy ${copyLabel}.</p>`);
  const s = r.settings;
  if (!s.checkoutUrl && !s.paypalMe) {
    items.push(`<p class="warn">No payment method yet. ${s.contactEmail ? 'Orders will be emailed to you.' : 'Add a Stripe link or PayPal.me name in the Checkout tab.'}</p>`);
  }
  for (const w of r.warnings) items.push(`<p class="warn">${escapeHtml(w)}</p>`);
  $('#notices').innerHTML = items.join('');
}

function fillForm(r) {
  const { copy, settings, product } = r;
  $$('[data-copy]').forEach((el) => (el.value = copy[el.dataset.copy] ?? ''));
  $$('[data-copy-lines]').forEach((el) => (el.value = (copy[el.dataset.copyLines] || []).join('\n')));
  $('#benefits-text').value = copy.benefits.map((b) => `${b.title}: ${b.text}`).join('\n');
  $('#faq-text').value = copy.faq.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n');
  $$('[data-setting]').forEach((el) => {
    const v = settings[el.dataset.setting];
    if (el.type === 'checkbox') el.checked = Boolean(v);
    else el.value = v ?? '';
  });
  $('[data-product="price"]').value = product.price ?? '';

  const current = settings.theme !== 'auto' ? settings.theme : copy.theme;
  $('#swatches').innerHTML = state.meta.themes.map((t) =>
    `<button type="button" class="swatch${t.id === current ? ' on' : ''}" data-theme="${t.id}" title="${escapeHtml(t.name)}" aria-label="${escapeHtml(t.name)} theme" style="--a:${t.primary};--b:${t.accent};--c:${t.surface}"></button>`
  ).join('');
  state.theme = current;

  renderPhotos();
  renderProfit();
}

function renderPhotos() {
  const imgs = state.build.product.images;
  $('#photos').innerHTML = imgs.length
    ? imgs.map((src, i) => `<figure><img src="${escapeHtml(src)}" alt="" referrerpolicy="no-referrer" loading="lazy"><button type="button" data-remove-photo="${i}" aria-label="Remove photo">×</button>${i === 0 ? '<span>Main</span>' : `<button type="button" class="make-main" data-main-photo="${i}">Make main</button>`}</figure>`).join('')
    : '<p class="muted small">No photos yet.</p>';
}

function renderProfit() {
  const r = state.build;
  const cost = Number($('[data-product="price"]').value) || null;
  const markup = Number($('[data-setting="markup"]').value) || 2.5;
  const fixed = Number($('[data-setting="price"]').value) || null;
  const ending = $('[data-setting="priceEnding"]').value;
  const currency = $('[data-setting="currency"]').value || r.product.currency || 'USD';
  let price = fixed;
  if (!price && cost) {
    const target = Math.max(cost * markup, cost + (r.settings.minProfit ?? 5) + 0.3);
    if (ending === '.00') price = Math.ceil(target);
    else {
      const c = ending === '.95' ? 0.95 : 0.99;
      const w = Math.floor(target);
      price = w + c >= target ? w + c : w + 1 + c;
    }
  }
  price = price || r.pricing.price;
  const fees = price * 0.029 + 0.3;
  const profit = cost ? price - cost - fees : null;
  $('#profit').innerHTML = `
    <div><span>Supplier price</span><strong>${money(cost, currency)}</strong></div>
    <div><span>Your price</span><strong>${money(price, currency)}</strong></div>
    <div><span>Card fees (est.)</span><strong>${money(fees, currency)}</strong></div>
    <div class="big"><span>Profit per sale</span><strong class="${profit !== null && profit < 5 ? 'low' : ''}">${money(profit, currency)}</strong></div>
    <p class="muted small">Before ad spend${r.settings.freeShipping ? ' and any supplier shipping charge' : ''}. Most dropshippers aim for at least 3× cost to leave room for ads.</p>`;
}

function collectEdits() {
  const r = state.build;
  const copy = { ...r.copy, source: r.copy.source };
  $$('[data-copy]').forEach((el) => (copy[el.dataset.copy] = el.value));
  $$('[data-copy-lines]').forEach((el) => (copy[el.dataset.copyLines] = el.value.split('\n').map((l) => l.trim()).filter(Boolean)));

  const benefits = $('#benefits-text').value.split('\n').map((l) => l.trim()).filter(Boolean).map((l, i) => {
    const m = l.match(/^([^:]{2,60}):\s*(.+)$/);
    const prev = r.copy.benefits[i];
    return { icon: prev?.icon || 'check', title: m ? m[1].trim() : l.split(' ').slice(0, 4).join(' '), text: m ? m[2].trim() : l };
  });
  if (benefits.length) copy.benefits = benefits;

  const faq = [];
  for (const block of $('#faq-text').value.split(/\n\s*\n|(?=^Q:)/m)) {
    const q = block.match(/Q:\s*([\s\S]*?)(?=\nA:|$)/);
    const a = block.match(/A:\s*([\s\S]*)$/);
    if (q && a) faq.push({ q: q[1].trim(), a: a[1].trim() });
  }
  if (faq.length) copy.faq = faq;

  const settings = { ...r.settings, theme: state.theme || r.settings.theme };
  $$('[data-setting]').forEach((el) => {
    settings[el.dataset.setting] = el.type === 'checkbox' ? el.checked : el.value.trim() === '' ? null : el.value.trim();
  });
  for (const k of ['contactEmail', 'checkoutUrl', 'paypalMe', 'businessName', 'businessAddress', 'siteUrl', 'currency']) settings[k] = settings[k] || '';
  settings.storeName = copy.storeName;

  const product = { ...r.product, price: $('[data-product="price"]').value };
  return { product, copy, settings, from: r.id };
}

$('#edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#apply');
  btn.disabled = true;
  $('#apply-status').textContent = 'Updating…';
  try {
    const msg = await runGenerate(collectEdits(), { background: true });
    if (msg.type === 'error') throw new Error(msg.error);
    const tab = $('.tabs [aria-selected="true"]').dataset.tab;
    showResult(msg.result);
    selectTab(tab);
    $('#apply-status').textContent = 'Preview updated.';
  } catch (err) {
    $('#apply-status').textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});

$('#edit-form').addEventListener('input', (e) => {
  if (e.target.closest('[data-panel="pricing"]')) renderProfit();
});

$('#swatches').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme]');
  if (!b) return;
  state.theme = b.dataset.theme;
  $$('#swatches .swatch').forEach((s) => s.classList.toggle('on', s === b));
  $('#edit-form').requestSubmit();
});

$('#photos').addEventListener('click', (e) => {
  const imgs = state.build.product.images;
  const rm = e.target.closest('[data-remove-photo]');
  const mk = e.target.closest('[data-main-photo]');
  if (rm) imgs.splice(Number(rm.dataset.removePhoto), 1);
  if (mk) imgs.unshift(imgs.splice(Number(mk.dataset.mainPhoto), 1)[0]);
  if (rm || mk) renderPhotos();
});
$('#photo-add').addEventListener('click', () => {
  const u = $('#photo-url').value.trim();
  if (!/^https?:\/\//.test(u)) return;
  state.build.product.images.push(u);
  $('#photo-url').value = '';
  renderPhotos();
});

function selectTab(name) {
  $$('.tabs [role=tab]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  $$('.tab-panel').forEach((p) => (p.hidden = p.dataset.panel !== name));
}
$('.tabs').addEventListener('click', (e) => {
  const t = e.target.closest('[data-tab]');
  if (t) selectTab(t.dataset.tab);
});

/* ---------------------------------------------------------------- */
/* Preview                                                           */
/* ---------------------------------------------------------------- */

function refreshFrame() {
  if (!state.build) return;
  const src = `/preview/${state.build.id}/${state.page}`;
  $('#frame').src = src;
  $('#open-tab').href = src;
  $('#frame-wrap').classList.toggle('mobile', state.device === 'mobile');
}
$('#page-select').addEventListener('change', (e) => {
  state.page = e.target.value;
  refreshFrame();
});
$$('[data-device]').forEach((b) =>
  b.addEventListener('click', () => {
    state.device = b.dataset.device;
    $$('[data-device]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    refreshFrame();
  })
);

/* ---------------------------------------------------------------- */
/* Start form                                                        */
/* ---------------------------------------------------------------- */

$('#link-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const old = $('.start .error');
  if (old) old.remove();
  generateFromLink($('#url').value.trim());
});

$$('[data-restart]').forEach((b) =>
  b.addEventListener('click', () => {
    history.replaceState(null, '', '/');
    show('start');
    $('#url').focus();
  })
);

boot();
