import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { upcomingRechecks } from "@/core/analysis";
import type { VaultSnapshot } from "@/core/bundle";
import { ImportRejected, KeyTaken, NotFound, type AuditInfo, type PgRepository } from "@/server/pg-repository";
import { conditionFocus, isResolved } from "@/core/health-template";
import { OtherItemSchema, RELATIONS } from "@/core/schema";
import { QuotaExceeded } from "@/server/quota";
import { registerRegimenTools } from "./regimen-tools";
import { ToolError, conditionOut, findMember } from "./tools";
import { MEASURE_ARGS, currentDoc, measuresDoc, patchProfileDoc, previewRecord, recordDoc, recordKey, scheduleChanges, stripDatePrefix, type RecordInput } from "./write";

// MCP 写入工具（M3.2）：只在 token 权限为「可写入」时注册。每次写入记一条 agent_change，用户可在 /agents 一键还原。

type HealthWriter = Pick<PgRepository, "applyChanges" | "addLog">;
export interface WriteDeps {
  writer: HealthWriter;
  audit: Omit<AuditInfo, "tool">;
  today: string;
  appUrl: string;
  snapshot: () => Promise<VaultSnapshot>;
  /** 写入后让同一请求里的读工具看到新数据 */
  invalidate: () => void;
}

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const;
const CONFIRM = "Confirm the content with the user before calling. Every write is recorded and the user can undo it on the Deepfy website.";
const member = z.string().describe("Member id from list_members");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const code = z.string().regex(/^[A-Z0-9_]{1,40}$/).describe("Indicator code (use lookup_indicator)");
const list = (what: string) => z.array(z.string().max(60)).max(30).optional().describe(`Full ${what} list — replaces the current one, so include existing items you want to keep (see get_overview)`);

type ToolResult = { content: { type: "text"; text: string }[] };
export type SavedFn = (label: string, changeIds: string[], extra?: Record<string, unknown>) => ToolResult;
export type ToolFn = <S extends z.ZodRawShape>(name: string, description: string, inputSchema: S, cb: (args: z.infer<z.ZodObject<S>>, audit: AuditInfo) => Promise<ToolResult>) => unknown;

const text = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o) }] });
const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

/** 新记下的诊断：告诉 agent 接下来该追问什么、该写到哪里（让档案不止一个病名） */
async function conditionFollowUp(d: WriteDeps, member: string, added: string[]) {
  const s = await d.snapshot();
  const focus = conditionFocus(findMember(s, member), s.catalog, d.today).filter((c) => added.includes(c.name)).map(conditionOut);
  return {
    conditions: focus,
    ask_user: [
      "When and how was it found (checkup, ultrasound, blood test)? Any report or numbers? → record reports with add_record (dry_run first)",
      "Recent diet, alcohol, exercise, sleep and weight changes → update_profile habits",
      "Any related discomfort? → add_log",
    ],
    then: "Offer to research it against the user's data and write a care plan with update_care_plan (focus on the focus_codes; include lifestyle changes, recheck timing and when to see a doctor). The overview page highlights conditions without a care plan.",
  };
}

/** 预览里给 agent 的提示：未知 code、与报告总数的差额、常规体检可能漏掉的部分 */
function previewHints(p: ReturnType<typeof previewRecord>) {
  const unknown = p.unknown_codes.length ? `Unknown codes ${p.unknown_codes.join(", ")} cannot be saved — map them with lookup_indicator, or move them to other_items (keep name, value, unit, reference); never invent codes. ` : "";
  const c = p.coverage;
  const gap = c && c.gap !== 0 ? `The report lists ${c.reported} items but mapped + other_items = ${c.mapped + c.other_items}; find the ${Math.abs(c.gap)} item(s) ${c.gap > 0 ? "still missing" : "counted twice"} before saving. ` : "";
  const missing = p.possibly_missing ? `A routine checkup usually also has: ${p.possibly_missing.join(", ")}. Re-check every page of the report (incl. appendix, imaging and summary pages) and add them if present; if they really are absent, tell the user. ` : "";
  return { unknown, hints: unknown + gap + missing };
}

/**
 * 记录 key：标题去掉重复日期后的 key；但旧记录当初是带日期的标题存的（key 为「日期 日期 标题」），
 * 用原标题补录 / 替换时沿用旧 key，否则会另起一条、旧的删不掉（MCP 不开放删除）。显示的标题仍用去掉日期后的。
 */
export function recordKeyFor(s: VaultSnapshot, member: string, input: { date: string; title: string }, title: string) {
  const key = recordKey(input.date, title);
  const m = s.members.find((x) => x.id === member);
  if (!m || m.records.some((x) => x.slug === key)) return key;
  // 旧记录：标题里带过日期（20260102 / 2026-01-02 / 2026/01/02 / 2026.01.02），key 为「日期 日期 标题」。
  // 不管 agent 这次传的是原标题还是已清理的标题，把同一天每条记录的 key 去掉重复日期后与新 key 比对（review：第二次替换不能另起一条）
  const d = input.date.replaceAll("-", "");
  const legacy = m.records.find((x) => x.slug.startsWith(`${d} `) && x.slug !== key
    && recordKey(input.date, stripDatePrefix(input.date, x.slug.slice(d.length + 1))) === key)?.slug;
  return legacy ?? key;
}

/** add_record：默认只预览；未知 code 拒绝；同名需 replace；有异常时提示 agent 后续可做的分析 */
async function addRecordTool(d: WriteDeps, a: RecordArgs, audit: AuditInfo, saved: Saved) {
  const { member: m, dry_run, replace, ...input } = a;
  const r = { ...input, title: stripDatePrefix(input.date, input.title) };
  if (!r.indicators.length && !r.other_items?.length) throw new ToolError("nothing to save — give at least one indicator or other_item");
  const snap = await d.snapshot();
  const key = recordKeyFor(snap, m, input, r.title);
  const preview = previewRecord(snap, m, r, key);
  const { unknown, hints } = previewHints(preview);
  if (dry_run) return text({ dry_run: true, ...preview, next: `${hints}Show this to the user; call again with dry_run=false to save.` });
  if (unknown) throw new ToolError(`nothing saved: ${unknown}`);
  if (preview.exists && !replace) throw new ToolError(`record "${preview.record}" already exists — pass replace=true to overwrite`);
  // 替换时保留原记录关联的附件（报告 PDF / 照片），MCP 不经手附件
  const ids = await d.writer.applyChanges((raw) =>
    [{ op: replace ? "put" : "create", member: m, kind: "record", key, ...recordDoc(r, currentDoc(raw, m, "record", key)) }], { audit })
    .catch((e) => { throw e instanceof KeyTaken ? new ToolError(`record "${key}" already exists — pass replace=true to overwrite`) : e; });
  // 这份报告里有待复查的指标：不自动完成，提醒 agent 问用户是否确认已检查（避免旧复查越堆越多）
  const recorded = new Set(r.indicators.map((i) => i.code));
  const rechecked = upcomingRechecks(findMember(await d.snapshot(), m)).filter((x) => recorded.has(x.code)).map((x) => x.code);
  const followUp = [
    ...(preview.abnormal.length ? [
      `Explain the abnormal markers to the user in plain words and ask about related habits or symptoms.`,
      `Offer to save an analysis per abnormal marker (save_indicator_note) and to update the care plan (update_care_plan) — read get_overview first.`,
    ] : []),
    ...(rechecked.length ? [`This report contains scheduled rechecks (${rechecked.join(", ")}). Ask the user whether this was that recheck; if yes, call update_schedule (kind=recheck, action=done) so it leaves the schedule. If a further recheck is needed, save a new indicator note with the new recheck date.`] : []),
  ];
  return saved(`record ${key}`, ids, {
    abnormal: preview.abnormal, unknown_codes: preview.unknown_codes,
    ...(rechecked.length ? { scheduled_rechecks_in_report: rechecked } : {}),
    ...(followUp.length ? { follow_up: followUp } : {}),
  });
}

const RECORD_SHAPE = {
  member, date, type: z.enum(["checkup", "lab", "device"]), title: z.string().min(1).max(100), institution: z.string().max(100).optional(),
    indicators: z.array(z.object({
      code, name: z.string().max(60).optional(), value: z.union([z.number(), z.string().max(60)]), unit: z.string().max(20).optional(),
      ref_low: z.number().optional(), ref_high: z.number().optional(), ref_text: z.string().max(60).optional(),
      flag: z.enum(["H", "L", "N", "A"]).optional().describe("Only when the report's own mark or remark differs from the computed flag"),
    })).max(300).default([]).describe("Items mapped to catalog codes (may be empty if every item goes to other_items)"),
    other_items: z.array(OtherItemSchema).max(300).optional().describe("Report items with no catalog code (lookup_indicator found nothing suitable) — keep them here verbatim instead of dropping them or inventing a code"),
    report_item_count: z.number().int().min(1).max(1000).optional().describe("Total number of items the report says it contains, if printed — the preview checks mapped + other_items against it"),
    notes: z.string().max(5000).optional().describe("Doctor's conclusions or remarks from the report"),
    dry_run: z.boolean().default(true), replace: z.boolean().default(false).describe("Overwrite an existing record with the same date and title"),
};

/** 健康计划写得过长或用了表格：写入照常，返回一句提醒让 agent 精简后重写（只提醒，不拒绝） */
export function carePlanHint(text: string): string | undefined {
  const issues = [
    ...(text.length > 2000 ? [`it is ${text.length} characters (aim for about 1000)`] : []),
    ...(/^\s*\|.*\|\s*$/m.test(text) ? ["it uses tables (use short lines instead; put details in save_indicator_note)"] : []),
  ];
  return issues.length ? `Saved, but the plan should be shorter and easier to follow: ${issues.join("; ")}. Offer the user a condensed rewrite in the 5-section format from the tool description.` : undefined;
}

type Saved = (label: string, changeIds: string[], extra?: Record<string, unknown>) => ReturnType<typeof text>;
type RecordArgs = RecordInput & { member: string; dry_run: boolean; replace: boolean };

const quotaMessage = (e: QuotaExceeded) => e.resource === "mcpWritesPerDay"
  ? `Daily write limit reached (${e.limit} saved changes per 24 h on this account), nothing saved. Tell the user; they can continue tomorrow or on the Deepfy website.`
  : e.resource === "attachmentBytes"
    ? `Attachment storage limit reached (${Math.round(e.limit / 1048576)} MB), nothing saved. Tell the user to remove old files on the Deepfy website.`
    : `Account limit reached (${e.resource}: ${e.limit}), nothing saved. Tell the user.`;

function toolFailure(e: unknown) {
  if (e instanceof ToolError) return fail(e.message);
  if (e instanceof NotFound) return fail("member not found — call list_members for valid ids");
  if (e instanceof ImportRejected) return fail(`rejected, nothing saved: ${e.issues.map((i) => i.message).join("; ").slice(0, 800)}`);
  if (e instanceof QuotaExceeded) return fail(quotaMessage(e));
  throw e;
}

const savedResult = (d: WriteDeps): SavedFn => (label, changeIds, extra = {}) => {
  d.invalidate();
  return text({ ok: true, saved: label, ...extra, change_ids: changeIds, undo: `Review or undo at ${d.appUrl}/agents` });
};

export function registerWriteTools(server: McpServer, d: WriteDeps) {
  const saved = savedResult(d);
  const tool: ToolFn = (name, description, inputSchema, cb) =>
    server.registerTool(name, { description: `${description} ${CONFIRM}`, inputSchema, annotations: WRITE }, (async (args: never) => {
      try {
        return await cb(args, { ...d.audit, tool: name });
      } catch (e) {
        return toolFailure(e);
      }
    }) as never);

  registerRegimenTools(tool, d, saved, member);

  tool("add_log", "Record a symptom or note for a member (what the user felt / noticed, in their words).", {
    member, title: z.string().min(1).max(120).describe("One-line summary, e.g. 右上腹隐痛"),
    date: date.optional().describe("Default today"), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
    type: z.enum(["symptom", "note"]).default("symptom"), severity: z.number().int().min(1).max(3).optional().describe("1 mild, 2 moderate, 3 severe"),
    tags: z.array(z.string().max(30)).max(20).default([]), detail: z.string().max(5000).optional(),
  }, async (a, audit) => {
    const { member: m, detail, date: day, ...rest } = a;
    const r = await d.writer.addLog(m, { ...rest, date: day ?? d.today, attachments: [] }, (detail ?? "").trim(), { audit });
    return saved(`log ${r.key}`, r.changeIds);
  });

  tool("update_profile", "Update a member's profile: relation to the account owner, exact birth date (replaces an age-based estimate), diagnosed conditions (e.g. 轻度脂肪肝), allergies, family history, habits, height / weight, blood type, checkup interval, free-text notes. Only the fields you pass change.", {
    member, relation: z.enum(RELATIONS).optional().describe("Relation to the account owner"),
    birth_date: date.optional().describe("Exact birth date, only when the user states it"),
    height_cm: z.number().min(50).max(250).optional(), weight_kg: z.number().min(2).max(400).optional(), blood_type: z.string().max(10).optional(),
    conditions: list("conditions / diagnoses"), allergies: list("allergies"), family_history: list("family history"),
    habits: z.object({ sleep: z.string().max(200), diet: z.string().max(200), exercise: z.string().max(200), smoking: z.string().max(100), alcohol: z.string().max(100), other: z.string().max(300) }).partial().optional(),
    checkup_interval_months: z.number().int().min(1).max(60).optional(), notes: z.string().max(5000).optional().describe("Replaces the profile notes"),
  }, async (a, audit) => {
    const { member: m, ...patch } = a;
    let before = new Set<string>();
    // 在写锁内读取最新档案再合并：并发的另一次更新不会被覆盖
    const ids = await d.writer.applyChanges((raw) => {
      const prev = currentDoc(raw, m, "profile");
      before = new Set(((prev?.data.conditions as string[] | undefined) ?? []).map((c) => c.trim()));
      return [{ op: "put", member: m, kind: "profile", key: "", ...patchProfileDoc(prev, patch, d.today) }];
    }, { audit });
    const added = (patch.conditions ?? []).map((c) => c.trim()).filter((c) => c && !before.has(c) && !isResolved(c)); // 已愈的只记病史，不追问
    return saved("profile", ids, added.length ? { follow_up: await conditionFollowUp(d, m, added) } : {});
  });

  tool("add_measurements", "Record home measurements for a date (merged into that day's daily record and shown in trends).", {
    member, date: date.optional().describe("Default today"),
    ...Object.fromEntries(Object.keys(MEASURE_ARGS).map((k) => [k, z.number().positive().max(400).optional()])) as Record<keyof typeof MEASURE_ARGS, z.ZodOptional<z.ZodNumber>>,
  }, async (a, audit) => {
    const { member: m, date: day = d.today, ...vals } = a;
    const key = `${day.replaceAll("-", "")} 日常记录`;
    const ids = await d.writer.applyChanges((raw) =>
      [{ op: "put", member: m, kind: "record", key, ...measuresDoc(currentDoc(raw, m, "record", key), { date: day, ...vals }) }], { audit });
    return saved(`record ${key}`, ids);
  });

  tool("add_record", "Import a test report (checkup / lab / device) as structured markers — ALL of it, not a selection. First read every page and list the report's sections (vitals incl. height / weight / blood pressure, blood count, urine, liver, kidney, lipids, glucose, thyroid, tumor markers, ECG / ultrasound / X-ray / CT conclusions, specialist exams, summary). Map each item with lookup_indicator; exam conclusions go in as text values under the 检查结论 codes (ECG, US_LIVER, CHEST_XRAY…). Keep the report's units and reference ranges; pass flag explicitly when the report's own ↑/↓ or remark differs. Put the doctor's summary and advice in notes. One record per test date. dry_run=true (default) returns a preview with flags, sections and possibly_missing — show it to the user, then call again with dry_run=false. Items with no catalog code go to other_items verbatim (never invent codes); pass report_item_count when the report prints a total. See deepfy://contract for the full intake guide.", RECORD_SHAPE, (a, audit) => addRecordTool(d, a, audit, saved));

  tool("save_indicator_note", "Write or replace your analysis of one marker for a member (status, one-line summary, full reasoning, recheck date). Shown on the marker's page.", {
    member, code, status: z.enum(["attention", "watch", "normal"]), summary: z.string().min(1).max(200),
    text: z.string().max(10000).describe("Analysis in Markdown: likely causes, what to change, sources"), recheck: date.optional(),
  }, async (a, audit) => {
    const { member: m, code: c, text: body, ...rest } = a;
    return saved(`note ${c}`, await d.writer.applyChanges((raw) => {
      currentDoc(raw, m, "note", c);
      return [{ op: "put", member: m, kind: "note", key: c, data: { code: c, updated: d.today, ...rest }, body }];
    }, { audit }));
  });

  tool("update_schedule", "Change the member's schedule (the 接下来 list in get_overview.schedule): mark a recheck / the next checkup as done after the user confirms it happened, or move its date. Only with the user's confirmation. Overdue items not marked done within 30 days are postponed 6 months automatically.", {
    member, kind: z.enum(["recheck", "checkup"]), codes: z.array(code).max(30).optional().describe("Recheck marker codes (required for kind=recheck)"),
    action: z.enum(["done", "reschedule"]), date: date.optional().describe("New date for action=reschedule"),
  }, async (a, audit) => {
    const { member: m, ...e } = a;
    return saved(`schedule ${e.kind}`, await d.writer.applyChanges((raw) => scheduleChanges(raw, m, e, d.today), { audit }));
  });

  tool("update_care_plan", "Replace a member's health plan (shown on the website as 健康计划): a short plan the family can read and follow. Read get_overview first and keep what is still valid; rewrite the whole plan when new reports arrive, don't append. Markdown, about 1000 Chinese characters, no tables (put per-marker reasoning in save_indicator_note). One opening line with the sources and dates plus 非诊断、非处方, then 5 sections: 现在的情况 (most important first, mark the 主线; one line each: conclusion + key values, trends with →) / 饮食与生活 (first acknowledge habits they already do well, then 3–5 concrete changes tailored to their habits) / 复查（重点） (fixed dates matching get_overview.schedule — use update_schedule to change them, try one date for the family; test list with new items marked 新增; fasting or not; which department, what to bring, 2–3 questions to ask the doctor; data still missing) / 及时就医 (3–5 specific red flags) / 目标 (what to finish within 1 month + measurable 3–6 month targets).", {
    member, focus: z.array(code).max(20).default([]).describe("Marker codes this plan focuses on"), text: z.string().min(1).max(20000).describe("Markdown"),
  }, async (a, audit) => {
    const ids = await d.writer.applyChanges((raw) => {
      currentDoc(raw, a.member, "care_plan");
      return [{ op: "put", member: a.member, kind: "care_plan", key: "", data: { updated: d.today, focus: a.focus }, body: a.text }];
    }, { audit });
    const hint = carePlanHint(a.text);
    return saved("care plan", ids, hint ? { follow_up: hint } : {});
  });
}
