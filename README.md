# Deepfy Health

Deepfy 健康档案的开源代码：网站、App、MCP、指标字典和数据库。

构建你的健康云档案，让 Agent 读懂你。
Built for your health. Read by your agents.

- 官网 / Website：https://deepfy.si
- App：https://app.deepfy.si
- 文档 / Docs：https://deepfy.si/zh/docs · https://deepfy.si/en/docs

Deepfy 把体检报告、化验、病历和日常指标整理成全家人的结构化健康档案：看趋势、排复查、到期邮件提醒。通过 MCP，你自己的 agent 可以读取档案，并在你允许时帮你记录和整理。

Deepfy organizes checkup reports, lab results, medical records and daily readings into a structured family health record. Over MCP, your own agent can read it and, with your permission, keep it up to date.

> **状态：持续开发中的测试版，不是正式版本。** 功能、接口和数据格式都可能变化。Pre-release software under active development: features, APIs and data formats may change.
>
> 仅供参考，不能替代医生诊断。For reference only — not a substitute for medical advice.
>
> **不要在 Issue、PR 或截图里贴任何真实健康信息。** Do not post real health information on GitHub.

## 本地运行 / Run locally

需要 Node 22 和 pnpm。什么都不配置，就能用虚构的样例数据跑起来：

```bash
pnpm install
pnpm dev        # http://localhost:3000，读 examples/sample-vault
pnpm test
```

要用登录、MCP 和写入，需要本地 Postgres（Docker）：

```bash
cp .env.example .env.local   # 取消注释云端模式那几行，并生成两个本地密钥
pnpm db:up && pnpm db:migrate
pnpm dev                     # 不配发信时，登录验证码打印在控制台
```

数据库测试：

```bash
docker compose -f compose.dev.yml exec db createdb -U kzh kzh_test
pnpm test:db
```

本地开发只用样例数据和本地数据库，不需要任何线上账号或密钥。

## 两种模式

- **云端模式**（设置了 `DATABASE_URL`）：账号登录，健康内容按账号加密后存进 Postgres。这是服务器端加密，不是端到端加密，见 [架构说明](docs/architecture.md)。
- **本地 vault 模式**：直接读 Markdown 目录，可以是 Obsidian vault，主要用于开发和备份。

## 本地 vault 与云端同步

```bash
pnpm kzh login --server https://app.deepfy.si --token kzh_xxx   # token 在网站「设置」里创建
pnpm kzh push --dry-run      # 先看会推多少
pnpm kzh push                # 校验通过才推；云端更新的条目默认跳过（--force 覆盖）
pnpm kzh pull --into ./backup/Personal   # 导出备份；与本地不同的文件另存 *.cloud.md
```

`pnpm kzh --help` 查看全部命令。

## 自托管 / Self-hosting

代码不带任何用户数据。可以自己部署，再导入从官方站点导出的账号数据，见 [docs/self-hosting.md](docs/self-hosting.md)。

The code ships with no user data. To run your own instance and import your account export, see [docs/self-hosting.md](docs/self-hosting.md).

## 参与 / Contributing

欢迎一起建设，最适合入手的是指标字典、录入规则和多语言。先看 [CONTRIBUTING.md](CONTRIBUTING.md)；代码规范和 agent 协作规则在 [AGENTS.md](AGENTS.md)，路线图在 [ROADMAP.md](ROADMAP.md)。安全问题请按 [SECURITY.md](SECURITY.md) 私下上报。

官方站点由维护者运营；App 的使用问题也可以登录后在头像菜单里提交「意见反馈」。

## 许可 / License

代码以 [MIT](LICENSE) 发布。「Deepfy」名称和 logo 不随代码授权，见 [TRADEMARK.md](TRADEMARK.md)。

Code is released under the [MIT License](LICENSE). The Deepfy name and logos are not covered; see [TRADEMARK.md](TRADEMARK.md).

> 仓库改名自内部项目，CLI 和部分配置仍沿用 `kzh`、`KZ_*` 前缀。The `kzh` CLI and `KZ_*` variables keep their original prefix for compatibility.
