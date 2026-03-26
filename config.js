module.exports = {
    // Credențiale FileList.io
    // Passkey-ul îl găsești în profilul tău pe filelist.io -> Edit Profile -> Passkey
    FL_USERNAME: process.env.FL_USERNAME || 'USERNAME',
    FL_PASSKEY:  process.env.FL_PASSKEY  || 'PASSKEY',

    // Server
    PORT: process.env.PORT || 7000,

    // Numărul maxim de stream-uri returnate per request
    MAX_RESULTS: 10,

    // Timeout request HTTP (ms)
    REQUEST_TIMEOUT: 15000,

    // Categorii FileList per tip Stremio
    // https://filelist.io/forums.php?action=viewtopic&topicid=16
    CATEGORIES: {
        movie: [
            1,   // Filme SD
            2,   // Filme DVD
            3,   // Filme DVD-RO
            4,   // Filme HD
            6,   // Filme 4K
            19,  // Filme HD-RO
            20,  // Filme Blu-Ray
            26,  // Filme 4K Blu-Ray
        ],
        series: [
            21,  // Seriale HD
            23,  // Seriale SD
            27,  // Seriale 4K
        ]
    }
};
