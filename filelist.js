/**
 * FileList.io API wrapper
 * Bazat pe documentatia oficiala: https://filelist.io/api.php
 * Portat din script.elementum.burst/burst/burst.py (extract_from_api)
 */

const https = require('https');
const config = require('./config');

const BASE_URL = 'https://filelist.io/api.php';

/**
 * Header Authorization: Basic base64(username:passkey)
 * Din documentatie: "username:passkey" must be encoded in base64
 */
function getAuthHeader() {
    const token = Buffer.from(`${config.FL_USERNAME}:${config.FL_PASSKEY}`).toString('base64');
    return `Basic ${token}`;
}

/**
 * Request HTTPS cu autentificare prin header Authorization
 */
function httpGet(url) {
    return new Promise((resolve, reject) => {
        const options = {
            timeout: config.REQUEST_TIMEOUT,
            headers: { 'Authorization': getAuthHeader() }
        };

        const req = https.get(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 401) reject(new Error('Username si passkey nu pot fi goale (401)'));
                else if (res.statusCode === 403) reject(new Error('Passkey sau username invalid (403)'));
                else if (res.statusCode === 429) reject(new Error('Rate limit atins — 150 cereri/ora (429)'));
                else if (res.statusCode === 400) reject(new Error('Cautare invalida (400)'));
                else if (res.statusCode === 503) reject(new Error('Serviciu indisponibil (503)'));
                else if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}`));
                else resolve(data);
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    });
}

/**
 * Construieste URL — fara username/passkey in URL, folosim header Authorization
 */
function buildUrl(params) {
    const qs = new URLSearchParams(params);
    return `${BASE_URL}?${qs.toString()}`;
}

/**
 * Parsare raspuns JSON de la FileList API
 */
function parseResults(raw) {
    let data;
    try {
        data = JSON.parse(raw);
    } catch (e) {
        console.error('[FileList] JSON parse error:', e.message);
        return [];
    }

    if (!Array.isArray(data)) {
        if (data && data.error) console.error('[FileList] API error:', data.error);
        else console.error('[FileList] Format neasteptat:', typeof data);
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
 * Cautare dupa IMDB ID — metoda preferata
 * Din documentatie: season si episode sunt parametri valizi direct in API!
 */
async function searchByImdb(imdbId, type, season, episode) {
    const categories = config.CATEGORIES[type] || config.CATEGORIES.movie;

    const params = {
        action:   'search-torrents',
        type:     'imdb',
        query:    imdbId,
        category: categories.join(','),
    };

    // Din documentatie: season si episode merg direct ca parametri API
    if (type === 'series' && season)  params.season  = season;
    if (type === 'series' && episode) params.episode = episode;

    console.log(`[FileList] IMDB search: ${imdbId} (${type})`, season ? `S${season}E${episode}` : '');

    try {
        const url = buildUrl(params);
        const raw = await httpGet(url);
        return parseResults(raw);
    } catch (err) {
        console.error(`[FileList] IMDB search error: ${err.message}`);
        return [];
    }
}

/**
 * Cautare dupa nume — fallback
 * Portat din providers.json: movie_keywords = "{title:original}"
 */
async function searchByName(title, type, season, episode) {
    if (!title) {
        console.log('[FileList] Titlu lipsa pentru cautare by name');
        return [];
    }

    const categories = config.CATEGORIES[type] || config.CATEGORIES.movie;

    const params = {
        action:   'search-torrents',
        type:     'name',
        query:    title,
        category: categories.join(','),
    };

    if (type === 'series' && season)  params.season  = season;
    if (type === 'series' && episode) params.episode = episode;

    console.log(`[FileList] Name search: "${title}"`, season ? `S${season}E${episode}` : '');

    try {
        const url = buildUrl(params);
        const raw = await httpGet(url);
        return parseResults(raw);
    } catch (err) {
        console.error(`[FileList] Name search error: ${err.message}`);
        return [];
    }
}

module.exports = { searchByImdb, searchByName };
