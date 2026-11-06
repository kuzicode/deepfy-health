import type { RawDoc } from "@/core/bundle";
import { RegimenItemSchema, type RegimenItem } from "@/core/schema";
import { randomId } from "@/server/crypto";
import { ToolError } from "./tools";

// 用药 / 补剂写入的纯函数（网页与 MCP 共用）：逐条修改，其他条目和正文原样保留。

const newRegimenId = () => `rx-${randomId().replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8)}`;

/** 只改给出的字段；null 表示清空这个字段 */
export type RegimenPatch = { id?: string } & { [K in Exclude<keyof RegimenItem, "id" | "doctor_confirmed">]?: RegimenItem[K] | null };

const listOf = (prev: RawDoc | undefined) => ((prev?.data.items as RegimenItem[] | undefined) ?? []);

function parseItem(data: Record<string, unknown>): RegimenItem {
  const r = RegimenItemSchema.safeParse(data);
  if (!r.success) throw new ToolError(`invalid regimen item: ${r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 400)}`);
  return r.data;
}

/** null 清空、undefined 不动 */
function applyPatch(base: Record<string, unknown>, patch: RegimenPatch) {
  const out = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else if (v !== undefined) out[k] = v;
  }
  return out;
}

/** 状态变化的连带：采纳建议时开始日期从今天算（写建议的日期不是实际开始吃的日期）；恢复在用时停用信息作废 */
function settleStatus(merged: Record<string, unknown>, existing: RegimenItem | undefined, patch: RegimenPatch, today: string) {
  const nowActive = merged.status !== "suggested" && merged.status !== "stopped";
  if (!nowActive) return;
  if (existing?.status === "suggested" && !patch.start) merged.start = today;
  delete merged.stopped_on;
  delete merged.stop_reason;
}

/** 结束 / 停用日期不能早于开始：当天安排和趋势图都靠这个区间。采纳过期建议也在这里拦下，开始日期刚被改成今天 */
function checkDates(item: RegimenItem) {
  const ends = item.stopped_on ?? item.end;
  if (ends && ends < item.start) throw new ToolError(`end date ${ends} is before the start date ${item.start} — ask the user for a new end date, or pass end: null if there is none`);
}

function changedKeys(existing: RegimenItem | undefined, item: RegimenItem) {
  if (!existing) return Object.keys(item);
  const differs = (k: string) => JSON.stringify(existing[k as keyof RegimenItem]) !== JSON.stringify(item[k as keyof RegimenItem]);
  return Object.keys({ ...existing, ...item }).filter(differs);
}

/** 合并出新条目：已有条目按 patch 修改；新条目缺名称 / 类型 / 剂量时由 schema 拒绝。不写入，便于先预览 */
export function mergeItem(items: RegimenItem[], patch: RegimenPatch, today: string): { item: RegimenItem; existing?: RegimenItem; changed: string[] } {
  const existing = patch.id ? items.find((i) => i.id === patch.id) : undefined;
  if (patch.id && !existing) throw new ToolError(`regimen item "${patch.id}" not found — use get_regimen for ids`);
  const merged = applyPatch({ start: today, ...existing }, patch);
  merged.id = existing?.id ?? newRegimenId();
  settleStatus(merged, existing, patch, today);
  // 医生开的即已确认；没动来源的老条目保留原值
  merged.doctor_confirmed = patch.source || !existing ? merged.source === "prescribed" : existing.doctor_confirmed;
  const item = parseItem(merged);
  checkDates(item);
  return { item, existing, changed: changedKeys(existing, item) };
}

const replaceItem = (items: RegimenItem[], item: RegimenItem) =>
  items.some((i) => i.id === item.id) ? items.map((i) => (i.id === item.id ? item : i)) : [...items, item];

const asDoc = (prev: RawDoc | undefined, items: RegimenItem[], today: string) => ({ data: { ...prev?.data, updated: today, items }, body: prev?.body ?? "" });

export function saveItemDoc(prev: RawDoc | undefined, patch: RegimenPatch, today: string) {
  const { item, existing, changed } = mergeItem(listOf(prev), patch, today);
  return { item, existing, changed, doc: asDoc(prev, replaceItem(listOf(prev), item), today) };
}

/** 停用：保留历史，趋势图和 agent 都还看得到这段时间吃过什么 */
export function stopItemDoc(prev: RawDoc | undefined, { id, on, reason }: { id: string; on: string; reason?: string }, today: string) {
  const items = listOf(prev);
  const cur = items.find((i) => i.id === id);
  if (!cur) throw new ToolError(`regimen item "${id}" not found — use get_regimen for ids`);
  if (on < String(cur.start)) throw new ToolError(`stop date ${on} is before the start date ${String(cur.start)}`);
  const item = parseItem({ ...cur, status: "stopped", stopped_on: on, ...(reason ? { stop_reason: reason } : {}) });
  return { item, doc: asDoc(prev, replaceItem(items, item), today) };
}

/** 删除：网页上的「录错了 / 不用了」；建议中的补剂从没吃过，agent 也可以撤掉 */
export function removeItemDoc(prev: RawDoc | undefined, id: string, today: string) {
  const items = listOf(prev);
  if (!items.some((i) => i.id === id)) throw new ToolError(`regimen item "${id}" not found — use get_regimen for ids`);
  return asDoc(prev, items.filter((i) => i.id !== id), today);
}
