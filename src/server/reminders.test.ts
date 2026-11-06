import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ScheduleItem } from "@/core/analysis";
import { mergeCatalog } from "@/core/bundle";
import { createDb, type DB } from "@/db/client";
import { reminderSetting, user, userStatus } from "@/db/schema";
import { todayCN } from "./cn-time";
import { newDek, randomId } from "./crypto";
import { inviteHtml, otpMail, reminderHtml } from "./mail";
import { PgRepository } from "./pg-repository";
import {
  confirmEmailChange, dueItems, getSetting, itemLine, pauseParams, requestEmailChange, runReminderJob, setEnabled, setLeadDays,
  verifyPause, windowStart, type ReminderMail,
} from "./reminders";

const item = (kind: ScheduleItem["kind"], due: string, codes: string[] = [], params: ScheduleItem["params"] = {}): ScheduleItem =>
  ({ memberId: "m", kind, due, overdue: false, soon: true, message: "", codes, code: codes[0], params });

describe("提醒窗口 dueItems", () => {
  const members = [{ id: "m", name: "妈妈", items: [
    item("recheck", "2026-11-24", ["ALB", "CREA"]),
    item("recheck", "2026-12-31", ["ECG"]),
    item("annual-checkup", "2026-11-17"), // 从未体检：到期日永远是今天，不发
    item("annual-checkup", "2026-11-20", [], { last: "2025-11-20", interval: 12 }),
  ] }];

  it("到期前 7 天和当天各触发一次", () => {
    expect(dueItems(members, [7, 0], "2026-11-16", "2026-11-17").map((d) => [d.item.due, d.lead])).toEqual([["2026-11-24", 7]]);
    expect(dueItems(members, [7, 0], "2026-11-12", "2026-11-13").map((d) => [d.item.kind, d.lead])).toEqual([["annual-checkup", 7]]);
    expect(dueItems(members, [7, 0], "2026-11-14", "2026-11-15").length).toBe(0);
    expect(dueItems(members, [7, 0], "2026-11-23", "2026-11-24").map((d) => [d.item.codes, d.lead])).toEqual([[["ALB", "CREA"], 0]]);
  });

  it("漏跑补发：同一项命中多个提前天数只发一次，取最近的", () => {
    const got = dueItems(members, [7, 3, 0], "2026-11-16", "2026-11-24");
    expect(got.map((d) => [d.item.due, d.lead])).toEqual([["2026-11-20", 0], ["2026-11-24", 0]]);
  });

  it("没有体检记录但手动定了日期：提前 7 天和当天照常提醒（Codex review P2）", () => {
    const first = [{ id: "m", name: "爸爸", items: [item("annual-checkup", "2026-11-11", [], { interval: 12, scheduled: "2026-11-11" })] }];
    expect(dueItems(first, [7, 0], "2026-11-03", "2026-11-04").map((d) => d.lead)).toEqual([7]);
    expect(dueItems(first, [7, 0], "2026-11-10", "2026-11-11").map((d) => d.lead)).toEqual([0]);
  });

  it("windowStart：首次从昨天开始；漏跑最多往回 7 天", () => {
    expect(windowStart(null, "2026-11-17")).toBe("2026-11-16");
    expect(windowStart("2026-11-15", "2026-11-17")).toBe("2026-11-15");
    expect(windowStart("2026-10-01", "2026-11-17")).toBe("2026-11-10");
  });

  it("todayCN 按北京时间：UTC 17:00 已是第二天", () => {
    expect(todayCN(new Date("2026-11-16T17:00:00Z"))).toBe("2026-11-17");
    expect(todayCN(new Date("2026-11-16T15:00:00Z"))).toBe("2026-11-16");
  });
});

describe("邮件内容", () => {
  const catalog = mergeCatalog([]);
  const HAN = /\p{Script=Han}/u;

  it("英文提醒：项目名、日期说明和整封邮件都是英文，只有成员称呼保持原样", () => {
    const line = itemLine({ memberId: "m", memberName: "Mom", item: item("recheck", "2026-11-24", ["ALB", "CREA"]), lead: 7 }, catalog, "2026-11-23", "en");
    expect(line.what).toBe("Recheck Albumin, Creatinine");
    expect(line.when).toBe("2026-11-24 (in 1 day)");
    expect(itemLine({ memberId: "m", memberName: "Mom", item: item("annual-checkup", "2026-11-20", []), lead: 0 }, catalog, "2026-11-23", "en").when).toBe("2026-11-20 (3 days overdue)");
    const html = reminderHtml([line], "https://x/pause", "en");
    expect(html).toContain('lang="en"');
    expect(html).not.toMatch(HAN);
  });

  it("英文验证码和邀请不含中文；中文版不混英文说明；未指定语言按中文", () => {
    for (const type of ["sign-in", "email-verification", "forget-password", "change-email"] as const) {
      const m = otpMail("123456", type, "en");
      expect(`${m.subject}${m.html}${m.text}`).not.toMatch(HAN);
      expect(m.subject).toContain("123456");
    }
    expect(inviteHtml("a@example.com", "en")).not.toMatch(HAN);
    const zh = otpMail("123456", "sign-in");
    expect(zh.subject).toBe("123456 是你的 Deepfy 健康档案登录验证码");
    expect(zh.html).toContain('lang="zh-CN"');
    expect(zh.html).not.toContain("Your code");
    expect(inviteHtml("a@example.com")).toContain("开始使用");
  });

  it("只写称呼、项目名和日期；转义 HTML", () => {
    const line = itemLine({ memberId: "m", memberName: "妈<b>妈", item: item("recheck", "2026-11-24", ["ALB", "CREA"]), lead: 7 }, catalog, "2026-11-17");
    expect(line.what).toBe("复查 白蛋白、肌酐");
    expect(line.when).toBe("2026-11-24（还有 7 天）");
    const html = reminderHtml([line], "https://x/pause");
    expect(html).toContain("妈&lt;b&gt;妈");
    expect(html).not.toContain("<b>妈");
  });

  it("一键暂停签名：本人有效，篡改无效", () => {
    const kek = newDek();
    const q = new URLSearchParams(pauseParams(kek, "u1"));
    expect(verifyPause(kek, "u1", q.get("s")!)).toBe(true);
    expect(verifyPause(kek, "u2", q.get("s")!)).toBe(false);
    expect(verifyPause(newDek(), "u1", q.get("s")!)).toBe(false);
    expect(verifyPause(kek, "u1", "x")).toBe(false);
  });
});

const URL = process.env.KZ_TEST_DATABASE_URL;

describe.skipIf(!URL)("提醒设置与每日任务（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const kek = newDek();
  const uid = `rem-${randomId()}`;
  const off = `rem-off-${randomId()}`;

  beforeAll(async () => {
    db = createDb(URL!);
    for (const id of [uid, off]) await db.insert(user).values({ id, name: id, email: `${id}@example.com` });
    const repo = new PgRepository(db, uid, kek);
    await repo.applyChanges([
      { op: "add_member", id: "m-mom", name: "妈妈", profile: { id: "m-mom", name: "妈妈", sex: "female", birth_date: "1965-01-01" } },
      { op: "put", member: "m-mom", kind: "note", key: "ALT", data: { code: "ALT", updated: "2026-11-01", status: "watch", summary: "ALT 偏高 88", recheck: "2026-11-24" }, body: "ALT 88 U/L" },
    ]);
  });
  afterAll(async () => {
    for (const id of [uid, off]) await db.delete(user).where(eq(user.id, id));
    await db.$client.end();
  });

  it("默认没有设置（视为开启）；提前天数只接受预设值", async () => {
    expect(await getSetting(db, uid)).toBeUndefined();
    await setLeadDays(db, uid, [7, 0, 5, 7]);
    expect((await getSetting(db, uid))!.leadDays).toEqual([7, 0]);
    expect((await getSetting(db, uid))!.enabled).toBe(true);
  });

  it("换收件邮箱：验证码正确才生效，错 5 次作废；填回登录邮箱恢复默认", async () => {
    const { code } = await requestEmailChange(db, uid, `${uid}@example.com`, "  New@Example.com ");
    expect(code).toMatch(/^\d{6}$/);
    expect(await confirmEmailChange(db, uid, "000000" === code ? "111111" : "000000")).toBe(false);
    expect((await getSetting(db, uid))!.email).toBeNull();
    expect(await confirmEmailChange(db, uid, code!)).toBe(true);
    expect((await getSetting(db, uid))!.email).toBe("new@example.com");
    expect(await confirmEmailChange(db, uid, code!)).toBe(false); // 用过即失效

    const again = await requestEmailChange(db, uid, `${uid}@example.com`, "other@example.com");
    for (let i = 0; i < 5; i++) await confirmEmailChange(db, uid, "x");
    expect(await confirmEmailChange(db, uid, again.code!)).toBe(false);
    expect(await confirmEmailChange(db, uid, again.code!, new Date(Date.now() + 10 * 60_000))).toBe(false);

    expect((await requestEmailChange(db, uid, `${uid}@example.com`, `${uid}@EXAMPLE.com`)).reset).toBe(true);
    expect((await getSetting(db, uid))!.email).toBeNull();
    await expect(requestEmailChange(db, uid, `${uid}@example.com`, "not-an-email")).rejects.toThrow();
  });

  it("每日任务：只发已启用、未停用的账号；同一天不重复；邮件里没有数值与分析", async () => {
    await setEnabled(db, uid, true, "2026-11-16");
    await setEnabled(db, off, true, "2026-11-16");
    await db.insert(userStatus).values({ userId: off, disabledAt: new Date() });
    const sent: ReminderMail[] = [];
    const send = async (m: ReminderMail) => { sent.push(m); };

    // 11-17：ALT 复查 11-24，提前 7 天
    const r = await runReminderJob(db, kek, send, "2026-11-17");
    const mine = sent.filter((m) => m.userId === uid || m.userId === off);
    expect(mine.map((m) => m.userId)).toEqual([uid]);
    expect(mine[0].to).toBe(`${uid}@example.com`);
    expect(mine[0].items).toEqual([{ who: "妈妈", what: "复查 丙氨酸氨基转移酶", when: "2026-11-24（还有 7 天）" }]);
    expect(mine[0].locale).toBe("zh"); // 还没同步过语言的账号按中文
    // 只查邮件内容：userId / 收件地址含随机 id，可能碰巧出现「88」（review：随机 id 导致偶发误判）
    expect(JSON.stringify({ ...mine[0], userId: "", to: "" })).not.toMatch(/88|偏高/);
    expect(r.checked).toBeGreaterThan(0); // 测试库里其他用例的账号用别的主密钥，失败数不在这里断言

    const before = sent.length;
    await runReminderJob(db, kek, send, "2026-11-17");
    expect(sent.filter((m) => m.userId === uid).length).toBe(1);
    expect(sent.length).toBeGreaterThanOrEqual(before);
    expect((await getSetting(db, uid))!.lastChecked).toBe("2026-11-17");

    // 暂停后不发
    await setEnabled(db, uid, false);
    await runReminderJob(db, kek, send, "2026-11-24");
    expect(sent.filter((m) => m.userId === uid).length).toBe(1);
    await db.delete(reminderSetting).where(eq(reminderSetting.userId, off));
  });
});
