#!/bin/sh
# 自托管初始化：生成 .env（密钥只在这个文件里）。只需运行一次。
# 用法：sh scripts/selfhost-init.sh
set -eu
cd "$(dirname "$0")/.."

if [ -e .env ]; then
  echo ".env 已经存在，没有改动。里面有加密数据用的主密钥，覆盖后已有数据就解不开了。" >&2
  exit 1
fi
command -v openssl >/dev/null 2>&1 || { echo "需要 openssl，请先安装。" >&2; exit 1; }

umask 077
cat > .env <<ENV
# Deepfy Health 自托管配置，由 scripts/selfhost-init.sh 生成
KZ_EDITION=self
POSTGRES_PASSWORD=$(openssl rand -hex 24)

# 主密钥：加密全部健康数据。丢失后数据无法恢复，请把这个文件单独备份，不要和数据库备份放在一起
KZ_MASTER_KEY=$(openssl rand -base64 32)
BETTER_AUTH_SECRET=$(openssl rand -base64 32)

# 让局域网里的其他设备也能访问：去掉下一行的注释（先在本机完成首次设置）
# KZ_BIND=0.0.0.0
ENV
chmod 600 .env

cat <<'MSG'
已生成 .env。请把它备份到安全的地方：丢了主密钥，数据就无法解密。

下一步：
  docker compose up -d
然后打开 http://localhost:3100 创建管理员账号。
MSG
