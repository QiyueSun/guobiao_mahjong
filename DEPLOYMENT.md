# Deployment Guide

This guide walks through publishing the mahjong stack on **Google Cloud
Platform's "Always Free" tier** (no time limit, but RAM-constrained), and
includes a fallback section for pivoting to **Hetzner** if GCP's free tier
proves too small.

The production stack (`docker-compose.prod.yml`) is just Docker Compose, so
it runs the same way on any Linux VM with Docker installed — moving providers
later is mostly "repeat the VM setup steps + copy a few files + repoint DNS."

---

## Part 0 — Before you start

You'll need:
- A Google account (for GCP).
- A free DuckDNS hostname (used for DNS + TLS + the Google OAuth redirect —
  see below). You don't need to own a real domain.
- ~30 minutes for the first deploy (plus a long wait for the first Docker
  build on a slow VM — see Part 4).

**What "Always Free" means**: GCP's `e2-micro` instance (1 shared vCPU, 1GB
RAM, 30GB standard persistent disk) is free *forever*, not a 12-month trial —
but only in the `us-west1`, `us-central1`, or `us-east1` regions, and only one
such instance per billing account. GCP still asks for a credit card when you
sign up, but Always-Free usage within these limits isn't charged.

**Free domain via DuckDNS**:
1. Go to https://www.duckdns.org and sign in (GitHub/Google/Reddit/etc.).
2. Under "add domain", pick a subdomain, e.g. `mahjong-jerry` → you get
   `mahjong-jerry.duckdns.org`.
3. You'll point this at your server's IP in Part 3.

Throughout this guide, replace `mahjong-jerry.duckdns.org` with your own
DuckDNS hostname, and `yourSharedPassword` with a password you'll share with
your friends.

---

## Part 1 — Create the GCP VM

1. **Create a project**: go to https://console.cloud.google.com, sign in,
   and create a new project (e.g. `mahjong-prod`) from the project picker at
   the top of the page.

2. **Enable Compute Engine**: search for "Compute Engine" in the top search
   bar and open it. The first time, GCP will prompt you to enable the
   Compute Engine API — click enable and wait ~1 minute.

3. **Create the VM** (Compute Engine → VM instances → Create instance):
   - **Name**: `mahjong-server`
   - **Region**: `us-central1` (must be `us-west1`, `us-central1`, or
     `us-east1` for the free tier)
   - **Machine type**: `e2-micro`
   - **Boot disk**: click "Change" → Ubuntu → **Ubuntu 24.04 LTS** → disk
     type "Standard persistent disk", size **30 GB** (the free allowance)
   - **Firewall**: check both "Allow HTTP traffic" and "Allow HTTPS traffic"
   - Click **Create**.

   *(Equivalent `gcloud` CLI, if you install the Cloud SDK instead of using
   the console)*:
   ```bash
   gcloud compute instances create mahjong-server \
     --zone=us-central1-a \
     --machine-type=e2-micro \
     --image-family=ubuntu-2404-lts-amd64 \
     --image-project=ubuntu-os-cloud \
     --boot-disk-size=30GB \
     --boot-disk-type=pd-standard \
     --tags=http-server,https-server
   ```

4. **Reserve a static external IP** so it doesn't change on reboot:
   - VPC network → IP addresses → "Reserve external static IP address"
   - Network Service Tier: **Standard** (Premium tier has its own free quota
     but Standard is simplest and free for one address attached to a running
     VM)
   - Attach it to your `mahjong-server` instance.
   - Note this IP — you'll enter it into DuckDNS in Part 3 (35.212.149.75)

5. **Confirm firewall rules** allow SSH/HTTP/HTTPS: VPC network → Firewall.
   The default `default-allow-ssh` rule (port 22) should already exist, and
   checking "Allow HTTP/HTTPS traffic" in step 3 created rules for ports
   80/443 tagged `http-server`/`https-server`.

6. **SSH into the VM**: on the VM instances list, click the **SSH** button
   next to `mahjong-server` — this opens a browser-based terminal. (Or, with
   the Cloud SDK: `gcloud compute ssh mahjong-server --zone=us-central1-a`.)

---

## Part 2 — Server setup (run on the VM)

1. **Install Docker Engine + Compose plugin**:
   ```bash
   curl -fsSL https://get.docker.com | sudo sh
   sudo usermod -aG docker $USER
   newgrp docker
   ```
   Verify with `docker compose version`.

2. **Add a swapfile** — important on a 1GB VM, since Ubuntu cloud images ship
   with no swap by default, and `docker compose build` (TypeScript + Vite)
   can briefly need more than 1GB:
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   free -h   # confirm swap shows ~2.0Gi
   ```

3. **Clone the repo**:
   ```bash
   sudo apt-get update && sudo apt-get install -y git nano
   git clone <your-repo-url> mahjong
   cd mahjong
   ```

4. **Create `.env`** from the template and fill in real values:
   ```bash
   cp .env.example .env
   ```
   Generate random secrets:
   ```bash
   openssl rand -hex 32   # use for SESSION_SECRET
   d8803952c9d01e65170172ef7f756194160583ca67a6eaf9ba9e271b009a44e3
   openssl rand -hex 16   # use for POSTGRES_PASSWORD and REDIS_PASSWORD
   10aa65bca594be1b36068c92e2203042
   ```
   Edit `.env` (minimal Ubuntu images don't ship with `vi`/`vim`, so use
   `nano .env` — edit values, then **Ctrl+O** then Enter to save, **Ctrl+X**
   to exit) and set:
   - `POSTGRES_PASSWORD=<generated>`
   - `SESSION_SECRET=<generated>`
   - `REDIS_PASSWORD=<generated>`
   - `CLIENT_ORIGIN=https://mahjong-jerry.duckdns.org`
   - `GOOGLE_CALLBACK_URL=https://mahjong-jerry.duckdns.org/api/v1/auth/google/callback`
   - `PROD_WS_URL=wss://mahjong-jerry.duckdns.org`
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from your OAuth client in
     Google Cloud Console (APIs & Services → Credentials). Add
     `https://mahjong-jerry.duckdns.org/api/v1/auth/google/callback` to that
     client's "Authorized redirect URIs".
   - `COOKIE_DOMAIN=mahjong-jerry.duckdns.org`

---

## Part 3 — DNS + TLS

1. **Point DuckDNS at your static IP**: on the DuckDNS dashboard, paste the
   GCP static IP from Part 1 into the "current ip" field for your subdomain
   and click "update ip". No registrar or nameserver changes needed —
   DuckDNS hosts the DNS record for you.

2. **Get a TLS certificate with certbot** (standalone mode — run this before
   nginx is up and using port 80):
   ```bash
   sudo apt-get install -y certbot
   sudo certbot certonly --standalone -d mahjong-jerry.duckdns.org
   mkdir -p nginx/ssl
   sudo cp /etc/letsencrypt/live/mahjong-jerry.duckdns.org/fullchain.pem nginx/ssl/
   sudo cp /etc/letsencrypt/live/mahjong-jerry.duckdns.org/privkey.pem nginx/ssl/
   sudo chown $USER:$USER nginx/ssl/*.pem
   ```

3. **Update `nginx/nginx.conf`**: change `server_name mahjong.example.com;`
   to `server_name mahjong-jerry.duckdns.org;`.

4. **Set up auto-renewal**. Let's Encrypt certs expire after 90 days. Add a
   root crontab entry that renews and refreshes the copies nginx reads:
   ```bash
   sudo crontab -e
   ```
   Add this line (runs daily at 3am; certbot only actually renews when
   within 30 days of expiry):
   ```
   0 3 * * * certbot renew --quiet --deploy-hook "cp /etc/letsencrypt/live/mahjong-jerry.duckdns.org/*.pem /home/qiyue_jerry_sun/mahjong/nginx/ssl/ && cd /home/qiyue_jerry_sun/mahjong && docker compose -f docker-compose.prod.yml restart nginx"
   ```
   Replace `<your-user>` with your actual username qiyue_jerry_sun (`whoami`).

---

## Part 4 — Build and launch

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

This builds the `server` (TypeScript) and `client` (Vite) images and starts
`postgres`, `redis`, `server`, and `nginx`. **On an `e2-micro`, the first
build can take several minutes** (1 shared vCPU compiling TypeScript + Vite)
— the swapfile from Part 2 keeps it from being OOM-killed, it just takes a
while. Subsequent builds (after small code changes) are faster thanks to
Docker layer caching.

**Verify**:
```bash
curl https://mahjong-jerry.duckdns.org/api/v1/health
# expect: {"status":"ok","redis":"ok","db":"ok",...}
```
Then visit `https://mahjong-jerry.duckdns.org` in a browser — you should get
a Basic Auth prompt (username `friends`, your shared password), then the
mahjong lobby. Test "使用 Google 登录" end-to-end.

**Reboot safety**: `nginx`, `server`, `redis`, and `postgres` all have
`restart: always`, and the Docker daemon starts on boot automatically after
the official install in Part 2 — so the stack comes back up after a VM
restart without manual steps.

---

## Part 5 — CI/CD: automatic deploys via GitHub Actions

After the initial setup, every `git push` to `main` will run the unit tests and
— if they pass — SSH into the VM, `git pull`, and restart the server container
automatically. The workflow lives at `.github/workflows/deploy.yml`.

### One-time setup (do this once; survives VM reboots)

**1. Generate a dedicated deploy SSH key** (run on your local machine):
```bash
ssh-keygen -t ed25519 -f ~/.ssh/mahjong_deploy -N ""
```
This creates `~/.ssh/mahjong_deploy` (private) and `~/.ssh/mahjong_deploy.pub`
(public). Keep the private key safe — don't commit it.

**2. Authorize the key on the VM** (SSH in once, then never again for this):
```bash
echo "$(cat ~/.ssh/mahjong_deploy.pub)" >> ~/.ssh/authorized_keys
```
`~/.ssh/authorized_keys` lives on the persistent disk and survives reboots.
You only need to redo this if the VM is **deleted and recreated** from scratch
(not on restarts — just reuse the same key pair you generated above).

**3. Add three secrets to GitHub**
(`Settings → Secrets and variables → Actions → New repository secret`):

| Secret name | Value |
|-------------|-------|
| `DEPLOY_SSH_KEY` | Full contents of `~/.ssh/mahjong_deploy` (private key, including the `-----BEGIN...` lines) |
| `VM_HOST` | VM's static IP or `mahjong-jerry.duckdns.org` |
| `VM_USER` | `qiyue_jerry_sun` |

That's it. From now on, `git push origin main` triggers the pipeline.

### What the pipeline does

1. **test** job — installs server deps and runs the 101 Jest unit tests.
2. **deploy** job (only runs if tests pass) — SSH's into the VM, runs
   `git pull`, then `docker compose -f docker-compose.prod.yml up -d --no-deps server`
   to restart only the server container with the new code.

### Moving to a new VM

If you ever recreate the VM (e.g., pivoting to Hetzner):
1. Reuse the same `~/.ssh/mahjong_deploy` key pair — no need to regenerate or
   update GitHub secrets.
2. Repeat Step 2 above on the new VM (copy the public key to `authorized_keys`).
3. Update the `VM_HOST` GitHub secret to the new IP/hostname.

---

## Part 6 — Is GCP's free tier good enough?

Watch these after a few real game sessions with friends:

- `free -h` — if "available" memory is consistently near zero and swap usage
  (`Swap: ... used`) is high, the box is under memory pressure.
- `docker stats` — per-container memory/CPU usage at a glance.
- `dmesg -T | grep -i -E 'oom|killed process'` and
  `journalctl -k | grep -i oom` — these show OOM-killer events if the kernel
  has had to kill a container's process for memory.

**Rule of thumb**: occasional swap usage during a `docker compose build` is
normal and fine. If you see OOM kills *during normal gameplay* (not just
builds), or the app feels sluggish with just a few rooms active, that's the
signal to pivot to Hetzner below.

---

## Pivoting to Hetzner

If GCP's 1GB `e2-micro` isn't enough, move to a **Hetzner CX22** (~€4/month,
2 vCPU / 4GB RAM / 40GB disk). Since both run the same
`docker-compose.prod.yml`, this is mostly "repeat the VM setup on a bigger
box, migrate the database, repoint DNS."

1. **Provision the Hetzner VM**: in the Hetzner Cloud console, create a CX22
   with Ubuntu 24.04, and note its public IP.

2. **Repeat Part 2** (Docker install, clone the repo) on the new box. A
   swapfile is optional with 4GB of RAM but doesn't hurt.

3. **Migrate the Postgres database** (this is the only durable state — game
   history and linked accounts; Redis is just session/cache and can be left
   to rebuild empty per `CLAUDE.md`):
   ```bash
   # on the GCP box
   docker compose -f docker-compose.prod.yml exec postgres \
     pg_dump -U mahjong mahjong > mahjong_backup.sql
   scp mahjong_backup.sql <user>@<hetzner-ip>:~/mahjong/

   # on the Hetzner box, after starting just postgres:
   docker compose -f docker-compose.prod.yml up -d postgres
   cat mahjong_backup.sql | docker compose -f docker-compose.prod.yml exec -T postgres \
     psql -U mahjong mahjong
   ```

4. **Copy secrets and certs** from the GCP box to the same paths on the
   Hetzner box: `.env`, `nginx/ssl/fullchain.pem`, `nginx/ssl/privkey.pem`,
   `nginx/.htpasswd`.
   ```bash
   scp .env nginx/.htpasswd nginx/ssl/*.pem <user>@<hetzner-ip>:~/mahjong/  # adjust nginx/ paths as needed
   ```

5. **(Optional)** Now that you have 4GB instead of 1GB, raise Redis's memory
   cap back up in `docker-compose.prod.yml` — change `--maxmemory 128mb` to
   e.g. `--maxmemory 512mb` (this was lowered specifically to fit GCP's 1GB
   `e2-micro`).

6. **Build and launch** on Hetzner:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

7. **Repoint DNS**: on the DuckDNS dashboard, change "current ip" to the
   Hetzner IP. This takes effect quickly (DuckDNS uses a short TTL). Verify
   `https://mahjong-jerry.duckdns.org` now serves from Hetzner — same
   hostname, so no changes needed to the Google OAuth redirect URI or TLS
   cert (certs were copied in step 4; let certbot renew normally on the new
   host going forward, and remove the renewal cron job from the old GCP box).

8. **Decommission the GCP VM**: once you've confirmed everything works on
   Hetzner for a day or two, stop and then delete the GCP instance, and
   release its static IP — otherwise the disk/IP could eventually incur
   small charges beyond the Always-Free allowance.
