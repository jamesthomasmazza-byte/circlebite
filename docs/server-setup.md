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

Four keys live there now: `DATABASE_URL` (set when the database was created, §5),
`SESSION_SECRET` (generated on the box with `openssl rand -hex 32`, appended when the app was first
deployed, §7 below), and `NODE_ENV=production` / `PORT=3000`.

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
- If it ever needs rebuilding, rebuild it from this file rather than clicking through the console
  from memory.
