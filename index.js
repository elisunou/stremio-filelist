const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const { searchByImdb, searchByName } = require('./filelist');
const { filterAndSort } = require('./filtering');
const { getTorrentInfo } = require('./torrent');
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
    behaviorHints: {
        configurable: false,
        adult: false
    }
};

const builder = new addonBuilder(manifest);

builder.defineStreamHandler(async ({ type, id }) => {
    console.log(`[FileList] Stream request: ${type} ${id}`);

    try {
        // id format: tt1234567 (movie) sau tt1234567:1:2 (series S01E02)
        const parts = id.split(':');
        const imdbId = parts[0];
        const season = parts[1] ? parseInt(parts[1]) : null;
        const episode = parts[2] ? parseInt(parts[2]) : null;

        // 1. Caută pe FileList după IMDB ID
        let results = await searchByImdb(imdbId, type, season, episode);

        // 2. Dacă nu găsim nimic după IMDB, fallback la căutare după titlu
        if (!results || results.length === 0) {
            console.log(`[FileList] No IMDB results, trying name search...`);
            results = await searchByName(imdbId, type, season, episode);
        }

        if (!results || results.length === 0) {
            console.log(`[FileList] No results found for ${id}`);
            return { streams: [] };
        }

        console.log(`[FileList] Found ${results.length} raw results`);

        // 3. Filtrează și sortează (logică portată din Burst filtering.py)
        const filtered = filterAndSort(results, type);
        console.log(`[FileList] After filtering: ${filtered.length} results`);

        // 4. Construiește stream-urile Stremio
        const streams = [];

        for (const torrent of filtered.slice(0, config.MAX_RESULTS)) {
            try {
                const info = await getTorrentInfo(torrent.download_link);
                if (!info || !info.infoHash) continue;

                const resolution = torrent._resolution || 'SD';
                const size = torrent._sizeFormatted || '';
                const seeds = torrent.seeders || 0;
                const name = torrent.name || '';

                const stream = {
                    infoHash: info.infoHash.toLowerCase(),
                    name: `FileList • ${resolution}`,
                    description: `${name}\n💾 ${size} | 🌱 ${seeds} seeders`,
                    // sources: trackere pentru tracker privat FileList
                    sources: [
                        'tracker:https://tracker.filelist.io:2790/announce',
                        'tracker:udp://tracker.filelist.io:2790/announce',
                    ],
                    behaviorHints: {
                        bingeGroup: `filelist-${imdbId}-${resolution}`
                    }
                };

                // fileIdx doar daca e un numar valid (nu string, nu undefined)
                // Daca lipseste, Stremio alege automat cel mai mare fisier
                if (typeof info.fileIdx === 'number' && info.fileIdx >= 0) {
                    stream.fileIdx = info.fileIdx;
                }

                streams.push(stream);
            } catch (err) {
                console.error(`[FileList] Error processing torrent: ${err.message}`);
            }
        }

        console.log(`[FileList] Returning ${streams.length} streams`);
        return { streams };

    } catch (err) {
        console.error(`[FileList] Handler error: ${err.message}`);
        return { streams: [] };
    }
});

const addonInterface = builder.getInterface();

serveHTTP(addonInterface, { port: config.PORT });
console.log(`[FileList] Addon running on http://localhost:${config.PORT}/manifest.json`);
