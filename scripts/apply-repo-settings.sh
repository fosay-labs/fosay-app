#!/usr/bin/env bash
# Applies the GitHub settings for both FOSAY repos in one run (idempotent).
#   gh auth login          # as an admin of fosay-labs
#   bash scripts/apply-repo-settings.sh [https://your-api.onrender.com]
# Sets: description, homepage, topics, Discussions, delete-branch-on-merge, wiki off,
# private vulnerability reporting, Dependabot alerts, GitHub Pages (Actions source),
# branch protection on main, and (with an argument) the FOSAY_API_URL Actions variable.
set -euo pipefail

ORG=fosay-labs
SITE=https://fosay-labs.github.io/fosay-app/
API_URL=${1:-}

settings() { # repo description topics...
  local repo=$1 desc=$2; shift 2
  gh api -X PATCH "repos/$ORG/$repo" \
    -f description="$desc" -f homepage="$SITE" \
    -F has_discussions=true -F has_wiki=false -F delete_branch_on_merge=true >/dev/null
  local args=(); for t in "$@"; do args+=(-f "names[]=$t"); done
  gh api -X PUT "repos/$ORG/$repo/topics" "${args[@]}" >/dev/null
  gh api -X PUT "repos/$ORG/$repo/private-vulnerability-reporting" >/dev/null
  gh api -X PUT "repos/$ORG/$repo/vulnerability-alerts" >/dev/null
  echo "settings: $repo"
}

protect() { # repo required-check-name
  gh api -X PUT "repos/$ORG/$1/branches/main/protection" --input - >/dev/null <<JSON
{
  "required_status_checks": { "strict": true, "contexts": ["$2"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 1, "dismiss_stale_reviews": true },
  "restrictions": null,
  "required_linear_history": true,
  "required_conversation_resolution": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
  echo "branch protection: $1 (requires PR + 1 approval + '$2')"
}

settings fosay-contract \
  "Soroban contracts for FOSAY: mandate policy and approval queue for AI-agent smart wallets on Stellar." \
  stellar soroban smart-contracts rust smart-account ai-agents agentic-payments x402 passkeys drips-wave
settings fosay-app \
  "FOSAY: a Stellar wallet you share with your AI agent. SDK, x402 payer, MCP server, relayer and passkey approval app." \
  stellar soroban typescript nextjs mcp ai-agents agentic-payments x402 passkeys webauthn smart-wallet drips-wave

# GitHub Pages from Actions (the workflow is .github/workflows/pages.yml)
if gh api "repos/$ORG/fosay-app/pages" >/dev/null 2>&1; then
  gh api -X PUT "repos/$ORG/fosay-app/pages" -f build_type=workflow >/dev/null
else
  gh api -X POST "repos/$ORG/fosay-app/pages" -f build_type=workflow >/dev/null
fi
echo "pages: enabled (source: GitHub Actions)"

if [ -n "$API_URL" ]; then
  gh variable set FOSAY_API_URL --repo "$ORG/fosay-app" --body "${API_URL%/}"
  echo "variable: FOSAY_API_URL=${API_URL%/}"
fi
gh workflow run pages.yml --repo "$ORG/fosay-app" >/dev/null && echo "pages: deploy started"

protect fosay-contract "fmt, clippy, test, wasm build"
protect fosay-app "lint, typecheck, test, build"
echo "done"
