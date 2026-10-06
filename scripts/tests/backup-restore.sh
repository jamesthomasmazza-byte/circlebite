#!/usr/bin/env bash
# Tests for scripts/backup.sh, scripts/restore-test.sh and scripts/backup-status.sh, against a
# throwaway database on a LOCAL Postgres. Must pass before either script is changed — see
# docs/server-setup.md §17.
#
#   ./scripts/tests/backup-restore.sh
#
# Manual, not CI: there is no CI here, and this needs a real Postgres superuser. It is not run by
# anything automatically — it protects a change only if someone runs it.
#
# What it proves, most rot-prone first:
#   - a corrupted dump fails the restore test at the checksum
#   - a photo already missing on the live box at backup time passes (and is reported), while a
#     photo lost from the tarball afterwards fails
#   - every production-protection layer in restore-test.sh, including Postgres's own refusal
#   - the disk guard against real GNU df output, the S3-failure split, pruning, .partial cleanup,
#     migration drift, cleanup after SIGTERM, and what backup-status.sh says in each case
#
# Needs: local Postgres on localhost:5432 (the scripts hardcode it) where you are a superuser,
# node_modules installed (it runs the migrations and the judge seed), and GNU userland — Ubuntu
# has it; on macOS: brew install bash coreutils gnu-tar flock.
#
# Creates, and removes on exit: database circlebite_backuptest_prod, role circlebite_restoretest
# (only if it didn't already exist), and a temp directory. Never touches ~/circlebite.
#
# SC2016: check() assertions are single-quoted on purpose — they're eval'd when checked, not when
# written. SC1091: the sourced .env is generated at runtime.
# shellcheck disable=SC2016,SC1091
set -euo pipefail

# macOS ships bash 3.2; the scripts under test need bash 4+.
if [ "${BASH_VERSINFO[0]}" -lt 4 ]; then
  for b in /opt/homebrew/bin/bash /usr/local/bin/bash; do
    [ -x "$b" ] && exec "$b" "$0" "$@"
  done
  echo "harness: needs bash 4+ (macOS: brew install bash)" >&2
  exit 1
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SHIMS="$REPO/scripts/tests/shims"
TEST_DB="circlebite_backuptest_prod"
ROLE="circlebite_restoretest"

# This must never run on the production box: it creates and drops databases and roles.
if [ -e "$HOME/circlebite/current" ] || [ -e /etc/systemd/system/circlebite.service ]; then
  echo "harness: this looks like the production box — refusing. Run it on a dev machine." >&2
  exit 1
fi

# GNU userland: on macOS, put Homebrew's GNU tools first (not needed on Ubuntu).
if [ "$(uname)" = Darwin ] && command -v brew > /dev/null; then
  BREW="$(brew --prefix)"
  PATH="$BREW/opt/coreutils/libexec/gnubin:$BREW/opt/gnu-tar/libexec/gnubin:$BREW/bin:$PATH"
fi
df --output=avail -B1 / > /dev/null 2>&1 || { echo "harness: needs GNU df (coreutils)" >&2; exit 1; }
tar --version 2>/dev/null | grep -q GNU || { echo "harness: needs GNU tar" >&2; exit 1; }
command -v flock > /dev/null || { echo "harness: needs flock" >&2; exit 1; }

su_psql() { psql -X -q -v ON_ERROR_STOP=1 -h localhost -p 5432 -d postgres "$@"; }
su_psql -Atc "SELECT 1" > /dev/null || { echo "harness: can't reach Postgres on localhost:5432" >&2; exit 1; }
[ "$(su_psql -Atc "SELECT rolsuper FROM pg_roles WHERE rolname = current_user")" = t ] \
  || { echo "harness: needs a Postgres superuser (it creates a role and databases)" >&2; exit 1; }
DB_OWNER="$(su_psql -Atc "SELECT current_user")"

T="$(mktemp -d)"
BOX="${T:?}/home"                  # stands in for /home/ubuntu
B="${BOX:?}/circlebite/backups"
UPLOADS="${BOX:?}/circlebite/uploads"
OUT="${T:?}/out"
CREATED_ROLE=false

cleanup() {
  set +e
  su_psql -c "REVOKE \"$DB_OWNER\" FROM $ROLE" 2> /dev/null
  for db in $(su_psql -Atc "SELECT datname FROM pg_database
                WHERE datname LIKE 'circlebite\_restoretest\_%' OR datname = '$TEST_DB'"); do
    su_psql -c "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)"
  done
  [ "$CREATED_ROLE" = true ] && su_psql -c "DROP ROLE IF EXISTS $ROLE"
  rm -rf -- "${T:?}"
}
trap cleanup EXIT

# --- Setup: a seeded throwaway "production" ----------------------------------------------------
echo "setup: $TEST_DB, migrated and judge-seeded"
su_psql -c "DROP DATABASE IF EXISTS $TEST_DB WITH (FORCE)" -c "CREATE DATABASE $TEST_DB"
if [ -z "$(su_psql -Atc "SELECT 1 FROM pg_roles WHERE rolname = '$ROLE'")" ]; then
  su_psql -c "CREATE ROLE $ROLE LOGIN CREATEDB"
  CREATED_ROLE=true
fi
RT_PW="$(openssl rand -hex 24)"
su_psql -c "ALTER ROLE $ROLE PASSWORD '$RT_PW'"

mkdir -p "${UPLOADS:?}"
# OFF_USER_AGENT is quoted with spaces on purpose — §6's sourcing rule, exercised.
cat > "${BOX:?}/circlebite/.env" <<EOF
DATABASE_URL=postgresql://localhost:5432/$TEST_DB
SESSION_SECRET=$(openssl rand -hex 32)
OFF_USER_AGENT="CircleBite-Harness/1.0 (backup tests)"
UPLOAD_DIR=$UPLOADS
NODE_ENV=development
BACKUP_S3_BUCKET=harness-bucket
RESTORE_TEST_DB_PASSWORD=$RT_PW
EOF
(
  cd "$REPO/server"
  set -a; source "${BOX:?}/circlebite/.env"; set +a
  npx tsx src/db/migrate.ts > /dev/null
  JUDGE_PASSWORD="$(openssl rand -hex 12)" npx tsx src/db/seedJudge.ts > /dev/null
)
PHOTO_REL="$(su_psql -d "$TEST_DB" -Atc "SELECT photo_path FROM product_corrections LIMIT 1")"
PHOTO="${UPLOADS:?}/${PHOTO_REL:?seed wrote no correction photo}"
[ -f "$PHOTO" ] || { echo "harness: seeded photo $PHOTO missing" >&2; exit 1; }

# Everything below runs the scripts as the box would: HOME is the fake /home/ubuntu, shims first.
export HOME="$BOX" SHIM_S3_DIR="${T:?}/s3" CIRCLEBITE_BACKUP_DIR="$B" CIRCLEBITE_TEST_SHIMS=1
export SHIM_REAL_PATH="$PATH"
export PATH="$SHIMS:$PATH"

# --- Assertions --------------------------------------------------------------------------------
passed=0
failed=()
ok()  { passed=$((passed + 1)); echo "  ok    $1"; }
bad() { failed+=("$1"); echo "  FAIL  $1"; sed 's/^/        | /' "$OUT"; }
# expect <name> <0|nonzero> <regex or ''> <command...>
expect() {
  local name=$1 want=$2 pattern=$3 rc=0
  shift 3
  "$@" > "$OUT" 2>&1 || rc=$?
  if [ "$want" = 0 ] && [ "$rc" -ne 0 ]; then bad "$name (exit $rc, expected success)"
  elif [ "$want" != 0 ] && [ "$rc" -eq 0 ]; then bad "$name (exited 0, expected failure)"
  elif [ -n "$pattern" ] && ! grep -qE -- "$pattern" "$OUT"; then bad "$name (output lacks /$pattern/)"
  else ok "$name"; fi
}
check() { if eval "$2"; then ok "$1"; else : > "$OUT"; bad "$1"; fi; }

newest_set() {
  local s
  s="$(find "${B:?}" -maxdepth 1 -name 'circlebite-*.sha256' | sort | tail -n 1)"
  s="$(basename "${s:?no complete set in $B}" .sha256)"
  echo "${s:?}"
}
fresh_backup() { sleep 1; "$REPO/scripts/backup.sh"; }   # set names have one-second resolution
scratch_dbs() {
  su_psql -Atc "SELECT datname FROM pg_database WHERE datname LIKE 'circlebite\_restoretest\_%'"
}
age_stamp() { touch -d "$2" "${B:?}/${1:?}"; }

echo
echo "backup.sh"
expect "happy path writes a set and copies it to S3" 0 "copied to s3://" "$REPO/scripts/backup.sh"
SET="$(newest_set)"
check "set files are mode 600" \
  '[ -z "$(find "${B:?}" -maxdepth 1 -name "${SET:?}.*" ! -perm 600)" ]'
check "backups dir is mode 700" '[ "$(stat -c %a "${B:?}")" = 700 ]'
check "all four set files reached the S3 shim" \
  '[ "$(find "${SHIM_S3_DIR:?}/harness-bucket/circlebite/${SET:?}" -type f | wc -l)" -eq 4 ]'
check "missing-photos list is empty when every photo exists" '[ ! -s "${B:?}/${SET:?}.missing-photos" ]'

sed 's/^RESERVE_BYTES=.*/RESERVE_BYTES=$((1024 ** 5))/' "$REPO/scripts/backup.sh" > "${T:?}/backup-1PiB.sh"
chmod +x "${T:?}/backup-1PiB.sh"
expect "disk guard trips on REAL GNU df output (reserve raised to 1 PiB in a scratch copy)" \
  nonzero "refused: low disk" "${T:?}/backup-1PiB.sh"
check "refusal wrote last-refusal and nothing else new" \
  'grep -q "refused: low disk" "${B:?}/last-refusal" && [ "$(newest_set)" = "${SET:?}" ]'
expect "unparseable df output refuses instead of passing the guard" \
  nonzero "could not measure available" env DF_SHIM_AVAIL=garbage "$REPO/scripts/backup.sh"

sleep 1
expect "S3 failure fails the run but keeps the local set" \
  nonzero "S3 copy of .* FAILED" env AWS_SHIM_MODE=fail "$REPO/scripts/backup.sh"
check "S3 failure: last-local-success advanced, last-offsite-success did not" \
  '[ "${B:?}/last-local-success" -nt "${B:?}/last-offsite-success" ]'

touch "${B:?}/circlebite-20000101T000000Z.dump.partial"
for _ in 1 2 3 4 5 6 7 8; do fresh_backup > /dev/null; done
check "pruning keeps exactly 7 complete sets" \
  '[ "$(find "${B:?}" -maxdepth 1 -name "circlebite-*.sha256" | wc -l)" -eq 7 ]'
check "leftover .partial from a killed run is removed" \
  '[ -z "$(find "${B:?}" -maxdepth 1 -name "*.partial")" ]'

echo
echo "restore-test.sh"
expect "happy path restores and passes" 0 "PASSED" "$REPO/scripts/restore-test.sh"
check "no scratch database left behind" '[ -z "$(scratch_dbs)" ]'

SET="$(newest_set)"
cp -- "${B:?}/${SET:?}.dump" "${T:?}/dump.bak"
printf 'X' | dd of="${B:?}/${SET:?}.dump" bs=1 seek=2000 conv=notrunc 2> /dev/null
expect "corrupted dump fails at the checksum" nonzero "did NOT match" "$REPO/scripts/restore-test.sh"
cp -- "${T:?}/dump.bak" "${B:?}/${SET:?}.dump"

mv -- "${PHOTO:?}" "${T:?}/photo.bak"
fresh_backup > /dev/null
check "photo absent at backup time is recorded in .missing-photos" \
  'grep -Fxq -- "${PHOTO_REL:?}" "${B:?}/$(newest_set).missing-photos"'
expect "photo absent at backup time: restore PASSES and reports it" \
  0 "1 already missing on the live box" "$REPO/scripts/restore-test.sh"
mv -- "${T:?}/photo.bak" "${PHOTO:?}"

fresh_backup > /dev/null
SET="$(newest_set)"
X="${T:?}/untar"
mkdir -p "${X:?}"
tar -xzf "${B:?}/${SET:?}.uploads.tar.gz" -C "${X:?}"
rm -- "${X:?}/${PHOTO_REL:?}"
tar -czf "${B:?}/${SET:?}.uploads.tar.gz" -C "${X:?}" .
# checksums regenerated so this reaches the photo check rather than stopping at the checksum
(cd "${B:?}" && sha256sum "${SET:?}.dump" "${SET:?}.uploads.tar.gz" "${SET:?}.missing-photos" \
  > "${SET:?}.sha256")
expect "photo present at backup, lost from the tarball: restore FAILS" \
  nonzero "not in the tarball: ${PHOTO_REL:?}" "$REPO/scripts/restore-test.sh"
rm -f -- "${B:?}/${SET:?}.dump" "${B:?}/${SET:?}.uploads.tar.gz" \
  "${B:?}/${SET:?}.missing-photos" "${B:?}/${SET:?}.sha256"

echo
echo "restore-test.sh — production-protection layers"
expect "layer 5: the restore role cannot drop the production database" \
  nonzero "must be owner of database $TEST_DB" \
  env PGPASSWORD="$RT_PW" psql -X -h localhost -p 5432 -U "$ROLE" -d postgres -c "DROP DATABASE $TEST_DB"

su_psql -c "GRANT \"$DB_OWNER\" TO $ROLE"
expect "layer 5 runtime check: refuses if the role can act as production's owner" \
  nonzero "REFUSING — $ROLE must not be" "$REPO/scripts/restore-test.sh"
su_psql -c "REVOKE \"$DB_OWNER\" FROM $ROLE"

cp -- "${BOX:?}/circlebite/.env" "${T:?}/env.bak"
# sed to a new file rather than sed -i, whose flags differ between GNU and BSD sed
sed "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://localhost:5432/circlebite_restoretest_20991231235959?sslmode=disable#" \
  "${T:?}/env.bak" > "${BOX:?}/circlebite/.env"
expect "layer 2: refuses when the generated name equals the production name" \
  nonzero "REFUSING — scratch name" env DATE_SHIM=20991231235959 "$REPO/scripts/restore-test.sh"
cp -- "${T:?}/env.bak" "${BOX:?}/circlebite/.env"

env PGPASSWORD="$RT_PW" psql -X -q -h localhost -p 5432 -U "$ROLE" -d postgres \
  -c "CREATE DATABASE circlebite_restoretest_20000101000000"
su_psql -c "CREATE DATABASE circlebite_restoretest_20000101000001"
expect "leftover scratch database owned by the role is dropped" \
  0 "dropping leftover circlebite_restoretest_20000101000000" "$REPO/scripts/restore-test.sh"
check "same-pattern database NOT owned by the role survives" \
  '[ "$(scratch_dbs)" = circlebite_restoretest_20000101000001 ]'
su_psql -c "DROP DATABASE circlebite_restoretest_20000101000001"

PGR_PID=""
PG_RESTORE_SHIM_SLEEP=20 "$REPO/scripts/restore-test.sh" > "$OUT" 2>&1 &
PGR_PID=$!
for _ in $(seq 1 50); do [ -n "$(scratch_dbs)" ] && break; sleep 0.2; done
# systemd stops a unit by signalling its whole cgroup; the nearest equivalent here is the script
# and its children.
pkill -TERM -P "$PGR_PID" 2> /dev/null || true
kill -TERM "$PGR_PID" 2> /dev/null || true
wait "$PGR_PID" 2> /dev/null || true
check "SIGTERM mid-restore still drops the scratch database" '[ -z "$(scratch_dbs)" ]'

echo
echo "restore-test.sh — migration drift (a copy of the checkout with its migrations altered)"
FAKE="${T:?}/checkout"
mkdir -p "${FAKE:?}/scripts" "${FAKE:?}/server/src/db"
cp -- "$REPO/scripts/restore-test.sh" "${FAKE:?}/scripts/"
fake_migrations() {
  rm -rf -- "${FAKE:?}/server/src/db/migrations"
  cp -R -- "$REPO/server/src/db/migrations" "${FAKE:?}/server/src/db/migrations"
}
NEWEST_MIGRATION="$(cd "$REPO/server/src/db/migrations" && printf '%s\n' *.sql | LC_ALL=C sort | tail -n 1)"

fake_migrations; touch "${FAKE:?}/server/src/db/migrations/9999_harness_future.sql"
expect "dump behind the checkout (deploy after dump) PASSES and says so" \
  0 "dump predates 1 migration\(s\): 9999_harness_future.sql" "${FAKE:?}/scripts/restore-test.sh"
fake_migrations; rm -- "${FAKE:?}/server/src/db/migrations/${NEWEST_MIGRATION:?}"
expect "dump has a migration the checkout lacks: FAILS" \
  nonzero "migrations this checkout .* doesn't: ${NEWEST_MIGRATION}" "${FAKE:?}/scripts/restore-test.sh"
fake_migrations; touch "${FAKE:?}/server/src/db/migrations/0001a_harness_gap.sql"
expect "gap in the migration sequence: FAILS" \
  nonzero "migration history has a gap" "${FAKE:?}/scripts/restore-test.sh"

echo
echo "backup-status.sh"
fresh_backup > /dev/null
"$REPO/scripts/restore-test.sh" > /dev/null
expect "all fresh: OK and exit 0" 0 "local +OK" "$REPO/scripts/backup-status.sh"
age_stamp last-offsite-success "2 days ago"
expect "offsite stale: names the S3 half as broken" \
  nonzero "local backups exist; the S3 copy is failing" "$REPO/scripts/backup-status.sh"
age_stamp last-local-success "2 days ago"
env DF_SHIM_AVAIL=1 "$REPO/scripts/backup.sh" > /dev/null 2>&1 || true
expect "local stale after a disk refusal: says REFUSED" nonzero "REFUSED — .*low disk" \
  "$REPO/scripts/backup-status.sh"
age_stamp last-refusal "3 days ago"
expect "local stale with no newer refusal: says the job isn't running" \
  nonzero "NO RECENT LOCAL BACKUP" "$REPO/scripts/backup-status.sh"
age_stamp last-restore-test "9 days ago"
expect "restore test stale: says so" nonzero "proven restorable in over a week" \
  "$REPO/scripts/backup-status.sh"
rm -f -- "${B:?}/last-restore-test"
expect "restore test never run: says so" nonzero "no restore test has ever passed" \
  "$REPO/scripts/backup-status.sh"

echo
if [ "${#failed[@]}" -gt 0 ]; then
  echo "harness: ${#failed[@]} FAILED, $passed passed:"
  printf '  - %s\n' "${failed[@]}"
  exit 1
fi
echo "harness: all $passed passed"
