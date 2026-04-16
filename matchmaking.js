/**
 * Matchmaking avansat pentru episoade din pack-uri de sezon
 * Portat si adaptat din addon subtitrari subs.ro (calculate_match_score)
 *
 * Problema: FileList are torrente pack de sezon (S01 complet)
 * Stremio are nevoie de fileIdx exact al episodului din torrent
 * Acest modul gaseste fisierul corect dintr-un torrent multi-fisier
 */

/**
 * Detecteaza sezon+episod dintr-un nume de fisier
 * Acopera: S05E05, s5e5, s05e5, 5x05, etc.
 * Portat din: episode_pattern = r's(\d+)e(\d+)'
 */
function detectEpisode(name) {
    const n = name.toLowerCase();

    // S01E01, s1e1, S01E1, etc
    const sePattern = /s(\d{1,2})e(\d{1,2})(?!\d)/i;
    const seMatch = n.match(sePattern);
    if (seMatch) {
        return { season: parseInt(seMatch[1]), episode: parseInt(seMatch[2]) };
    }

    // 1x01, 01x01
    const xPattern = /(\d{1,2})x(\d{2})(?!\d)/i;
    const xMatch = n.match(xPattern);
    if (xMatch) {
        return { season: parseInt(xMatch[1]), episode: parseInt(xMatch[2]) };
    }

    // Ep.05, EP05, Episode 5
    const epPattern = /ep(?:isode)?[\s._-]*(\d{1,3})(?!\d)/i;
    const epMatch = n.match(epPattern);
    if (epMatch) {
        return { season: null, episode: parseInt(epMatch[1]) };
    }

    return null;
}

/**
 * Detecteaza rezolutia dintr-un nume
 * Portat din: detect_resolution() — evita coliziuni substring
 */
function detectResolution(name) {
    const n = name.toLowerCase();
    if (/(?<![a-z])(2160p|4320p)(?![a-z0-9])/.test(n)) return '2160p';
    if (/(?<![a-z])4k(?![a-z0-9])/.test(n))             return '2160p';
    if (/(?<![a-z])uhd(?![a-z0-9])/.test(n))            return '2160p';
    if (/(?<![a-z])(1080p|1080i|fhd)(?![a-z0-9])/.test(n)) return '1080p';
    if (/(?<![a-z])720p(?![a-z0-9])/.test(n))           return '720p';
    if (/(?<![a-z])480p(?![a-z0-9])/.test(n))           return '480p';
    return null;
}

/**
 * Detecteaza sursa release-ului
 * Portat din: sources = { bluray, web, hdtv }
 */
function detectSource(name) {
    const n = name.toLowerCase();
    if (/bluray|bdrip|brrip|remux/.test(n)) return 'bluray';
    if (/web-dl|webrip|webdl|amzn|netflix/.test(n)) return 'web';
    if (/hdtv|pdtv/.test(n)) return 'hdtv';
    return null;
}

/**
 * Detecteaza release group (ex: -FLUX, -NTb)
 */
function detectGroup(name) {
    const match = name.toLowerCase().match(/-([a-z0-9]+)(?:\.[a-z0-9]+)?$/);
    return match ? match[1] : null;
}

/**
 * Calculeaza scor de potrivire intre un fisier din torrent si episodul cerut
 * Portat din: calculate_match_score(subtitle_name, video_file)
 * Adaptat: comparam fisier din torrent vs S/E cerut de Stremio
 *
 * @param {string} fileName - numele fisierului din torrent
 * @param {string} torrentName - numele torrentului (pentru context rezolutie/sursa)
 * @param {number} targetSeason - sezonul cerut de Stremio
 * @param {number} targetEpisode - episodul cerut de Stremio
 * @returns {{ score: number, details: object }}
 */
function calculateMatchScore(fileName, torrentName, targetSeason, targetEpisode) {
    let score = 0;
    const details = {};
    const name = fileName.toLowerCase();

    // 1. Potrivire sezon+episod — cel mai important criteriu (+100 / -50)
    //    Portat din: if sub_ep == video_ep: score += 100
    const fileEp = detectEpisode(name);
    if (fileEp) {
        const seasonMatch  = fileEp.season  === null || fileEp.season  === targetSeason;
        const episodeMatch = fileEp.episode === targetEpisode;

        if (seasonMatch && episodeMatch) {
            score += 100;
            details.episodeMatch = true;
        } else if (episodeMatch && !seasonMatch) {
            // Episodul e corect dar sezonul diferit — penalizare mica
            score += 30;
            details.episodeMatch = 'partial';
        } else {
            score -= 50;
            details.episodeMatch = false;
        }
    } else {
        // Fisierul nu are info de episod — poate e un singur fisier video
        score += 10;
        details.episodeMatch = 'unknown';
    }

    // 2. Potrivire rezolutie (+40 / -30)
    //    Portat din: if video_res == sub_res: score += 40
    const fileRes    = detectResolution(name);
    const torrentRes = detectResolution(torrentName.toLowerCase());
    if (fileRes && torrentRes) {
        if (fileRes === torrentRes) {
            score += 40;
            details.resolutionMatch = true;
        } else {
            score -= 30;
            details.resolutionMatch = false;
        }
    }
    details.resolution = fileRes || torrentRes || 'unknown';

    // 3. Potrivire sursa (+50 / -20)
    //    Portat din: if video_source == sub_source: score += 50
    const fileSrc    = detectSource(name);
    const torrentSrc = detectSource(torrentName.toLowerCase());
    if (fileSrc && torrentSrc) {
        if (fileSrc === torrentSrc) {
            score += 50;
            details.sourceMatch = true;
        } else {
            score -= 20;
            details.sourceMatch = false;
        }
    }

    // 4. Potrivire release group (+30)
    //    Portat din: if video_group == sub_group: score += 30
    const fileGroup    = detectGroup(name);
    const torrentGroup = detectGroup(torrentName.toLowerCase());
    if (fileGroup && torrentGroup && fileGroup === torrentGroup) {
        score += 30;
        details.groupMatch = true;
    }

    // 5. Exclude fisiere non-video (subs, extras, featurettes)
    //    Daca fisierul e .nfo, .srt, sample, etc. scor negativ
    if (/\.(nfo|srt|ass|ssa|sub|idx|txt|jpg|png|sfv|md5)$/.test(name)) {
        score -= 200;
        details.nonVideo = true;
    }
    if (/sample|trailer|extra|featurette|behind.the.scenes|deleted/i.test(name)) {
        score -= 100;
        details.extraContent = true;
    }

    return { score, details };
}

/**
 * Gaseste fileIdx corect pentru un episod dintr-un torrent multi-fisier
 * Aceasta e functia principala folosita in index.js
 *
 * @param {Array} files - lista de fisiere din torrent (de la parse-torrent)
 * @param {number} season - sezonul cerut
 * @param {number} episode - episodul cerut
 * @param {string} torrentName - numele torrentului pentru context
 * @returns {number} - fileIdx corect
 */
function findEpisodeFileIdx(files, season, episode, torrentName = '') {
    if (!files || files.length === 0) return 0;
    if (files.length === 1) return 0;

    // Calculeaza scor pentru fiecare fisier
    const scored = files.map((file, idx) => {
        const fileName = file.name || file.path || `file_${idx}`;
        const baseName = fileName.split('/').pop(); // Doar numele, fara cale
        const { score, details } = calculateMatchScore(baseName, torrentName, season, episode);

        return { idx, fileName: baseName, score, details, size: file.length || 0 };
    });

    // Sorteaza dupa scor descrescator
    scored.sort((a, b) => b.score - a.score);

    // Log top 3
    console.log(`[Match] Top potriviri pentru S${String(season).padStart(2,'0')}E${String(episode).padStart(2,'0')}:`);
    scored.slice(0, 3).forEach((f, i) => {
        console.log(`  #${i+1} (${f.score > 0 ? '+' : ''}${f.score}) fileIdx=${f.idx}: ${f.fileName.slice(0, 60)}`);
    });

    // Daca cel mai bun scor e negativ, fallback la fisierul cel mai mare
    if (scored[0].score < 0) {
        console.log(`[Match] Scor negativ, fallback la fisierul cel mai mare`);
        const largest = files.reduce((max, f, i) =>
            (f.length || 0) > (files[max].length || 0) ? i : max, 0);
        return largest;
    }

    return scored[0].idx;
}

module.exports = { findEpisodeFileIdx, calculateMatchScore, detectEpisode, detectResolution };
