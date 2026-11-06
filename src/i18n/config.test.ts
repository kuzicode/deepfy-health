import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { negotiate, toLocale } from "./config";

describe("negotiate", () => {
  it.each([
    ["zh-CN,zh;q=0.9,en;q=0.8", "zh"],
    ["en-US,en;q=0.9,zh-CN;q=0.8", "en"],
    ["ja,en;q=0.5", "en"],
    ["fr", "zh"],
    [null, "zh"],
    ["en;q=0.4,zh-TW;q=0.9", "zh"],
  ])("%s → %s", (h, want) => expect(negotiate(h)).toBe(want));
});

const keys = (o: object, prefix = ""): string[] => Object.entries(o).flatMap(([k, v]) =>
  v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`]);

describe("文案", () => {
  it("中英文 key 完全一致", () => expect(keys(en).sort()).toEqual(keys(zh).sort()));
  it("英文文案不含中文（分类名的中文 key 除外）", () => {
    const leaves = (o: object): string[] => Object.values(o).flatMap((v) => (v && typeof v === "object" ? leaves(v) : [String(v)]));
    expect(leaves(en).filter((s) => /\p{Script=Han}/u.test(s))).toEqual([]);
  });
  it("存储的语言：无效或空值按默认", () => {
    expect(toLocale("en")).toBe("en");
    expect(toLocale(null)).toBe("zh");
    expect(toLocale("fr")).toBe("zh");
  });
});
