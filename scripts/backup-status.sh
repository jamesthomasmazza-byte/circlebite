#!/usr/bin/env bash
# Is the newest backup older than it should be? One line per half, then what's broken — this app
# has nowhere to send an alert, so a backup that quietly stops is only caught by someone asking.
#   ssh -i ~/.ssh/circlebite-prod.pem ubuntu@circlebite.app ~/circlebite/current/scripts/backup-status.sh
# Exits nonzero if anything is stale or missing.
#
# READ-ONLY, and must stay that way: docs/server-setup.md §17 offers linking this into
# /etc/update-motd.d, where it runs as root on every interactive login.
set -uo pipefail

# Absolute, not $HOME: under update-motd this runs as root. Overridable only for testing elsewhere —
# this script never writes, so pointing it somewhere else can't do harm.
BACKUP_DIR="${CIRCLEBITE_BACKUP_DIR:-/home/ubuntu/circlebite/backups}"
DAY=86400
now=$(date +%s)
status=0

age_of() { [ -f "$BACKUP_DIR/$1" ] && echo $((now - $(stat -c %Y "$BACKUP_DIR/$1"))); }

human_age() {
  local s=$1
  if [ "$s" -lt 7200 ]; then echo "$((s / 60))m ago"
  elif [ "$s" -lt $((2 * DAY)) ]; then echo "$((s / 3600))h ago"
  else echo "$((s / DAY))d ago"; fi
}

# check <label> <stamp file> <max age in seconds>; prints the line, returns 1 if stale/missing
check() {
  local age
  age=$(age_of "$2")
  if [ -z "$age" ]; then
    printf 'backups: %-8s MISSING  no %s yet\n' "$1" "$2"
    return 1
  fi
  if [ "$age" -gt "$3" ]; then
    printf 'backups: %-8s STALE    %-8s %s\n' "$1" "$(human_age "$age")" "$(cat "$BACKUP_DIR/$2")"
    return 1
  fi
  printf 'backups: %-8s OK       %-8s %s\n' "$1" "$(human_age "$age")" "$(cat "$BACKUP_DIR/$2")"
}

# Nightly job, so one day plus two hours of slack; the restore test is weekly, plus one day.
check local   last-local-success   $((DAY + 7200));  local_ok=$?
check offsite last-offsite-success $((DAY + 7200));  offsite_ok=$?
check restore last-restore-test    $((8 * DAY));     restore_ok=$?

refusal_age=$(age_of last-refusal)
local_age=$(age_of last-local-success)
if [ "$local_ok" -ne 0 ] && [ -n "$refusal_age" ] \
    && { [ -z "$local_age" ] || [ "$refusal_age" -lt "$local_age" ]; }; then
  echo "backups: REFUSED — $(cat "$BACKUP_DIR/last-refusal")"
  echo "backups: the disk is too full to back up safely. See docs/server-setup.md §17, 'Disk space'."
  status=1
elif [ "$local_ok" -ne 0 ]; then
  echo "backups: NO RECENT LOCAL BACKUP — the job isn't running or the dump is failing."
  echo "backups: check: systemctl list-timers 'circlebite-*'; journalctl -u circlebite-backup -n 50"
  status=1
elif [ "$offsite_ok" -ne 0 ]; then
  echo "backups: local backups exist; the S3 copy is failing — there is no recent off-box copy."
  echo "backups: check: journalctl -u circlebite-backup -n 50, and the instance's IAM role (§17)."
  status=1
fi

if [ "$restore_ok" -ne 0 ] && [ ! -f "$BACKUP_DIR/last-restore-test" ]; then
  echo "backups: no restore test has ever passed — no backup has been proven restorable."
  echo "backups: run: sudo systemctl start circlebite-restore-test"
  status=1
elif [ "$restore_ok" -ne 0 ]; then
  echo "backups: no backup has been proven restorable in over a week."
  echo "backups: check: journalctl -u circlebite-restore-test -n 80"
  status=1
fi

exit "$status"
