#!/usr/bin/env bash
# Stable deploy entry point. Installed once on the server as ~/circlebite/deploy.sh — see
# docs/server-setup.md for the one-time bootstrap. This file should essentially never need to
# change again: its only job is to clone main fresh into a new release directory and hand off to
# that release's own scripts/release.sh, which holds the actual deploy logic. Because it always
# execs the freshly-cloned copy, release.sh updates itself automatically every run — this file
# never needs to be manually re-synced when release.sh changes.
set -euo pipefail

REPO_URL="https://github.com/jamesthomasmazza-byte/circlebite.git"
RELEASE_DIR="$HOME/circlebite/releases/$(date +%Y%m%d%H%M%S)"

git clone --depth 1 --branch main "$REPO_URL" "$RELEASE_DIR"
exec "$RELEASE_DIR/scripts/release.sh" "$RELEASE_DIR"
