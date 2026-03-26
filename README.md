# Stremio FileList.io Addon

Addon Stremio pentru FileList.io — tracker privat românesc.  
Portat din logica **Elementum Burst** (Kodi) în Node.js.

## Ce face

- Caută torrente pe FileList după IMDB ID (filme și seriale)
- Filtrează release-uri de calitate proastă (CAM, screener, etc)
- Detectează rezoluția din numele torrentului (4K / 1080p / 720p / 480p)
- Sortează după rezoluție și seeders
- Returnează `infoHash` direct → Stremio Android redă nativ fără client torrent extern

## Cerințe

- Node.js 14+
- Cont activ pe [filelist.io](https://filelist.io)
- Passkey-ul din profilul tău FileList

## Instalare

```bash
git clone ...
cd stremio-filelist
npm install
```

## Configurare

Editează `config.js` și pune username-ul și passkey-ul tău:

```js
FL_USERNAME: 'username_tau',
FL_PASSKEY:  'passkey_tau',   // din profil -> Edit Profile -> Passkey
```

Sau folosește variabile de mediu:

```bash
FL_USERNAME=username_tau FL_PASSKEY=passkey_tau npm start
```

## Pornire

```bash
npm start
```

Addon-ul rulează pe `http://localhost:7000`

## Adăugare în Stremio Android

1. Pornește addon-ul pe un PC din aceeași rețea
2. Află IP-ul PC-ului (ex: `192.168.1.100`)
3. Deschide Stremio → Settings → Addons → Community Addons
4. Introdu: `http://192.168.1.100:7000/manifest.json`
5. Instalează și gata

## Structura fișierelor

```
index.js      ← entry point, manifest Stremio + stream handler
filelist.js   ← FileList API wrapper (searchByImdb, searchByName)
filtering.js  ← filtrare + sortare (portat din filtering.py Burst)
torrent.js    ← descarcă .torrent → extrage infoHash
config.js     ← credențiale și setări
```

## Portare din Elementum Burst

| Burst (Python)     | Addon (Node.js)       | Ce face                          |
|--------------------|-----------------------|----------------------------------|
| `extract_from_api` | `filelist.js`         | Parsare JSON răspuns FileList    |
| `filtering.py`     | `filtering.js`        | Filtrare rezoluție, release type |
| `normalize.py`     | `filtering.js`        | Normalizare string-uri           |
| `cleanup_results`  | `filterAndSort()`     | Deduplicare + sortare seeders    |
| `determine_resolution` | `determineResolution()` | Regex rezoluție din nume   |
| `process_keywords` | `buildUrl()`          | Construire query FileList        |
