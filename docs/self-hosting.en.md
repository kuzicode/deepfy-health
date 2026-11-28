---
last_updated: 2026-11-28
status: active
---

# Self-hosting

[简体中文](self-hosting.md)

Run Deepfy on your own computer, NAS or cloud server. Health records, recipes, insurance policies and attachments stay on that machine. For access over the internet, use the HTTPS setup below.

## Start on a computer or NAS

Install Git, OpenSSL and Docker with Compose v2. On Windows, run these commands inside WSL.

```bash
git clone https://github.com/kuzicode/deepfy-family.git && cd deepfy-family
sh scripts/selfhost-init.sh
docker compose up -d
```

The first run builds the image, which takes a few minutes. Then open http://localhost:3100 and create your admin account.

`selfhost-init.sh` creates `.env`, which holds the master key that protects each account’s data key. The account key encrypts health records, recipe contents and attachments. **Keep a separate copy of `.env`, away from your database backups. Without the master key, your data can't be recovered.**

## Use it on your local network

1. Finish setup on the same machine at http://localhost:3100. For a headless NAS, use the SSH tunnel in the HTTPS section below.
2. In `.env`, remove the `#` in front of `KZ_BIND=0.0.0.0`, then run `docker compose up -d`.
3. On other devices, open `http://this-machine's-local-IP:3100`.

Traffic isn't encrypted this way, so keep it on a network you trust and don't forward the port to the internet.

## Run on your own cloud server with HTTPS

1. Run the same three commands on the server. Keep the default loopback binding. To create the first administrator before publishing the site, open an SSH tunnel from your computer with `ssh -L 3100:127.0.0.1:3100 user@your-server`, then visit `http://localhost:3100` on that computer. This also works for a NAS without a browser.
2. Point your domain at the server. Set `BETTER_AUTH_URL=https://deepfy.example.org` in the generated `.env`, substituting your domain. Run `docker compose up -d` to apply it.
3. Run Nginx or Caddy on the same host. Open ports 80 and 443 for the proxy and keep port 3100 on loopback. In an Nginx HTTPS server block with a certificate for the domain, add the following location.

```nginx
location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    client_max_body_size 32m;
    proxy_buffering off;
}
```

Caddy can obtain the certificate automatically. Replace the domain in this Caddyfile.

```caddyfile
deepfy.example.org {
    reverse_proxy 127.0.0.1:3100 {
        header_up X-Real-IP {remote_host}
    }
}
```

Both examples assume clients connect directly to the proxy. Preserve the original `Host` and forward the HTTPS scheme in `X-Forwarded-Proto` so requests match the public login origin. Caddy does both by default. Overwrite `X-Real-IP` with the connecting client’s address so login rate limits apply per client. Open your HTTPS URL and sign in.

## Add accounts for family

A family member's health record doesn't need its own account. Add them as a family member in your account.

If they want to sign in themselves, open **Admin** from the avatar menu and enter a name, email and initial password. The email is only a sign-in name; nothing is sent to it. They can change the password in **Settings**.

## Forgot a password

For other accounts, an admin can reset the password under **Manage** on the Admin page.

If you're the admin, run this on the server. It prints a new password. The first run builds an image.

```bash
docker compose run --rm migrate pnpm admin reset-password you@example.com
```

## Connect an agent

Create a token on the **Agents** page and give the generated prompt to your agent. Choose the token’s access level and data scope (all, health only or recipes only). Use `http://localhost:3100/mcp` for an agent on the server itself. For an agent on another device, use the server’s LAN address or your HTTPS endpoint, such as `https://deepfy.example.org/mcp`.

## Back up and restore

Save this example as `backup.sh` on the server, replacing `/opt/deepfy-family` with your clone directory. It briefly stops the app so the database and attachment volume are captured together, then restarts it on exit. Completed snapshots appear in `~/deepfy-backups/` under their timestamp.

```sh
#!/bin/sh
set -eu
umask 077
cd /opt/deepfy-family
backup_dir="$HOME/deepfy-backups"
mkdir -p "$backup_dir"
snapshot="$backup_dir/$(date +%Y%m%d-%H%M%S)"
mkdir "$snapshot.partial"
trap 'docker compose start app' EXIT
docker compose stop app
docker compose exec -T db pg_dump -U kzh -Fc kzh > "$snapshot.partial/db.dump"
docker compose run --rm --no-deps -T app tar -C /data/attachments -cf - . > "$snapshot.partial/attachments.tar"
mv "$snapshot.partial" "$snapshot"
```

Run `sh backup.sh` once. To repeat at 03:00 server time, add the following to the Docker operator’s `crontab -e`, adjusting the script path and Docker CLI search path for that machine.

```cron
PATH=/usr/local/bin:/usr/bin:/bin
0 3 * * * /bin/sh /opt/deepfy-family/backup.sh
```

Keep completed snapshots on a separate disk and the original `.env` separately from those snapshots. To restore, use a fresh clone of the same version with empty volumes. Put the original `.env` back first and set `snapshot` to a completed backup directory.

```bash
snapshot=/path/to/snapshot
docker compose up -d --wait db
docker compose build app
docker compose exec -T db pg_restore -U kzh -d kzh --clean --if-exists --single-transaction < "$snapshot/db.dump" &&
  docker compose run --rm --no-deps -T app tar -C /data/attachments -xf - < "$snapshot/attachments.tar" &&
  docker compose up -d
```

## Upgrade or change the clone directory

Compose uses the project name to locate the existing database (`pgdata`) and attachment (`attachments`) volumes. Check the old project name with `docker compose ls` before upgrading.

- **Upgrade in place.** Keep the original `.env` and run the commands below in the existing directory. With the default project name, keeping the directory name also keeps the volumes.
- **Change the clone directory.** On the same machine and Docker engine, copy the original `.env` into the new directory, keeping its keys and passwords. Before starting Compose, set `COMPOSE_PROJECT_NAME=<original-directory-name>` in that file. For example, use `COMPOSE_PROJECT_NAME=deepfy-health` for an original directory named `deepfy-health`.
- If you previously used `-p` or a custom project name, set `COMPOSE_PROJECT_NAME` to that **actual old name** in either case. Using a different name mounts empty volumes and makes the existing data appear missing.

```bash
git pull
docker compose up -d --build
```

The database is updated automatically on startup.

## Move from the hosted app

1. Sign in to the hosted app and download the zip from **Settings → Export**. It's decrypted plain text, so delete it when you're done.
2. On your instance's **Agents** page, create a token with **Local sync** permission and access to all sections.
3. Run these commands in Bash on your computer with Node 22 and pnpm installed. Paste the token at the prompt. For a remote instance, replace `http://localhost:3100` with your HTTPS address.

```bash
pnpm install
unzip deepfy-family-*.zip -d my-export
export HEALTH_VAULT_DIR=$PWD/my-export
pnpm kzh validate
read -rs -p 'Sync token: ' sync_token
echo
pnpm kzh login --server http://localhost:3100 --token "$sync_token"
pnpm kzh push --dry-run
pnpm kzh push
```

Passwords, agent tokens, reminder settings and agent change history aren't carried over.

## Upgrade from an older self-hosted install

Add `KZ_EDITION=self` to `.env`, then upgrade as above. Accounts and data stay the same, and admins in `KZ_ADMIN_EMAILS` remain admins. You can remove settings that are no longer used: `KZ_ALLOWED_EMAILS`, `KZ_MAIL_CONSOLE` and `KZ_SITE_HOSTS`.
