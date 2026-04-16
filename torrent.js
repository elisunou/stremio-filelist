/**
 * Descarca .torrent si extrage infoHash + fileIdx
 * Cu matchmaking avansat pentru episoade din pack-uri de sezon
 */

const https = require('https');
const config = require('./config');
const { findEpisodeFileIdx } = require('./matchmaking');

const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 ore

function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        }, (res) => {
            if (res.statusCode === 401 || res.statusCode === 403) {
                reject(new Error(`Auth error ${res.statusCode} — verifica passkey`));
                return;
            }
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Download timeout')); });
    });
}

/**
 * Extrage infoHash si lista de fisiere din buffer .torrent
 * Returneaza { infoHash, files } sau null
 */
function parseTorrentBuffer(buf) {
    try {
        const parseTorrent = require('parse-torrent');
        const parsed = parseTorrent(buf);

        // Valideaza infoHash hex 40 chars
        if (!parsed || !parsed.infoHash || !/^[a-f0-9]{40}$/i.test(parsed.infoHash)) {
            throw new Error('Invalid infoHash from parse-torrent');
        }

        return {
            infoHash: parsed.infoHash.toLowerCase(),
            files: parsed.files || [],
            name: parsed.name || '',
            torrentBuffer: buf  // pastram buffer-ul pentru TorrServer
        };
    } catch (e) {
        console.error('[Torrent] parse-torrent failed:', e.message);
    }

    // Fallback: SHA1 manual
    try {
        const crypto = require('crypto');
        const str = buf.toString('binary');
        const infoStart = str.indexOf('4:info');
        if (infoStart === -1) throw new Error('No info dict in torrent');
        const infoContent = buf.slice(infoStart + 6);
        const infoDict = extractBencodeDict(infoContent);
        if (!infoDict) throw new Error('Could not extract info dict');
        const hash = crypto.createHash('sha1').update(infoDict).digest('hex');
        if (!/^[a-f0-9]{40}$/.test(hash)) throw new Error('SHA1 invalid');
        return { infoHash: hash, files: [], name: '' };
    } catch (e) {
        console.error('[Torrent] Manual SHA1 failed:', e.message);
        return null;
    }
}

function extractBencodeDict(buf) {
    if (buf[0] !== 100) return null;
    let pos = 1, depth = 1;
    while (pos < buf.length && depth > 0) {
        const ch = buf[pos];
        if (ch === 100 || ch === 108) { depth++; pos++; }
        else if (ch === 101) { depth--; pos++; }
        else if (ch === 105) { pos++; while (pos < buf.length && buf[pos] !== 101) pos++; pos++; }
        else if (ch >= 48 && ch <= 57) {
            let lenStr = '';
            while (pos < buf.length && buf[pos] >= 48 && buf[pos] <= 57) {
                lenStr += String.fromCharCode(buf[pos]); pos++;
            }
            pos++; pos += parseInt(lenStr);
        } else break;
    }
    return buf.slice(0, pos);
}

/**
 * Descarca .torrent si returneaza { infoHash, fileIdx }
 * Daca season/episode sunt furnizate, foloseste matchmaking pentru fileIdx corect
 *
 * @param {string} downloadLink
 * @param {number|null} season  - pentru matchmaking episod
 * @param {number|null} episode - pentru matchmaking episod
 * @param {string} torrentName  - numele torrentului pentru context
 */
async function getTorrentInfo(downloadLink, season = null, episode = null, torrentName = '') {
    // Cache key include season/episode pentru a nu confunda pack-uri
    const cacheKey = `${downloadLink}:${season}:${episode}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return cached.data;
    }

    const buf = await downloadBuffer(downloadLink);
    if (!buf || buf.length < 100 || buf[0] !== 100) {
        throw new Error('Invalid torrent file');
    }

    const parsed = parseTorrentBuffer(buf);
    if (!parsed) throw new Error('Could not parse torrent');

    let fileIdx = 0;

    if (parsed.files.length > 1) {
        if (season && episode) {
            // Matchmaking avansat — gaseste episodul corect din pack
            fileIdx = findEpisodeFileIdx(
                parsed.files,
                season,
                episode,
                torrentName || parsed.name
            );
            console.log(`[Torrent] Matchmaking → fileIdx=${fileIdx} pentru S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}`);
        } else {
            // Film — ia cel mai mare fisier
            fileIdx = parsed.files.reduce((max, f, i) =>
                (f.length || 0) > (parsed.files[max].length || 0) ? i : max, 0);
        }
    }

    const info = { infoHash: parsed.infoHash, fileIdx, torrentBuffer: buf };
    cache.set(cacheKey, { data: info, ts: Date.now() });
    return info;
}

module.exports = { getTorrentInfo };
