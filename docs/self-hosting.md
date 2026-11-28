---
last_updated: 2026-11-28
status: active
---

# 自托管

[English](self-hosting.en.md)

推荐将 Deepfy 部署到自己的电脑、NAS 或云服务器。健康档案、菜谱、保单与附件都保存在部署机器上。需要从外网访问时，可按下文配置 HTTPS。

## 本机或 NAS 三条命令启动

准备好 Git、OpenSSL 和 Docker（Compose v2）。Windows 请在 WSL 里运行。

```bash
git clone https://github.com/kuzicode/deepfy-family.git && cd deepfy-family
sh scripts/selfhost-init.sh
docker compose up -d
```

第一次要构建镜像，需要几分钟。完成后打开 http://localhost:3100 ，创建管理员账号，就可以开始用了。

`selfhost-init.sh` 会生成 `.env`，里面的主密钥保护每个账号的数据密钥，后者用于加密健康档案、菜谱和附件内容。**请把 `.env` 另外保存一份，不要和数据库备份放在一起。丢了主密钥，数据无法恢复。**

## 在局域网里使用

1. 先在本机打开 http://localhost:3100 完成首次设置。没有浏览器的 NAS 可用下节的 SSH 隧道。
2. 编辑 `.env`，去掉 `KZ_BIND=0.0.0.0` 前面的 `#`，然后运行 `docker compose up -d`。
3. 其他设备打开 `http://这台机器的局域网 IP:3100`。

这种方式没有加密传输，只在可信的内网使用，不要做端口转发暴露到公网。

## 云服务器长期部署与 HTTPS

1. 在自己的服务器执行相同的三条启动命令，保留默认的回环地址绑定。对外开放前，在电脑上运行 `ssh -L 3100:127.0.0.1:3100 user@your-server` 建立隧道，再用电脑浏览器打开 `http://localhost:3100` 创建首个管理员。没有浏览器的 NAS 也可用这个方法。
2. 将自己的域名解析到服务器，在生成的 `.env` 中设置 `BETTER_AUTH_URL=https://deepfy.example.org`（替换为自己的域名），再运行 `docker compose up -d` 使配置生效。
3. 在同一台宿主机运行 Nginx 或 Caddy。为代理开放 80、443 端口，3100 继续只绑定回环地址。使用 Nginx 时，在已配置域名证书的 HTTPS server 块内加入以下配置。

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

使用 Caddy 时，将示例域名换成自己的域名，Caddy 即可自动申请证书。

```caddyfile
deepfy.example.org {
    reverse_proxy 127.0.0.1:3100 {
        header_up X-Real-IP {remote_host}
    }
}
```

上述配置假设客户端直连代理。保留原始 `Host`，并通过 `X-Forwarded-Proto` 传递 HTTPS 协议，使登录请求与配置的外部地址一致。Caddy 默认传递这两项。用连接来源地址覆盖 `X-Real-IP`，登录限速才能按真实客户端区分。配置完成后即可通过自己的 HTTPS 地址登录。

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

在 **Agent 接入** 页面创建 token，把生成的提示词发给 agent。可按需要选择读写权限与栏目范围（全部、仅健康或仅菜谱）。Agent 与服务在同一台机器时使用 `http://localhost:3100/mcp`。在其他设备上，请改用服务器的局域网地址，或自己的 HTTPS 地址，如 `https://deepfy.example.org/mcp`。

## 备份和恢复

将下例保存为服务器上的 `backup.sh`，把 `/opt/deepfy-family` 替换为实际克隆目录。脚本会短暂停止应用，配套保存数据库与附件卷，退出时重新启动应用。成功的备份保存在 `~/deepfy-backups/` 下以时间命名的目录里。

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

先运行一次 `sh backup.sh`。如需按服务器时间每天 03:00 备份，使用可运行 Docker 的账号执行 `crontab -e`，加入以下两行，按实际安装位置调整脚本路径与 Docker 命令搜索路径。

```cron
PATH=/usr/local/bin:/usr/bin:/bin
0 3 * * * /bin/sh /opt/deepfy-family/backup.sh
```

将成功的备份另存到其他磁盘，原始 `.env` 与这些备份分开保管。恢复时，在具有空数据卷的同版本新实例中先放回原始 `.env`，再将 `snapshot` 指向一份完整备份的目录。

```bash
snapshot=/path/to/snapshot
docker compose up -d --wait db
docker compose build app
docker compose exec -T db pg_restore -U kzh -d kzh --clean --if-exists --single-transaction < "$snapshot/db.dump" &&
  docker compose run --rm --no-deps -T app tar -C /data/attachments -xf - < "$snapshot/attachments.tar" &&
  docker compose up -d
```

## 升级与更换克隆目录

Compose 通过项目名找到现有的数据库卷 `pgdata` 和附件卷 `attachments`。升级前可用 `docker compose ls` 核对旧项目名。

- **原地升级**。保留原来的 `.env`，在原目录运行下方命令。若一向使用默认项目名，目录名相同就会复用原卷。
- **更换克隆目录**。在同一台机器、同一 Docker 引擎上，把原来的 `.env` 连同原密钥和密码复制到新目录。首次启动前，在其中设置 `COMPOSE_PROJECT_NAME=<原目录名>`。例如旧目录为 `deepfy-health`，就写 `COMPOSE_PROJECT_NAME=deepfy-health`。
- 如果以前通过 `-p` 或其他方式指定了项目名，两种升级方式都要在 `.env` 中填写**实际旧项目名**。换成其他名称会挂载空卷，看起来像数据丢失。

```bash
git pull
docker compose up -d --build
```

数据库结构会在启动时自动更新。

## 从官方托管搬过来

1. 在官方托管登录，打开 **设置 → 导出**，下载 zip。zip 是解密后的明文，用完请删除。
2. 在自己实例的 **Agent 接入** 页面创建一个「本地同步」权限的 token，栏目范围选「全部」。
3. 在本机的 Bash 中执行以下命令（需要 Node 22 和 pnpm），按提示粘贴 token。远程实例请把 `http://localhost:3100` 换成自己的 HTTPS 地址。

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

密码、agent token、提醒设置和 agent 修改记录不会带过来。

## 从旧版自托管升级

在 `.env` 里加上 `KZ_EDITION=self`，再按上面的方式升级。账号和数据不变，`KZ_ADMIN_EMAILS` 里的管理员仍然有效，其他不再使用的配置（`KZ_ALLOWED_EMAILS`、`KZ_MAIL_CONSOLE`、`KZ_SITE_HOSTS`）可以删掉。
