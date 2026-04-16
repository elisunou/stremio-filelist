# FileList.io Stremio Addon

## Instalare rapidă

### PC (Windows/Linux)

1. Descarcă TorrServer: https://github.com/YouROK/TorrServer/releases
2. Pornește TorrServer (dublu click pe .exe pe Windows)
3. Editează `config.js` cu username și passkey FileList
4. `npm install && node index.js`
5. Instalează în Stremio: `http://localhost:7000/manifest.json`

### Android (Termux)

```bash
# 1. Instaleaza TorrServer
bash install-torrserver-termux.sh

# 2. Porneste TorrServer (intr-un tab Termux separat)
~/torrserver &

# 3. Instaleaza addon
cd ~/stremio-filelist
npm install --ignore-scripts
node index.js
```

Instalează în Stremio: `http://localhost:7000/manifest.json`

## Config

Editează `config.js`:
```js
FL_USERNAME: 'username_tau',
FL_PASSKEY:  'passkey_tau',
```

## Porturi
- Addon:      http://localhost:7000
- TorrServer: http://localhost:8090

- ##Doneaza
- https://revolut.me/elisunou
