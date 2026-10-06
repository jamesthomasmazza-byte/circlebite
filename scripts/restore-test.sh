#!/usr/bin/env bash
# Proves the newest backup set is restorable: restores its dump into a scratch database, checks
# that what came back is real (rows in the tables that matter, the migration history, every
# correction photo), then drops the scratch database. Run weekly by circlebite-restore-test.timer
# (docs/server-setup.md §17); safe to run by hand. Writes ~/circlebite/backups/last-restore-test
# only when every check passes.
#
# This is the one backup script that drops a database, so it is built to be incapable of touching
# the production one. Five independent layers — the last is enforced by Postgres, not this file:
#
#   1. The scratch name is generated here and must match ^circlebite_restoretest_[0-9]{14}$. There
#      is no argument or environment variable that can set it.
#   2. It must differ from the production database's name (read from DATABASE_URL as a string —
#      this script never connects with DATABASE_URL) and from circlebite/postgres/template0/1.
#   3. Plain CREATE DATABASE fails if the name exists, and the cleanup that drops it is armed only
#      after that CREATE succeeds — it can only ever drop the database this run created.
#   4. pg_restore is never given --create or --clean. Both act on the database named *inside the
#      dump*, which is production; --clean --create would drop it. Restore targets the scratch
#      database by name, explicitly.
#   5. Everything runs as the circlebite_restoretest role: CREATEDB, not a superuser, not a member
#      of the production database's owner. Postgres lets only an owner drop a database, so even a
#      bug in 1–4 gets "must be owner of database circlebite". Checked at runtime below, not
#      assumed.
set -euo pipefail
umask 077

CIRCLEBITE_HOME="$HOME/circlebite"
ENV_FILE="$CIRCLEBITE_HOME/.env"
BACKUP_DIR="$CIRCLEBITE_HOME/backups"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$REPO_DIR/server/src/db/migrations"
RESTORE_ROLE="circlebite_restoretest"
PG_HOST="localhost"
PG_PORT="5432"

# Same loading as backup.sh: plain source for the quoting rules in §6, nothing exported.
# shellcheck disable=SC1090
source "$ENV_FILE"

for var in DATABASE_URL RESTORE_TEST_DB_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "restore-test: $var is not set in $ENV_FILE — see docs/server-setup.md §17" >&2
    exit 1
  fi
done

refuse() {
  echo "restore-test: REFUSING — $1" >&2
  exit 1
}

# Layer 2's input: the database name from the URL's path, query string stripped. A string
# operation only — DATABASE_URL is never used to connect from this script.
PROD_DB="${DATABASE_URL##*/}"
PROD_DB="${PROD_DB%%\?*}"
[ -n "$PROD_DB" ] || refuse "could not read the production database name from DATABASE_URL"

SCRATCH_DB="circlebite_restoretest_$(date -u +%Y%m%d%H%M%S)"

# Layers 1 and 2. Called again immediately before the drop, so nothing between here and there can
# have changed what gets dropped.
assert_scratch_name() {
  [[ "$SCRATCH_DB" =~ ^circlebite_restoretest_[0-9]{14}$ ]] \
    || refuse "scratch name '$SCRATCH_DB' does not match the generated pattern"
  local forbidden
  for forbidden in "$PROD_DB" circlebite postgres template0 template1; do
    [ "$SCRATCH_DB" != "$forbidden" ] || refuse "scratch name '$SCRATCH_DB' is '$forbidden'"
  done
}
assert_scratch_name

# Every connection goes through these, as the restore role, to an explicit database name.
rt_psql() {
  PGPASSWORD="$RESTORE_TEST_DB_PASSWORD" psql -X -q -v ON_ERROR_STOP=1 \
    -h "$PG_HOST" -p "$PG_PORT" -U "$RESTORE_ROLE" "$@"
}
scratch_query() { rt_psql -d "$SCRATCH_DB" -At -c "$1"; }

# Layer 5, checked rather than assumed: a superuser, or a member of the production owner's role,
# would make "must be owner" stop protecting anything.
role_check=$(rt_psql -d postgres -At -c "
  SELECT r.rolsuper, COALESCE(pg_has_role(current_user, d.datdba, 'MEMBER'), false)
  FROM pg_roles r LEFT JOIN pg_database d ON d.datname = '$PROD_DB'
  WHERE r.rolname = current_user")
[ "$role_check" = "f|f" ] || refuse "$RESTORE_ROLE must not be a superuser or a member of the \
production database's owner (got '$role_check'). See docs/server-setup.md §17."

# Same lock as backup.sh, so the set can't be pruned out from under the restore. 30 min, well inside
# the unit's 2h TimeoutStartSec.
exec 9> "$BACKUP_DIR/.lock"
if ! flock -w 1800 9; then
  echo "restore-test: a backup or restore test has held the lock for 30 min — giving up" >&2
  exit 1
fi

# Scratch databases left by a run that was hard-killed (SIGKILL, power loss) before its trap could
# drop them. Each run's name is unique, so a leftover never blocks the next run — it just sits there
# holding a full copy of production that nobody looks at. Dropping them here is safe because:
#   - the match is the same pattern that governs creation (layer 1), checked again per name;
#   - only databases this role owns are listed — and this role owns nothing but its own scratch
#     databases (layer 5: not production's owner, so Postgres would refuse anyway);
#   - holding the lock means no other run's scratch database is in use right now.
# List them by hand: see docs/server-setup.md §17.
while IFS= read -r stale; do
  [[ "$stale" =~ ^circlebite_restoretest_[0-9]{14}$ ]] || continue
  [ "$stale" != "$PROD_DB" ] || continue
  echo "restore-test: dropping leftover $stale from an interrupted run"
  rt_psql -d postgres -c "DROP DATABASE IF EXISTS \"$stale\" WITH (FORCE)"
done < <(rt_psql -d postgres -At -c "SELECT datname FROM pg_database
  WHERE datname LIKE 'circlebite\_restoretest\_%' AND pg_get_userbyid(datdba) = current_user")

# Newest *complete* set: a .sha256 is written only after everything else in the set.
shopt -s nullglob
sums=("$BACKUP_DIR"/circlebite-*.sha256)
shopt -u nullglob
[ "${#sums[@]}" -gt 0 ] || { echo "restore-test: no complete backup set in $BACKUP_DIR" >&2; exit 1; }
SET=$(printf '%s\n' "${sums[@]}" | sort | tail -n 1)
SET=$(basename "$SET" .sha256)
echo "restore-test: newest set $SET"

cd "$BACKUP_DIR"
sha256sum --check --quiet -- "$SET.sha256"
echo "restore-test: checksums match"

# Layer 3: no IF NOT EXISTS — an existing database of this name is an error, never adopted.
rt_psql -d postgres -c "CREATE DATABASE \"$SCRATCH_DB\""
LISTING=$(mktemp)
cleanup() {
  rm -f -- "${LISTING:?}"
  assert_scratch_name
  rt_psql -d postgres -c "DROP DATABASE IF EXISTS \"$SCRATCH_DB\" WITH (FORCE)" \
    && echo "restore-test: dropped $SCRATCH_DB"
}
trap cleanup EXIT
# bash already runs the EXIT trap when killed by SIGTERM (systemd's timeout or stop), but routing
# the signals into a normal exit makes that explicit rather than a property of the shell.
trap 'exit 130' INT
trap 'exit 143' TERM

# Layer 4: --dbname is the scratch database, never --create, never --clean. --no-owner/--no-acl
# because the restore role isn't the production owner and those grants don't exist for it.
PGPASSWORD="$RESTORE_TEST_DB_PASSWORD" pg_restore \
  --no-owner --no-acl --exit-on-error --single-transaction \
  -h "$PG_HOST" -p "$PG_PORT" -U "$RESTORE_ROLE" --dbname="$SCRATCH_DB" "$SET.dump"
echo "restore-test: restored into $SCRATCH_DB"

failures=()

# --- Migration history -----------------------------------------------------------------------
# Compared by prefix, not equality. A deploy that lands between the nightly dump and this test
# legitimately leaves the dump a few migrations behind the checkout — that's reported, not failed,
# because a safety check that cries wolf gets ignored the one time it matters.
mapfile -t restored < <(scratch_query \
  "SELECT filename FROM schema_migrations ORDER BY filename COLLATE \"C\"")
mapfile -t checkout < <(cd "$MIGRATIONS_DIR" && printf '%s\n' *.sql | LC_ALL=C sort)
migration_note=""

if [ "${#restored[@]}" -eq 0 ]; then
  failures+=("schema_migrations is empty — the dump has no schema history")
else
  unknown=()
  for r in "${restored[@]}"; do
    printf '%s\n' "${checkout[@]}" | grep -Fxq -- "$r" || unknown+=("$r")
  done
  if [ "${#unknown[@]}" -gt 0 ]; then
    failures+=("dump has migrations this checkout ($REPO_DIR) doesn't: ${unknown[*]}. \
Either the dump is from newer code than this checkout, or production was rolled back and is \
running against a newer schema than its code.")
  else
    for i in "${!restored[@]}"; do
      if [ "${restored[$i]}" != "${checkout[$i]}" ]; then
        failures+=("migration history has a gap: dump has ${restored[$i]} where the checkout's \
sequence has ${checkout[$i]} — a migration was applied out of order")
        break
      fi
    done
    pending=("${checkout[@]:${#restored[@]}}")
    if [ "${#pending[@]}" -eq 0 ]; then
      migration_note="schema current (${#restored[@]} migrations)"
    else
      migration_note="dump predates ${#pending[@]} migration(s): ${pending[*]} — expected if a"
      migration_note+=" deploy landed after the dump"
    fi
  fi
fi

# --- Rows in the tables that matter ----------------------------------------------------------
# The judge seed guarantees every one of these is non-empty on production (§16).
echo
printf '  %-24s %s\n' table rows
for t in users allergen_profiles allergens profile_managers follow_relationships scans \
    product_corrections nps_responses; do
  n=$(scratch_query "SELECT count(*) FROM $t")
  printf '  %-24s %s\n' "$t" "$n"
  [ "$n" -gt 0 ] || failures+=("$t is empty")
done
demo=$(scratch_query "SELECT count(*) FROM users WHERE email LIKE '%@demo.circlebite.test'")
printf '  %-24s %s\n' "judge-seed users" "$demo"
[ "$demo" -gt 0 ] || failures+=("no @demo.circlebite.test users — the judge seed didn't come back")
echo

# Foreign keys came back, not just rows: no scan points at a profile that isn't there.
orphans=$(scratch_query "SELECT count(*) FROM scans s
  LEFT JOIN allergen_profiles p ON p.id = s.allergen_profile_id WHERE p.id IS NULL")
[ "$orphans" -eq 0 ] || failures+=("$orphans scans reference a missing allergen profile")

# --- Every correction photo ------------------------------------------------------------------
# Each photo_path in the restored database must be in this set's tarball, unless it was already
# missing from the live box when the set was taken (backup.sh records those). Reading the whole
# listing also decompresses the whole archive, so a corrupt tarball fails here.
tar -tzf "$SET.uploads.tar.gz" | sed 's#^\./##' > "$LISTING"
already_missing=0
if [ -f "$SET.missing-photos" ]; then
  already_missing=$(grep -c . "$SET.missing-photos" || true)
else
  echo "restore-test: set has no .missing-photos list — requiring every photo"
fi
photos=0
present=0
lost=()
while IFS= read -r p; do
  [ -n "$p" ] || continue
  photos=$((photos + 1))
  if grep -Fxq -- "$p" "$LISTING"; then
    present=$((present + 1))
  elif ! { [ -f "$SET.missing-photos" ] && grep -Fxq -- "$p" "$SET.missing-photos"; }; then
    lost+=("$p")
  fi
done < <(scratch_query "SELECT DISTINCT photo_path FROM product_corrections ORDER BY photo_path")
if [ "${#lost[@]}" -gt 0 ]; then
  failures+=("${#lost[@]} correction photo(s) referenced by the dump are not in the tarball: \
${lost[*]:0:5}")
fi

# --- Verdict ---------------------------------------------------------------------------------
echo "  migrations: ${migration_note:-see failures}"
echo "  photos:     $photos referenced, $present in the tarball," \
  "$already_missing already missing on the live box when backed up"
if [ "$already_missing" -gt 0 ]; then
  echo "              (not a backup problem — listed in $BACKUP_DIR/$SET.missing-photos)"
fi
echo

if [ "${#failures[@]}" -gt 0 ]; then
  echo "restore-test: FAILED — $SET is not a trustworthy backup:" >&2
  for f in "${failures[@]}"; do echo "  - $f" >&2; done
  exit 1
fi

stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ) $SET passed; $migration_note"
printf '%s\n' "$stamp" > "$BACKUP_DIR/.last-restore-test.tmp"
mv -f "$BACKUP_DIR/.last-restore-test.tmp" "$BACKUP_DIR/last-restore-test"
echo "restore-test: PASSED — $SET restores and checks out"
