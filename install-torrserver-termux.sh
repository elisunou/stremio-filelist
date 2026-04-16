#!/data/data/com.termux/files/usr/bin/bash
# Instalare TorrServer pe Android ARM64 (Termux)

echo "→ Descarc TorrServer pentru Android ARM64..."

# Descarca ultima versiune
curl -L "https://github.com/YouROK/TorrServer/releases/latest/download/TorrServer-android-arm64" \
     -o ~/torrserver

chmod +x ~/torrserver

echo "✓ TorrServer instalat!"
echo ""
echo "Porneste TorrServer cu:"
echo "  ~/torrserver"
echo ""
echo "Ruleaza pe: http://localhost:8090"
