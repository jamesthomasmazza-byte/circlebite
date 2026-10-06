#!/usr/bin/env bash
# Nightly backup: a pg_dump of the database and a tarball of the correction photos, kept on local
# disk and copied to a private S3 bucket. Run by circlebite-backup.timer (docs/server-setup.md §17);
# safe to run by hand with `sudo systemctl start circlebite-backup` or directly as ubuntu.
#
# Writes only under ~/circlebite/backups — a sibling of releases/ and current/, never inside either.
# §8 records why that rule exists: a path that resolved inside the release tree once silently
# deleted every correction photo on the next deploy. The guard below refuses rather than trusting
# the layout.
#
# A backup that quietly stops is the realistic failure (there's nowhere to send an alert), so every
# outcome leaves a stamp file that scripts/backup-status.sh reads:
#   last-local-success    dump + tarball written and verified on this box
#   last-offsite-success  that set also copied to S3
#   last-refusal          refused to start because the disk was too full to do it safely
set -euo pipefail

# Everything below is created 600 / directories 700 from the start — a dump holds password hashes,
# session-token hashes and HMACs, and a chmod afterwards would leave a window.
umask 077

CIRCLEBITE_HOME="$HOME/circlebite"
ENV_FILE="$CIRCLEBITE_HOME/.env"
BACKUP_DIR="$CIRCLEBITE_HOME/backups"
KEEP_SETS=7
S3_REGION="us-east-2"
S3_PREFIX="circlebite"

# Room Postgres itself needs after the backup is written: WAL segments and checkpoints, session and
# auth_attempts writes, journald. A full disk takes the database and the app down with it, so the
# backup job must never be what fills it.
RESERVE_BYTES=$((2 * 1024 * 1024 * 1024))

# Plain `source`, the same as release.sh — .env values with spaces are double-quoted (§6), so a
# key=value parser would get them wrong. Deliberately *without* `set -a`: nothing is exported, so
# SESSION_SECRET and the AI key never reach pg_dump or aws. Only the three below are used.
# shellcheck disable=SC1090
source "$ENV_FILE"

for var in DATABASE_URL UPLOAD_DIR BACKUP_S3_BUCKET; do
  if [ -z "${!var:-}" ]; then
    echo "backup: $var is not set in $ENV_FILE — see docs/server-setup.md §17" >&2
    exit 1
  fi
done
case "$BACKUP_S3_BUCKET" in
  *"<"*|*">"*)
    echo "backup: BACKUP_S3_BUCKET is still the runbook placeholder ($BACKUP_S3_BUCKET)" >&2
    exit 1 ;;
esac

mkdir -p "$BACKUP_DIR"
real_backup_dir=$(realpath "$BACKUP_DIR")
for tree in releases current; do
  real_tree=$(realpath -m "$CIRCLEBITE_HOME/$tree")
  case "$real_backup_dir/" in
    "$real_tree"/*)
      echo "backup: $BACKUP_DIR resolves inside $tree/ ($real_backup_dir) — refusing." >&2
      echo "        Anything under the release tree is deleted by a later deploy (§8)." >&2
      exit 1 ;;
  esac
done

now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }
human() { numfmt --to=iec-i --suffix=B "$1"; }

# Atomic: a reader never sees a half-written stamp, and its mtime is the moment of success.
write_stamp() {
  printf '%s\n' "$2" > "$BACKUP_DIR/.$1.tmp"
  mv -f "$BACKUP_DIR/.$1.tmp" "$BACKUP_DIR/$1"
}

# One backup or restore test at a time — the restore test takes the same lock, so pruning here can
# never delete the set it is in the middle of restoring. 30 min, well inside the unit's 2h
# TimeoutStartSec, so a stuck holder produces this script's own error rather than a systemd kill.
exec 9> "$BACKUP_DIR/.lock"
if ! flock -w 1800 9; then
  echo "backup: another backup or restore test has held the lock for 30 min — giving up" >&2
  exit 1
fi

# Leftovers from a run that was killed (timeout, reboot, SIGKILL) before its EXIT trap could clean
# up. Safe to delete: we hold the lock, so no other run is writing right now. They could never be
# mistaken for a backup anyway — a file is renamed from .partial only after the step that wrote it
# succeeded, and the restore test only picks sets by their .sha256, which is written last. Removing
# them here is about disk: the free-space check below should measure real room, not room minus a
# dead half-dump.
rm -f -- "${BACKUP_DIR:?}"/circlebite-*.partial "${BACKUP_DIR:?}"/.*.tmp

# --- 0. Free space, before anything is written -----------------------------------------------
# Upper bounds that need no history, so the first run is judged the same as the hundredth: the
# on-disk database size (indexes and bloat included) is always more than its compressed -Fc dump,
# and the photos are already-compressed images, so their tarball is no bigger than the directory.
db_bytes=$(psql "$DATABASE_URL" -XAtc "SELECT pg_database_size(current_database())")
upload_bytes=$(du -sb "$UPLOAD_DIR" | cut -f1)
estimate=$((db_bytes + upload_bytes))
needed=$((estimate + RESERVE_BYTES))
available=$(df --output=avail -B1 "$BACKUP_DIR" | tail -n 1 | tr -d ' ')

# A value that didn't parse must stop the run, not pass the guard: `[ "" -lt N ]` is an error
# (status 2), which an `if` reads as false — the check below would wave the backup through.
for measured in "db_bytes=$db_bytes" "upload_bytes=$upload_bytes" "available=$available"; do
  if ! [[ "${measured#*=}" =~ ^[0-9]+$ ]]; then
    echo "backup: could not measure ${measured%%=*} (got '${measured#*=}') — refusing" >&2
    write_stamp last-refusal "$(now_utc) refused: could not measure ${measured%%=*}"
    exit 1
  fi
done

if [ "$available" -lt "$needed" ]; then
  msg="$(now_utc) refused: low disk — $(human "$available") free, $(human "$needed") needed"
  msg+=" (set estimate $(human "$estimate") + $(human "$RESERVE_BYTES") reserve for Postgres)"
  echo "backup: $msg" >&2
  echo "backup: nothing was written or pruned. See docs/server-setup.md §17, 'Disk space'." >&2
  write_stamp last-refusal "$msg"
  exit 1
fi

# --- 1–3. Dump, photos, checksums ------------------------------------------------------------
SET="circlebite-$(date -u +%Y%m%dT%H%M%SZ)"
DUMP="$SET.dump"
TARBALL="$SET.uploads.tar.gz"
MISSING="$SET.missing-photos"
SUMS="$SET.sha256"
cd "$BACKUP_DIR"

# Names have one-second resolution. A second run in the same second (by hand, right after the
# timer's) would otherwise overwrite a complete set file by file, mixing two runs into one set.
if compgen -G "$SET.*" > /dev/null; then
  echo "backup: a set named $SET already exists — refusing to overwrite it; rerun in a second" >&2
  exit 1
fi

# Anything still named .partial when this script exits is from a failed step — never a backup.
trap 'rm -f -- "${BACKUP_DIR:?}/${SET:?}".*.partial' EXIT
trap 'exit 130' INT    # route signals through the EXIT trap explicitly (see restore-test.sh)
trap 'exit 143' TERM

# The connection URL is visible in `ps` while pg_dump runs. On this single-user box the only other
# accounts that could read it are root and postgres, which already have more access than it grants.
pg_dump --format=custom --dbname="$DATABASE_URL" --file="$DUMP.partial"
pg_restore --list "$DUMP.partial" > /dev/null   # readable archive with a table of contents
mv "$DUMP.partial" "$DUMP"

# Correction photos referenced by a row but already gone from the live box. §8's lost-photos
# incident means some may be, for reasons unrelated to backups. Recording them here lets the restore
# test fail only on photos missing *beyond* what was already missing, instead of failing every week
# on history. Best effort: if this query ever breaks (schema change), the set is still written
# without the list, and the restore test falls back to requiring every photo — loud, not silent.
if photo_paths=$(psql "$DATABASE_URL" -XAtc \
    "SELECT DISTINCT photo_path FROM product_corrections ORDER BY photo_path"); then
  while IFS= read -r p; do
    [ -z "$p" ] || [ -f "$UPLOAD_DIR/$p" ] || printf '%s\n' "$p"
  done <<< "$photo_paths" > "$MISSING.partial"
  mv "$MISSING.partial" "$MISSING"
else
  echo "backup: WARNING — could not list correction photo paths; set has no $MISSING" >&2
fi

# GNU tar exits 1 when a file changed while being read (an upload landing mid-backup). That photo
# may be partial in this set, but the rest of the set is good — failing the whole backup over it
# would be worse. Anything above 1 is a real failure.
tar_status=0
tar -czf "$TARBALL.partial" -C "$UPLOAD_DIR" . || tar_status=$?
if [ "$tar_status" -gt 1 ]; then
  echo "backup: tar failed with status $tar_status" >&2
  exit "$tar_status"
elif [ "$tar_status" -eq 1 ]; then
  echo "backup: WARNING — a photo changed while being archived; set kept" >&2
fi
mv "$TARBALL.partial" "$TARBALL"

set_files=("$DUMP" "$TARBALL")
[ -f "$MISSING" ] && set_files+=("$MISSING")
sha256sum -- "${set_files[@]}" > "$SUMS.partial"
mv "$SUMS.partial" "$SUMS"
set_files+=("$SUMS")

# --- 4. The local half is done ---------------------------------------------------------------
write_stamp last-local-success \
  "$(now_utc) $SET dump=$(human "$(stat -c %s "$DUMP")") photos=$(human "$(stat -c %s "$TARBALL")")"
echo "backup: local set written: $SET"

# --- 5. Local retention ----------------------------------------------------------------------
# Keep the $KEEP_SETS newest *complete* sets (a .sha256 exists only once everything else was
# written). Count, not age: if the timer stalls for a fortnight, the last good sets are still here.
# Names sort chronologically (UTC stamp), so this doesn't depend on mtimes. Runs before the S3 step
# so an S3 outage doesn't stop local rotation.
shopt -s nullglob
kept=0
for set in $(for f in circlebite-*; do echo "${f%%.*}"; done | sort -ru); do
  if [ -f "$set.sha256" ] && [ "$kept" -lt "$KEEP_SETS" ]; then
    kept=$((kept + 1))
  else
    rm -f -- "${set:?}".*
  fi
done
shopt -u nullglob

# --- 6. Off-box copy -------------------------------------------------------------------------
# Credentials come from the instance's IAM role — there are no access keys anywhere. That role may
# only s3:PutObject under this prefix: no delete, no read. Expiry is the bucket's lifecycle rule,
# and versioning keeps an overwritten object recoverable (§17).
for f in "${set_files[@]}"; do
  if ! aws s3 cp --region "$S3_REGION" --only-show-errors --no-progress \
      "$f" "s3://$BACKUP_S3_BUCKET/$S3_PREFIX/$SET/$f"; then
    echo "backup: S3 copy of $f FAILED. The local set is good; the off-box copy is not." >&2
    exit 1
  fi
done

write_stamp last-offsite-success "$(now_utc) $SET s3://$BACKUP_S3_BUCKET/$S3_PREFIX/$SET/"
echo "backup: copied to s3://$BACKUP_S3_BUCKET/$S3_PREFIX/$SET/"
