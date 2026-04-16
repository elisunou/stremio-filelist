'use strict';

const http = require('http');
const config = require('./config');

// ─── Config ───────────────────────────────────────────────────────
const TS_HOST = config.TS_HOST || 'localhost';
const TS_PORT = config.TS_PORT || 8090;
const BASE_URL = `http://${TS_HOST}:${TS_PORT}`;

const CACHE = new Map();
const TTL   = 60 * 60 * 1000; // 1 ora

// ─── HTTP helper ──────────────────────────────────────────────────
function tsRequest(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: TS_HOST,
      port:     TS_PORT,
      path,
      method,
      timeout:  15000,
      headers,
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('TorrServer timeout'));
    });

    if (body) req.write(body);
    req.end();
  });
}

// ─── isRunning ────────────────────────────────────────────────────
async function isRunning() {
  try {
    const r = await tsRequest('/echo');
    return r.status === 200;
  } catch {
    return false;
  }
}

// ─── Magnet builder ───────────────────────────────────────────────
function buildMagnet(infoHash, name) {
  const passkey = config.FL_PASSKEY || '';
  const trackers = [
    `http://reactor.filelist.io/${passkey}/announce`,
    `http://reactor.thefl.org/${passkey}/announce`,
    `udp://tracker.opentrackr.org:1337/announce`,
  ].map(t => `&tr=${encodeURIComponent(t)}`).join('');

  const dn = name ? `&dn=${encodeURIComponent(name)}` : '';
  return `magnet:?xt=urn:btih:${infoHash}${dn}${trackers}`;
}

// ─── Upload .torrent (pentru file_stats) ──────────────────────────
async function uploadTorrent(torrentBuffer, name) {
  const boundary = `----TS${Date.now()}`;
  const fname    = 'torrent.torrent';

  const pre = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${fname}"\r\n` +
    `Content-Type: application/x-bittorrent\r\n\r\n`
  );
  const post = Buffer.from(
    `\r\n--${boundary}\r\n` +
    `Content-Disposition: form-data; name="save"\r\nContent-Type: text/plain\r\n\r\nfalse\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="title"\r\nContent-Type: text/plain\r\n\r\n${name || ''}\r\n` +
    `--${boundary}--\r\n`
  );

  const body = Buffer.concat([pre, torrentBuffer, post]);

  console.log(`[TS] Upload .torrent (${Math.round(torrentBuffer.length / 1024)} KB)`);

  const r = await tsRequest('/torrent/upload', 'POST', body, {
    'Content-Type':   `multipart/form-data; boundary=${boundary}`,
    'Content-Length': body.length,
  });

  console.log(`[TS] Upload status: ${r.status}`);

  if (r.status !== 200 && r.status !== 201) {
    throw new Error(`Upload failed: ${r.status}`);
  }

  try {
    return JSON.parse(r.body);
  } catch {
    return null;
  }
}

// ─── Gaseste fileId din file_stats ────────────────────────────────
function findFileId(fileStats, season, episode, fallbackIdx) {
  if (!fileStats || fileStats.length === 0) return 0;
  if (fileStats.length === 1) return fileStats[0].id;

  // Incearca match S01E01
  if (season && episode) {
    const s  = String(season).padStart(2, '0');
    const e  = String(episode).padStart(2, '0');
    const rx = new RegExp(`S${s}E${e}(?!\\d)`, 'i');
    const match = fileStats.find(f => rx.test(f.path || ''));
    if (match) {
      console.log(`[TS] File match S${s}E${e}: id=${match.id} | ${match.path}`);
      return match.id;
    }
  }

  // Fallback la index
  if (fallbackIdx < fileStats.length) {
    const f = fileStats[fallbackIdx];
    console.log(`[TS] File by index ${fallbackIdx}: id=${f.id} | ${f.path}`);
    return f.id;
  }

  // Cel mai mare fisier
  const largest = fileStats.reduce((max, f) => f.length > max.length ? f : max);
  console.log(`[TS] File largest: id=${largest.id} | ${largest.path}`);
  return largest.id;
}

// ─── Construieste URL /musage ─────────────────────────────────────
function buildStreamUrl(infoHash, fileId, name, category) {
  const magnet = buildMagnet(infoHash, name);

  const params = new URLSearchParams();
  params.set('link',     magnet);
  params.set('index',    String(fileId));
  params.set('play',     'true');
  params.set('save',     'false');
  if (name)     params.set('title',    name);
  if (category) params.set('category', category);  // 'movie' sau 'tv'

  return `${BASE_URL}/stream?${params.toString()}`;
}

// ─── getStreamUrl — metoda principala ────────────────────────────
/**
 * @param {string}      infoHash      - 40-char hex
 * @param {number}      fileIdx       - index fisier (din torrent.js)
 * @param {string}      name          - titlu torrent
 * @param {Buffer|null} torrentBuffer - buffer .torrent (optional, pentru file_stats)
 * @param {number|null} season        - sezon (seriale)
 * @param {number|null} episode       - episod (seriale)
 * @param {string}      type          - 'movie' | 'series'
 * @returns {Promise<string>} URL de stream
 */
async function getStreamUrl(infoHash, fileIdx = 0, name = '', torrentBuffer = null, season = null, episode = null, type = 'movie') {
  const cacheKey = `${infoHash}:${season ?? 'x'}:${episode ?? 'x'}`;
  const cached   = CACHE.get(cacheKey);

  if (cached && Date.now() - cached.ts < TTL) {
    console.log(`[TS] Cache hit: ${infoHash.slice(0, 8)}...`);
    return cached.url;
  }

  let fileId = fileIdx;

  // Daca avem .torrent buffer => upload pentru file_stats precise
  if (torrentBuffer && torrentBuffer.length > 100) {
    try {
      const status = await uploadTorrent(torrentBuffer, name);

      if (status?.file_stats?.length > 0) {
        console.log(`[TS] file_stats: ${status.file_stats.length} fisiere`);
        status.file_stats.forEach(f =>
          console.log(`  id=${f.id} len=${f.length} | ${f.path}`)
        );
        fileId = findFileId(status.file_stats, season, episode, fileIdx);
        console.log(`[TS] Folosesc fileId=${fileId}`);
      }
    } catch (e) {
      console.warn(`[TS] Upload warning: ${e.message} — continuam cu fileIdx=${fileIdx}`);
    }
  }

  const category = type === 'series' ? 'tv' : 'movie';
  const url      = buildStreamUrl(infoHash, fileId, name, category);

  CACHE.set(cacheKey, { url, ts: Date.now() });
  console.log(`[TS] ✓ Stream URL: ${url.slice(0, 120)}...`);
  return url;
}

// ─── Export ───────────────────────────────────────────────────────
module.exports = {
  getStreamUrl,
  isRunning,
};
