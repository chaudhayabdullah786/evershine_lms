#!/bin/bash
# scripts/deploy-and-pr.sh
# ==========================================
# Script to automate local checks, branch creation, 
# and pushing changes to GitHub for deployment.
# ==========================================

set -e

BRANCH_NAME="feature/landing-enhancements-rules-agreement"

echo "=== 1. Starting local verification ==="
# Check if node_modules exists, if not install
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm ci
fi

echo "Generating Prisma client..."
npx prisma generate

echo "=== 2. Preparing Git Branch ==="
# Check if branch exists, delete or checkout
if git show-ref --quiet refs/heads/$BRANCH_NAME; then
  echo "Branch $BRANCH_NAME already exists locally. Switching to it."
  git checkout $BRANCH_NAME
else
  echo "Creating and switching to new branch: $BRANCH_NAME"
  git checkout -b $BRANCH_NAME
fi

# Ensure banner asset exists and copy it
if [ -f "updated_banne.png" ]; then
  echo "Copying updated_banne.png to public banner directory..."
  cp updated_banne.png public/assets/images/banner/updated_banne.png
else
  echo "WARNING: updated_banne.png not found in root directory!"
fi

echo "=== 3. Staging and Committing Changes ==="
git add app/dashboard/batches/\[id\]/page.tsx
git add app/dashboard/admin/permissions/page.tsx
git add content/site-config.ts
git add prisma/schema.prisma
git add components/landing/site-footer.tsx
git add components/landing/hero-section.tsx
git add app/admissions/apply/_components.tsx
git add app/admissions/apply/page.tsx
git add components/student/RulesAgreementBlocker.tsx
git add app/dashboard/layout.tsx
git add app/api/student/rules-agreement/route.ts
if [ -f "public/assets/images/banner/updated_banne.png" ]; then
  git add public/assets/images/banner/updated_banne.png
fi

git commit --allow-empty -m "feat(lms): batch deactivation, RBAC overrides, responsive banner, Since 2016 badge, student rules agreement on first login"

echo "=== 4. Pushing to remote origin ==="
git push -u origin $BRANCH_NAME

echo ""
echo "==============================================================="
echo " SUCCESS: All changes pushed to GitHub!"
echo "==============================================================="
echo " Branch : $BRANCH_NAME"
echo " PR URL : https://github.com/chaudhayabdullah786/evershine_lms/pull/new/$BRANCH_NAME"
echo ""
echo " ⚠ DEPLOYMENT CHECKLIST (Hostinger):"
echo " 1. Merge this PR on GitHub"
echo " 2. On Hostinger: git pull origin main"
echo " 3. Run: npx prisma db push --skip-generate"
echo "       (Adds rulesAccepted column to Student table)"
echo " 4. Run: npm run build"
echo "       (postbuild-sync.js will auto-sync .next/static)"
echo " 5. Restart: node server.js or via Hostinger panel"
echo "==============================================================="
