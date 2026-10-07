# Server setup runbook

How the production box was built, exactly. If the instance is ever lost or broken, this rebuilds it
from nothing in about fifteen minutes.

Satisfies `CONTEST_RULES.md` R5 (own server on AWS Free Tier) and R6 (no hosted backend services) —
web server, application runtime, and PostgreSQL all run on this one instance.

**Never put real passwords or keys in this file.** Every command below generates its own.

---

## 1. The instance

| Setting | Value |
|---------|-------|
| Region | us-east-2 (Ohio) — everything stays in this region |
| Name | `circlebite-prod` |
| AMI | Ubuntu Server 24.04 LTS, 64-bit x86 |
| Instance type | t3.micro (2 vCPU, 1 GiB RAM) |
| Storage | 30 GiB gp3 |
| Key pair | `circlebite-prod.pem`, RSA — stored at `~/.ssh/` on the Mac, `chmod 400`, **not recoverable if lost** |
| Elastic IP | allocated and associated, so the address survives reboots |

Security group (`launch-wizard-1`):

| Port | Source | Why |
|------|--------|-----|
| 22 (SSH) | My IP only | Home IP changes — re-set this rule when SSH starts timing out |
| 80 (HTTP) | 0.0.0.0/0 | Public site |
| 443 (HTTPS) | 0.0.0.0/0 | Public site |

Billing: zero-spend budget alert created before provisioning anything.

## 2. Connect

```bash
chmod 400 ~/.ssh/circlebite-prod.pem       # once, on the Mac
ssh -i ~/.ssh/circlebite-prod.pem ubuntu@<ELASTIC_IP>
```

Login user is `ubuntu` (not `ec2-user` — that's Amazon Linux).

If SSH hangs rather than prompting, the cause is almost always a stale "My IP" in the security group.

## 3. Swap — do this first

1 GiB of RAM is not enough to run a Node production build. Without swap the build is killed by the
OOM reaper and the error looks like a code problem.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

`free -h` must show `2.0Gi` in the Swap row. The `/etc/fstab` line is what makes it survive a reboot;
without it the swap silently disappears on the next restart.

## 4. Install the stack

```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx postgresql postgresql-contrib git
node -v && nginx -v && psql --version
```

Installed as of 2026-09-09: Node v22.23.2, nginx 1.24.0, PostgreSQL 16.15.

Reboot afterwards to pick up the new kernel, then confirm swap and services survived:

```bash
sudo reboot
# wait ~40s, reconnect
free -h
systemctl is-active nginx postgresql
```

## 5. Database

Generates a password, sets it, and writes the connection string to `.env` in one step — the password
is never displayed or copied by hand.

```bash
sudo -u postgres psql -c "CREATE USER circlebite;"
sudo -u postgres psql -c "CREATE DATABASE circlebite OWNER circlebite;"

PW=$(openssl rand -hex 24)
sudo -u postgres psql -c "ALTER USER circlebite WITH PASSWORD '$PW';"
mkdir -p ~/circlebite
printf 'DATABASE_URL=postgresql://circlebite:%s@localhost:5432/circlebite\n' "$PW" > ~/circlebite/.env
chmod 600 ~/circlebite/.env
unset PW
```

Verify:

```bash
psql "$(grep DATABASE_URL ~/circlebite/.env | cut -d= -f2-)" -c "SELECT current_user, current_database();"
```

Expected: `circlebite | circlebite`.

Use **hex**, not base64 — `/` and `+` need escaping inside a connection URL and produce confusing
failures later.

PostgreSQL listens on localhost only by default. Leave it that way; the app connects locally, and
nothing about this database should be reachable from the internet.

## 6. Where secrets live

`~/circlebite/.env` on the server, mode 600, owned by `ubuntu`. Nowhere else. It is never committed —
`.gitignore` blocks it and `scripts/check-secrets.sh` refuses the commit if it is ever staged.

Keys that live there now: `DATABASE_URL` (set when the database was created, §5),
`SESSION_SECRET` (generated on the box with `openssl rand -hex 32`, appended when the app was first
deployed, §7 below), `NODE_ENV=production` / `PORT=3000`, `OFF_USER_AGENT` (appended when the
scan feature deployed — Open Food Facts requires a descriptive user agent on every request),
`UPLOAD_DIR` (§8), `COMMUNITY_CORRECTIONS` (§11), `LABEL_SCAN`, the AI keys listed in
`.env.example`, and for backups (§17) `BACKUP_S3_BUCKET` — a name, not a secret, kept here so no
bucket name is ever in the repo — and `RESTORE_TEST_DB_PASSWORD`, generated on the box. `.env.example`
is the complete list.

`release.sh` loads this file with a plain bash `source`, not a key=value parser — a value with
spaces or special characters (like `OFF_USER_AGENT`'s `CircleBite-Prod/1.0 (email)` form) **must be
double-quoted** or the deploy fails at the sourcing step with a shell syntax error. The atomic deploy
design caught this the first time: the build ran fine, sourcing failed, and the currently running
release was left untouched — exactly what it's for.

To read it back: `cat ~/circlebite/.env`.

## 7. Deploy status

- [x] Domain purchased and DNS A record pointed at the Elastic IP
- [x] Let's Encrypt certificate via certbot, HTTPS working
- [x] nginx reverse proxy in front of the Node app on port 3000
- [x] systemd unit so the app restarts on reboot and on crash
- [x] Deploy path: pull from GitHub, build, migrate, restart — atomic, with a tested rollback

Live at [circlebite.app](https://circlebite.app), deployed 2026-09-10.

## 8. Deploying

Atomic, symlink-swap releases — a failed build or migration never reaches the running app, and a
revert is just re-pointing a symlink. Two scripts, both in `scripts/`:

- **`scripts/deploy.sh`** — installed once as `~/circlebite/deploy.sh` (see bootstrap below), rarely
  needs to change again. Clones `main` fresh into `~/circlebite/releases/<timestamp>/` and hands off
  to that release's own `scripts/release.sh`.
- **`scripts/release.sh`** — the real logic, always run from inside the fresh clone, so it's
  automatically the latest version every time: `npm install`, build both workspaces, run migrations
  via the compiled runner (`node server/dist/db/migrate.js`, not `tsx` — production doesn't depend on
  a dev tool working). Only if every step succeeds does it swap the `~/circlebite/current` symlink to
  the new release and `systemctl restart circlebite`, then polls `/health` to confirm the restart
  actually came up. Keeps the 5 most recent releases, prunes older ones.

**To deploy:** `ssh -i ~/.ssh/circlebite-prod.pem ubuntu@circlebite.app "~/circlebite/deploy.sh"`.

**One-time bootstrap** (already done; here for when the box is ever rebuilt from this file):

```bash
mkdir -p ~/circlebite/releases

# Correction photo storage — a sibling of releases/ and current/, never inside either. The app
# refuses to boot without UPLOAD_DIR set (server/src/env.ts, required() — no default), specifically
# because a prior default resolved inside the release tree and every correction photo was silently
# deleted on the next deploy. Create the directory and set the var in the same step so a rebuild
# from this runbook can't reproduce that gap by setting one without the other.
mkdir -p ~/circlebite/uploads
echo "UPLOAD_DIR=/home/ubuntu/circlebite/uploads" >> ~/circlebite/.env

# copy scripts/deploy.sh from the repo to ~/circlebite/deploy.sh, chmod +x

# generate the session secret on the box — never locally, never in the repo
{
  echo "SESSION_SECRET=$(openssl rand -hex 32)"
  echo "NODE_ENV=production"
  echo "PORT=3000"
} >> ~/circlebite/.env
chmod 600 ~/circlebite/.env

# copy scripts/circlebite.service from the repo to /etc/systemd/system/circlebite.service
sudo systemctl daemon-reload
sudo systemctl enable circlebite   # not started yet — `current` doesn't exist until the first deploy
```

Then run `~/circlebite/deploy.sh` once to create the first release, and switch nginx from the
placeholder to the reverse proxy (nginx config is `scripts/nginx-circlebite.conf` in the repo, as a
reference copy — the live file at `/etc/nginx/sites-available/circlebite.app` is the operative one;
see §9 for the backup this depends on).

`WorkingDirectory` in the systemd unit points at the `current` symlink, not a specific release, so
nothing about the unit needs to change on a normal deploy or a manual revert.

## 9. Rollback — two layers, for two different failure modes

**1. A bad deploy never goes live in the first place.** `scripts/release.sh`'s atomicity means a
failed install/build/migration leaves `current` and the running service completely untouched. If a
release somehow goes live but is unhealthy in a way its own post-restart health check didn't catch,
revert with:

```bash
ln -sfn <previous-release-dir> ~/circlebite/current && sudo systemctl restart circlebite
```

`<previous-release-dir>` is `ls -1dt ~/circlebite/releases/*/ | sed -n 2p` (second-newest — the
newest is the one being reverted away from).

**2. Node itself is down for any other reason** (crash loop, out-of-memory, database unreachable) —
the app-level revert above doesn't help without a healthy release to point at, or if the problem
isn't in the app at all. This is what the nginx-level fallback is for: it serves the static
placeholder regardless of what's wrong with Node or the database. A backup of the pre-Node config is
kept on the box at a fixed filename specifically so this never needs a lookup:

```bash
sudo cp /etc/nginx/sites-available/circlebite.app.pre-node-backup /etc/nginx/sites-available/circlebite.app
sudo nginx -t && sudo systemctl reload nginx
```

Both tested for real on 2026-09-10, not just written down: restored the placeholder config mid-deploy,
confirmed `/` served the actual placeholder page and `/health` 404'd (no Node behind it), then
reapplied the working config and confirmed the real app came back.

## 10. Rules that constrain this box

- The instance **stays running through judging week** — do not stop it to save credits (R10).
- No managed AWS services in the application path: no RDS, no ElastiCache, no Cognito (R6).
  The S3 bucket that holds backup copies is outside that path — the app never reads it; why
  that keeps R5 and R6 intact is in §17.
- If it ever needs rebuilding, rebuild it from this file rather than clicking through the console
  from memory.

## 11. Community corrections — kill switch and undo

Corroborated community reports that an allergen **is** in a product change what *other* profiles
see when they scan that barcode (`server/src/corrections/applyCommunityCorrections.ts`). Additions
only — a report that an allergen *isn't* there changes only the reporter's own view. Per
`docs/principles.md` principle 4, the off switch and the undo exist before the feature is turned on.

**Turn it on** (off by default — it ships dark):

```bash
# replaces an existing line rather than appending a second one that might not be the one read
grep -q '^COMMUNITY_CORRECTIONS=' ~/circlebite/.env \
  && sed -i 's/^COMMUNITY_CORRECTIONS=.*/COMMUNITY_CORRECTIONS=on/' ~/circlebite/.env \
  || echo "COMMUNITY_CORRECTIONS=on" >> ~/circlebite/.env
sudo systemctl restart circlebite
```

**Turn it off** — reverts every other profile's view at once. No data changes: `scans.result` always
holds the engine's own verdict, and the community layer is applied on read. A reporter's own
corrections keep applying to their own view.

```bash
sed -i 's/^COMMUNITY_CORRECTIONS=.*/COMMUNITY_CORRECTIONS=off/' ~/circlebite/.env
sudo systemctl restart circlebite
```

Any value other than `on`/`off` refuses to boot, on purpose — a typo'd kill switch must not resolve
to a guess.

**Undo one bad report** without turning the whole thing off. Only `status = 'corroborated'` rows are
read, so marking a row `rejected` removes it from every profile's view on the next request:

```bash
DB="$(grep DATABASE_URL ~/circlebite/.env | cut -d= -f2-)"

# recent corroborated additions, newest first
psql "$DB" -c "SELECT id, barcode, allergen, created_at, note FROM product_corrections
               WHERE direction = 'add_caution' AND status = 'corroborated'
               ORDER BY created_at DESC LIMIT 20;"

psql "$DB" -c "UPDATE product_corrections SET status = 'rejected' WHERE id = '<correction-id>';"
```

**Audit what a report changed.** Every scan records which corroborated additions it applied at scan
time in `scans.community_corrections_applied` (`null` = switch was off, `[]` = checked, nothing
matched):

```bash
psql "$DB" -c "SELECT id, barcode, created_at FROM scans
               WHERE community_corrections_applied @> '[{\"correctionIds\": [\"<correction-id>\"]}]';"
```

## 12. Admin access — the AI accuracy page

`users.is_admin` gates internal aggregate pages (the AI accuracy page today, the review queue
later). There's no UI for it — flipped by hand via SQL, same pattern as undoing a corroborated
report above:

```bash
DB="$(grep DATABASE_URL ~/circlebite/.env | cut -d= -f2-)"
psql "$DB" -c "UPDATE users SET is_admin = true WHERE email = '<jt-account-email>';"
```

**Deliberately not granted to the judge account.** With a small user base, the by-allergen
breakdown on the accuracy page can effectively identify a specific person's allergy — see
`docs/principles.md`'s precedent table. The judge account stays a normal account.

To revoke: `UPDATE users SET is_admin = false WHERE email = '<email>';`

## 13. Login/register rate limiting

`auth_attempts` (server/src/auth/rateLimit.ts). Login gets three tiers — `ip_and_email` (5
failures/15min, one attacker guessing one account), `ip` (20 failures/15min, one source spraying
many emails), and `email` alone (50 failures/60min, deliberately wide and long: a lone tight
per-email threshold would let anyone lock out any account — including the judge account — with a
cheap loop of wrong passwords from rotating IPs). Register has no secret to guess, so every
well-formed submission counts, regardless of outcome, toward its own `ip` (10/60min) and `email`
(5/60min) tiers. `ip_hash`/`email_hash` are HMAC-SHA256 (reusing `SESSION_SECRET`, the same key
`auth/session.ts` hashes session tokens with) — the raw IP or email is never stored
(`docs/principles.md` principle 5).

**Verify the real client IP survives, through nginx, not locally.** `app.set("trust proxy",
"loopback")` in `app.ts` only does the right thing if nginx is actually the one setting
`X-Forwarded-For`/`X-Real-IP` — confirm against the live site, not a local request (a local
request's own socket peer genuinely *is* loopback, so it would trust a spoofed header there by
design and prove nothing):

```bash
# 1. From your own machine — NOT the box — send a request with a forged header:
curl -s -X POST https://circlebite.app/api/auth/login \
  -H "Content-Type: application/json" \
  -H "X-Forwarded-For: 1.2.3.4" \
  -d '{"email":"trust-proxy-check@example.com","password":"wrong"}'

# 2. On the box, compute what "1.2.3.4" would hash to under the running SESSION_SECRET — the
#    table stores hashes, not raw IPs, so this is how to check without a code change:
SESSION_SECRET="$(grep SESSION_SECRET ~/circlebite/.env | cut -d= -f2-)"
node -e 'const {createHmac}=require("crypto");
console.log(createHmac("sha256",process.argv[1]).update("ip:1.2.3.4").digest("hex"))' "$SESSION_SECRET"

# 3. Confirm that hash does NOT match the attempt you just made:
DB="$(grep DATABASE_URL ~/circlebite/.env | cut -d= -f2-)"
psql "$DB" -c "SELECT ip_hash, occurred_at FROM auth_attempts WHERE endpoint = 'login' ORDER BY occurred_at DESC LIMIT 1;"
```

If step 3's `ip_hash` matches step 2's output, nginx isn't setting the headers the way
`scripts/nginx-circlebite.conf` claims, or the live file has drifted from that reference copy —
fix nginx before trusting the limiter at all, since every request would otherwise be attributable
to whatever IP a client feels like claiming. The test row self-prunes within 24h; no cleanup
needed.

## 14. 24-month scan retention

No cron, no systemd timer on this box — `server/src/jobs/scanRetention.ts` runs in-process
instead, once on startup and once a day after that (`server/src/index.ts`), riding the same
`Restart=always` guarantee `circlebite.service` already depends on for everything else. Every run
writes a row to `retention_runs`, success or failure, so "did it actually run" is a query, not a
guess:

```bash
DB="$(grep DATABASE_URL ~/circlebite/.env | cut -d= -f2-)"
psql "$DB" -c "SELECT started_at, finished_at, rows_deleted, status, error_message FROM retention_runs
               ORDER BY started_at DESC LIMIT 10;"
```

A gap in this table (no row for a day the box was clearly up) means something killed the process
before it could even record a failure — check `journalctl -u circlebite` for a crash loop. A row
with `status = 'error'` means the job ran and the delete itself failed (check
`error_message`) — the process stayed up, only that day's purge didn't happen, and it retries on
its own next tick.

`product_corrections` is untouched by this purge on purpose (`docs/coppa.md` §2.7) —
`product_corrections.scan_id` is `ON DELETE SET NULL`, not `CASCADE`, so a correction outlives the
scan it was filed against.

## 15. Generate a password reset token

No "forgot password" flow exists and none is planned (R6 — no email anywhere in this app).
Recovery for a locked-out account is administered by hand: JT generates a one-time token on the
box and hands it to the account holder out of band (never plain email — same discipline as judge
credentials), who uses it once at `https://circlebite.app/reset-password/<token>`.

Same shape as the manager/follow invite tokens (`server/src/lib/inviteToken.ts`): 32 random bytes,
hex-encoded, SHA-256'd before it ever touches the database — only the hash is stored, so a leaked
`password_reset_tokens` row alone grants nothing. Single-use (`used_at`) and expires in 60 minutes
(`RESET_TOKEN_TTL_MINUTES` in `server/src/auth/passwordReset.ts`).

**Generate one.** The token and its hash are printed together so the hash pasted into the INSERT
below is guaranteed to match the raw token handed over:

```bash
node -e '
const { randomBytes, createHash } = require("crypto");
const token = randomBytes(32).toString("hex");
console.log("token:", token);
console.log("hash: ", createHash("sha256").update(token).digest("hex"));
'
```

```bash
DB="$(grep DATABASE_URL ~/circlebite/.env | cut -d= -f2-)"
psql "$DB" -c "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
               SELECT id, '<hash-from-above>', now() + interval '60 minutes'
               FROM users WHERE email = '<account-email>';"
```

**Shown once, never retrievable again** — same discipline as `POST /profiles/:id/manager-invites`'s
response. Compose the full link yourself (`https://circlebite.app/reset-password/<token>`) and
hand it over out of band. If the INSERT's `SELECT` matches zero rows (no such email), it silently
inserts nothing — check psql's reported row count, not the app, since there's no route that would
ever confirm or deny that email exists either.

**Revoke an unused token** (leaked to the wrong channel, or handed out by mistake):

```bash
psql "$DB" -c "UPDATE password_reset_tokens SET used_at = now()
               WHERE user_id = (SELECT id FROM users WHERE email = '<account-email>')
               AND used_at IS NULL;"
```

## 16. Seed the judge account and demo data

One command creates the judge account and everything it needs to show: invented families, every
circle role, scan history across all four verdicts, a community warning reported by two families
outside the judge's circle, and the NPS rows. It is
also the **recovery path** — if a judge deletes the account mid-week, run it again and everything is
back. Rerunnable: a second run over a seeded database ends in exactly the same state.

What it touches, and only this (details in `server/src/db/seed/judgeSeed.ts`):

- Accounts on the reserved `demo.circlebite.test` domain, which signup refuses — deleted and
  recreated with everything they own.
- Corrections those accounts filed (a judge testing on a real product) are **rejected**, not
  deleted, with the reason "Judge test data — cleared by reseed" — that stops any live warning
  immediately and keeps the overrule log. NPS responses they filed are deleted.
- Fixed seed barcodes (GTINs with deliberately invalid check digits — no real product has them) in
  the `products` cache, and the seed's own NPS and correction rows by fixed id. The seeded warning is
  corroborated by the same threshold step a real report runs; if the threshold ever outgrows the
  seeded reports, the seed refuses and changes nothing rather than seeding a demo that doesn't fire.
- Never your account, never any other real account or its profiles, never a real product's row.
- Signs a logged-in judge out (their sessions are deleted with the account).

It makes no AI calls and spends no AI budget. The judge is **not** an admin (`docs/principles.md`,
Sept 11 2026 precedent).

**Run it** from the live release, after a deploy that includes it. The password never goes on the
command line, into shell history, or into a file:

```bash
cd ~/circlebite/current

# Optional: choose the judge password. read -s keeps it off the screen and out of shell history.
# Skip both lines to have a strong one generated and printed once instead.
read -s JUDGE_PASSWORD && export JUDGE_PASSWORD

( set -a; source ~/circlebite/.env; set +a; node server/dist/db/seedJudge.js )

unset JUDGE_PASSWORD
```

Never `JUDGE_PASSWORD=... node ...` inline — that lands in shell history. With `JUDGE_PASSWORD` set,
the output only confirms it was used; without it, the generated password is printed **once** — copy
it into the one-time secret link and nowhere else. Run a recovery reseed with the same
`JUDGE_PASSWORD` and the judges' credentials keep working.

**If it refuses.** A judge may invite a real address to try the invite flow. By default the seed
won't delete a real person's access to a seeded child, or their scans of one — it changes nothing
and prints the counts:

```
Not seeded — nothing was changed. Seeded profiles have non-seeded people or rows attached:
  co-managers: 0
  followers: 1
  scans by non-seeded people: 2
  ...
```

Look at who it is, then rerun with `--force` to remove exactly those rows and seed:

```bash
( set -a; source ~/circlebite/.env; set +a; node server/dist/db/seedJudge.js --force )
```

`--force` only removes rows *on seeded profiles* (synthetic children) — that person's follow or
co-manager access to them and their scans of them. Their own account, their own profiles, and their
scans of those are never touched.

**Known limit.** If a judge deletes the account *before* a reseed, the reports they filed are
already anonymous (`reported_by` is set to NULL on account deletion) and the seed can no longer find
them. Check the review queue (`/admin/review-queue`) daily during judging week for reports on real
products that don't look like real families'.

## 17. Backups

Required by Prof. Yoest, Oct 1 2026 (`docs/approvals/2026-10-02-yoest-overrule-conditions.md`, item
4): "with Postgres on the same box as the app, set up automated backups now, before real circles
depend on the data." Until this section existed, losing the instance lost everything.

### 17.1 What runs, and where the copies live

Every night at 03:30 Eastern, `scripts/backup.sh` writes one **set** to `~/circlebite/backups/` — a
sibling of `releases/` and `current/`, never inside either (§8 is why; the script refuses if the path
ever resolves inside the release tree):

| File | What it is |
|------|------------|
| `circlebite-<UTC stamp>.dump` | `pg_dump -Fc` of the database — custom format, so `pg_restore` can restore selectively |
| `circlebite-<UTC stamp>.uploads.tar.gz` | every correction photo in `UPLOAD_DIR`. pg_dump doesn't cover them, and they're the evidence each downgrade report carries |
| `circlebite-<UTC stamp>.missing-photos` | `photo_path` values on `product_corrections` rows whose file was **already missing on the live box** when the set was taken — one per line, usually empty. Recorded because §8's incident deleted photos once; the restore test uses this list to tell "already gone before the backup" (passes, reported) from "lost by the backup" (fails). A non-empty list is a live-data finding, not a backup problem |
| `circlebite-<UTC stamp>.sha256` | checksums of the above, written last — a set without one is incomplete and never used |

All mode 600, directory 700: a dump holds password hashes, session-token hashes and HMACs.

**Local:** the 7 newest complete sets — a week of restores with no download. Counted, not aged: a
timer that stalls for a fortnight never ages out its own last good sets.

**Off-box:** each set is copied to a private S3 bucket in this account, `s3://<your-backup-bucket>/circlebite/<set>/`.
The bucket's lifecycle rule deletes copies after **35 days** (a month of history, so data corruption
noticed weeks late still has a clean copy before it), plus up to 7 more days for an overwritten
version (§17.2) — so nothing deleted from the app survives in any backup past **42 days**
(`docs/coppa.md` §2.6).

**Why this doesn't touch R5 or R6.** S3 holds copies of files; it is not a backend. The app never
reads from it, no request path touches it, and if S3 disappeared the app would run exactly as before.
Web server, application and PostgreSQL are still all on this one instance (R5). R6 bans hosted
backends — managed databases, managed auth, backend-as-a-service — and §10 draws the line at "the
application path"; a place to keep dump files is outside it. And R8 has nothing to protect: the box
authenticates to S3 with an instance role, so no access key exists anywhere.

### 17.2 AWS — by hand, once

All in us-east-2. Console steps; nothing here needs the instance stopped (R10).

1. **Bucket.** S3 → Create bucket, name of your choosing (it goes in `.env`, never the repo). Leave
   **Block all public access** on (all four boxes). Default encryption: confirm **SSE-S3** — on by
   default since 2023. Not SSE-KMS: it adds cost and needs KMS permissions on the role.
2. **Versioning: Enable.** See "why" below — this is half the protection.
3. **Lifecycle rule** (Management → Create lifecycle rule), scoped to prefix `circlebite/`:
   expire current versions after **35** days, permanently delete noncurrent versions **7** days after
   they become noncurrent, delete incomplete multipart uploads after **1** day. Equivalent JSON:

   ```json
   {"Rules": [{
     "ID": "expire-circlebite-backups",
     "Status": "Enabled",
     "Filter": {"Prefix": "circlebite/"},
     "Expiration": {"Days": 35},
     "NoncurrentVersionExpiration": {"NoncurrentDays": 7},
     "AbortIncompleteMultipartUpload": {"DaysAfterInitiation": 1}
   }]}
   ```

4. **IAM role.** IAM → Roles → Create role → AWS service → EC2. Name it e.g. `circlebite-backup`,
   with exactly this inline policy and nothing else:

   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Sid": "PutBackupsOnly",
       "Effect": "Allow",
       "Action": "s3:PutObject",
       "Resource": "arn:aws:s3:::<your-backup-bucket>/circlebite/*"
     }]
   }
   ```

5. **Attach it to the running instance:** EC2 → `circlebite-prod` → Actions → Security → Modify IAM
   role. Then Actions → Instance settings → Modify instance metadata options → **IMDSv2: Required**
   (the box's credentials come from the metadata service; v2 stops them being fetched via a
   forwarded request). Both apply live — do not stop the instance.

**Why PutObject only — and why that isn't enough on its own.** If the instance is ever compromised,
whoever holds it must not be able to destroy the backups. No `s3:DeleteObject`: it can't delete
them. No `s3:GetObject`/`ListBucket`: it can't read them or see what's there. But `PutObject` on an
existing key **overwrites** it, and without versioning an overwrite with an empty file erases a
backup as thoroughly as a delete. Versioning makes that overwrite a new version and keeps the old one
for 7 days. Neither half alone closes the hole; both together do. Expiry belongs to the bucket's
lifecycle rule — `backup.sh` never deletes anything from S3, and couldn't.

The cost of that choice: **the box cannot read its own off-box copies.** The weekly restore test
proves the local set; restoring from S3 goes through your Mac (§17.10, §17.11).

### 17.3 AWS CLI on the box

Ubuntu 24.04 no longer packages `awscli` in apt. Official v2 installer:

```bash
sudo apt install -y unzip
cd /tmp && curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip
unzip -q awscliv2.zip && sudo ./aws/install && rm -rf aws awscliv2.zip && cd ~
aws --version
aws sts get-caller-identity     # Arn must show assumed-role/circlebite-backup/i-...
```

**Never `aws configure`** with access keys on this box — the role is the only credential.

Prove the policy is as narrow as claimed (both must say **AccessDenied**):

```bash
aws s3 ls "s3://<your-backup-bucket>/circlebite/" --region us-east-2
aws s3 rm "s3://<your-backup-bucket>/circlebite/anything" --region us-east-2
```

### 17.4 The restore-test role

`scripts/restore-test.sh` restores into a scratch database and drops it. It is the one script here
that drops a database, so it runs as its own role, which **Postgres itself** stops from dropping
production: `CREATEDB`, not a superuser, not a member of `circlebite`. Only an owner can drop a
database. The script checks those properties at runtime and refuses if they ever stop being true;
the full five layers are in its header comment.

Same pattern as §5 — the password goes straight into `.env`, never displayed:

```bash
RPW=$(openssl rand -hex 24)
sudo -u postgres psql -c "CREATE ROLE circlebite_restoretest LOGIN CREATEDB PASSWORD '$RPW';"
printf 'RESTORE_TEST_DB_PASSWORD=%s\n' "$RPW" >> ~/circlebite/.env
unset RPW

# It can't drop production — and with this, it can't even connect to it. The app's own role
# (circlebite) is the owner and keeps access; postgres is a superuser.
sudo -u postgres psql -c "REVOKE CONNECT ON DATABASE circlebite FROM PUBLIC;"
```

**Immediately** confirm the app still connects — `curl -sf http://127.0.0.1:3000/health && echo ok`
and the §5 verify command. If either fails, undo with
`sudo -u postgres psql -c "GRANT CONNECT ON DATABASE circlebite TO PUBLIC;"` and stop.

Then prove the last layer once, by hand (both must fail as shown):

```bash
RPW="$(grep RESTORE_TEST_DB_PASSWORD ~/circlebite/.env | cut -d= -f2-)"
PGPASSWORD="$RPW" psql -h localhost -U circlebite_restoretest -d postgres -c "DROP DATABASE circlebite;"
#   ERROR:  must be owner of database circlebite
PGPASSWORD="$RPW" psql -h localhost -U circlebite_restoretest -d circlebite -c "SELECT 1;"
#   FATAL:  permission denied for database "circlebite"
unset RPW
```

### 17.5 Install the timers

After a deploy that includes the backup scripts (`ls ~/circlebite/current/scripts/backup.sh`):

```bash
mkdir -m 700 -p ~/circlebite/backups
# The bucket name from §17.2. backup.sh refuses to run if this is left as the <placeholder>.
echo 'BACKUP_S3_BUCKET=<your-backup-bucket>' >> ~/circlebite/.env

# Reference copies in scripts/ — systemd doesn't read the checkout; re-copy whenever they change.
sudo cp ~/circlebite/current/scripts/circlebite-backup.service \
        ~/circlebite/current/scripts/circlebite-backup.timer \
        ~/circlebite/current/scripts/circlebite-restore-test.service \
        ~/circlebite/current/scripts/circlebite-restore-test.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now circlebite-backup.timer circlebite-restore-test.timer
systemctl list-timers 'circlebite-*'
```

`list-timers` should show the next backup at 03:30 Eastern (07:30 or 08:30 UTC depending on DST) and
the restore test on Sunday at 04:00 Eastern. Why those times, and why `Persistent=true`, is in the
unit files' header comments. Both units set `TimeoutStartSec=2h`: a oneshot unit has no start
timeout otherwise, so a hang would hold the unit forever and silently skip every later run.

### 17.6 First run

```bash
sudo systemctl start circlebite-backup          # returns when the run finishes
journalctl -u circlebite-backup -n 20 --no-pager
sudo systemctl start circlebite-restore-test
journalctl -u circlebite-restore-test -n 40 --no-pager
~/circlebite/current/scripts/backup-status.sh
```

The restore test prints row counts for the tables that matter, the migration comparison, and the
photo check, and ends `PASSED`. Then confirm the set reached S3 from the Mac (§17.10).

### 17.7 Is the newest backup stale? — check this, nothing else will

This app has no way to send an alert, so a backup that quietly stops is the realistic failure, and
the only thing that catches it is asking. From the Mac, one line:

```bash
ssh -i ~/.ssh/circlebite-prod.pem ubuntu@circlebite.app /home/ubuntu/circlebite/current/scripts/backup-status.sh
```

The remote path is absolute on purpose. An unquoted `~/circlebite/...` there is expanded by the
**Mac's** shell before ssh runs, so the box is asked for `/Users/<you>/circlebite/...` and answers
"No such file or directory" — which reads like a missing script, not a quoting problem. (The `-i
~/.ssh/...` key path is meant to expand locally; that one is right.)

One line each for **local** (dump + photos on the box), **offsite** (the S3 copy), and **restore**
(newest set proven restorable). Local and offsite are stale after 26h, restore after 8 days. When
something is wrong it says which half: *"local backups exist; the S3 copy is failing"* is a very
different morning from *"NO RECENT LOCAL BACKUP"*. Exits nonzero if anything is stale.

Without the script: `find ~/circlebite/backups/last-local-success -mmin -1560 | grep -q . && echo OK || echo STALE`

**Optional — show it on every SSH login**, so it gets seen without being remembered:

```bash
sudo ln -sf /home/ubuntu/circlebite/current/scripts/backup-status.sh /etc/update-motd.d/99-circlebite-backups
```

Recorded tradeoff: `update-motd.d` scripts run **as root** on every interactive login, and this one
runs from `current/`, which every deploy replaces. Acceptable on a solo box only because the script
is read-only — it reads stamp files and nothing else, and its header says so. Anyone changing it must
keep it that way, or remove the link. (Non-interactive `ssh ... "~/circlebite/deploy.sh"` doesn't
show the MOTD.)

### 17.8 Disk space — when a backup refuses

Postgres, the app, the photos and the local sets share one 30 GiB volume, and a full disk takes
Postgres and the app down with it. So `backup.sh` checks free space **before writing anything**: the
database's on-disk size plus the uploads directory (upper bounds on the set), plus a **2 GiB reserve**
for Postgres's own WAL and writes. If there isn't room, it writes nothing, prunes nothing, writes
`last-refusal`, and the status check reports `REFUSED — low disk (X free, Y needed)`.

When it trips:

```bash
df -h /
du -sh ~/circlebite/* /var/log/journal
sudo journalctl --vacuum-size=200M
sudo apt clean
```

If that isn't enough, delete the **oldest** local sets by hand, keeping at least the newest 2 (the
off-box copies are unaffected). If the volume is genuinely too small, grow it **online**: EC2 →
Volumes → Modify → larger size, then `sudo growpart /dev/nvme0n1 1 && sudo resize2fs /dev/nvme0n1p1`
(check device names with `lsblk`). No stop needed (R10). Then `sudo systemctl start circlebite-backup`
and re-check status.

### 17.9 Growth — when to revisit

The photo tarball is a full copy every night, not incremental, so local disk holds ~7× the size of
`uploads/` and S3 holds up to ~42× (35 days current + 7 noncurrent); revisit when `uploads/` passes
~100 MB (`du -sh ~/circlebite/uploads`), where S3 reaches ~4–5 GB and the edge of the legacy 5 GB
free tier — local disk isn't the constraint until ~1 GB of photos.

### 17.10 Check the off-box copy matches — from the Mac

The box can't read the bucket (§17.2), so this check is yours. Do it once after setup and once before
judging week. In the S3 console, download the newest `circlebite/<set>/` (all four files), then:

> **Two console quirks, both seen on the first check (2026-10-05):**
> - **Download is disabled when more than one object is selected.** Select and download the four
>   files one at a time.
> - **The browser strips `.gz` from the tarball.** It lands as `circlebite-<stamp>.uploads.tar`, so
>   `shasum -c` reports the `.tar.gz` as missing and it looks like a corrupt or failed upload. It
>   isn't: the bytes are unchanged (it is still gzip data). Rename it back before checking:
>   `mv circlebite-<stamp>.uploads.tar circlebite-<stamp>.uploads.tar.gz`

```bash
cd ~/Downloads && shasum -a 256 -c circlebite-<stamp>.sha256     # every file: OK
ssh -i ~/.ssh/circlebite-prod.pem ubuntu@circlebite.app "cat ~/circlebite/backups/circlebite-<stamp>.sha256"
cat circlebite-<stamp>.sha256                                    # identical to the line above
```

Delete the downloaded copies afterwards. They hold password hashes, even if only of synthetic accounts (R9).

### 17.11 Disaster restore — rebuilt box, empty database only

For when the instance is lost: rebuild through §1–§5 (which creates an **empty** `circlebite`
database), then restore the newest set before the first deploy. **Never run this against a database
that has data in it.** To recover a live box from bad data, restore into a *new* database and switch
`DATABASE_URL` to it after checking it, rather than improvising against the live one.

```bash
# On the Mac: download and verify the set as in §17.10, then
scp -i ~/.ssh/circlebite-prod.pem circlebite-<stamp>.* ubuntu@<ELASTIC_IP>:~/

# On the box
sha256sum -c circlebite-<stamp>.sha256
pg_restore --no-owner --exit-on-error --single-transaction \
  -d "$(grep DATABASE_URL ~/circlebite/.env | cut -d= -f2-)" circlebite-<stamp>.dump
mkdir -p ~/circlebite/uploads && tar -xzf circlebite-<stamp>.uploads.tar.gz -C ~/circlebite/uploads
rm circlebite-<stamp>.*
```

Then continue with §8 (bootstrap and first deploy — migrations bring an older dump forward), §17.2's
role attachment, and §17.3–§17.6.

### 17.12 Leftover scratch databases

Each restore test creates `circlebite_restoretest_<timestamp>` and drops it on exit, including on
timeout or `systemctl stop`. A hard kill (power loss, SIGKILL) can leave one behind, holding a full
copy of production; the next run drops any the restore role owns before starting. To look by hand
(normally empty):

```bash
sudo -u postgres psql -c "SELECT datname, pg_get_userbyid(datdba) AS owner FROM pg_database
                          WHERE datname LIKE 'circlebite\_restoretest\_%';"
```

### 17.13 Changing the backup scripts — run the harness first

`scripts/tests/backup-restore.sh` tests `backup.sh`, `restore-test.sh` and `backup-status.sh` end to
end against a throwaway database: corrupt-dump detection, already-missing vs lost photos, every
production-protection layer (including Postgres's own refusal), the disk guard against real GNU `df`,
the S3-failure split, pruning, migration drift, SIGTERM cleanup, and each status message.
**It must pass before any change to those scripts is committed.**

It is **manual, not automated** — there's no CI in this repo, and it needs a real Postgres where you
are a superuser. It only protects a change if someone runs it. On the Mac, from the repo root:

```bash
brew install bash coreutils gnu-tar flock     # once; Ubuntu already has GNU userland
./scripts/tests/backup-restore.sh             # ~1 min; ends "harness: all N passed"
```

It creates and removes its own database, role and temp directory, never touches `~/circlebite`, and
refuses to run on the production box. Its stand-ins for `aws`, `df`, `date` and `pg_restore` live in
`scripts/tests/shims/` and refuse to run unless the harness invoked them, so one can never quietly
replace the real command if that directory ends up on a `PATH`.
