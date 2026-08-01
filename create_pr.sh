#!/bin/bash
# PR Creation Helper Script
# WHY: Standardizes branch naming, verifies code quality, commits using Conventional Commits,
#      and provides the GitHub CLI commands with a pre-filled markdown PR template.

set -e

# ANSI escape codes for coloring output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== EVS LMS Pull Request Deployment Workflow ===${NC}"

# 1. Quality Gate (Run typescript & lint validation)
echo -e "\n${BLUE}[1/5] Running local code validation...${NC}"
if npm run lint; then
    echo -e "${GREEN}✓ All linting and TypeScript checks passed!${NC}"
else
    echo -e "${RED}✗ Code validation failed. Please resolve lint/type issues before committing.${NC}"
    exit 1
fi

# 2. Branch Selection
BRANCH_NAME="feat/notifications-inbox-tabs"
echo -e "\n${BLUE}[2/5] Setting up branch: $BRANCH_NAME...${NC}"
if git rev-parse --verify "$BRANCH_NAME" >/dev/null 2>&1; then
    echo "Branch already exists. Switching to it..."
    git checkout "$BRANCH_NAME"
else
    echo "Creating and switching to new branch..."
    git checkout -b "$BRANCH_NAME"
fi

# 3. Stage Changes
echo -e "\n${BLUE}[3/5] Staging modified files...${NC}"
git add app/dashboard/layout.tsx
git status --short

# 4. Commit using Conventional Commits Specification
COMMIT_MSG="feat(notifications): implement tabbed inbox/archive and resolve header z-index overlap"
COMMIT_BODY="Refactors the notifications dropdown panel inside the dashboard layout to resolve visual inconsistencies and optimize the user experience. Introduces a client-side tabbed layout (Inbox vs Archive) with real-time count badges, category tags, standard Lucide React icons, and smooth Framer Motion list transition animations."

echo -e "\n${BLUE}[4/5] Committing changes...${NC}"
git commit -m "$COMMIT_MSG" -m "$COMMIT_BODY"

# 5. Output Next Steps
echo -e "\n${GREEN}=== local changes committed successfully ===${NC}"
echo -e "To push this branch to the remote repository, run:"
echo -e "  ${BLUE}git push origin $BRANCH_NAME${NC}"

echo -e "\nTo create the Pull Request with a pre-filled description template via GitHub CLI, run:"
echo -e "--------------------------------------------------------------------------------"
cat << 'EOF'
gh pr create \
  --title "feat(notifications): implement tabbed inbox/archive and resolve header z-index overlap" \
  --body "## Description
Refactors the notifications dropdown panel inside the dashboard layout to resolve visual inconsistencies and optimize the user experience.

### Key Changes
1. **Inbox / Archive Tabs:** Separated unread notifications (Inbox) from read notifications (Archive) on the client side with custom counts.
2. **Badge Categorization:** Mapped notification types (e.g. results, attendance, leaves, finance) to desaturated colored border badges.
3. **Z-Index Fix:** Added \`relative z-50\` to the header to prevent the dropdown from painting behind the main dashboard page cards.
4. **Clean Animations:** Integrated Framer Motion \`<AnimatePresence>\` to animate notifications sliding out when marked read.
5. **Lucide Icons:** Replaced inline SVGs with standard Lucide React icons (\`CheckCheck\`, \`Archive\`, \`GraduationCap\`, \`CalendarClock\`, etc.).

### Verification
- Verified dropdown paints on top of dashboard cards.
- Verified unread count badges decrement in real-time.
- Checked tab filtering and mark-as-read transitions."
EOF
echo -e "--------------------------------------------------------------------------------"
