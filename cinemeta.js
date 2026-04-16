/**
 * Metadata helper - Cinemeta + TMDB
 * Obtine titluri multiple pentru fallback search pe FileList
 *
 * Cinemeta: titlul principal (fara API key)
 * TMDB /find: titluri alternative, titlu original, traduceri (necesita API key gratuit)
 */

const https = require('https');
const config = require('./config');

const CINEMETA_URL = 'https://v3-cinemeta.strem.io';
const TMDB_URL     = 'https://api.themoviedb.org/3';
const TIMEOUT      = 8000;

// Cache: imdbId:type -> { titles: [], year }
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 ore

function httpGet(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: TIMEOUT }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode === 404) reject(new Error('Not found (404)'));
                else if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}`));
                else resolve(data);
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

/**
 * Cinemeta - titlul principal fara API key
 */
async function getFromCinemeta(imdbId, type) {
    try {
        const url  = `${CINEMETA_URL}/meta/${type}/${imdbId}.json`;
        const raw  = await httpGet(url);
        const data = JSON.parse(raw);
        if (!data?.meta?.name) return null;
        return {
            title: data.meta.name,
            year:  data.meta.year || null,
        };
    } catch (err) {
        console.error(`[Cinemeta] Error for ${imdbId}: ${err.message}`);
        return null;
    }
}

/**
 * TMDB /find - titluri alternative + titlu original
 * Din documentatie: /find/{imdb_id}?external_source=imdb_id
 * Returneaza: title, original_title, si alte variante
 */
async function getFromTmdb(imdbId, type) {
    if (!config.TMDB_API_KEY) return null;

    try {
        const url  = `${TMDB_URL}/find/${imdbId}?api_key=${config.TMDB_API_KEY}&external_source=imdb_id&language=ro-RO`;
        const raw  = await httpGet(url);
        const data = JSON.parse(raw);

        // TMDB returneaza rezultate separate pentru filme si seriale
        const movieResults = data.movie_results || [];
        const tvResults    = data.tv_results    || [];
        const results      = type === 'movie' ? movieResults : tvResults;

        if (results.length === 0) return null;

        const item = results[0];

        // Colecteaza toate titlurile disponibile (fara duplicate)
        const titles = [...new Set([
            item.title,           // titlu localizat (ro daca exista)
            item.original_title,  // titlu original
            item.name,            // pentru seriale
            item.original_name,   // titlu original serial
        ].filter(Boolean))];

        console.log(`[TMDB] ${imdbId} → titluri: ${titles.join(' | ')}`);

        return {
            titles,
            year: (item.release_date || item.first_air_date || '').substring(0, 4) || null,
            tmdbId: item.id,
        };

    } catch (err) {
        console.error(`[TMDB] Error for ${imdbId}: ${err.message}`);
        return null;
    }
}

/**
 * Obtine toate titlurile disponibile pentru un IMDB ID
 * Combina Cinemeta + TMDB pentru acoperire maxima
 *
 * @returns { titles: string[], year: string|null }
 */
async function getAllTitles(imdbId, type) {
    const cacheKey = `${imdbId}:${type}`;
    const cached   = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return cached.data;
    }

    // Interogam Cinemeta si TMDB in paralel
    const [cinemeta, tmdb] = await Promise.all([
        getFromCinemeta(imdbId, type),
        getFromTmdb(imdbId, type),
    ]);

    // Combinam toate titlurile fara duplicate
    const allTitles = [...new Set([
        cinemeta?.title,
        ...(tmdb?.titles || []),
    ].filter(Boolean))];

    const year = cinemeta?.year || tmdb?.year || null;

    if (allTitles.length === 0) {
        console.log(`[Meta] No titles found for ${imdbId}`);
        return null;
    }

    const result = { titles: allTitles, year };
    console.log(`[Meta] ${imdbId} → [${allTitles.join(', ')}] (${year})`);

    cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
}

module.exports = { getAllTitles };
