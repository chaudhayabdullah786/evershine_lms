#!/bin/bash
# scripts/hostinger-redeploy.sh
# ==============================================================================
# ONE-COMMAND POST-MERGE REDEPLOY for Hostinger SSH
# ==============================================================================
# Run this on Hostinger after merging any Pull Request into main:
#
#   bash scripts/hostinger-redeploy.sh
#
# What this does in order:
#   1. Sets up Node 20 in PATH (Hostinger requirement)
#   2. Pulls the latest code from the main branch
#   3. Installs any new dependencies without rebuilding native modules
#   4. Regenerates the Prisma client to match the current schema
#   5. Runs the full Next.js production build
#   6. Kills any running server process so Passenger can restart cleanly
#   7. Prints a confirmation with the new BUILD_ID
# ==============================================================================

set -euo pipefail

# ── 0. Bootstrap Node.js PATH ────────────────────────────────────────────────
# WHY: Hostinger shared hosting does not add Node to PATH by default.
export PATH="/opt/alt/alt-nodejs20/root/bin:$PATH"

# Validate Node 20 is available.
node_version=$(node -e "process.stdout.write(process.version)" 2>/dev/null || echo "")
if [[ -z "$node_version" ]]; then
  echo "ERROR: Node.js not found. Check that alt-nodejs20 is installed."
  exit 1
fi
echo "[DEPLOY] Node.js: $node_version"

# ── 1. Pull latest code ───────────────────────────────────────────────────────
echo "[DEPLOY] Pulling latest code from main..."
git pull origin main

# ── 2. Install dependencies ───────────────────────────────────────────────────
# WHY --ignore-scripts: postinstall runs prisma generate. We run it separately
# to ensure the database schema is valid before generating the client.
echo "[DEPLOY] Installing dependencies..."
npm ci --ignore-scripts

# ── 3. Regenerate Prisma client ───────────────────────────────────────────────
echo "[DEPLOY] Generating Prisma client..."
npx prisma generate

# ── 4. Build the application ──────────────────────────────────────────────────
# postbuild (postbuild-sync.js) runs automatically after build via npm lifecycle.
echo "[DEPLOY] Building Next.js application..."
npm run build

# ── 5. Restart the server ─────────────────────────────────────────────────────
# WHY pkill: Hostinger uses Phusion Passenger which auto-restarts next-server.
# Killing the current process triggers Passenger to restart with the new build.
echo "[DEPLOY] Restarting application..."
pkill -9 -u "$(whoami)" -f "next-server" 2>/dev/null || echo "[DEPLOY] No running next-server process found (OK)."

# ── 6. Confirmation ───────────────────────────────────────────────────────────
BUILD_ID=""
if [ -f ".next/BUILD_ID" ]; then
  BUILD_ID=$(cat .next/BUILD_ID)
fi

echo ""
echo "=================================================================="
echo " ✅  DEPLOYMENT COMPLETE"
echo "=================================================================="
echo "  New BUILD_ID  : ${BUILD_ID:-unknown}"
echo "  Branch        : $(git branch --show-current)"
echo "  Node version  : $node_version"
echo ""
echo "  The server will restart automatically via Passenger."
echo "  Check logs at: ~/domains/evershineacadmey.com/passenger_wsgi.log"
echo "=================================================================="
