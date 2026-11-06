import { z } from "zod";
import { latestReadings, isAbnormal } from "@/core/analysis";
import type { VaultSnapshot } from "@/core/bundle";
import { activeItems, itemStatus, regimenWarnings, suggestedItems, type RegimenWarning } from "@/core/regimen";
import type { RegimenItem } from "@/core/schema";
import type { SavedFn, ToolFn, WriteDeps } from "./write-tools";
import { mergeItem, removeItemDoc, saveItemDoc, stopItemDoc, type RegimenPatch } from "./regimen-write";
import { ToolError, findMember } from "./tools";
import { currentDoc } from "./write";

// MCP 用药 / 补剂写入：药物只照实记录，补剂可以建议但必须和「真的在吃」分开。规则在服务端校验，不只靠提示词。

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (o: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(o) }] });

const warningText = (w: RegimenWarning) => {
  if (w.code === "duplicate") return `Looks like the same thing as "${w.other}" already on the list — check before adding a second entry.`;
  if (w.code === "allergy") return `Name matches the member's recorded allergy "${w.allergy}" — tell the user and do not save until they confirm.`;
  if (w.code === "expired") return `Expired on ${w.expiry} — tell the user not to take it.`;
  return `Expires soon (${w.expiry}).`;
};

const ANNOTATIONS = new Set(["precautions", "reason", "related", "basis"]);

function checkStatusRules(item: RegimenItem, existing: RegimenItem | undefined) {
  if (existing) {
    if (itemStatus(existing) !== "suggested" && itemStatus(item) === "suggested") throw new ToolError("an entry already being taken cannot go back to suggested — stop it instead");
    return;
  }
  if (!item.source) throw new ToolError("source is required for a new entry: prescribed, self or agent");
  if (item.source === "agent" && itemStatus(item) !== "suggested") throw new ToolError("your own suggestions must be saved with status \"suggested\" until the user agrees");
}

/** 服务端规则：药物不能来自 agent 建议（schema 也拦）；建议只能新写成 suggested；不是建议的实质改动都要有用户原话或处方内容 */
export function checkRegimenRules(item: RegimenItem, existing: RegimenItem | undefined, changed: string[], statement: string | undefined) {
  checkStatusRules(item, existing);
  // 只补充注意事项、理由、关联指标是 agent 的分析，不改变吃什么、怎么吃，不需要依据
  const substantive = changed.some((k) => !ANNOTATIONS.has(k));
  if (substantive && itemStatus(item) !== "suggested" && !statement?.trim()) throw new ToolError("user_statement is required: quote what the user said or what the prescription / label says");
}

/** 预览给 agent 判断相互作用用的完整上下文：Deepfy 不做药品库，判断由 agent 做 */
function reviewContext(s: VaultSnapshot, member: string, item: RegimenItem) {
  const m = findMember(s, member);
  const others = [...activeItems(m), ...suggestedItems(m)].filter((x) => x.id !== item.id);
  return {
    current: others.map((x) => ({ name: x.name, kind: x.kind, dose: x.dose, spec: x.spec, status: itemStatus(x) })),
    allergies: m.profile?.allergies ?? [],
    conditions: m.profile?.conditions ?? [],
    abnormal: latestReadings(m, s.catalog).filter((r) => isAbnormal(r.flag)).slice(0, 30).map((r) => ({ code: r.code, name: r.name, value: r.value, unit: r.unit, flag: r.flag })),
  };
}

function reviewHint(item: RegimenItem, changed: string[], existing?: RegimenItem) {
  const out = ["Check `context` for interactions, repeated ingredients, allergies and liver / kidney issues, then show the user this preview and wait for their confirmation."];
  if (item.kind === "medication") {
    out.push("Medication: record only what the doctor prescribed or the user says they take. Do not suggest starting, stopping, switching or changing the dose — raise concerns as questions for their doctor.");
    if (existing && changed.includes("dose")) out.push("If the doctor changed the dose: stop the old entry with stop_regimen_item and add a new one, so the history stays accurate. Edit in place only to fix a typo.");
  }
  if (itemStatus(item) === "suggested") out.push("Suggestion: explain why, based on this member's data, and the upper limit. It stays \"suggested\" and off the daily schedule until the user agrees; then call again with this id, status \"active\" and user_statement. Starting it resets start to today, so confirm any planned end date with them first.");
  if (!item.times.length && !item.frequency && !item.as_needed) out.push("No times or frequency given — ask how often it is taken.");
  return out.join(" ");
}

const followUp = (item: RegimenItem) => item.kind === "medication"
  ? "Offer to explain what to watch for (add to precautions), and if this medication needs monitoring, set a recheck date with save_indicator_note so it appears on the schedule. Link relevant markers via related so the trend chart marks it."
  : "Link relevant markers via related, so the trend chart shows whether it helps. Put the overall reasoning in the care plan with update_care_plan.";

const unknownCodes = (s: VaultSnapshot, item: RegimenItem) => item.related.filter((c) => !s.catalog.has(c));

const FIELDS = {
  id: z.string().max(40).optional().describe("Existing entry id from get_regimen; omit to add a new entry. Only the fields you pass change."),
  name: z.string().min(1).max(80).optional().describe("Name as on the box / prescription, e.g. 阿托伐他汀钙片"),
  kind: z.enum(["medication", "supplement"]).optional(),
  dose: z.string().min(1).max(60).optional().describe("Per-use amount, e.g. 20 mg, 1 粒"),
  source: z.enum(["prescribed", "self", "agent"]).optional().describe("Required for new entries. prescribed: from a doctor. self: the user decided / bought it. agent: your own suggestion (supplements only)."),
  status: z.enum(["suggested", "active"]).optional().describe("suggested: not being taken yet (default for source agent). Use active once the user agrees."),
  times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)).max(8).optional().describe("Exact clock times, only if known — don't invent them. Otherwise use frequency."),
  frequency: z.string().max(60).nullable().optional().describe("In words, e.g. 每日 2 次，早晚"),
  as_needed: z.boolean().optional(),
  days: z.array(z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"])).nullable().optional().describe("Only for specific weekdays; omit for daily"),
  with_food: z.boolean().nullable().optional().describe("true with food, false fasting"),
  start: date.optional().describe("Default today"),
  end: date.nullable().optional().describe("Planned end, not before start; a review reminder appears on this date"),
  reason: z.string().max(200).nullable().optional().describe("Why it is taken"),
  related: z.array(z.string().regex(/^[A-Z0-9_]{1,40}$/)).max(20).optional().describe("Marker codes it affects (lookup_indicator); the trend chart marks these"),
  prescriber: z.string().max(100).nullable().optional(),
  precautions: z.array(z.string().min(1).max(200)).max(10).nullable().optional().describe("What to watch for, from the leaflet / label or your analysis. Full list, replaces the current one."),
  brand: z.string().max(80).nullable().optional(),
  spec: z.string().max(120).nullable().optional().describe("Strength / main ingredients per unit, e.g. 每粒 D3 1000 IU"),
  expiry: date.nullable().optional().describe("Use-by date from the package. If unreadable or only a shelf life is given, ask the user — never guess."),
};

/** 依据存进条目；agent 新写的建议默认 suggested */
function patchFrom<F extends RegimenPatch>(fields: F, statement?: string): RegimenPatch {
  const isSuggestion = !fields.id && fields.source === "agent" && !fields.status;
  return { ...fields, ...(statement?.trim() ? { basis: statement.trim() } : {}), ...(isSuggestion ? { status: "suggested" as const } : {}) };
}

export function registerRegimenTools(tool: ToolFn, d: WriteDeps, saved: SavedFn, member: z.ZodString) {
  tool("save_regimen_item", "Add or edit one medication or supplement entry; other entries are untouched. Medication: record only what a doctor prescribed or the user says they take. Supplement: from a package photo the user sent, or your own suggestion based on this member's data (source agent, stays \"suggested\" until they agree). dry_run=true (default) returns a preview, warnings and the context to check for interactions; save with dry_run=false after the user confirms.", {
    member, ...FIELDS,
    user_statement: z.string().max(300).optional().describe("What the user said or what the prescription / label says; stored as the basis of this entry. Required to save anything except a suggestion or added notes."),
    dry_run: z.boolean().default(true),
  }, async (a, audit) => {
    const { member: m, user_statement: statement, dry_run, ...fields } = a;
    const patch = patchFrom(fields, statement);
    const s = await d.snapshot();
    const member_ = findMember(s, m);
    const preview = mergeItem(member_.regimen?.items ?? [], patch, d.today);
    const unknown = unknownCodes(s, preview.item);
    if (unknown.length) throw new ToolError(`unknown marker codes in related: ${unknown.join(", ")} — use lookup_indicator`);
    const warnings = regimenWarnings(preview.item, member_, d.today).map(warningText);
    if (dry_run) {
      checkRegimenRules(preview.item, preview.existing, preview.changed, "preview"); // 依据在真正写入时才要求
      return text({ dry_run: true, action: preview.existing ? "update" : "add", item: preview.item, changed: preview.changed, warnings, context: reviewContext(s, m, preview.item), hint: reviewHint(preview.item, preview.changed, preview.existing) });
    }
    let item!: RegimenItem;
    const ids = await d.writer.applyChanges((raw) => {
      const prev = currentDoc(raw, m, "regimen");
      const r = saveItemDoc(prev, patch, d.today);
      checkRegimenRules(r.item, r.existing, r.changed, statement);
      item = r.item;
      return [{ op: "put", member: m, kind: "regimen", key: "", ...r.doc }];
    }, { audit });
    return saved(`regimen ${item.id}`, ids, { id: item.id, status: itemStatus(item), warnings, follow_up: followUp(item) });
  });

  tool("stop_regimen_item", "Record that a member stopped a medication or supplement: only when the user says they or their doctor stopped it, never as your own advice for medication. The entry stays in the history. A suggestion that was never taken is removed instead.", {
    member, id: z.string().max(40).describe("Entry id from get_regimen"), date: date.optional().describe("First day not taken; default today"),
    reason: z.string().min(1).max(200).describe("Why, in the user's words"),
  }, async (a, audit) => {
    let label = "";
    const ids = await d.writer.applyChanges((raw) => {
      const prev = currentDoc(raw, a.member, "regimen");
      const cur = (prev?.data.items as RegimenItem[] | undefined)?.find((i) => i.id === a.id);
      if (cur && itemStatus(cur) === "suggested") {
        label = `removed suggestion ${a.id}`;
        return [{ op: "put", member: a.member, kind: "regimen", key: "", ...removeItemDoc(prev, a.id, d.today) }];
      }
      label = `stopped ${a.id}`;
      return [{ op: "put", member: a.member, kind: "regimen", key: "", ...stopItemDoc(prev, { id: a.id, on: a.date ?? d.today, reason: a.reason }, d.today).doc }];
    }, { audit });
    return saved(label, ids);
  });
}
