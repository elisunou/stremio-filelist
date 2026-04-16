/**
 * WebTorrent Server cu peer ID de qBittorrent 5.1.x
 * FileList accepta doar clienti din whitelist
 * qBittorrent peer ID: -qB5100-XXXXXXXXXXXX
 */

const http   = require('http');
const crypto = require('crypto');
const config = require('./config');

const WT_PORT = parseInt(process.env.WT_PORT) || 8888;

let client     = null;
let server     = null;
let useWt      = false;

const activeTorrents = new Map();

/**
 * Genereaza peer ID valid pentru qBittorrent 5.1.x
 * Format: -qB5100-XXXXXXXXXXXX (20 bytes total)
 */
function generateQBittorrentPeerId() {
    const prefix = '-qB5100-';
    const random = crypto.randomBytes(6).toString('hex'); // 12 chars
    return prefix + random; // 8 + 12 = 20 chars
}

async function init() {
    try {
        const WebTorrent = require('webtorrent');

        const peerId = generateQBittorrentPeerId();
        console.log(`[WT] Peer ID: ${peerId}`);

        client = new WebTorrent({
            peerId: peerId,
            userAgent: 'qBittorrent/5.1.0',
        });

        client.on('error', err => console.error('[WT] Error:', err.message));

        server = http.createServer(handleRequest);
        await new Promise((resolve, reject) => {
            server.listen(WT_PORT, '0.0.0.0', resolve);
            server.on('error', reject);
        });

        useWt   = true;
        console.log(`[WT] ✓ Server activ pe portul ${WT_PORT} (qBittorrent 5.1.0)`);
        return true;

    } catch (e) {
        console.warn(`[WT] Indisponibil: ${e.message}`);
        useWt = false;
        return false;
    }
}

function handleRequest(req, res) {
    const parts    = req.url.split('/').filter(Boolean);
    const infoHash = (parts[0] || '').toLowerCase();
    const fileIdx  = parseInt(parts[1]) || 0;

    const torrent = activeTorrents.get(infoHash);
    if (!torrent) {
        res.writeHead(404); res.end('Torrent not found'); return;
    }

    const file = torrent.files[fileIdx];
    if (!file) {
        res.writeHead(404); res.end('File not found'); return;
    }

    const fileSize = file.length;
    const range    = req.headers.range;

    if (range) {
        const [s, e]   = range.replace(/bytes=/, '').split('-');
        const start    = parseInt(s, 10);
        const end      = e ? parseInt(e, 10) : fileSize - 1;
        const chunk    = end - start + 1;
        res.writeHead(206, {
            'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges':  'bytes',
            'Content-Length': chunk,
            'Content-Type':   'video/mp4',
        });
        file.createReadStream({ start, end }).pipe(res);
    } else {
        res.writeHead(200, {
            'Content-Length': fileSize,
            'Content-Type':   'video/mp4',
            'Accept-Ranges':  'bytes',
        });
        file.createReadStream().pipe(res);
    }
}

async function addTorrentAndGetUrl(infoHash, fileIdx = 0, torrentName = '') {
    if (!useWt || !client) return null;
    if (activeTorrents.has(infoHash)) {
        return `http://localhost:${WT_PORT}/${infoHash}/${fileIdx}`;
    }

    const magnet = buildMagnet(infoHash, torrentName);

    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.warn(`[WT] Timeout: ${infoHash.slice(0,8)}...`);
            resolve(null);
        }, 30000);

        try {
            client.add(magnet, { path: require('os').tmpdir() }, (torrent) => {
                clearTimeout(timeout);
                activeTorrents.set(infoHash, torrent);

                torrent.files.forEach((f, i) => {
                    if (i === fileIdx) f.select();
                    else f.deselect();
                });

                torrent.on('error', err => {
                    console.error(`[WT] Torrent error: ${err.message}`);
                    activeTorrents.delete(infoHash);
                });

                // Log tracker status
                torrent.on('warning', w => console.warn(`[WT] Warning: ${w.message || w}`));

                setTimeout(() => {
                    console.log(`[WT] Peers dupa 5s: ${torrent.numPeers}`);
                }, 5000);

                console.log(`[WT] ✓ Torrent adaugat: ${torrent.name}`);
                resolve(`http://localhost:${WT_PORT}/${infoHash}/${fileIdx}`);
            });
        } catch (e) {
            clearTimeout(timeout);
            resolve(null);
        }
    });
}

function buildMagnet(infoHash, name = '') {
    const trackers = [
        `http://reactor.filelist.io/${config.FL_PASSKEY}/announce`,
        `http://reactor.thefl.org/${config.FL_PASSKEY}/announce`,
        `udp://tracker.opentrackr.org:1337/announce`,
    ];
    const dn = name ? `&dn=${encodeURIComponent(name)}` : '';
    const tr = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
    return `magnet:?xt=urn:btih:${infoHash}${dn}${tr}`;
}

function isWebTorrentActive() { return useWt; }

module.exports = { init, addTorrentAndGetUrl, isWebTorrentActive };
