import { bigint, boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ---- better-auth 核心表（字段名与 better-auth 默认 schema 对齐） ----
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** 界面语言，决定邮件语言；打开 App 时同步，空值按中文 */
  locale: text("locale"),
  createdAt: created(),
  updatedAt: updated(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("session_user_idx").on(t.userId)]);

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("account_user_idx").on(t.userId)]);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
  updatedAt: updated(),
});

// ---- 健康数据：健康内容只以密文存放（SEC） ----
export const userKey = pgTable("user_key", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  wrappedDek: text("wrapped_dek").notNull(),
  kekVersion: integer("kek_version").notNull().default(1),
  createdAt: created(),
});

/** 一个账号 = 一个家庭；自定义指标字典不属于个人健康内容，明文 jsonb */
export const household = pgTable("household", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  name: text("name"),
  customCatalog: jsonb("custom_catalog").notNull().default([]),
  updatedAt: updated(),
});

/** 档案对象本身（姓名）也是个人信息，名字加密存放 */
export const member = pgTable("member", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  nameCipher: text("name_cipher").notNull(),
  role: text("role").notNull().default("member"),
  dir: text("dir"),
  /** 用户拖动设置的显示顺序，不含健康内容。没排过的是空，排在最后 */
  position: integer("position"),
  createdAt: created(),
}, (t) => [uniqueIndex("member_user_slug_uq").on(t.userId, t.slug)]);

export const doc = pgTable("doc", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => member.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  key: text("key").notNull().default(""),
  contentSha256: text("content_sha256").notNull(),
  ciphertext: text("ciphertext").notNull(),
  updatedAt: updated(),
}, (t) => [uniqueIndex("doc_member_kind_key_uq").on(t.memberId, t.kind, t.key)]);

export const attachment = pgTable("attachment", {
  id: text("id").primaryKey(),
  memberId: text("member_id").notNull().references(() => member.id, { onDelete: "cascade" }),
  relPath: text("rel_path").notNull(),
  mime: text("mime").notNull(),
  size: bigint("size", { mode: "number" }).notNull(),
  sha256: text("sha256").notNull(),
  storageKey: text("storage_key").notNull(),
  createdAt: created(),
}, (t) => [uniqueIndex("attachment_member_path_uq").on(t.memberId, t.relPath)]);

export const apiToken = pgTable("api_token", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  /** token 明文，用账号 DEK 加密（AAD token:<userId>:<id>），供之后再次复制配置；旧 token 为空，重新生成后补上 */
  tokenCipher: text("token_cipher"),
  /** read：只读；write：MCP 写入工具与 kzh push 可用 */
  scope: text("scope").notNull().default("read"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: created(),
});

/**
 * agent 经 MCP 的每次写入：保存写入前的密文（同一 AAD，可直接还原），用于「最近的 agent 修改」与一键还原。
 * token 被撤销后记录仍保留（token_name 冗余存一份）；不含明文健康内容（key 与 doc 表一样是明文文件名）。
 */
export const agentChange = pgTable("agent_change", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => member.id, { onDelete: "cascade" }),
  tokenId: text("token_id"),
  tokenName: text("token_name").notNull(),
  tool: text("tool").notNull(),
  kind: text("kind").notNull(),
  key: text("key").notNull(),
  prevCiphertext: text("prev_ciphertext"),
  prevSha256: text("prev_sha256"),
  newSha256: text("new_sha256").notNull(),
  createdAt: created(),
  revertedAt: timestamp("reverted_at", { withTimezone: true }),
}, (t) => [index("agent_change_user_created_idx").on(t.userId, t.createdAt)]);

/**
 * 字典缺口反馈：用户在记录页主动点「反馈」时，只上报未归类项目的名称 / 单位 / 分组，按名称聚合计数。
 * 不存用户、不存数值、不存日期——维护者据此扩充内置字典。
 */
export const catalogFeedback = pgTable("catalog_feedback", {
  nameNorm: text("name_norm").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit"),
  section: text("section"),
  count: integer("count").notNull().default(1),
  firstSeen: created(),
  lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
});

// ---- 提醒邮件设置（不含健康内容：只有开关、收件邮箱、提前天数、上次检查日期） ----
export const reminderSetting = pgTable("reminder_setting", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(true),
  /** 收件邮箱；为空表示用登录邮箱。换成别的邮箱前须验证码确认 */
  email: text("email"),
  /** 到期前几天提醒（0 = 当天） */
  leadDays: integer("lead_days").array().notNull().default([7, 0]),
  /** 每日任务上次检查到的日期（YYYY-MM-DD，北京时间）；漏跑时据此补发 */
  lastChecked: date("last_checked", { mode: "string" }),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  /** 待验证的新收件邮箱与验证码（sha256），5 分钟有效 */
  pendingEmail: text("pending_email"),
  pendingCodeHash: text("pending_code_hash"),
  pendingExpires: timestamp("pending_expires", { withTimezone: true }),
  pendingTries: integer("pending_tries").notNull().default(0),
  updatedAt: updated(),
});

// ---- 管理：账号状态（不含任何健康内容） ----
/** 待删除（0.19.1）：开放注册后不再使用，保留到上线验证通过，便于回滚 */
export const allowedEmail = pgTable("allowed_email", {
  email: text("email").primaryKey(),
  note: text("note"),
  createdBy: text("created_by"),
  createdAt: created(),
});

/** 被拉黑（停用）的账号：不能登录，API token 失效 */
export const userStatus = pgTable("user_status", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  reason: text("reason"),
});

/** 待删除（0.19.1）：开放注册后不再使用，保留到上线验证通过，便于回滚 */
export const waitlist = pgTable("waitlist", {
  email: text("email").primaryKey(),
  locale: text("locale"),
  agents: text("agents").array().notNull().default([]),
  note: text("note"),
  source: text("source").notNull().default("login"),
  status: text("status").notNull().default("pending"), // pending | approved | declined
  createdAt: created(),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decidedBy: text("decided_by"),
}, (t) => [index("waitlist_status_idx").on(t.status, t.createdAt)]);

// ---- 意见反馈（用户主动填写；附登录邮箱以便回复；每周汇总发给管理员） ----
export const feedback = pgTable("feedback", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  email: text("email"),
  kind: text("kind").notNull().default("idea"), // idea | bug | other
  body: text("body").notNull(),
  /** 从哪个页面点进来的（路径，不含查询参数） */
  page: text("page"),
  createdAt: created(),
  /** 已进入哪次汇总邮件；为空 = 还没发 */
  digestedAt: timestamp("digested_at", { withTimezone: true }),
}, (t) => [index("feedback_pending_idx").on(t.digestedAt, t.createdAt)]);

/** 运维小状态（键值）：如上次汇总邮件时间、字典缺口计数快照 */
export const opsState = pgTable("ops_state", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: updated(),
});

/** 账号档位（免费 / 付费）；没有记录 = free。额度定义在 src/server/quota.ts */
export const accountPlan = pgTable("account_plan", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  plan: text("plan").notNull().default("free"), // free | pro
  note: text("note"),
  updatedAt: updated(),
});
