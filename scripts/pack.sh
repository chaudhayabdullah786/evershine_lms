#!/bin/bash
# scripts/pack.sh
# ==============================================================================
# Packs the locally compiled Next.js standalone build into a zip archive
# to bypass Hostinger's memory/process limit constraints during compilation.
# ==============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "=== 1. Building application locally (with full system resources) ==="
# Running production build locally
npm run build

echo "=== 2. Creating deployment archive (next-build.zip) ==="
# Remove old archive if it exists
rm -f next-build.zip

# Navigate to standalone directory containing server.js and bundled node_modules
cd .next/standalone

# Zip all contents of the standalone build
zip -q -r ../../next-build.zip .

cd "$ROOT_DIR"

echo "==============================================================="
# Print confirmation and size
size_mb=$(du -m next-build.zip | cut -f1)
echo " ✅ PACK COMPLETE: next-build.zip (${size_mb} MB) is ready."
echo "==============================================================="
echo " DEPLOYMENT STEPS:"
echo " 1. Open Hostinger hPanel File Manager: https://hpanel.hostinger.com/"
echo " 2. Upload next-build.zip to your project folder:"
echo "    /home/u668799501/domains/evershineacadmey.com/hbuilds/last-source/"
echo " 3. Right-click next-build.zip in hPanel and click 'Extract' (overwrite all)."
echo " 4. In SSH, run: pkill -9 -u \"\$(whoami)\" -f \"next-server\""
echo "==============================================================="
