---
last_updated: 2026-11-09
status: active
---

# 自托管

[English](self-hosting.en.md)

这是推荐的使用方式：跑在自己的电脑或家里的服务器上，数据留在本地。看板和档案功能和官方托管一样，不需要域名、HTTPS、邮箱服务或第三方登录。代码不带任何用户数据。欢迎一起维护，见 [CONTRIBUTING.md](../.github/CONTRIBUTING.md)。

## 快速开始

需要 Docker（Compose v2）。Windows 请在 WSL 里运行。

```bash
git clone https://github.com/kuzicode/deepfy-health.git && cd deepfy-health
sh scripts/selfhost-init.sh
docker compose up -d
```

第一次要构建镜像，需要几分钟。完成后打开 http://localhost:3100 ，创建管理员账号，就可以开始用了。

`selfhost-init.sh` 会生成 `.env`，里面的主密钥用来加密全部健康数据。**请把 `.env` 另外保存一份，不要和数据库备份放在一起。丢了主密钥，数据无法恢复。**

## 在局域网里使用

1. 先在本机打开 http://localhost:3100 完成首次设置。
2. 编辑 `.env`，去掉 `KZ_BIND=0.0.0.0` 前面的 `#`，然后运行 `docker compose up -d`。
3. 其他设备打开 `http://这台机器的局域网 IP:3100`。

这种方式没有加密传输，只在可信的内网使用，不要做端口转发暴露到公网。

## 给家人添加账号

家人的健康档案不需要单独的账号，在自己的账号里添加家人就行。

如果家人想用自己的账号登录：管理员打开右上角头像里的 **管理后台**，填写名字、邮箱和初始密码。邮箱只作为登录名，不会发邮件。对方登录后可以在 **设置** 里改密码。

## 忘记密码

普通账号：管理员在后台对应账号的 **管理** 里重置。

管理员自己忘了：在服务器上运行下面的命令，它会打印一个新密码，第一次运行时要构建镜像。

```bash
docker compose run --rm migrate pnpm admin reset-password 你的邮箱
```

## 接入 agent

在 **Agent 接入** 页面创建 token，把生成的提示词发给 agent。MCP 地址是 `http://你打开网页用的地址:3100/mcp`。

## 备份和恢复

备份数据库和附件。`.env` 按上面的说明单独保存：

```bash
mkdir -p backups
docker compose exec -T db pg_dump -U kzh -Fc kzh > backups/db.dump
docker compose cp app:/data/attachments backups/attachments
```

在新机器或清空后恢复（先放回原来的 `.env`）：

```bash
docker compose up -d
docker compose exec -T db pg_restore -U kzh -d kzh --clean --if-exists < backups/db.dump
docker compose cp backups/attachments/. app:/data/attachments/
docker compose restart app
```

## 升级

```bash
git pull
docker compose up -d --build
```

数据库结构会在启动时自动更新。

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

密码、agent token、提醒设置和 agent 修改记录不会带过来。

## 通过 HTTPS 访问（可选）

想从外网访问时，自己配 HTTPS 反向代理转发到 `127.0.0.1:3100`（不要设 `KZ_BIND`），传递原始 `Host`，把 `X-Real-IP` 设为真实客户端 IP，并在 `.env` 里设 `BETTER_AUTH_URL=https://你的域名`。首次设置请先在本机完成。

## 从旧版自托管升级

在 `.env` 里加上 `KZ_EDITION=self`，再按上面的方式升级。账号和数据不变，`KZ_ADMIN_EMAILS` 里的管理员仍然有效，其他不再使用的配置（`KZ_ALLOWED_EMAILS`、`KZ_MAIL_CONSOLE`、`KZ_SITE_HOSTS`）可以删掉。
