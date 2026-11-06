import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadVault, readVaultRaw } from "../core/vault";
import { localAttachments, planPull, type Remote } from "./sync";

const SAMPLE = path.resolve(import.meta.dirname, "../../examples/sample-vault/Personal");
const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

function tempCopy() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kzh-pull-"));
  fs.cpSync(SAMPLE, dir, { recursive: true });
  return dir;
}

const remoteOf = (patch?: (r: Remote) => void): Remote => {
  const r: Remote = { vault: readVaultRaw(SAMPLE), attachments: [] };
  patch?.(r);
  return r;
};

describe("planPull", () => {
  it("与本地一致时什么都不写", () => {
    const plan = planPull(remoteOf(), tempCopy(), { stamp: "t" });
    expect(plan.steps).toEqual([]);
  });

  it("云端记录 key 越界：在任何写入前中止", () => {
    const into = tempCopy();
    const r = remoteOf((x) => x.vault.docs.kz.push({ kind: "record", key: "../../../../escaped", data: { date: "2026-01-01" }, body: "" }));
    expect(() => planPull(r, into, { stamp: "t" })).toThrow("路径越界");
  });

  it("云端附件路径越界：中止", () => {
    const r = remoteOf((x) => x.attachments.push({ member: "kz", relPath: "attachments/../../../../x.pdf", sha256: "0" }));
    expect(() => planPull(r, tempCopy(), { stamp: "t" })).toThrow("路径越界");
  });

  it("内容不同的文档与附件默认进 _conflicts，本地原件不动；加载器不会读到冲突副本", () => {
    const into = tempCopy();
    const att = path.join(into, "KZ/Health/attachments/report.pdf");
    fs.mkdirSync(path.dirname(att), { recursive: true });
    fs.writeFileSync(att, "本地原始报告");
    const r = remoteOf((x) => {
      x.vault.docs.kz.find((d) => d.kind === "profile")!.body = "云端改过的正文";
      x.attachments.push({ member: "kz", relPath: "attachments/report.pdf", sha256: sha("云端版本") });
    });
    const plan = planPull(r, into, { stamp: "t" });
    expect(plan.steps.map((s) => [s.rel, s.conflict, path.relative(into, s.target)])).toEqual([
      ["KZ/Health/profile.md", true, "_conflicts/t/KZ/Health/profile.md"],
      ["KZ/Health/attachments/report.pdf", true, "_conflicts/t/KZ/Health/attachments/report.pdf"],
    ]);
    for (const st of plan.steps) {
      fs.mkdirSync(path.dirname(st.target), { recursive: true });
      fs.writeFileSync(st.target, st.content ?? "云端版本");
    }
    expect(fs.readFileSync(att, "utf8")).toBe("本地原始报告");
    const s = loadVault(into);
    expect(s.issues).toEqual([]);
    expect(s.members.find((m) => m.id === "kz")!.records).toHaveLength(3);
  });

  it("--overwrite 时直接写回原位置", () => {
    const into = tempCopy();
    const r = remoteOf((x) => { x.vault.docs.kz.find((d) => d.kind === "profile")!.body = "云端改过的正文"; });
    const plan = planPull(r, into, { stamp: "t", overwrite: true });
    expect(plan.steps.map((s) => [s.conflict, path.relative(into, s.target)])).toEqual([[false, "KZ/Health/profile.md"]]);
  });
});

describe("localAttachments", () => {
  it("push 时收集日志引用的照片（不只检测记录）", () => {
    const dir = tempCopy();
    const log = path.join(dir, "KZ/Health/logs/20261028-2230.md");
    fs.writeFileSync(log, fs.readFileSync(log, "utf8").replace("attachments: []", "attachments: [attachments/logs/eye.jpg]"));
    fs.mkdirSync(path.join(dir, "KZ/Health/attachments/logs"), { recursive: true });
    fs.writeFileSync(path.join(dir, "KZ/Health/attachments/logs/eye.jpg"), Buffer.from([0xff, 0xd8, 0xff]));
    const atts = localAttachments(dir, readVaultRaw(dir));
    expect(atts.map((a) => a.relPath)).toContain("attachments/logs/eye.jpg");
  });
});
