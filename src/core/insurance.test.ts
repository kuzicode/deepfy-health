import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { doc } from "@/db/schema";
import { createMcpServer } from "@/mcp/server";
import { DATA_NOTE } from "@/mcp/contract";
import { newDek } from "@/server/crypto";
import { buildInsuranceChange, insuranceRevision } from "@/server/insurance-form";
import { NotFound, PgRepository } from "@/server/pg-repository";
import { itemLine } from "@/server/reminders";
import { kitchenDb } from "@/test/kitchen-db";
import { reminderHref } from "@/ui/i18n";
import { buildSnapshot, isSafeDocKey } from "./bundle";
import { InsurancePolicySchema, InsuranceSchema, POLICY_HEADER, insuranceNotes, parseInsuranceTable } from "./insurance";
import { addDays, reminders, schedule } from "./schedule";
import { rawToFiles, sameContent } from "./serialize";
import { VaultRepository, loadVault, readVaultRaw } from "./vault";

const SAMPLE = path.resolve(import.meta.dirname, "../../examples/sample-vault/Personal");
const rel = "KZ/保险配置.md";
const emptyTable = POLICY_HEADER + "\n| --- | --- | --- | --- | --- | --- | --- | --- |";
const row = "| 医疗 | 虚构星岛 | 10 万 | 42 元 | 年缴 | 至 2028-02-29 | 本人 | 条款 A\\|B |";
const body = `\n\n${emptyTable}\n${row}\n\n核对原件。  \n\n`;
const structured = { category: "意外", product: "虚构雨燕", premium: 115, renewal_date: "2027-01-15" };

it("reads the eight template columns, escaped pipes, leap days and expired dates without inventing dates", () => {
  expect(parseInsuranceTable(emptyTable)).toEqual([]);
  expect(parseInsuranceTable(body)).toEqual([{
    category: "医疗", product: "虚构星岛", coverage: "10 万", premium: "42 元", payment_term: "年缴",
    term: "至 2028-02-29", renewal_date: "2028-02-29", beneficiary: "本人", note: "条款 A|B",
  }]);
  expect(parseInsuranceTable(body.replaceAll("2028-02-29", "2027-02-29"))[0].renewal_date).toBeUndefined();
  expect(parseInsuranceTable(body.replace("至 2028", "2027-03-01 至 2028"))[0].renewal_date).toBe("2028-02-29");
  expect(parseInsuranceTable("~~~md\n" + body + "~~~")).toEqual([]);
  expect(insuranceNotes(body)).toBe("\n\n\n核对原件。  \n\n");
});

it("validates structured fields, permits blank optional fields and preserves unknown data", () => {
  expect(InsurancePolicySchema.safeParse({ product: "虚构" }).success).toBe(false);
  expect(InsurancePolicySchema.safeParse({ ...structured, renewal_date: "2026-04-31" }).success).toBe(false);
  expect(InsuranceSchema.parse({ date: null, summary: null, custom: { a: null }, updated: null, policies: null }))
    .toMatchObject({ date: null, summary: null, custom: { a: null } });
  expect(InsurancePolicySchema.parse({ ...structured, beneficiary: null }).premium).toBe(115);
  expect(isSafeDocKey("insurance", "")).toBe(true);
  expect(isSafeDocKey("insurance", "another")).toBe(false);
});

it("round-trips nested YAML, null fields and all body whitespace through two on-disk reads", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "insurance-"));
  try {
    fs.cpSync(SAMPLE, tmp, { recursive: true });
    const source = "---\ntype: ledger\ndate:\nsummary:\ntags: [insurance]\nsecret: true\ncustom: {empty: null, code: '001'}\n---\n" + body;
    fs.writeFileSync(path.join(tmp, rel), source);
    const raw = readVaultRaw(tmp);
    const original = raw.docs.kz.find((d) => d.kind === "insurance")!;
    expect(original.data).toMatchObject({ tags: ["insurance"], date: null, summary: null, custom: { empty: null, code: "001" } });
    expect(loadVault(tmp).issues).toEqual([]);
    expect((await new VaultRepository(tmp).getMember("kz"))?.member.insurance).toMatchObject({ body, secret: true, policies: [{ renewal_date: "2028-02-29" }] });
    const output = rawToFiles(raw)[rel];
    expect(sameContent(rel, source, output)).toBe(true);
    expect(sameContent(rel, output, output.trimEnd())).toBe(false);
    expect(sameContent(rel, output, output.replace("summary:\n", ""))).toBe(false);
    fs.writeFileSync(path.join(tmp, rel), output);
    expect(readVaultRaw(tmp).docs.kz.find((d) => d.kind === "insurance")).toMatchObject({ data: original.data, body });
    fs.unlinkSync(path.join(tmp, rel));
    const old = loadVault(tmp);
    expect(old.issues).toEqual([]);
    expect(old.members.find((m) => m.id === "kz")?.insurance).toBeUndefined();
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

it("prefers structured policies, including an explicitly empty list", () => {
  const raw = readVaultRaw(SAMPLE);
  const insurance = raw.docs.kz.find((d) => d.kind === "insurance")!;
  const policies = () => buildSnapshot(raw, { root: SAMPLE }).members.find((m) => m.id === "kz")?.insurance?.policies;
  insurance.data.policies = [];
  expect(policies()).toEqual([]);
  insurance.data.policies = [structured];
  expect(policies()).toEqual([structured]);
});

it("keeps original overdue dates, includes day 30 and excludes day 31 from reminders", () => {
  const today = "2026-11-28";
  const member = loadVault(SAMPLE).members[0];
  const policies = [-90, 0, 30, 31].map((days) => ({ ...structured, renewal_date: addDays(today, days) }));
  const m = { ...member, insurance: { policies, body: "", secret: false } };
  const renewals = reminders(m, today).filter((r) => r.kind === "insurance-renewal");
  expect(renewals.map((r) => [r.due, r.overdue])).toEqual(policies.slice(0, 3).map((p, i) => [p.renewal_date, i === 0]));
  expect(renewals[0].originalDue).toBeUndefined();
  expect(reminderHref(renewals[0])).toBe("/insurance");
  expect(renewals[0].params).toEqual({ category: structured.category, product: structured.product, due: policies[0].renewal_date });
  const item = schedule(m, today).find((r) => r.kind === "insurance-renewal")!;
  const due = { memberId: m.id, memberName: "测试成员", item, lead: 0 };
  expect(itemLine(due, new Map(), today)).toEqual({ who: due.memberName, what: "意外续保到期", when: item.due });
  expect(itemLine(due, new Map(), today, "en")).toEqual({ who: due.memberName, what: "意外 renewal due", when: item.due });
});

function policyForm(text: string) {
  const form = new FormData();
  form.set("body", text);
  form.set("category", "意外");
  form.set("product", "虚构|远帆");
  form.set("term", "至 2027-05-01");
  return form;
}

it("appends within the source table and preserves notes, CRLF and blank frontmatter", () => {
  const raw = readVaultRaw(SAMPLE);
  const prev = raw.docs.kz.find((d) => d.kind === "insurance")!;
  prev.body = body.replaceAll("\n", "\r\n");
  const change = buildInsuranceChange(raw, "kz", insuranceRevision(prev.body, 1), policyForm(body));
  expect(change.op).toBe("put");
  if (change.op !== "put") throw new Error("expected a document");
  expect(change.data).toMatchObject({ summary: null, date: null, tags: ["insurance"] });
  expect(change.data).not.toHaveProperty("policies");
  expect(insuranceNotes(change.body)).toBe(insuranceNotes(prev.body));
  expect(parseInsuranceTable(change.body)).toMatchObject([{ category: "医疗" }, { product: "虚构|远帆", renewal_date: "2027-05-01" }]);
});

it("creates a missing document from the cloud editor and rejects an incomplete policy", () => {
  const raw = readVaultRaw(SAMPLE);
  raw.docs.kz = raw.docs.kz.filter((d) => d.kind !== "insurance");
  const form = policyForm("  Markdown note  ");
  const save = () => buildInsuranceChange(raw, "kz", insuranceRevision("", 0), form);
  const change = save();
  if (change.op !== "put") throw new Error("expected a document");
  expect(insuranceNotes(change.body)).toContain("  Markdown note  ");
  expect(parseInsuranceTable(change.body)).toMatchObject([{ category: "意外", product: "虚构|远帆" }]);
  form.delete("category");
  expect(save).toThrow("invalid");
});

it("imports, edits and exports encrypted member documents with account isolation and stale edit detection", async () => {
  const db = kitchenDb();
  try {
    const key = newDek();
    const repo = new PgRepository(db.db, "family-a", key);
    const other = new PgRepository(db.db, "family-b", key);
    const raw = readVaultRaw(SAMPLE);
    const prev = raw.docs.kz.find((d) => d.kind === "insurance")!;
    const extras = { attachments: { custom: null }, secret: true, policies: [{ ...structured, vendor_field: null }] };
    prev.data = { ...prev.data, ...extras };
    await repo.importRaw(raw);
    const rows = await db.db.select().from(doc).where(eq(doc.kind, "insurance"));
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.key === "" && !r.ciphertext.includes(structured.product))).toBe(true);
    expect(await other.getMember("kz")).toBeUndefined();
    const revision = insuranceRevision(prev.body, 1);
    const apply = (target: PgRepository) => target.applyChanges((latest) => [buildInsuranceChange(latest, "kz", revision, policyForm(body))]);
    await expect(apply(other)).rejects.toBeInstanceOf(NotFound);
    await apply(repo);
    await expect(apply(repo)).rejects.toMatchObject({ code: "conflict" });
    const after = (await repo.exportRaw()).docs.kz.find((d) => d.kind === "insurance")!;
    expect(after.data).toMatchObject({ ...extras, policies: [extras.policies[0], { product: "虚构|远帆" }], date: null });
    expect(after.body).toBe(body);
    expect((await repo.getMember("kz"))?.member.insurance?.policies).toHaveLength(2);
  } finally {
    db.close();
  }
});

it.each([null, ["health"], ["kitchen"]] as const)("enforces get_insurance discovery and invocation for %j", async (domains) => {
  const client = new Client({ name: "insurance-test", version: "1" });
  const server = createMcpServer(new VaultRepository(SAMPLE), "2026-11-28", undefined, domains && [...domains]);
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(a), client.connect(b)]);
    const tool = (await client.listTools()).tools.find((t) => t.name === "get_insurance");
    const call = await client.callTool({ name: "get_insurance", arguments: { member: "kz" } });
    if (domains?.[0] === "kitchen") {
      expect(tool).toBeUndefined();
      expect(call.isError).toBe(true);
    } else {
      expect(tool?.description).toContain(DATA_NOTE);
      expect(tool?.annotations?.readOnlyHint).toBe(true);
      expect(call.isError).not.toBe(true);
      const output = JSON.parse((call.content as { text: string }[])[0].text);
      expect(output.data_note).toBe(DATA_NOTE);
      expect(output.policies).toHaveLength(2);
      expect(output.reminders).toMatchObject([{ due: "2026-12-15" }]);
      expect(output.body).toContain("保险配置");
    }
  } finally {
    await client.close();
  }
});
