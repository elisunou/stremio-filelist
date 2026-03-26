/**
 * Descarca fisierul .torrent de la FileList si extrage infoHash
 * infoHash e tot ce are nevoie Stremio Android pentru redare nativa
 */

const https = require('https');
const config = require('./config');

// Cache simplu in memorie: download_link -> { infoHash, fileIdx }
// Evita sa descarcam acelasi .torrent de mai multe ori
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 ora

/**
 * Descarca continutul de la un URL ca Buffer
 */
function downloadBuffer(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: config.REQUEST_TIMEOUT }, (res) => {
            if (res.statusCode === 401 || res.statusCode === 403) {
                reject(new Error(`Auth error ${res.statusCode} — verifica username/passkey`));
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
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Download timeout'));
        });
    });
}

/**
 * Parsare bencode minimala — doar ce ne trebuie pentru infoHash
 * Portam logica esentiala fara dependinte externe grele
 * Alternativa: folosim pachetul 'parse-torrent' (recomandat)
 */
function extractInfoHashFromBuffer(buf) {
    // Incercam cu parse-torrent daca e disponibil
    try {
        const parseTorrent = require('parse-torrent');
        const parsed = parseTorrent(buf);
        if (parsed && parsed.infoHash) {
            // Gaseste fisierul video cu cea mai mare dimensiune
            let fileIdx = 0;
            if (parsed.files && parsed.files.length > 1) {
                let maxSize = 0;
                parsed.files.forEach((f, i) => {
                    if (f.length > maxSize) {
                        maxSize = f.length;
                        fileIdx = i;
                    }
                });
            }
            return { infoHash: parsed.infoHash, fileIdx };
        }
    } catch (e) {
        // parse-torrent nu e instalat, incercam manual
    }

    // Fallback: extragere manuala a infoHash din bencode
    // infoHash = SHA1 al sectiunii "info" din bencode
    try {
        const crypto = require('crypto');
        const str = buf.toString('binary');

        // Gasim "4:info" in bencode si extragem pana la sfarsitul dictionarului
        const infoStart = str.indexOf('4:info');
        if (infoStart === -1) throw new Error('No info dict found');

        const infoContent = buf.slice(infoStart + 6); // sarim peste "4:info"
        // Trebuie sa gasim exact sectiunea info — parsare bencode simpla
        const infoDict = extractBencodeDict(infoContent);
        if (!infoDict) throw new Error('Could not extract info dict');

        const hash = crypto.createHash('sha1').update(infoDict).digest('hex');
        return { infoHash: hash, fileIdx: 0 };
    } catch (e) {
        console.error('[Torrent] Manual infoHash extraction failed:', e.message);
        return null;
    }
}

/**
 * Extrage un dictionar bencode complet ca Buffer
 * Necesar pentru calculul manual al infoHash
 */
function extractBencodeDict(buf) {
    if (buf[0] !== 100) return null; // 'd' = 100 in ASCII

    let pos = 1;
    let depth = 1;

    while (pos < buf.length && depth > 0) {
        const ch = buf[pos];

        if (ch === 100 || ch === 108) { // 'd' sau 'l'
            depth++;
            pos++;
        } else if (ch === 101) { // 'e'
            depth--;
            pos++;
        } else if (ch === 105) { // 'i' — integer: i<num>e
            pos++;
            while (pos < buf.length && buf[pos] !== 101) pos++;
            pos++; // sarim peste 'e'
        } else if (ch >= 48 && ch <= 57) { // cifra — string: <len>:<data>
            let lenStr = '';
            while (pos < buf.length && buf[pos] >= 48 && buf[pos] <= 57) {
                lenStr += String.fromCharCode(buf[pos]);
                pos++;
            }
            pos++; // sarim peste ':'
            pos += parseInt(lenStr); // sarim peste date
        } else {
            break;
        }
    }

    return buf.slice(0, pos);
}

/**
 * Descarca .torrent si returneaza { infoHash, fileIdx }
 * Cu cache pentru a evita request-uri repetate
 */
async function getTorrentInfo(downloadLink) {
    // Verifica cache
    const cached = cache.get(downloadLink);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return cached.data;
    }

    console.log(`[Torrent] Downloading: ${downloadLink}`);

    const buf = await downloadBuffer(downloadLink);

    if (!buf || buf.length < 100) {
        throw new Error('Downloaded file too small — probably auth error');
    }

    // Verifica ca e intr-adevar un fisier .torrent (incepe cu 'd')
    if (buf[0] !== 100) { // 'd'
        const preview = buf.slice(0, 100).toString('utf8');
        throw new Error(`Not a torrent file. Got: ${preview}`);
    }

    const info = extractInfoHashFromBuffer(buf);

    if (!info || !info.infoHash) {
        throw new Error('Could not extract infoHash');
    }

    console.log(`[Torrent] infoHash: ${info.infoHash} fileIdx: ${info.fileIdx}`);

    // Salveaza in cache
    cache.set(downloadLink, { data: info, ts: Date.now() });

    return info;
}

module.exports = { getTorrentInfo };
