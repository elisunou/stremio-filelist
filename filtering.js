/**
 * Filtrare si sortare torrente
 * Portat din script.elementum.burst/burst/filtering.py
 * si script.elementum.burst/burst/normalize.py
 */

// ---------------------------------------------------------------------------
// NORMALIZE — portat din normalize.py
// ---------------------------------------------------------------------------

/**
 * Elimina diacritice din string
 * Portat din normalize.py: remove_accents()
 */
function removeAccents(str) {
    return str.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalizeaza string pentru comparatie
 * Portat din normalize.py: normalize_string() — varianta simplificata fara Kodi deps
 */
function normalizeString(str) {
    if (!str) return '';
    return removeAccents(str)
        .toLowerCase()
        .replace(/&amp;/g, '&')
        .replace(/&#x27;/g, "'")
        .replace(/<!\[CDATA\[/g, '')
        .replace(/\]\]/g, '')
        .trim();
}

// ---------------------------------------------------------------------------
// REZOLUTII — portat din filtering.py: resolutions OrderedDict
// ---------------------------------------------------------------------------

const RESOLUTIONS = {
    '4k':    { patterns: [/4k|2160[pр]|uhd/i, /hd4k/i],              label: '4K'    },
    '2k':    { patterns: [/1440[pр]/i, /\b2k\b/i],                    label: '2K'    },
    '1080p': { patterns: [/1080[piр]|1920x1080/i, /fullhd|fhd/i,
                          /blu[\W_]?ray|bd[\W_]?remux/i],              label: '1080p' },
    '720p':  { patterns: [/720[pр]|1280x720/i, /hd[\W_]?rip/i,
                          /\bhd720p?\b/i],                             label: '720p'  },
    '480p':  { patterns: [/480[pр]/i, /xvid|dvdrip|hdtv/i,
                          /web[\W_]?(?:dl)?rip|iptv|sat[\W_]?rip/i],  label: '480p'  },
    '240p':  { patterns: [/240[pр]/i, /vhs[\W_]?rip/i],               label: '240p'  },
};

/**
 * Determina rezolutia din numele torrentului
 * Portat din filtering.py: determine_resolution()
 */
function determineResolution(name) {
    const n = name.toLowerCase();
    for (const [key, def] of Object.entries(RESOLUTIONS)) {
        if (def.patterns.some(p => p.test(n))) {
            return { key, label: def.label };
        }
    }
    return { key: '480p', label: 'SD' };
}

// ---------------------------------------------------------------------------
// RELEASE TYPES — portat din filtering.py: release_types
// ---------------------------------------------------------------------------

const RELEASE_DENY = [
    /cam[\W_]?rip?|hd[\W_]?cam/i,          // CAM — calitate proasta
    /dvd[\W_]?scr|screener|\bscr\b/i,      // Screener
    /telesync|\bts\b|telecine|\btc\b|hdts/i, // Telesync
    /workprint/i,
    /trailer|трейлер|тизер/i,
];

/**
 * Verifica daca torrentul e de tip nedorit (CAM, screener, etc)
 * Portat din filtering.py: included_rx() cu releases_deny
 */
function isDeniedRelease(name) {
    return RELEASE_DENY.some(p => p.test(' ' + name + ' '));
}

// ---------------------------------------------------------------------------
// SIZE — portat din filtering.py: in_size_range() si sizeof()
// ---------------------------------------------------------------------------

/**
 * Formateaza bytes in string lizibil
 * Portat din burst.py: sizeof()
 */
function formatSize(bytes) {
    if (!bytes) return '';
    const gb = bytes / 1e9;
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = bytes / 1e6;
    return `${mb.toFixed(0)} MB`;
}

// ---------------------------------------------------------------------------
// DEDUPLICARE — portat din filtering.py: cleanup_results()
// ---------------------------------------------------------------------------

/**
 * Elimina duplicate dupa infoHash sau download_link
 * Portat din filtering.py: cleanup_results()
 */
function deduplicateResults(results) {
    const seen = new Set();
    return results.filter(r => {
        const key = r.download_link || r.name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// ---------------------------------------------------------------------------
// FILTRU PRINCIPAL — portat din filtering.py: verify()
// ---------------------------------------------------------------------------

/**
 * Filtreaza si sorteaza lista de torrente
 * Portat din filtering.py: verify() + cleanup_results()
 *
 * @param {Array} results - rezultate brute de la FileList API
 * @param {string} type - 'movie' sau 'series'
 * @returns {Array} - rezultate filtrate, sortate dupa seeders
 */
function filterAndSort(results, type) {
    const filtered = [];

    for (const torrent of results) {
        const name = normalizeString(torrent.name);

        // 1. Sari peste rezultate fara seeders (portat din cleanup_results)
        if (torrent.seeders === 0) continue;

        // 2. Sari peste release-uri de calitate proasta (CAM, screener, etc)
        if (isDeniedRelease(name)) {
            console.log(`[Filter] DENIED (release type): ${torrent.name}`);
            continue;
        }

        // 3. Determina rezolutia (pentru label in Stremio)
        const resolution = determineResolution(name);

        // 4. Adauga metadate calculate
        filtered.push({
            ...torrent,
            _resolution:     resolution.label,
            _resolutionKey:  resolution.key,
            _sizeFormatted:  formatSize(torrent.size),
        });
    }

    // 5. Elimina duplicate
    const deduped = deduplicateResults(filtered);

    // 6. Sorteaza: intai dupa rezolutie (4K > 1080p > 720p > etc), apoi dupa seeders
    //    Portat din cleanup_results: sorted by seeds
    const resOrder = ['4k', '2k', '1080p', '720p', '480p', '240p'];

    deduped.sort((a, b) => {
        const rA = resOrder.indexOf(a._resolutionKey);
        const rB = resOrder.indexOf(b._resolutionKey);
        if (rA !== rB) return rA - rB;  // rezolutie mai mare intai
        return b.seeders - a.seeders;   // mai multi seeders intai
    });

    return deduped;
}

module.exports = { filterAndSort, determineResolution, normalizeString, formatSize };
