import { z } from "zod";
import { isoDate } from "./schema";

const optional = <S extends z.ZodType>(schema: S) =>
  schema.nullable().transform((value) => value ?? undefined).optional();
const text = optional(z.string());

export const InsurancePolicySchema = z.object({
  category: z.string().trim().min(1),
  product: z.string().trim().min(1),
  coverage: text,
  premium: optional(z.union([z.string(), z.number()])),
  payment_term: text,
  term: text,
  renewal_date: optional(isoDate),
  beneficiary: text,
  note: text,
});
export type InsurancePolicy = z.infer<typeof InsurancePolicySchema>;

export const InsuranceSchema = z.looseObject({
  policies: optional(z.array(InsurancePolicySchema)),
  secret: optional(z.boolean()),
  updated: optional(isoDate),
});

export interface InsuranceBundle {
  policies: InsurancePolicy[];
  secret: boolean;
  updated?: string;
  body: string;
}

export const POLICY_COLUMNS = ["category", "product", "coverage", "premium", "payment_term", "term", "beneficiary", "note"] as const;
export const POLICY_HEADER = "| 险种 | 保险公司 / 产品 | 保额 | 年缴保费 | 缴费期 | 保障期 / 到期 | 受益人 | 备注 |";
const headings = cells(POLICY_HEADER).map((title) => title.replace(/\s/g, ""));
const divider = "| --- | --- | --- | --- | --- | --- | --- | --- |";

function cells(line: string) {
  return line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/)
    .map((value) => value.trim().replace(/\\\|/g, "|"));
}

function isHeader(line: string, next = "") {
  if (!line.includes("险种")) return false;
  const header = cells(line);
  const rules = cells(next);
  return header.length === headings.length && rules.length === headings.length
    && headings.every((title, i) => header[i].replace(/\s/g, "") === title && /^:?-+:?$/.test(rules[i]));
}

function nextFence(current: string, marker: string, line: string) {
  if (!current) return marker;
  return marker.startsWith(current) && line.trim() === marker ? "" : current;
}

/** Keep source lines (including their original line endings) for edits and export. */
function insuranceTables(body: string) {
  const lines = body.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const tables: { start: number; end: number }[] = [];
  let fence = "";
  for (let i = 0; i < lines.length; i++) {
    const marker = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i])?.[1];
    if (marker) {
      fence = nextFence(fence, marker, lines[i]);
      continue;
    }
    if (fence || !isHeader(lines[i], lines[i + 1])) continue;
    const start = i;
    i += 1;
    while (i + 1 < lines.length && cells(lines[i + 1]).length === headings.length) i++;
    tables.push({ start, end: i + 1 });
  }
  return { lines, tables };
}

export const renewalFromTerm = (term: string) =>
  term.match(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g)?.findLast((date) => isoDate.safeParse(date).success);

function policyRow(line: string): InsurancePolicy[] {
  const values = cells(line);
  const fields = Object.fromEntries(POLICY_COLUMNS.map((key, i) => [key, values[i] || undefined]));
  const policy = InsurancePolicySchema.safeParse({ ...fields, renewal_date: renewalFromTerm(values[5]) });
  return policy.success ? [policy.data] : [];
}

export function parseInsuranceTable(body: string): InsurancePolicy[] {
  const { lines, tables } = insuranceTables(body);
  return tables.flatMap(({ start, end }) => lines.slice(start + 2, end).flatMap(policyRow));
}

export function insuranceNotes(body: string) {
  const { lines, tables } = insuranceTables(body);
  for (const { start, end } of tables.reverse()) lines.splice(start, end - start);
  return lines.join("");
}

export function appendInsuranceRow(body: string, policy: InsurancePolicy) {
  const { lines, tables } = insuranceTables(body);
  const newline = body.includes("\r\n") ? "\r\n" : "\n";
  const row = "| " + POLICY_COLUMNS.map((key) => String(policy[key] ?? "").replaceAll("|", "\\|")).join(" | ") + " |";
  const table = tables.at(-1);
  if (!table) return [POLICY_HEADER, divider, row, "", body].join(newline);
  const prefix = lines[table.end - 1].endsWith("\n") ? "" : newline;
  lines.splice(table.end, 0, prefix + row + newline);
  return lines.join("");
}
