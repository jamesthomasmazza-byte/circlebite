#!/usr/bin/env bash
# The actual deploy logic — versioned here, not hand-copied to the server. Always invoked by
# ~/circlebite/deploy.sh from inside a fresh clone, so this always runs as the version just
# pulled from main. Atomic: `set -euo pipefail` means a failed install/build/migration aborts
# here, before the symlink swap or restart — the currently running release is untouched, and
# there is nothing to roll back. Only reached this far == safe to go live.
set -euo pipefail

RELEASE_DIR="$1"
CIRCLEBITE_HOME="$HOME/circlebite"
ENV_FILE="$CIRCLEBITE_HOME/.env"
KEEP_RELEASES=5

cd "$RELEASE_DIR"
npm install --no-audit --no-fund
npm run build -w server
npm run build -w client

# Loaded into this shell only, to run the migration — not written anywhere, not passed to the
# npm/node child processes above (they don't need it).
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
node server/dist/db/migrate.js

# Everything above succeeded — safe to go live. Both of these are what "atomic" means here: the
# symlink swap is a single rename, and only after it succeeds does anything get restarted.
ln -sfn "$RELEASE_DIR" "$CIRCLEBITE_HOME/current"
sudo systemctl restart circlebite

echo "waiting for the new release to report healthy..."
healthy=false
for _ in $(seq 1 10); do
  if curl -sf http://127.0.0.1:3000/health > /dev/null; then
    healthy=true
    break
  fi
  sleep 1
done

if [ "$healthy" != "true" ]; then
  prev=$(ls -1dt "$CIRCLEBITE_HOME"/releases/*/ | sed -n 2p)
  echo "WARNING: $RELEASE_DIR did not report healthy after restart." >&2
  echo "Check: sudo systemctl status circlebite --no-pager" >&2
  echo "Revert: ln -sfn ${prev%/} $CIRCLEBITE_HOME/current && sudo systemctl restart circlebite" >&2
  exit 1
fi

echo "deploy ok: $RELEASE_DIR"

# Keep the last $KEEP_RELEASES releases (this one included) so a revert always has somewhere
# recent to point at; prune anything older to bound disk usage over the life of the project.
cd "$CIRCLEBITE_HOME/releases"
ls -1dt */ | tail -n "+$((KEEP_RELEASES + 1))" | xargs -r rm -rf
