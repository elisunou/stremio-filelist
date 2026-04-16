module.exports = {
    // Credentiale FileList.io
    // Passkey-ul il gasesti in profilul tau pe filelist.io -> Edit Profile -> Passkey
    FL_USERNAME: process.env.FL_USERNAME || 'USERNAME',
    FL_PASSKEY:  process.env.FL_PASSKEY  || 'PASSKEY',

    // TMDB API Key (optional dar recomandat pentru mai multe titluri alternative)
    // Gratuit la: https://www.themoviedb.org/settings/api
    TMDB_API_KEY: process.env.TMDB_API_KEY || '',

    // Server
    PORT: process.env.PORT || 7000,

    // Numarul maxim de stream-uri returnate per request
    MAX_RESULTS: 10,

    // Timeout request HTTP (ms)
    REQUEST_TIMEOUT: 15000,

    // Categorii FileList per tip Stremio
    CATEGORIES: {
        movie: [1, 2, 3, 4, 6, 19, 20, 26],   // SD, DVD, DVD-RO, HD, 4K, HD-RO, Blu-Ray, 4K Blu-Ray
        series: [21, 23, 27]                    // Seriale HD, SD, 4K
    }
};
