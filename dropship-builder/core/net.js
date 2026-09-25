/**
 * Outbound fetching with the guard rails a "paste any URL" feature needs:
 * http(s) only, no private/loopback addresses (so a pasted link cannot reach
 * your router or cloud metadata), redirects re-checked hop by hop, a timeout,
 * and a size cap.
 */

import dns from 'node:dns/promises';
import net from 'node:net';

export const BROWSER_HEADERS = {
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-US,en;q=0.9'
};

export class FetchError extends Error {
  constructor(message, { status = 0, blocked = false } = {}) {
    super(message);
    this.status = status;
    this.blocked = blocked;
  }
}

function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224
    );
  }
  const v = ip.toLowerCase();
  if (v === '::' || v === '::1') return true;
  if (v.startsWith('::ffff:')) return privateAddress(v.slice(7));
  return v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
}

function allowPrivate() {
  return process.env.DROPSHIP_ALLOW_PRIVATE === '1';
}

/** Throws unless `raw` is a public http(s) URL. Returns the parsed URL. */
export async function assertPublicUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new FetchError('That does not look like a link. Paste the full address, starting with https://');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetchError('Only http:// and https:// links are supported.');
  }
  if (allowPrivate()) return url;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new FetchError('Links to local or private addresses are not allowed.');
  }
  let addrs;
  if (net.isIP(host)) {
    addrs = [host];
  } else {
    try {
      addrs = (await dns.lookup(host, { all: true })).map((a) => a.address);
    } catch {
      throw new FetchError(`Could not find the website "${host}". Check the link for typos.`);
    }
  }
  if (addrs.some(privateAddress)) throw new FetchError('Links to local or private addresses are not allowed.');
  return url;
}

/**
 * GET a public URL. Returns { url, status, contentType, body: Buffer }.
 * Non-2xx responses throw a FetchError carrying the status.
 */
export async function safeFetch(raw, { timeoutMs = 20000, maxBytes = 6 * 1024 * 1024, headers = {} } = {}) {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 6; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(url, { headers: { ...BROWSER_HEADERS, ...headers }, redirect: 'manual', signal: ctrl.signal });
    } catch (err) {
      clearTimeout(timer);
      const why = err.name === 'AbortError' ? 'timed out' : err.cause?.code || err.message;
      throw new FetchError(`Could not download ${url.hostname} (${why}).`);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      clearTimeout(timer);
      res.body?.cancel().catch(() => {});
      url = await assertPublicUrl(new URL(res.headers.get('location'), url).href);
      continue;
    }
    try {
      if (!res.ok) {
        res.body?.cancel().catch(() => {});
        throw new FetchError(`${url.hostname} answered ${res.status}.`, {
          status: res.status,
          blocked: [401, 403, 429, 503].includes(res.status)
        });
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > maxBytes) {
          ctrl.abort();
          throw new FetchError(`${url.hostname} sent more than ${Math.round(maxBytes / 1048576)}MB.`);
        }
        chunks.push(chunk);
      }
      return {
        url: url.href,
        status: res.status,
        contentType: (res.headers.get('content-type') || '').toLowerCase(),
        body: Buffer.concat(chunks)
      };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new FetchError('Too many redirects.');
}
