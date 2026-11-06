---
last_updated: 2026-11-07
status: active
---

# 自托管

这是推荐的使用方式：跑在自己的电脑或家里的服务器上，数据留在本地，不需要域名和 HTTPS。欢迎一起维护，见 [CONTRIBUTING.md](../.github/CONTRIBUTING.md)。代码和镜像不带任何用户数据，新实例的数据库是空的。

## 启动

需要 Docker。把下面的 IP 换成这台机器的内网地址，邮箱换成你的：

```bash
git clone https://github.com/kuzicode/deepfy-health.git && cd deepfy-health
cat > .env <<EOT
POSTGRES_PASSWORD=$(openssl rand -hex 24)
KZ_MASTER_KEY=$(openssl rand -base64 32)
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=http://192.168.1.10:3100
KZ_APP_URL=http://192.168.1.10:3100
KZ_BIND=0.0.0.0
KZ_SITE_HOSTS=site.invalid
KZ_ADMIN_EMAILS=you@example.com
KZ_ALLOWED_EMAILS=you@example.com
KZ_MAIL_CONSOLE=1
EOT
chmod 600 .env
docker compose run --rm migrate
docker compose up -d app
```

只在本机用的话，两个地址都填 `http://localhost:3100`，并去掉 `KZ_BIND` 那一行。

## 注册账号

浏览器打开你填的地址，用上面的邮箱注册。`KZ_MAIL_CONSOLE=1` 时不发邮件，验证码在日志里：

```bash
docker compose logs app | grep '\[mail\]'
```

## 要注意的

- **保存好主密钥：** `.env` 里的 `KZ_MASTER_KEY` 丢失后数据无法解密。请另外保存一份，不要和数据库备份放在一起。
- **只在内网使用：** 这种方式没有加密传输，不要做端口转发暴露到公网。
- **加家人：** 把邮箱加进 `KZ_ALLOWED_EMAILS`（逗号分隔），运行 `docker compose up -d app`。也可以让他们在登录页提交申请，你在 `/admin` 审批。名单留空时，能访问这个地址的人都能注册。
- **接入 agent：** MCP 地址是 `http://你的地址:3100/mcp`，token 在「Agent 接入」页创建。

## 备份和升级

备份数据库和附件（附件已加密，恢复时需要原来的 `.env`）：

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U kzh -Fc kzh > backups/db.dump
docker compose cp app:/data/attachments backups/attachments
```

升级：

```bash
git pull
docker compose build app migrate
docker compose run --rm migrate
docker compose up -d app
```

## 从官方托管搬过来

1. 在官方托管登录，打开 **设置 → 导出**，下载 zip。zip 是解密后的明文，用完请删除。
2. 在自己实例的 **Agent 接入** 页面创建一个「本地同步」权限的 token。
3. 在本机（需要 Node 22 和 pnpm）执行：

```bash
pnpm install
unzip deepfy-health-*.zip -d my-export
export HEALTH_VAULT_DIR=$PWD/my-export
pnpm kzh validate
pnpm kzh login --server http://你的地址:3100 --token <token>
pnpm kzh push --dry-run
pnpm kzh push
```

登录方式和密码、agent token、提醒设置、agent 修改记录不会带过来。

## 可选

- **真的发邮件：** 配 `RESEND_API_KEY` 和 `MAIL_FROM`，并去掉 `KZ_MAIL_CONSOLE`。提醒邮件还需要 `KZ_CRON_SECRET` 和每天调用 `/api/cron/reminders` 的定时任务。
- **Google 登录：** 配 `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET`。
- **放到公网：** 需要你自己配 HTTPS 反向代理，转发到 `127.0.0.1:3100`（不要设 `KZ_BIND`），对外拒绝 `/api/cron/`，并把 `X-Real-IP` 设为真实客户端 IP。

Self-hosting: clone the repo, create `.env` as above with your local network address, run the migration, start the app and sign up with your admin email. The code is printed in the logs. It runs over plain HTTP, so keep it on your local network.
