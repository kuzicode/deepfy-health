---
last_updated: 2026-11-06
status: active
---

# 自托管

用这份代码在自己的服务器上跑一套，再把官方站点上的账号数据搬过来。代码和镜像不带任何用户数据，新实例的数据库是空的。

## 从官方站点搬过来，分三步

1. 在官方站点登录，打开 **设置 → 导出**，下载 zip。zip 里只有你这个账号的数据（家人、记录、日志、用药、附件）。
2. 按下面启动自己的实例并注册账号。
3. 把 zip 导入自己的实例。

**不会带过来的：** 登录方式和密码、agent token、提醒设置、agent 修改记录。token 和提醒要在新实例重新设置。

**zip 是明文。** 它是解密后的健康数据，请像保管原件一样保管，用完删除。

## 启动实例

需要 Docker。

```bash
git clone https://github.com/kuzicode/deepfy-health.git && cd deepfy-health
cat > .env <<EOT
POSTGRES_PASSWORD=$(openssl rand -hex 24)
KZ_MASTER_KEY=$(openssl rand -base64 32)
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=https://health.example.com
KZ_APP_URL=https://health.example.com
KZ_SITE_HOSTS=site.invalid
KZ_ADMIN_EMAILS=you@example.com
KZ_MAIL_CONSOLE=1
EOT
chmod 600 .env
docker compose run --rm migrate
docker compose up -d app
```

应用只监听 `127.0.0.1:3100`。公开访问时，在前面放一个带 HTTPS 的反向代理转发到这个端口。反向代理必须对外拒绝 `/api/cron/`，并把 `X-Real-IP` 设为真实客户端 IP（如 nginx 的 `proxy_set_header X-Real-IP $remote_addr;`），否则限速按 IP 区分不开或可被伪造。只在本机用时，两个 URL 都填 `http://localhost:3100`。

**必须另存 `KZ_MASTER_KEY`：** 丢失后数据无法解密。不要把它和数据库备份放在一起。

**一定要设 `KZ_ADMIN_EMAILS`：** 没有管理员也没有白名单时，实例对所有人开放注册。设了之后，只有管理员和白名单邮箱能注册，管理员也不受免费额度限制。

## 注册账号

用 `KZ_ADMIN_EMAILS` 里的邮箱注册。`KZ_MAIL_CONSOLE=1` 时不发邮件，验证码打印在日志里：

```bash
docker compose logs app | grep '\[mail\]'
```

要真的发邮件，就配 `RESEND_API_KEY` 和 `MAIL_FROM`，并去掉 `KZ_MAIL_CONSOLE`。Google 登录可选，配 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET`。

## 导入 zip

在自己实例的 **Agent 接入** 页面创建一个可写入的 token，然后在本机（需要 Node 22 和 pnpm）执行：

```bash
pnpm install
unzip deepfy-health-*.zip -d my-export
export HEALTH_VAULT_DIR=$PWD/my-export
pnpm kzh validate
pnpm kzh login --server https://health.example.com --token <token>
pnpm kzh push --dry-run
pnpm kzh push
```

导入完就可以删掉 zip 和解压目录。`pnpm kzh pull` 可以随时再导出一份。

## 之后由你负责

服务器安全、备份、升级（`git pull` 后重新 `docker compose build app migrate`、`docker compose run --rm migrate`、`docker compose up -d app`）和数据合规都由你负责。提醒邮件还需要发信服务、`KZ_CRON_SECRET` 和每天调用 `/api/cron/reminders` 的定时任务。

Self-hosting: clone the repo, create `.env` as above, run the migration, start the app, sign up with your admin email, then import your export with `kzh push`. The export contains only your account's data and is plain text, so keep it safe and delete it afterwards.
