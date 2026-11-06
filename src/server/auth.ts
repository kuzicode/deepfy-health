import { and, eq } from "drizzle-orm";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { getDb } from "@/db/client";
import * as schema from "@/db/schema";
import { isDisabled, isEmailAllowed } from "./access";
import { masterKey } from "./crypto";
import { sendOtpEmail } from "./mail";
import { resolveLocale } from "@/i18n/resolve";
import { clientIp, createLimiter } from "./login-lookup";
import { assignAvatarOnSignup } from "./avatar";
import { ensureUserKey } from "./pg-repository";

/** 验证码发信：同一邮箱每小时最多 5 封（超出静默不发，不暴露账号是否存在）；同一 IP 每天 20 次由下面的 rateLimit 规则管 */
const otpPerEmail = createLimiter(5, 3600_000);

/**
 * 校验验证码的接口：重发验证码不清零。同一邮箱 + IP 每天 30 次，别人只锁得住自己这个 IP，锁不住邮箱主人；
 * 同一邮箱全部 IP 合计每天 300 次兜底，防止换 IP 分散猜 6 位验证码
 */
const OTP_CHECK_PATHS = new Set(["/sign-in/email-otp", "/email-otp/verify-email", "/email-otp/reset-password", "/email-otp/check-verification-otp"]);
const otpChecksPerEmailIp = createLimiter(30, 86_400_000);
const otpChecksPerEmail = createLimiter(300, 86_400_000);

/** 会发验证码的接口：同一 IP 每天 20 次 */
const OTP_SEND_RULE = { window: 86_400, max: 20 };

/** 邮箱注册的全站每日上限：每次注册都发一封验证邮件，不能让批量注册把发信额度用光，导致其他人收不到登录验证码。Google 注册不发信，不计入 */
const signupBudget = createLimiter(Number(process.env.KZ_SIGNUP_DAILY_LIMIT) || 60, 86_400_000);

/** 验证码语言跟用户正在看的页面走；不在请求上下文时（脚本）用中文 */
const otpLocale = () => resolveLocale().catch(() => "zh" as const);

const signupsPerIp = createLimiter(5, 86_400_000);

/** 在账号真正创建前才计数：格式不对、密码太短、邮箱已注册或不在名单内的请求都到不了这里，不能用来耗尽全站名额 */
function assertSignupQuota(req: Request | undefined) {
  if (req && !signupsPerIp(clientIp(req))) throw new APIError("TOO_MANY_REQUESTS", { code: "rate_limited", message: "Too many sign-ups" });
  if (!signupBudget("all")) throw new APIError("TOO_MANY_REQUESTS", { code: "signup_busy", message: "Sign-ups are full today" });
}

function createAuth() {
  const db = getDb();
  return betterAuth({
    // 只信反向代理设置的 X-Real-IP：X-Forwarded-For 可以被客户端带上假值
    advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip"] } },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!OTP_CHECK_PATHS.has(ctx.path)) return;
        const email = String(ctx.body?.email ?? "").trim().toLowerCase();
        if (email && (!otpChecksPerEmailIp(`${email}|${ctx.request ? clientIp(ctx.request) : "local"}`) || !otpChecksPerEmail(email))) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many attempts" });
      }),
    },
    rateLimit: { customRules: { "/email-otp/send-verification-otp": OTP_SEND_RULE, "/email-otp/request-password-reset": OTP_SEND_RULE, "/forget-password/email-otp": OTP_SEND_RULE, "/sign-up/email": { window: 3600, max: 5 } } },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user: schema.user, session: schema.session, account: schema.account, verification: schema.verification },
    }),
    // 注册：邮箱 + 密码，必须用邮箱验证码完成验证后才能登录
    emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 8, maxPasswordLength: 128, revokeSessionsOnPasswordReset: true },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      // 防抢注：邮箱验证前设的密码来历不明（可能是别人抢先用这个邮箱注册的），验证时一律作废；
      // 网页在验证成功后再把用户刚输入的密码设上（app/login/actions.ts）
      beforeEmailVerification: async (u) => {
        if (!u.emailVerified) await db.delete(schema.account).where(and(eq(schema.account.userId, u.id), eq(schema.account.providerId, "credential")));
      },
    },
    // 同一邮箱用密码、验证码、Google 哪种方式登录都是同一个账号。不要设 trustedProviders：
    // 它会跳过 better-auth 对「Google 邮箱已验证」的检查，邮箱未验证的 Google 身份就能关联到别人的账号
    account: { accountLinking: { enabled: true } },
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID ?? "",
        clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        // 「登录」不自动建号，只有「注册」（已勾选同意条款）才会创建账号
        disableImplicitSignUp: true,
      },
    },
    user: {
      // 默认开放注册；设了 KZ_ALLOWED_EMAILS 的实例只允许名单内的邮箱和管理员
      validateUserInfo: async ({ user, source }) => {
        if (source.method === "oauth" && user.emailVerified === false) return { error: "email_not_verified" };
        if (!isEmailAllowed(String(user.email ?? ""))) return { error: "not_allowed" };
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (_u, ctx) => {
            if (ctx?.path === "/sign-up/email") assertSignupQuota(ctx.request);
          },
          after: async (u) => {
            await ensureUserKey(db, u.id, masterKey());
            await assignAvatarOnSignup(db, u.id); // 预设头像随机分配（清单为空时跳过）
          },
        },
      },
      // 被拉黑的账号不能建立新会话（拉黑时已删除旧会话）；带上 code，密码、验证码、Google 登录才都能显示正确提示
      session: {
        create: {
          before: async (s) => {
            if (await isDisabled(db, s.userId)) throw new APIError("FORBIDDEN", { code: "disabled", message: "Account disabled" });
          },
        },
      },
    },
    onAPIError: { errorURL: "/login" },
    // 国内入口二期（需要已备案域名、审核通过的短信签名、微信开放平台网站应用）：
    // - 手机号：better-auth/plugins 的 phoneNumber({ sendOTP })，接阿里云 / 腾讯云短信
    // - 微信：genericOAuth 插件配置 open.weixin.qq.com 的扫码登录；同一账号表，按 accountLinking 合并
    // 登录页 app/login/LoginView.tsx 已预留两个按钮
    plugins: [
      emailOTP({
        storeOTP: "hashed", // 读到数据库也拿不到有效的验证码
        overrideDefaultEmailVerification: true, // 邮箱验证用 6 位验证码而不是链接
        disableSignUp: true, // 验证码登录只给已注册用户，注册必须走勾选条款的注册页
        expiresIn: 300,
        allowedAttempts: 5,
        // 不 await：避免通过响应时间探测邮箱是否存在
        sendVerificationOTP: async ({ email, otp, type }) => { if (otpPerEmail(email.trim().toLowerCase())) void otpLocale().then((locale) => sendOtpEmail(email, otp, type, locale)).catch((e) => console.error("otp mail failed:", e instanceof Error ? e.message : "unknown")); },
      }),
      nextCookies(),
    ],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
export const getAuth = () => (instance ??= createAuth());
