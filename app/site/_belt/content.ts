import type { Locale } from "@/i18n/config";

// 传送带示例数据：虚构的一家人「林夏 / Lin Xia」和她的父母。
// 右侧卡片是 Deepfy 真实功能的样子；左侧代码与 Deepfy 真实的 vault / MCP 格式一致（字段名不要随手改）。

export interface CardTokens { original: number; distilled: number; url: string }

/** 原始材料（报告原文、聊天记录…）→ 结构化数据的 token 数（示例），顺序与 CARDS 一致 */
export const TOKENS: CardTokens[] = [
  { original: 52800, distilled: 1260, url: "deepfy://mcp tools/call add_record" },
  { original: 48350, distilled: 2140, url: "deepfy://lin-xia/records/20261015" },
  { original: 14900, distilled: 720, url: "deepfy://lin-xia/indicators/ALT" },
  { original: 22610, distilled: 640, url: "deepfy://lin-xia/series/ALT" },
  { original: 31200, distilled: 860, url: "deepfy://mcp tools/call list_members" },
  { original: 26400, distilled: 940, url: "deepfy://mom/overview/conditions" },
  { original: 18700, distilled: 610, url: "deepfy://family/overview/schedule" },
];

type Flag = "H" | "L" | "A" | "N";
type CheckStatus = "covered" | "due" | "missing";

export interface BeltCopy {
  chat: { kicker: string; title: string; photos: string; ask: string; reply: string; yes: string; tool: string; foot: string };
  report: { kicker: string; title: string; org: string; rows: [string, string, string, Flag][]; flag: Record<Flag, string>; note: string };
  insight: { kicker: string; code: string; title: string; blocks: [string, string][]; recheck: string };
  trend: { kicker: string; name: string; delta: string; range: string; years: [string, string, string] };
  family: { kicker: string; title: string; rows: [string, string, string, string, boolean][]; foot: string };
  condition: { kicker: string; who: string; title: string; rows: [string, string, CheckStatus][]; status: Record<CheckStatus, string>; ask: string };
  schedule: { kicker: string; title: string; rows: [string, string, string, string][]; done: string; mail: string };
}

export const COPY: Record<Locale, BeltCopy> = {
  zh: {
    chat: {
      kicker: "Agent 对话", title: "把报告拍给 agent，剩下的它来",
      photos: "体检报告 ×3", ask: "帮我录一下今年的体检",
      reply: "101 项都录好了，4 项需要关注。ALT 正好是 1 月那次复查，要标记「已查」吗？",
      yes: "是的", tool: "update_schedule · 可一键还原", foot: "Grokbot · Claude Code · Codex …",
    },
    report: {
      kicker: "年度体检 · 2026-10-15", title: "101 项全部录入，4 项需要关注", org: "示例体检中心",
      rows: [["丙氨酸氨基转移酶 ALT", "48", "U/L", "H"], ["甘油三酯 TG", "2.1", "mmol/L", "H"], ["25-羟基维生素D", "18", "ng/mL", "L"], ["腹部彩超 · 肝脏", "轻度脂肪肝", "", "A"]],
      flag: { H: "偏高", L: "偏低", A: "异常", N: "正常" },
      note: "化验、影像、心电图结论都录",
    },
    insight: {
      kicker: "指标解读", code: "ALT · 继续观察", title: "轻度升高，但比前两年一直在降",
      blocks: [["解读", "多与轻度脂肪肝、熬夜有关"], ["饮食", "少夜宵和含糖饮料"], ["作息与运动", "0:30 前睡，每周跑 3 次"], ["何时就医", "持续 >120 或乏力、黄疸"]],
      recheck: "复查 2027-01-15 → 已加入「接下来」",
    },
    trend: { kicker: "指标追踪", name: "ALT · 丙氨酸氨基转移酶", delta: "较 2024 年 ↓ 33%", range: "参考 7–40", years: ["2024", "2025", "2026"] },
    family: {
      kicker: "全家档案", title: "一家人的健康，一页看完",
      rows: [["林", "林夏", "本人 · 34 岁", "3 项需关注", false], ["妈", "妈妈", "母亲 · 约 62 岁", "高血压 · 2 项检查待补", true], ["爸", "爸爸", "父亲 · 约 65 岁", "体检已逾期", true]],
      foot: "每个账号独立密钥加密",
    },
    condition: {
      kicker: "已知状况", who: "妈妈 · 高血压、脂肪肝", title: "相关检查，还差两项",
      rows: [["血压", "本周", "covered"], ["肝功能", "2026-04", "covered"], ["血脂", "2025-03", "due"], ["腹部超声", "—", "missing"]],
      status: { covered: "已覆盖", due: "已过期", missing: "未查过" },
      ask: "Agent 会追问：最近血压多少？在吃什么药？",
    },
    schedule: {
      kicker: "接下来", title: "到期前，邮件先提醒你",
      rows: [["妈妈", "复查血脂", "11-20", "16 天后"], ["林夏", "复查 ALT、甘油三酯", "01-15", "72 天后"], ["爸爸", "年度体检", "2027-05", "已顺延"]],
      done: "已查 / 免查", mail: "每天 08:00 · 邮件只写项目名，不含数值",
    },
  },
  en: {
    chat: {
      kicker: "Agent chat", title: "Snap the report, your agent logs it all",
      photos: "Checkup report ×3", ask: "Log this year's checkup",
      reply: "All 101 items are in — 4 need attention. ALT was your January recheck. Mark it done?",
      yes: "Yes", tool: "update_schedule · undo anytime", foot: "Grokbot · Claude Code · Codex …",
    },
    report: {
      kicker: "Annual checkup · 2026-10-15", title: "All 101 items in, 4 need attention", org: "Sample Clinic",
      rows: [["ALT (liver enzyme)", "48", "U/L", "H"], ["Triglycerides", "2.1", "mmol/L", "H"], ["Vitamin D (25-OH)", "18", "ng/mL", "L"], ["Liver ultrasound", "Mild fatty liver", "", "A"]],
      flag: { H: "High", L: "Low", A: "Abnormal", N: "Normal" },
      note: "Labs, imaging and ECG findings",
    },
    insight: {
      kicker: "Insight", code: "ALT · watch", title: "Mildly high, but falling for two years",
      blocks: [["What it means", "Likely fatty liver, late nights"], ["Diet", "Fewer late snacks and sugary drinks"], ["Sleep & exercise", "Bed by 0:30, run 3× a week"], ["See a doctor if", "Stays >120, or fatigue / jaundice"]],
      recheck: "Recheck 2027-01-15 → added to Coming up",
    },
    trend: { kicker: "Tracking", name: "ALT · liver enzyme", delta: "↓ 33% since 2024", range: "Ref 7–40", years: ["2024", "2025", "2026"] },
    family: {
      kicker: "Family", title: "The whole family, on one page",
      rows: [["L", "Lin Xia", "Me · 34", "3 need attention", false], ["M", "Mom", "Mother · ~62", "Hypertension · 2 checks to do", true], ["D", "Dad", "Father · ~65", "Checkup overdue", true]],
      foot: "Encrypted with a per-account key",
    },
    condition: {
      kicker: "Known conditions", who: "Mom · hypertension, fatty liver", title: "Related checks: two to go",
      rows: [["Blood pressure", "this week", "covered"], ["Liver panel", "2026-04", "covered"], ["Lipid panel", "2025-03", "due"], ["Abdominal ultrasound", "—", "missing"]],
      status: { covered: "Covered", due: "Overdue", missing: "Never" },
      ask: "Your agent asks: recent readings? current meds?",
    },
    schedule: {
      kicker: "Coming up", title: "An email before anything is due",
      rows: [["Mom", "Recheck lipids", "11-20", "in 16 days"], ["Lin Xia", "Recheck ALT, TG", "01-15", "in 72 days"], ["Dad", "Annual checkup", "2027-05", "postponed"]],
      done: "Done / skip", mail: "08:00 daily · item names only, no results",
    },
  },
};

const TREND_CODE = `{
  "code": "ALT",
  "unit": "U/L",
  "points": [
    { "date": "2024-09-20", "value": 72,
      "low": 7, "high": 40, "flag": "H" },
    { "date": "2025-10-12", "value": 61,
      "low": 7, "high": 40, "flag": "H" },
    { "date": "2026-10-15", "value": 48,
      "low": 7, "high": 40, "flag": "H" }
  ],
  "trend": "improving"
}`;

const SCHEDULE_CODE = `"schedule": [
  { "member": "mom", "kind": "recheck",
    "codes": ["TG", "LDL_C"], "due": "2026-11-20" },
  { "member": "lin-xia", "kind": "recheck",
    "codes": ["ALT", "TG"], "due": "2027-01-15" },
  { "member": "dad", "kind": "annual-checkup",
    "due": "2027-05-12",
    "original_due": "2026-05-12" }
]
→ update_schedule { "action": "done" }`;

/** 每张卡片扫描后给 agent 的结构化数据（与 Deepfy 的 vault / MCP 格式一致） */
export function codes(locale: Locale): string[] {
  const c = COPY[locale];
  const zh = locale === "zh";
  return [
    `→ tools/call add_record
{ "member": "lin-xia", "date": "2026-10-15",
  "type": "checkup", "indicators": [ …101 ] }

← {
  "saved": "record 20261015 ${zh ? "年度体检" : "annual checkup"}",
  "report_item_count": 101,
  "flagged": ["ALT", "TG", "VITD", "US_LIVER"],
  "scheduled_rechecks_in_report": ["ALT"],
  "follow_up": "Ask whether this was the ALT
    recheck → update_schedule done"
}`,
    `---
date: 2026-10-15
type: checkup
title: ${zh ? "2026 年度体检" : "2026 annual checkup"}
institution: ${c.report.org}
indicators:
  - { code: ALT, value: 48, unit: U/L,
      ref_low: 7, ref_high: 40 }
  - { code: TG, value: 2.1, unit: mmol/L,
      ref_high: 1.7 }
  - { code: VITD, value: 18, unit: ng/mL,
      ref_low: 30, ref_high: 100 }
  - { code: US_LIVER, value: "${zh ? "轻度脂肪肝" : "mild fatty liver"}" }
  # … 97 more
---`,
    `---
code: ALT
updated: 2026-10-20
status: watch
summary: ${zh ? "轻度升高，较前两年持续下降" : "mildly high, falling since 2024"}
recheck: 2027-01-15
---
## ${zh ? "解读" : "What it means"}
## ${zh ? "饮食" : "Diet"}
## ${zh ? "作息与运动" : "Sleep & exercise"}
## ${zh ? "何时就医" : "When to see a doctor"}`,
    TREND_CODE,
    `[
  { "id": "lin-xia", "name": "${c.family.rows[0][1]}",
    "relation": "self", "age": 34, "abnormal": 3 },
  { "id": "mom", "name": "${c.family.rows[1][1]}",
    "relation": "mother", "age": 62,
    "age_estimated": true, "abnormal": 2 },
  { "id": "dad", "name": "${c.family.rows[2][1]}",
    "relation": "father", "age": 65,
    "age_estimated": true,
    "next_reminder": { "kind": "annual-checkup",
      "overdue": true } }
]`,
    `"conditions": [
  { "condition": "${zh ? "高血压" : "hypertension"}",
    "related_checks": [
      { "item": "bp", "status": "covered" } ],
    "has_care_plan": false },
  { "condition": "${zh ? "脂肪肝" : "fatty liver"}",
    "related_checks": [
      { "item": "liver", "status": "covered" },
      { "item": "lipid", "status": "due",
        "last": "2025-03-02" },
      { "item": "ultrasound", "status": "missing" } ] }
],
"follow_up": "Ask for recent BP readings
  and current medication"`,
    SCHEDULE_CODE,
  ];
}
