const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { searchByImdb, searchByName } = require('./filelist');
const { filterAndSort } = require('./filtering');
const { getTorrentInfo } = require('./torrent');
const { getAllTitles } = require('./cinemeta');
const { getStreamUrl, isRunning } = require('./torrserver.js');
const config = require('./config');

const manifest = {
    id: 'ro.filelist.stremio',
    version: '1.0.0',
    name: 'FileList.io',
    description: 'Torrente de pe FileList.io — tracker privat românesc',
    logo: 'https://filelist.io/favicon.ico',
    resources: ['stream'],
    types: ['movie', 'series'],
    idPrefixes: ['tt'],
    catalogs: [],
    behaviorHints: { configurable: false, adult: false }
};

const builder = new addonBuilder(manifest);

// Verifica TorrServer la pornire
isRunning().then(ok => {
    if (ok) console.log('[FileList] ✓ TorrServer activ pe portul 8090');
    else    console.warn('[FileList] ✗ TorrServer nu ruleaza — fallback la infoHash');
});

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`\n[FileList] ═══ Request: ${type} ${id} ═══`);

    try {
        const parts   = id.split(':');
        const imdbId  = parts[0];
        const season  = parts[1] && !isNaN(parts[1]) ? parseInt(parts[1]) : null;
        const episode = parts[2] && !isNaN(parts[2]) ? parseInt(parts[2]) : null;

        if (type === 'series' && (!season || !episode)) {
            return { streams: [] };
        }

        // 1. Cauta pe FileList dupa IMDB ID
        let results = await searchByImdb(imdbId, type, season, episode);

        // 2. Fallback Cinemeta + TMDB
        if (!results || results.length === 0) {
            console.log(`[FileList] No IMDB results, trying Cinemeta + TMDB...`);
            const meta = await getAllTitles(imdbId, type);

            if (meta && meta.titles.length > 0) {
                for (const title of meta.titles) {
                    results = await searchByName(title, type, season, episode);
                    if (results && results.length > 0) {
                        console.log(`[FileList] ✓ Found: "${title}"`);
                        break;
                    }
                    if (meta.year) {
                        results = await searchByName(`${title} ${meta.year}`, type, season, episode);
                        if (results && results.length > 0) {
                            console.log(`[FileList] ✓ Found: "${title} ${meta.year}"`);
                            break;
                        }
                    }
                }
            }
        }

        if (!results || results.length === 0) {
            console.log(`[FileList] ✗ No results for ${id}`);
            return { streams: [] };
        }

        const filtered = filterAndSort(results, type);
        if (filtered.length === 0) return { streams: [] };

        // Verifica daca TorrServer e disponibil
        const torrServerActive = await isRunning();
        console.log(`[FileList] TorrServer: ${torrServerActive ? '✓ activ' : '✗ offline'}`);

        const streams = [];

        for (const torrent of filtered.slice(0, config.MAX_RESULTS)) {
            try {
                const info = await getTorrentInfo(
                    torrent.download_link,
                    season,
                    episode,
                    torrent.name
                );

                if (!info || !info.infoHash || !/^[a-f0-9]{40}$/i.test(info.infoHash)) {
                    continue;
                }

                const infoHash   = info.infoHash.toLowerCase();
                const fileIdx    = typeof info.fileIdx === 'number' && info.fileIdx >= 0 ? info.fileIdx : 0;
                const resolution = torrent._resolution || 'SD';
                const size       = torrent._sizeFormatted || '';
                const seeds      = torrent.seeders || 0;
                const name       = torrent.name || '';
                const freeleech  = torrent.freeleech ? ' 🆓' : '';
                const epLabel    = (type === 'series' && season && episode)
                    ? ` [S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}]`
                    : '';

                let stream;

                if (torrServerActive) {
                    // TorrServer — trimitem .torrent direct ca Base64
                    try {
                        const streamUrl = await getStreamUrl(infoHash, fileIdx, name, info.torrentBuffer || null, season, episode);
                        stream = {
                            url:   streamUrl,
                            name:  `FileList\n${resolution}${freeleech}${epLabel}`,
                            title: `${name}\n👤 ${seeds}   💾 ${size}${epLabel}`,
                            behaviorHints: {
                                notWebReady: false,
                                bingeGroup:  `filelist|${imdbId}|${resolution}`,
                            }
                        };
                        console.log(`[FileList] ✓ TorrServer stream: ${resolution} | ${name.slice(0,40)}`);
                    } catch (tsErr) {
                        console.warn(`[FileList] TorrServer error: ${tsErr.message}`);
                        torrServerActive && console.warn('[FileList] Fallback la infoHash');
                        stream = buildInfoHashStream(infoHash, fileIdx, resolution, freeleech, epLabel, name, seeds, size, imdbId, config);
                    }
                } else {
                    // Fallback — infoHash direct (Stremio motor intern)
                    stream = buildInfoHashStream(infoHash, fileIdx, resolution, freeleech, epLabel, name, seeds, size, imdbId, config);
                }

                streams.push(stream);

            } catch (err) {
                console.error(`[FileList] ✗ Error: ${torrent.name} → ${err.message}`);
            }
        }

        console.log(`[FileList] ═══ Returning ${streams.length} streams ═══\n`);
        return { streams };

    } catch (err) {
        console.error(`[FileList] Handler error: ${err.message}`);
        return { streams: [] };
    }
});

function buildInfoHashStream(infoHash, fileIdx, resolution, freeleech, epLabel, name, seeds, size, imdbId, config) {
    return {
        infoHash: infoHash,
        fileIdx:  fileIdx,
        name:  `FileList\n${resolution}${freeleech}${epLabel}`,
        title: `${name}\n👤 ${seeds}   💾 ${size}${epLabel}`,
        sources: [
            `tracker:http://reactor.filelist.io/${config.FL_PASSKEY}/announce`,
            `tracker:http://reactor.thefl.org/${config.FL_PASSKEY}/announce`,
            `dht:${infoHash}`,
        ],
        behaviorHints: {
            bingeGroup:  `filelist|${imdbId}|${resolution}`,
            notWebReady: false
        }
    };
}

const addonInterface = builder.getInterface();
serveHTTP(addonInterface, { port: config.PORT });
console.log(`[FileList] Addon running on http://localhost:${config.PORT}/manifest.json`);
