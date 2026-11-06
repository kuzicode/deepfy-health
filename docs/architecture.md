---
last_updated: 2026-11-06
status: active
---

# deepfy-health — 架构

> 规则见 `AGENTS.md`；路线图见 `ROADMAP.md`。

## 官网与 App（同一个 Next 应用）

| Host | 路由 | 说明 |
|---|---|---|
| `deepfy.si`、`www` | `/` → 按 Accept-Language 跳 `/zh` 或 `/en`；`/zh/*`、`/en/*` 由 `proxy.ts` 改写到 `app/site/[locale]/*` | 官网，扫描线传送带首屏（`app/site/_belt/`） |
| `app.deepfy.si` | `(app)` 路由组、`/login`、`/legal/*`、`/api/*` | App；本地也可直接访问 `/site/zh` 预览官网 |

- 语言：next-intl（`src/i18n/`，文案在 `messages/zh.json`、`en.json`）。官网由 URL 决定（proxy 设置 `x-kz-locale` 头）；App 由 cookie `kz_locale` 决定，默认取 Accept-Language。用户写的内容（笔记、健康计划）不翻译；指标英文名在内置字典 `name_en`。
- 邮件语言：打开 App 时把界面语言同步到 `user.locale`（空值按中文）。提醒邮件读它；验证码跟当前请求；暂停页读它，没有再看浏览器语言。每周汇总只发管理员，保持中文。
- 设计：Mint Glass，token 在 `app/styles/tokens.css`，通用样式在 `base.css`；官网 `app/site/site.css`（`s-`/`belt-`/`kc-` 前缀），App `app/(app)/app.css`（`a-` 前缀），登录页 `app/login/login.css`。字体用 Fontsource 自托管。品牌标志「影像环」：组件 `src/ui/Logo.tsx`（< 32px 自动用单环小尺寸版），图标走 Next 文件约定（`app/icon.svg`、`apple-icon.png`、`favicon.ico`、`opengraph-image.png`、`manifest.ts`），原始素材与规范在 `public/brand/`、`docs/brand/logo-kit.md`；邮件模板 `src/server/mail.ts` 引用 `/brand/deepfy-horizontal.png`（这些路径在 `proxy.ts` 中公开）。
- 登录：`/login` 单卡片、先邮箱后分流（参考 ChatGPT）：Google 或输入邮箱 → `POST /api/login-lookup` 返回 `password` / `otp`（仅 Google 注册过）/ `create` / `closed`（只出现在设了 `KZ_ALLOWED_EMAILS` 的实例，显示错误提示），前端进入对应步骤（`app/login/LoginView.tsx`）。Google 新用户回到 `?error=signup_disabled` 后先勾选同意再创建。手机号、微信登录待定（见 plan backlog）。网页编辑（快速建档、快速记录、档案编辑）走 server action → `PgRepository.applyChanges`：在当前数据上合并单点改动，用 `buildSnapshot` 只校验被改文件，通过后只写改动的文档；日志照片经 `putAttachment` 加密存储，前端先压缩去 EXIF，服务端按魔数只收 jpg/png/webp，经 `/m/[id]/files/*`（需登录）查看。MCP 只读端点 `/mcp`（Streamable HTTP 无状态，Bearer token，`src/mcp/`）。设置 / 修改密码复用 emailOTP `forget-password` + `resetPassword`（无 credential 账号时 better-auth 会新建），入口在登录页验证码步骤与 `/settings`。

## 两种运行模式

| 模式 | 触发 | 数据源 | 登录 |
|---|---|---|---|
| 云端（生产） | 设置了 `DATABASE_URL` | Postgres，按用户加密 | Google（better-auth） |
| 本地 vault（开发） | 未设置 `DATABASE_URL` | `HEALTH_VAULT_DIR/Personal`（默认示例 vault） | 无 |

生产环境未设置 `DATABASE_URL` 时直接报错，不会退回本地模式。

## 数据流

```
Obsidian vault (Personal/<Dir>/Health/*.md)
   │ readVaultRaw ─┐                      ┌─ PgRepository.exportRaw ◀─ Postgres (doc.ciphertext …)
   ▼               ▼                      ▼
              RawVault（frontmatter 原样 + 正文）
                       │ buildSnapshot（zod 校验 + 组装，两边共用）
                       ▼
               VaultSnapshot / MemberBundle ──▶ analysis.ts ──▶ 页面 / kzh
```

- `src/core/bundle.ts`：中间格式与校验组装，不碰文件系统。
- `src/core/vault.ts`：读写本地 vault；`src/core/serialize.ts`：RawVault → vault 文件（kzh pull、网站导出）。
- `src/core/regimen.ts`：用药 / 补剂的状态分组、当天安排、写入检查、趋势图区间；写入构造在 `src/mcp/regimen-write.ts`（网页与 MCP 共用），agent 规则在 `src/mcp/regimen-tools.ts`。
- `src/server/pg-repository.ts`：云端读写；`importRaw` 整批校验通过才写入。
- 网站只依赖 `HealthReader`（`snapshot`、`getMember`），由 `app/_components/repo.ts#getReader` 按模式选择实现。

## 存储与加密

- 表：better-auth 的 `user / session / account / verification`；`user_key`（包裹后的 DEK）、`household`（家庭名、自定义指标，明文）、`member`（姓名加密，`position` 是用户拖动设置的显示顺序）、`doc`（档案 / 记录 / 笔记 / 用药 / 健康计划（care_plan），整份 JSON 加密）、`attachment`（元数据，文件密文在 `KZ_ATTACHMENT_DIR`）、`api_token`（校验用 sha256；明文用账号 DEK 加密存于 `token_cipher`，供「Agent 接入」页再次复制配置；`scope` 只读 / 可写入）、`agent_change`（agent 写入记录：写入前密文 + 前后 sha，可一键还原，保留 90 天）。
- AES-256-GCM，格式 `v1:nonce:ct:tag`；每个账号一把 DEK，由 `KZ_MASTER_KEY` 包裹。AAD 绑定所属对象（`doc:<memberId>:<kind>:<key>`、`member:<userId>:<slug>`、`att:<memberId>:<path>`、`dek:<userId>`），密文挪到别处无法解密。
- 服务端加密存储，不是端到端：服务器在请求时于内存中解密，用于展示、分析与将来的 MCP。

## 鉴权

- 网页：better-auth 数据库会话；`proxy.ts` 只检查 cookie 是否存在，页面内 `requireUser()` 做真正校验。
- 注册：邮箱 + 密码，必须输入邮箱验证码（emailOTP 插件，`overrideDefaultEmailVerification`）才能登录；或 Google（`requestSignUp`，`disableImplicitSignUp`）。两种方式都只在创建账号这一步勾选服务协议与隐私政策（健康数据需单独同意）。
- 登录：邮箱 + 密码、邮箱验证码免密（只给已注册用户，`disableSignUp`）、Google；同一邮箱自动合并为一个账号（accountLinking）。忘记密码走验证码重置。
- 发信：`src/server/mail.ts`（Resend HTTP API）；本地未配置 key 时验证码打印在开发服务器控制台，生产必须配置。
- 注册：默认开放（0.19 起）。设了 `KZ_ALLOWED_EMAILS` 的实例只允许名单内的邮箱和管理员（`src/server/access.ts`，在 `user.validateUserInfo` 里校验），用于自托管；官方实例留空。邮箱注册每个 IP 每小时 5 次，全站每天上限 `KZ_SIGNUP_DAILY_LIMIT`（默认 60，超限返回 `signup_busy`，避免批量注册用光发信额度）。超过 7 天仍未验证的账号由每日任务清理。
- 管理员：只由 `KZ_ADMIN_EMAILS` 指定，且邮箱需已验证；`/admin` 对非管理员返回 404。后台只显示账号元数据与数量（`src/server/admin.ts`），不解密任何健康内容，不提供代登录。
- 拉黑账号（后台叫「拉黑」，给用户看的提示是「已停用」）：`user_status.disabled_at`；拉黑时删除全部会话，`session.create.before` 抛出 `disabled` 错误拒绝新登录，API token 失效，提醒停发；账号还在，所以这个邮箱不能重新注册；可以解除。
- `/api/v1/*`：Bearer `kzh_…` token（「Agent 接入」页 `/agents` 创建，可随时再次复制或重新生成）。kzh 与三期 MCP 共用。

## 路由

| 路径 | 用途 |
|---|---|
| `/login`、`/legal/*` | 公开页 |
| `/avatars/*` | 预设头像图片（DiceBear Thumbs CC0「暖柔健康」18 张，自托管；`src/avatars.ts` 登记；`user.image = "preset:<id>"`）；家人头像存在档案 `profile.avatar`（建档时默认挑家里没人用的、概览点头像可换；只是外观，MCP 不开放写入），没选的「本人」用账号头像、其他人按成员 id 自动分配（`memberAvatars`，不存库）；官网用父域 cookie `dfy_av`（只含头像 id，App 写入、退出时清）显示登录态，不用于鉴权 |
| 官网 `deepfy.si/{zh,en}`、`/{zh,en}/docs` | 首页、文档（`app/site/[locale]`；nginx 缓存 60 秒）；本地预览 `/site/zh` |
| `/`、`/m/[id]/*` | 家庭总览与成员页 |
| `/settings`、`/settings/export` | 账号、token、导出 zip、删除账号 |
| `/reminders`、`/feedback` | 邮件提醒设置、意见反馈（头像菜单） |
| `/agents`、`/mcp` | Agent 接入（token 管理）、MCP 端点 |
| `/admin` | 管理后台（仅管理员）：用户与拉黑、注册状态、用户反馈、字典缺口 |
| `/api/cron/reminders`、`/api/cron/digest` | 每日提醒邮件与未验证账号清理、每周汇总；只由服务器 crontab 调用（Bearer `KZ_CRON_SECRET`，nginx 对外 404） |
| `/api/reminders/pause` | 邮件里的一键暂停（HMAC 签名，免登录） |
| `/api/auth/*` | better-auth |
| `/api/v1/me`、`export`、`import`、`attachments/[member]/[...path]` | kzh push/pull |

## 部署

`compose.yml`：`app` standalone 镜像 + `db` postgres:16，端口只绑 127.0.0.1，由宿主机反向代理对外。官方站点的部署脚本、反向代理配置和备份由维护者私下管理，不在本仓库。

防护分层：反向代理（按 IP 限连接与限速，公开页和 `/_next/static` 缓存，对外拒绝 `/api/cron/`，见 ISS-013）→ 应用限速（MCP 每 token / 每 IP、登录验证码、login-lookup）→ 账号额度（`src/server/quota.ts`）→ 容器内存 / CPU 上限。

## 额度与资源

- 额度定义只在 `src/server/quota.ts` 的 `PLANS`（free / pro / admin）；管理员邮箱（`KZ_ADMIN_EMAILS`）= admin（不限），`account_plan` 里 pro = pro，其余 = free。超额抛 `QuotaExceeded`，调用方不写入任何东西。
- 检查点：`createToken`（token 数）、`PgRepository.applyChanges` 的 add_member 与 `importRaw` 新成员（家人数）、`putAttachment`（附件总量，按差额）、`applyChanges` 带 audit 时（agent 24 小时写入，按 `agent_change` 条数）、网页导出路由（每天次数，进程内计数）。
- 资源监控：发信成功时 `ops_state` 记当天计数（`mail:YYYY-MM-DD`）；每周汇总带发信量、附件总量、磁盘使用率（`src/server/ops.ts`）。
