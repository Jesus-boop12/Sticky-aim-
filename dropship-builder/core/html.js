/**
 * Small, dependency-free HTML helpers. They are forgiving on purpose: product
 * pages are messy, and a regex that reads 95% of them beats a parser that
 * throws on the other 5%.
 */

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', trade: '™', reg: '®',
  copy: '©', deg: '°', times: '×', bull: '•', middot: '·', euro: '€', pound: '£', yen: '¥',
  cent: '¢', frac12: '½', frac14: '¼', frac34: '¾', eacute: 'é', egrave: 'è', aacute: 'á',
  iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä', szlig: 'ß'
};

export function decodeEntities(str) {
  if (!str) return '';
  return String(str).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, code) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      try { return Number.isFinite(n) && n > 0 ? String.fromCodePoint(n) : m; } catch { return m; }
    }
    const v = NAMED[code.toLowerCase()];
    return v === undefined ? m : v;
  });
}

/** Escape text for safe insertion into HTML text or a double-quoted attribute. */
export function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Collapse whitespace and trim. */
export function clean(str) {
  return decodeEntities(String(str ?? '')).replace(/[​﻿]/g, '').replace(/\s+/g, ' ').trim();
}

/** HTML fragment -> plain text with paragraph/list breaks preserved as newlines. */
export function htmlToText(html) {
  if (!html) return '';
  const text = String(html)
    .replace(/<(script|style|noscript|svg|template)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|ul|ol|table)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '\n• ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(text)
    .split('\n')
    .map((l) => l.replace(/[ \t ]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

/** Parse `a="b" c='d' e=f g` into an object (keys lower-cased). */
export function parseAttrs(tagSource) {
  const attrs = {};
  const re = /([^\s=<>"'/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  const inner = tagSource.replace(/^<\s*[\w:-]+/, '').replace(/\/?>$/, '');
  let m;
  while ((m = re.exec(inner))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Every opening tag of a given name, as attribute objects. */
export function findTags(html, name) {
  const re = new RegExp(`<${name}\\b[^>]*>`, 'gi');
  return (String(html).match(re) || []).map(parseAttrs);
}

/** Content of the first meta tag whose property/name/itemprop matches one of the keys. */
export function metaContent(metas, ...keys) {
  for (const key of keys) {
    const k = key.toLowerCase();
    const hit = metas.find((m) => [m.property, m.name, m.itemprop].some((v) => v && v.toLowerCase() === k) && m.content);
    if (hit) return clean(hit.content);
  }
  return '';
}

/** All meta contents for a key (og:image can repeat). */
export function metaAll(metas, key) {
  const k = key.toLowerCase();
  return metas
    .filter((m) => [m.property, m.name, m.itemprop].some((v) => v && v.toLowerCase() === k) && m.content)
    .map((m) => clean(m.content));
}

export function titleTag(html) {
  const m = String(html).match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return m ? clean(m[1]) : '';
}

/** Resolve a possibly-relative URL against a base; returns '' when unusable. */
export function absUrl(u, base) {
  if (!u) return '';
  let s = String(u).trim();
  if (s.startsWith('//')) s = 'https:' + s;
  try {
    const url = new URL(s, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

/**
 * Read a JS/JSON object literal that starts at `start` (which must be `{` or `[`),
 * honouring strings, and return its source text. Used for embedded page state.
 */
export function sliceBalanced(src, start) {
  const open = src[start];
  const close = open === '{' ? '}' : open === '[' ? ']' : null;
  if (!close) return null;
  let depth = 0;
  let inStr = null;
  for (let i = start; i < src.length && i - start < 3_000_000; i++) {
    const c = src[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') inStr = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

/** Parse JSON, returning null instead of throwing. */
export function tryJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
