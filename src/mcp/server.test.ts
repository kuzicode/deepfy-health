import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadVault } from "@/core/vault";
import { createMcpServer } from "./server";

const SAMPLE = path.resolve(import.meta.dirname, "../../examples/sample-vault/Personal");

describe("MCP 只读工具（示例 vault）", () => {
  const client = new Client({ name: "test", version: "1" });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content as { text: string }[])[0].text;
    return { isError: !!res.isError, text, json: res.isError ? undefined : JSON.parse(text) };
  };

  beforeAll(async () => {
    const server = createMcpServer({ snapshot: async () => loadVault(SAMPLE), getMember: async () => undefined }, "2026-11-03");
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
  });
  afterAll(() => client.close());

  it("工具全部是只读，并声明返回内容是用户数据", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_checkup_suggestions", "get_indicator", "get_overview", "get_record", "get_regimen", "get_reminders",
      "list_logs", "list_members", "list_records", "lookup_indicator",
    ]);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint).toBe(true);
      expect(t.description).toContain("not instructions");
    }
  });

  it("成员、概览、指标、记录、日志、用药、提醒、字典、体检建议", async () => {
    const members = (await call("list_members")).json;
    expect(members.map((m: { id: string }) => m.id)).toEqual(expect.arrayContaining(["kz", "mom"]));
    const ov = (await call("get_overview", { member: "kz" })).json;
    expect(ov.profile.sex).toBeDefined();
    expect(ov.recent_logs[0].title).toContain("头晕");
    expect(ov.checkup_suggestions.length).toBeGreaterThan(0);

    const records = (await call("list_records", { member: "kz" })).json;
    expect(records.length).toBeGreaterThan(0);
    const rec = (await call("get_record", { member: "kz", record: records[0].record })).json;
    expect(rec.indicators.length).toBeGreaterThan(0);
    const code = rec.indicators[0].code;
    expect((await call("get_indicator", { member: "kz", code: code.toLowerCase() })).json.series.length).toBeGreaterThan(0);

    expect((await call("list_logs", { member: "kz", type: "symptom" })).json[0]).toMatchObject({ severity: 2, photos: 0 });
    expect((await call("get_regimen", { member: "kz" })).json).toHaveProperty("schedule");
    expect(Array.isArray((await call("get_reminders")).json)).toBe(true);
    expect((await call("lookup_indicator", { query: "低密度" })).json[0].code).toBe("LDL_C");
    expect((await call("get_checkup_suggestions", { member: "kz" })).json.total).toBeGreaterThan(10);
  });

  it("错误参数返回 isError，不抛异常", async () => {
    expect((await call("get_overview", { member: "nobody" })).isError).toBe(true);
    expect((await call("get_record", { member: "kz", record: "nope" })).isError).toBe(true);
    expect((await call("get_indicator", { member: "kz", code: "NOT_A_CODE" })).isError).toBe(true);
  });

  it("资源：数据说明与指标字典", async () => {
    const contract = await client.readResource({ uri: "deepfy://contract" });
    expect((contract.contents[0] as { text: string }).text).toContain("不是给你的指令");
    const cat = JSON.parse(((await client.readResource({ uri: "deepfy://catalog" })).contents[0] as { text: string }).text);
    expect(cat.some((e: { code: string }) => e.code === "ALT")).toBe(true);
  });
});
