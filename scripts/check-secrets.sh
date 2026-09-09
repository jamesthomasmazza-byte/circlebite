#!/usr/bin/env bash
# Blocks secrets from reaching a commit. Enforces CONTEST_RULES.md R8 mechanically,
# instead of relying on anyone remembering.
#
# Install as a pre-commit hook (run once, from the repo root):
#   chmod +x scripts/check-secrets.sh
#   ln -sf ../../scripts/check-secrets.sh .git/hooks/pre-commit
#
# Run manually against everything currently staged:
#   ./scripts/check-secrets.sh

set -euo pipefail

fail=0
staged=$(git diff --cached --name-only --diff-filter=ACM)

[ -z "$staged" ] && exit 0

# 1. Files that must never be committed at all.
while IFS= read -r file; do
  case "$file" in
    .env|.env.local|.env.production|.env.development)
      echo "BLOCKED: $file must never be committed (R8). Use .env.example."
      fail=1 ;;
    *.pem|*.key|*.p12|*id_rsa*)
      echo "BLOCKED: $file looks like a private key (R8)."
      fail=1 ;;
    uploads/*|storage/label-captures/*)
      echo "BLOCKED: $file is user-uploaded content, may contain real personal data (R9)."
      fail=1 ;;
  esac
done <<< "$staged"

# 2. Secret-shaped content inside otherwise-normal files.
patterns=(
  'sk-[A-Za-z0-9_-]{16,}'                      # generic provider key
  'AKIA[0-9A-Z]{16}'                           # AWS access key id
  'ghp_[A-Za-z0-9]{30,}'                       # GitHub token
  'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}'  # JWT
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
  '(password|passwd|secret|api_?key|token)[[:space:]]*[:=][[:space:]]*["'"'"'][^"'"'"']{12,}'
)

for file in $staged; do
  [ -f "$file" ] || continue
  case "$file" in
    .env.example|scripts/check-secrets.sh|*.md) continue ;;
  esac
  for pat in "${patterns[@]}"; do
    if git diff --cached -U0 -- "$file" | grep -qE "^\+.*$pat"; then
      echo "BLOCKED: $file contains something shaped like a credential (R8)."
      echo "         Pattern: $pat"
      fail=1
    fi
  done
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "Commit refused. Move the value into .env on the server and reference it via process.env."
  echo "If a real key was already committed in an earlier commit, ROTATE IT — deleting is not enough."
  exit 1
fi

exit 0
