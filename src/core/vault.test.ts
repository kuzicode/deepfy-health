import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { abnormalReadings, latestReadings, series } from "./analysis";
import { VaultRepository, loadVault, obsidianLinkPrefix, readVaultRaw, resolveHealthDir } from "./vault";

const SAMPLE = path.resolve(import.meta.dirname, "../../examples/sample-vault/Personal");

function tempCopy(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kzh-"));
  fs.cpSync(SAMPLE, dir, { recursive: true });
  return dir;
}

describe("sample vault", () => {
  const s = loadVault(SAMPLE);
  const kz = s.members.find((m) => m.id === "kz")!;
  const mom = s.members.find((m) => m.id === "mom")!;

  it("无校验问题", () => expect(s.issues).toEqual([]));
  it("合并自定义 catalog", () => expect(s.catalog.get("NSE")?.name).toBe("神经元特异性烯醇化酶"));
  it("日期保持字符串", () => expect(kz.profile?.birth_date).toBe("1990-05-20"));

  it("最新读数取最近一次并保留上一次值", () => {
    const alt = latestReadings(kz, s.catalog).find((r) => r.code === "ALT")!;
    expect(alt).toMatchObject({ date: "2025-10-12", value: 61, previous: 72, flag: "H" });
    const w = latestReadings(kz, s.catalog).find((r) => r.code === "WEIGHT")!;
    expect(w).toMatchObject({ date: "2026-08-10", value: 76.5 });
  });

  it("异常指标", () => {
    expect(abnormalReadings(kz, s.catalog).map((r) => r.code).sort()).toEqual(["ALT", "BMI", "LDL_C", "TG", "UA", "VITD"]);
    expect(abnormalReadings(mom, s.catalog).map((r) => r.code).sort()).toEqual(["HGB", "TC", "TSH", "U_BLD"]);
  });

  it("序列按日期升序", () => {
    expect(series(kz, s.catalog, "WEIGHT").map((p) => p.value)).toEqual([81, 79, 76.5]);
  });
});

describe("校验", () => {
  it("报出 schema 错误、未知 code 与单位不一致", () => {
    const dir = tempCopy();
    const f = path.join(dir, "KZ/Health/records/2026-09-01-bad.md");
    fs.writeFileSync(f, `---\ndate: 2026/09/01\ntype: lab\ntitle: bad\nindicators:\n  - { code: ALT, value: 1 }\n---\n`);
    fs.writeFileSync(
      path.join(dir, "KZ/Health/records/2026-09-02-lab.md"),
      `---\ndate: 2026-09-02\ntype: lab\ntitle: x\nindicators:\n  - { code: FOO, value: 1 }\n  - { code: FBG, value: 100, unit: mg/dL }\n---\n`,
    );
    const msgs = loadVault(dir).issues.map((i) => `${i.level} ${i.file} ${i.message}`);
    expect(msgs.some((m) => m.startsWith("error KZ/Health/records/2026-09-01-bad.md date:"))).toBe(true);
    expect(msgs.some((m) => m.includes("error") && m.includes("未知指标 code FOO"))).toBe(true);
    expect(msgs.some((m) => m.includes("warning") && m.includes("FBG 单位 mg/dL"))).toBe(true);
  });

  it("记录文件名接受 YYYYMMDD 主题 与 YYYY-MM-DD 前缀，其他格式给出警告", () => {
    const dir = tempCopy();
    const body = `---\ndate: 2026-09-03\ntype: lab\ntitle: 复查\nindicators:\n  - { code: ALT, value: 40 }\n---\n`;
    const recs = path.join(dir, "KZ/Health/records");
    fs.writeFileSync(path.join(recs, "20260903 复查.md"), body);
    expect(loadVault(dir).issues).toEqual([]);
    fs.writeFileSync(path.join(recs, "复查.md"), body);
    expect(loadVault(dir).issues).toMatchObject([{ level: "warning", file: "KZ/Health/records/复查.md" }]);
  });

  it("缺 family.yaml 报错", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kzh-"));
    expect(loadVault(dir).issues[0]).toMatchObject({ level: "error", file: "family.yaml" });
  });
});

describe("createMember", () => {
  const snapshotFiles = (dir: string) => fs.readdirSync(dir, { recursive: true }).map(String).sort();

  it("生成个人目录、Health 模板并登记 family.yaml 与 Personal.md", async () => {
    const dir = tempCopy();
    const repo = new VaultRepository(dir);
    await repo.createMember({ id: "dad", name: "爸爸", dir: "Dad", sex: "male", birthDate: "1960-01-01" });
    const s = loadVault(dir);
    expect(s.issues).toEqual([]);
    expect(s.members.find((m) => m.id === "dad")?.profile?.name).toBe("爸爸");
    for (const f of ["Dad/Dad.md", "Dad/兴趣爱好.md", "Dad/保险配置.md", "Dad/Health/Health.md", "Dad/Health/records"]) {
      expect(fs.existsSync(path.join(dir, f)), f).toBe(true);
    }
    expect(fs.readFileSync(path.join(dir, "Dad/Dad.md"), "utf8")).toContain("[[Dad/Health/Health|健康档案]]");
    expect(fs.readFileSync(path.join(dir, "Personal.md"), "utf8")).toMatch(/- \[\[Dad\/Dad\|爸爸\]\]\n%% members:end %%/);
    expect(fs.readFileSync(path.join(dir, "family.yaml"), "utf8")).toContain("示例家庭");
    await expect(repo.createMember({ id: "dad", name: "x", sex: "male", birthDate: "1960-01-01" })).rejects.toThrow("已存在");
  });

  it("family.yaml 使用块格式", async () => {
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), "kzh-"));
    fs.writeFileSync(path.join(fresh, "family.yaml"), "members: []\n");
    await new VaultRepository(fresh).createMember({ id: "me", name: "我", sex: "male", birthDate: "1990-01-01" });
    expect(fs.readFileSync(path.join(fresh, "family.yaml"), "utf8")).toContain("\n  - id: me\n");
  });

  it.each([
    ["越界 id", { id: "../../escaped" }],
    ["非法 id", { id: "Bad" }],
    ["越界目录", { dir: "../x" }],
    ["名字含链接字符", { name: "a]]b" }],
    ["非法生日", { birthDate: "1990-13-01" }],
    ["目录与已有成员仅大小写不同", { dir: "kz" }],
    ["目录下已有健康档案", { dir: "Orphan" }],
  ])("拒绝%s，且不写任何文件", async (_label, override) => {
    const dir = tempCopy();
    fs.mkdirSync(path.join(dir, "Orphan/Health"), { recursive: true });
    const before = snapshotFiles(dir);
    const family = fs.readFileSync(path.join(dir, "family.yaml"), "utf8");
    await expect(new VaultRepository(dir).createMember({ id: "new", name: "新成员", sex: "male", birthDate: "1990-01-01", ...override })).rejects.toThrow();
    expect(snapshotFiles(dir)).toEqual(before);
    expect(fs.readFileSync(path.join(dir, "family.yaml"), "utf8")).toBe(family);
    expect(fs.existsSync(path.join(dir, "../../escaped"))).toBe(false);
  });

  it("名字含冒号也能生成合法档案", async () => {
    const dir = tempCopy();
    await new VaultRepository(dir).createMember({ id: "tp", name: "Test: Person", dir: "TP", sex: "female", birthDate: "1990-01-01" });
    const s = loadVault(dir);
    expect(s.issues).toEqual([]);
    expect(s.members.find((m) => m.id === "tp")?.profile?.name).toBe("Test: Person");
  });
});

describe("档案 id 与 family 不一致", () => {
  it("报错且不加载该目录的健康数据", () => {
    const dir = tempCopy();
    fs.appendFileSync(path.join(dir, "family.yaml"), "  - id: other\n    name: 别人\n    dir: KZ\n");
    const s = loadVault(dir);
    const other = s.members.find((m) => m.id === "other")!;
    expect(other.records).toEqual([]);
    expect(other.profile).toBeUndefined();
    expect(s.issues.some((i) => i.level === "error" && i.message.includes("不一致"))).toBe(true);
  });
});

describe("路径", () => {
  it("默认指向 sample vault 的 Personal", () => {
    expect(resolveHealthDir({}, "/repo")).toBe("/repo/examples/sample-vault/Personal");
    expect(resolveHealthDir({ HEALTH_VAULT_DIR: "/v", PERSONAL_SUBDIR: "个人" }, "/repo")).toBe("/v/个人");
  });

  it("obsidianLinkPrefix 以含 .obsidian 的目录为库根", () => {
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), "kzh-"));
    fs.mkdirSync(path.join(vault, ".obsidian"));
    fs.mkdirSync(path.join(vault, "Vault/Personal"), { recursive: true });
    expect(obsidianLinkPrefix(path.join(vault, "Vault/Personal"))).toBe("Vault/Personal/");
    expect(obsidianLinkPrefix(SAMPLE)).toBe("");
  });
});

describe("序列化", () => {
  it("rawToFiles 往返后语义一致，时间与日期加引号", async () => {
    const { rawToFiles, sameContent } = await import("./serialize");
    const raw = readVaultRaw(SAMPLE);
    const files = rawToFiles(raw);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kzh-"));
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    }
    expect(loadVault(dir).issues).toEqual([]);
    expect(files["Mom/Health/regimen.md"]).toContain('- "06:00"');
    const original = fs.readFileSync(path.join(SAMPLE, "Mom/Health/regimen.md"), "utf8");
    expect(sameContent("x.md", original, files["Mom/Health/regimen.md"])).toBe(true);
    expect(sameContent("x.md", original, files["Mom/Health/regimen.md"].replace("50 μg", "75 μg"))).toBe(false);
  });
});
