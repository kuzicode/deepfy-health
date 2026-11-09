---
last_updated: 2026-11-09
status: active
---

# Self-hosting

[简体中文](self-hosting.md)

This is the recommended way to run Deepfy Health: on your own computer or home server, with your data staying local. You get the same dashboard and records as the hosted app, with no domain, HTTPS, email service or third-party sign-in needed. The code ships with no user data. You're welcome to help build it: see [CONTRIBUTING.md](../.github/CONTRIBUTING.md).

## Quick start

You need Docker with Compose v2. On Windows, run this inside WSL.

```bash
git clone https://github.com/kuzicode/deepfy-health.git && cd deepfy-health
sh scripts/selfhost-init.sh
docker compose up -d
```

The first run builds the image, which takes a few minutes. Then open http://localhost:3100 and create your admin account.

`selfhost-init.sh` creates `.env`, which holds the master key that encrypts all health data. **Keep a separate copy of `.env`, away from your database backups. Without the master key, your data can't be recovered.**

## Use it on your local network

1. Open http://localhost:3100 on the same machine and finish setup first.
2. In `.env`, remove the `#` in front of `KZ_BIND=0.0.0.0`, then run `docker compose up -d`.
3. On other devices, open `http://this-machine's-local-IP:3100`.

Traffic isn't encrypted this way, so keep it on a network you trust and don't forward the port to the internet.

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

Create a token on the **Agents** page and give the generated prompt to your agent. The MCP address is `http://the-address-you-open:3100/mcp`.

## Back up and restore

Back up the database and attachments. Keep `.env` separately, as described above:

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U kzh -Fc kzh > backups/db.dump
docker compose cp app:/data/attachments backups/attachments
```

To restore on a new machine or after a wipe, put the original `.env` back first:

```bash
docker compose up -d
docker compose exec -T db pg_restore -U kzh -d kzh --clean --if-exists < backups/db.dump
docker compose cp backups/attachments/. app:/data/attachments/
docker compose restart app
```

## Upgrade

```bash
git pull
docker compose up -d --build
```

The database is updated automatically on startup.

## Move from the hosted app

1. Sign in to the hosted app and download the zip from **Settings → Export**. It's decrypted plain text, so delete it when you're done.
2. On your instance's **Agents** page, create a token with the **Local sync** permission.
3. On your computer (Node 22 and pnpm required), run:

```bash
pnpm install
unzip deepfy-health-*.zip -d my-export
export HEALTH_VAULT_DIR=$PWD/my-export
pnpm kzh validate
pnpm kzh login --server http://your-address:3100 --token <token>
pnpm kzh push --dry-run
pnpm kzh push
```

Passwords, agent tokens, reminder settings and agent change history aren't carried over.

## Access over HTTPS (optional)

To reach it from outside your network, set up your own HTTPS reverse proxy to `127.0.0.1:3100` (don't set `KZ_BIND`). Pass the original `Host`, set `X-Real-IP` to the real client IP, and set `BETTER_AUTH_URL=https://your-domain` in `.env`. Finish first-time setup on the machine itself.

## Upgrade from an older self-hosted install

Add `KZ_EDITION=self` to `.env`, then upgrade as above. Accounts and data stay the same, and admins in `KZ_ADMIN_EMAILS` remain admins. You can remove settings that are no longer used: `KZ_ALLOWED_EMAILS`, `KZ_MAIL_CONSOLE` and `KZ_SITE_HOSTS`.
