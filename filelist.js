/**
 * FileList.io API wrapper
 * Bazat pe documentatia oficiala: https://filelist.io/api.php
 */

const https = require('https');
const config = require('./config');

const BASE_URL = 'https://filelist.io/api.php';

function getAuthHeader() {
    const token = Buffer.from(`${config.FL_USERNAME}:${config.FL_PASSKEY}`).toString('base64');
    return `Basic ${token}`;
}

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, {
            timeout: config.REQUEST_TIMEOUT,
            headers: { 'Authorization': getAuthHeader() }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 401) reject(new Error('Username/passkey goale (401)'));
                else if (res.statusCode === 403) reject(new Error('Passkey/username invalid (403)'));
                else if (res.statusCode === 429) reject(new Error('Rate limit 150/ora (429)'));
                else if (res.statusCode === 400) reject(new Error('Cautare invalida (400)'));
                else if (res.statusCode === 503) reject(new Error('Serviciu indisponibil (503)'));
                else if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}`));
                else resolve(data);
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

function buildUrl(params) {
    const qs = new URLSearchParams(params);
    return `${BASE_URL}?${qs.toString()}`;
}

function parseResults(raw) {
    let data;
    try { data = JSON.parse(raw); }
    catch (e) { console.error('[FileList] JSON parse error:', e.message); return []; }

    if (!Array.isArray(data)) {
        if (data?.error) console.error('[FileList] API error:', data.error);
        return [];
    }

    return data.map(item => ({
        name:          item.name          || '',
        download_link: item.download_link || '',
        seeders:       parseInt(item.seeders)  || 0,
        leechers:      parseInt(item.leechers) || 0,
        size:          parseInt(item.size)     || 0,
        imdb:          item.imdb          || '',
        category:      item.category      || '',
        freeleech:     item.freeleech     === 1,
        id:            item.id            || null,
    })).filter(r => r.name && r.download_link);
}

/**
 * Cerere simpla la API
 */
async function apiSearch(params) {
    try {
        const url = buildUrl(params);
        const raw = await httpGet(url);
        return parseResults(raw);
    } catch (err) {
        console.error(`[FileList] API error: ${err.message}`);
        return [];
    }
}

/**
 * Filtreaza local rezultatele pentru episodul exact sau pack de sezon
 * Portat din filtering.py: use_episode() cu tv_keywords
 */
function matchEpisode(results, season, episode) {
    const s  = String(season).padStart(2, '0');
    const e  = String(episode).padStart(2, '0');

    // Pattern-uri pentru episod exact: S01E01, 1x01, etc
    const episodePatterns = [
        new RegExp(`S${s}E${e}(?!\\d)`, 'i'),
        new RegExp(`${season}x${e}(?!\\d)`, 'i'),
        new RegExp(`Ep?\\.?\\s*${episode}(?!\\d)`, 'i'),
    ];

    // Pattern-uri pentru pack de sezon: S01, Season 1, etc
    const seasonPatterns = [
        new RegExp(`S${s}(?!E\\d)`, 'i'),
        new RegExp(`Season\\.?\\s*${season}(?!\\d)`, 'i'),
        new RegExp(`Sezon\\.?\\s*${season}(?!\\d)`, 'i'),
    ];

    // Incearca mai intai episod exact
    const exactMatch = results.filter(r =>
        episodePatterns.some(p => p.test(r.name))
    );
    if (exactMatch.length > 0) {
        console.log(`[FileList] Matched ${exactMatch.length} exact episode results`);
        return exactMatch;
    }

    // Fallback: pack de sezon
    const seasonMatch = results.filter(r =>
        seasonPatterns.some(p => p.test(r.name))
    );
    if (seasonMatch.length > 0) {
        console.log(`[FileList] Matched ${seasonMatch.length} season pack results`);
        return seasonMatch;
    }

    // Ultimul fallback: returnam tot
    console.log(`[FileList] No episode/season match, returning all ${results.length} results`);
    return results;
}

/**
 * Cautare dupa IMDB ID cu cascada de fallback-uri
 * Portat din burst.py: searchByImdb cu queries_priorities
 *
 * Strategia:
 * 1. IMDB + season + episode  (cel mai precis)
 * 2. IMDB + season only       (gaseste pack-uri de sezon)
 * 3. IMDB fara season/episode (gaseste orice)
 * Dupa fiecare pas filtram local dupa episod
 */
async function searchByImdb(imdbId, type, season, episode) {
    const categories = config.CATEGORIES[type] || config.CATEGORIES.movie;
    const baseParams = {
        action:   'search-torrents',
        type:     'imdb',
        query:    imdbId,
        category: categories.join(','),
    };

    if (type !== 'series') {
        // Film — simplu, fara sezon/episod
        console.log(`[FileList] IMDB search: ${imdbId} (movie)`);
        return apiSearch(baseParams);
    }

    // Serial — cascada de cautari
    console.log(`[FileList] IMDB search: ${imdbId} S${season}E${episode}`);

    // 1. Cu season + episode exact
    let results = await apiSearch({ ...baseParams, season, episode });
    if (results.length > 0) return matchEpisode(results, season, episode);

    // 2. Cu doar season (gaseste pack-uri)
    results = await apiSearch({ ...baseParams, season });
    if (results.length > 0) return matchEpisode(results, season, episode);

    // 3. Fara filtru sezon (gaseste orice pentru serial)
    results = await apiSearch(baseParams);
    if (results.length > 0) return matchEpisode(results, season, episode);

    return [];
}

/**
 * Cautare dupa titlu cu cascada de fallback-uri
 * Portat din burst.py: tv_keywords = "{title} s{season:2}e{episode:2}"
 *
 * Strategia:
 * 1. "Titlu S01E01"  (episod exact in query)
 * 2. "Titlu S01"     (sezon in query)
 * 3. "Titlu"         (doar titlul)
 * Dupa fiecare pas filtram local
 */
async function searchByName(title, type, season, episode) {
    if (!title) return [];

    const categories = config.CATEGORIES[type] || config.CATEGORIES.movie;
    const baseParams = {
        action:   'search-torrents',
        type:     'name',
        category: categories.join(','),
    };

    if (type !== 'series') {
        console.log(`[FileList] Name search: "${title}"`);
        return apiSearch({ ...baseParams, query: title });
    }

    const s = String(season).padStart(2, '0');
    const e = String(episode).padStart(2, '0');

    // 1. Titlu + S01E01
    const queryEp = `${title} S${s}E${e}`;
    console.log(`[FileList] Name search: "${queryEp}"`);
    let results = await apiSearch({ ...baseParams, query: queryEp });
    if (results.length > 0) return matchEpisode(results, season, episode);

    // 2. Titlu + S01
    const querySeason = `${title} S${s}`;
    console.log(`[FileList] Name search: "${querySeason}"`);
    results = await apiSearch({ ...baseParams, query: querySeason });
    if (results.length > 0) return matchEpisode(results, season, episode);

    // 3. Doar titlul
    console.log(`[FileList] Name search: "${title}"`);
    results = await apiSearch({ ...baseParams, query: title });
    if (results.length > 0) return matchEpisode(results, season, episode);

    return [];
}

module.exports = { searchByImdb, searchByName };
