import { MAX_DOC_BODY_LENGTH, MAX_DOC_DATA_LENGTH, type RawVault } from "@/core/bundle";
import { InsurancePolicySchema, POLICY_COLUMNS, appendInsuranceRow, parseInsuranceTable, renewalFromTerm } from "@/core/insurance";
import { todayISO } from "@/core/schedule";
import { sha256 } from "./crypto";
import { NotFound, type Change } from "./repo-base";

type SaveError = "invalid" | "conflict";
export class InsuranceFormError extends Error {
  constructor(readonly code: SaveError) { super(code); }
}

export const insuranceRevision = (body: string, count: number) => sha256(JSON.stringify([body, count]));

function readPolicy(form: FormData) {
  const entries = POLICY_COLUMNS.map((key) => [key, form.get(key) || undefined] as const);
  if (entries.every(([, value]) => !value)) return;
  for (const [, value] of entries) {
    if (value && (typeof value !== "string" || /[\r\n]/.test(value))) throw new InsuranceFormError("invalid");
  }
  const fields = Object.fromEntries(entries);
  const parsed = InsurancePolicySchema.safeParse({ ...fields, renewal_date: renewalFromTerm(String(fields.term ?? "")) });
  if (!parsed.success) throw new InsuranceFormError("invalid");
  return parsed.data;
}

function readBody(form: FormData, original: string) {
  const input = form.get("body");
  if (typeof input !== "string" || input.length > MAX_DOC_BODY_LENGTH) throw new InsuranceFormError("invalid");
  // Browsers normalize textarea line endings even when the source is untouched.
  return input.replaceAll("\r\n", "\n") === original.replaceAll("\r\n", "\n") ? original : input;
}

function editDocument(data: Record<string, unknown>, original: string, form: FormData) {
  let body = readBody(form, original);
  const policy = readPolicy(form);
  if (policy && Array.isArray(data.policies)) data.policies = [...data.policies, policy];
  else if (policy) body = appendInsuranceRow(body, policy);
  if (body.length > MAX_DOC_BODY_LENGTH || JSON.stringify(data).length > MAX_DOC_DATA_LENGTH) throw new InsuranceFormError("invalid");
  return { data, body };
}

export function buildInsuranceChange(raw: RawVault, member: string, revision: string, form: FormData): Change {
  if (!raw.family.members.some((fm) => fm.id === member)) throw new NotFound();
  const prev = raw.docs[member]?.find((d) => d.kind === "insurance" && d.key === "");
  const data: Record<string, unknown> = { ...(prev?.data ?? { type: "ledger", tags: ["insurance"] }), updated: todayISO() };
  const original = prev?.body ?? "";
  const policies = Array.isArray(data.policies) ? data.policies : parseInsuranceTable(original);
  if (insuranceRevision(original, policies.length) !== revision) throw new InsuranceFormError("conflict");
  return { op: "put", member, kind: "insurance", key: "", ...editDocument(data, original, form) };
}
