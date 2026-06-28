#!/bin/bash
# scripts/deploy-and-pr.sh
# ==============================================================================
# Dynamic, self-validating script to automate local checks, branch verification,
# change staging, committing, and pushing to GitHub.
# ==============================================================================

set -euo pipefail

# ── 1. Check Git Environment & Status ────────────────────────────────────────
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "ERROR: Not inside a git repository."
  exit 1
fi

# Get current branch name
CURRENT_BRANCH=$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse --abbrev-ref HEAD 2>/dev/null)

if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
  echo "WARNING: You are currently on the '$CURRENT_BRANCH' branch."
  echo "Direct commits/pushes to main/master are restricted to keep production stable."
  read -p "Enter a new feature or bugfix branch name to create: " NEW_BRANCH
  
  # Trim whitespace
  NEW_BRANCH=$(echo "$NEW_BRANCH" | xargs)
  
  if [ -z "$NEW_BRANCH" ]; then
    echo "ERROR: Branch name cannot be empty. Aborting."
    exit 1
  fi
  
  echo "Creating and switching to branch: $NEW_BRANCH"
  git checkout -b "$NEW_BRANCH"
  CURRENT_BRANCH="$NEW_BRANCH"
fi

echo "=== 1. Active Branch: $CURRENT_BRANCH ==="

# ── 2. Local Verification (Gatekeeper) ───────────────────────────────────────
echo "=== 2. Starting local verification checks ==="

# Ensure dependencies are installed
if [ ! -d "node_modules" ]; then
  echo "[CHECK] node_modules not found. Installing dependencies..."
  npm ci
fi

echo "[CHECK] Generating Prisma Client..."
npx prisma generate

echo "[CHECK] Running local Next.js build validation..."
npm run build

echo "[CHECK] Running local academic engine unit tests..."
npm run test:academic

echo "=== Local Verification SUCCESS ==="

# Ensure banner asset exists and copy it (for backward compatibility)
if [ -f "updated_banne.png" ]; then
  echo "[ASSET] Copying updated_banne.png to public banner directory..."
  mkdir -p public/assets/images/banner/
  cp updated_banne.png public/assets/images/banner/updated_banne.png
fi

# ── 3. Dynamic Staging and Committing ────────────────────────────────────────
echo "=== 3. Staging and Committing Changes ==="

# Check if there are any staged changes
if git diff --cached --quiet; then
  echo "[STAGE] No changes currently staged."
  git status -s
  
  read -p "Would you like to stage all modified and untracked changes? (y/n): " STAGE_ALL
  if [[ "$STAGE_ALL" =~ ^[Yy]$ ]]; then
    git add -A
    echo "[STAGE] All changes staged."
  else
    echo "Aborting: No changes staged for commit."
    exit 0
  fi
fi

# Double check if we now have staged changes after prompt
if git diff --cached --quiet; then
  echo "No changes staged to commit. Aborting."
  exit 0
fi

# Use commit message from script arguments, or prompt interactively
COMMIT_MSG="${1:-}"

if [ -z "$COMMIT_MSG" ]; then
  read -p "Enter commit message (Conventional Commits style preferred): " COMMIT_MSG
  # Trim whitespace
  COMMIT_MSG=$(echo "$COMMIT_MSG" | xargs)
fi

if [ -z "$COMMIT_MSG" ]; then
  echo "ERROR: Commit message cannot be empty. Aborting."
  exit 1
fi

git commit -m "$COMMIT_MSG"

# ── 4. Pushing to Remote Origin ──────────────────────────────────────────────
echo "=== 4. Pushing to remote origin ==="
git push -u origin "$CURRENT_BRANCH"

echo ""
echo "==============================================================="
echo " SUCCESS: All changes validated and pushed to GitHub!"
echo "==============================================================="
echo " Branch : $CURRENT_BRANCH"
echo " PR URL : https://github.com/chaudhayabdullah786/evershine_lms/pull/new/$CURRENT_BRANCH"
echo ""
echo " ⚠ DEPLOYMENT CHECKLIST (Hostinger):"
echo " 1. Merge this PR on GitHub (confirm GitHub Actions CI checks pass)"
echo " 2. On Hostinger: git pull origin main"
echo " 3. Run database migrations if schema changed:"
echo "    npx prisma db push --skip-generate"
# Note: postbuild-sync.js will auto-sync .next/static
echo " 4. Run: npm run build"
echo " 5. Restart: node server.js or via Hostinger panel"
echo "==============================================================="
