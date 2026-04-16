#!/data/data/com.termux/files/usr/bin/bash
# ╔══════════════════════════════════════════╗
# ║  FileList Stremio Addon — Termux Setup  ║
# ╚══════════════════════════════════════════╝

set -e

echo ""
echo "→ [1/5] Update Termux packages..."
pkg update -y -o Dpkg::Options::="--force-confdef" 2>/dev/null || true

echo "→ [2/5] Install Node.js LTS..."
pkg install nodejs-lts -y 2>/dev/null || pkg install nodejs -y

echo "→ [3/5] Install build tools (necesare pentru WebTorrent)..."
pkg install python make clang binutils -y 2>/dev/null || true

echo "→ [4/5] Download addon..."
if [ ! -d ~/stremio-filelist ]; then
    echo "   Copiaza fisierele addon in ~/stremio-filelist"
    mkdir -p ~/stremio-filelist
fi

cd ~/stremio-filelist

echo "→ [5/5] Install dependencies..."
npm install stremio-addon-sdk parse-torrent

# Incearca WebTorrent
echo "→ Incerc WebTorrent..."
npm install webtorrent 2>/dev/null && echo "✓ WebTorrent instalat!" || echo "✗ WebTorrent esuat — va folosi fallback"

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║           CONFIGURARE NECESARA          ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Editeaza config.js:"
echo "  nano ~/stremio-filelist/config.js"
echo ""
echo "Seteaza:"
echo "  FL_USERNAME: 'username_tau_filelist'"
echo "  FL_PASSKEY:  'passkey_tau_filelist'"
echo ""
echo "╔══════════════════════════════════════════╗"
echo "║              PORNIRE ADDON              ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  cd ~/stremio-filelist"
echo "  node index.js"
echo ""
echo "Instaleaza in Stremio Android:"
echo "  http://localhost:7000/manifest.json"
echo ""
