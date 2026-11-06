import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type DB } from "@/db/client";
import { feedback, opsState, user } from "@/db/schema";
import { randomId } from "./crypto";
import { addFeedback, FeedbackForm, runDigest, type Digest } from "./feedback";
import { digestHtml } from "./mail";
import { countMail, resourceStats } from "./ops";

describe("反馈表单与汇总邮件", () => {
  it("来源页只留站内路径；正文去空白、过短拒绝", () => {
    expect(FeedbackForm.parse({ kind: "bug", body: "  打不开  ", page: "/m/x/records?token=1#a" })).toEqual({ kind: "bug", body: "打不开", page: "/m/x/records" });
    expect(FeedbackForm.parse({ body: "建议加个导出", page: "https://evil.example/x" }).page).toBeUndefined();
    expect(FeedbackForm.parse({ body: "建议加个导出", page: "//evil.example" }).page).toBeUndefined();
    expect(FeedbackForm.safeParse({ body: " a " }).success).toBe(false);
    expect(FeedbackForm.safeParse({ kind: "spam", body: "hello" }).success).toBe(false);
  });

  it("汇总邮件转义用户写的内容", () => {
    const d: Digest = {
      since: null, stats: { users: 3, newUsers: 1 }, resources: { mailWeek: 12, mailPeakDay: 4, mailMonth: 30, attachmentBytes: 0, diskUsedPct: 40, alert: false },
      feedback: [{ id: "f", userId: null, email: "a@b.c", kind: "idea", body: "<script>x</script>", page: "/m/<i>", createdAt: new Date(), digestedAt: null }],
      gaps: [{ name: "<b>谷胱甘肽</b>", unit: null, section: null, count: 3, added: 1, isNew: false }],
    };
    const html = digestHtml(d, "https://x");
    expect(html).not.toMatch(/<script>|<i>|<b>谷/);
    expect(html).toContain("&lt;script&gt;");
  });
});

const URL = process.env.KZ_TEST_DATABASE_URL;

describe.skipIf(!URL)("每周汇总（需要 KZ_TEST_DATABASE_URL）", () => {
  let db: DB;
  const uid = `fb-${randomId()}`;
  beforeAll(async () => {
    db = createDb(URL!);
    await db.delete(opsState).where(inArray(opsState.key, ["digest", "digest-gaps"]));
    await db.insert(user).values({ id: uid, name: "fb", email: `${uid}@example.com`, emailVerified: true });
  });
  afterAll(async () => {
    await db.delete(feedback).where(eq(feedback.userId, uid));
    await db.delete(user).where(eq(user.id, uid));
    await db.delete(opsState).where(inArray(opsState.key, ["digest", "digest-gaps"]));
    await db.$client.end();
  });

  it("每日发信计数与资源统计", async () => {
    await db.delete(opsState).where(inArray(opsState.key, ["mail:2026-11-03", "mail:2026-11-04", "mail:2026-10-01"]));
    await countMail(db, "2026-11-03");
    for (let i = 0; i < 3; i++) await countMail(db, "2026-11-04");
    await countMail(db, "2026-10-01"); // 超出 7 天窗口
    const r = await resourceStats(db, "2026-11-04");
    expect(r).toMatchObject({ mailWeek: 4, mailPeakDay: 3, mailMonth: 4 }); // 10-01 不在本月也不在 7 天内
    expect(r.attachmentBytes).toBeGreaterThanOrEqual(0);
    await db.delete(opsState).where(inArray(opsState.key, ["mail:2026-11-03", "mail:2026-11-04", "mail:2026-10-01"]));
  });

  it("新反馈进汇总并标记；7 天内不再发；发信失败不改状态", async () => {
    const u = { id: uid, email: `${uid}@example.com` };
    await addFeedback(db, u, FeedbackForm.parse({ kind: "bug", body: "记录页上传失败", page: "/m/x/records" }));
    await addFeedback(db, u, FeedbackForm.parse({ body: "希望能导出 PDF" }));
    const mine = (d: Digest) => d.feedback.filter((f) => f.userId === uid).map((f) => f.body);

    const t0 = new Date("2026-11-09T01:00:00Z");
    await expect(runDigest(db, async () => { throw new Error("smtp down"); }, t0)).rejects.toThrow();
    expect((await db.select().from(feedback).where(eq(feedback.userId, uid))).every((f) => !f.digestedAt)).toBe(true);

    const sent: Digest[] = [];
    const r = await runDigest(db, async (d) => { sent.push(d); }, t0);
    expect(r.sent).toBe(true);
    expect(mine(sent[0])).toEqual(["记录页上传失败", "希望能导出 PDF"]);
    expect((await db.select().from(feedback).where(eq(feedback.userId, uid))).every((f) => f.digestedAt)).toBe(true);

    expect(await runDigest(db, async (d) => { sent.push(d); }, new Date("2026-11-12T01:00:00Z"))).toMatchObject({ sent: false, reason: "not-due" });

    await addFeedback(db, u, FeedbackForm.parse({ body: "第二周的建议" }));
    await runDigest(db, async (d) => { sent.push(d); }, new Date("2026-11-16T01:00:00Z"));
    expect(mine(sent.at(-1)!)).toEqual(["第二周的建议"]);
  });
});
