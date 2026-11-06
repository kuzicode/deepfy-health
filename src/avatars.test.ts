import { describe, expect, it } from "vitest";
import { memberAvatars, parentCookieDomain, presetOf, presetValue, randomAvatar, stableAvatar, suggestAvatar } from "./avatars";

const LIST = ["a01", "a02", "a03"];

describe("预设头像", () => {
  it("清单为空时不分配", () => {
    expect(randomAvatar([])).toBeUndefined();
    expect(stableAvatar("u1", [])).toBeUndefined();
  });

  it("只会挑清单里的 id；同一个 userId 结果稳定", () => {
    for (const r of [0, 0.5, 0.999]) expect(LIST).toContain(randomAvatar(LIST, () => r));
    expect(stableAvatar("user-abc", LIST)).toBe(stableAvatar("user-abc", LIST));
    expect(LIST).toContain(stableAvatar("user-abc", LIST));
  });

  it("presetOf 只认清单里的预设头像", () => {
    expect(presetOf(presetValue("a02"), LIST)).toBe("a02");
    expect(presetOf("preset:a99", LIST)).toBeUndefined();
    expect(presetOf("https://lh3.googleusercontent.com/x", LIST)).toBeUndefined();
    expect(presetOf(null, LIST)).toBeUndefined();
  });

  it("标记 cookie 的父域", () => {
    expect(parentCookieDomain("https://app.deepfy.si")).toBe(".deepfy.si");
    expect(parentCookieDomain("https://deepfy.si")).toBe(".deepfy.si");
    expect(parentCookieDomain("http://localhost:3000")).toBeUndefined();
    expect(parentCookieDomain("http://127.0.0.1:3100")).toBeUndefined();
    expect(parentCookieDomain(undefined)).toBeUndefined();
    expect(parentCookieDomain("not a url")).toBeUndefined();
  });
});

describe("换头像", () => {
  it("只接受清单里的 id（不碰数据库就拒绝）", async () => {
    const { setAvatar } = await import("./server/avatar");
    await expect(setAvatar({} as never, "u1", "../../etc/passwd", LIST)).rejects.toThrow("unknown avatar");
    await expect(setAvatar({} as never, "u1", "a99", LIST)).rejects.toThrow("unknown avatar");
  });
});

describe("家人头像", () => {
  it("本人用账号头像，其他人稳定且互不重复；清单用完才重复", () => {
    const ms = [{ id: "m-me", self: true }, { id: "m-dad" }, { id: "m-mom" }];
    const a = memberAvatars(ms, "a02", LIST);
    expect(a.get("m-me")).toBe("a02");
    expect(new Set(a.values()).size).toBe(3);
    expect(memberAvatars(ms, "a02", LIST)).toEqual(a);
    expect(memberAvatars([...ms, { id: "m-4" }], "a02", LIST).size).toBe(4);
    // 没有「本人」档案：家人也不用账号头像
    expect([...memberAvatars([{ id: "m-dad" }, { id: "m-mom" }], "a02", LIST).values()]).not.toContain("a02");
  });
  it("没有账号头像（本地模式）或清单为空", () => {
    expect(memberAvatars([{ id: "m-me", self: true }], undefined, LIST).get("m-me")).toBe(stableAvatar("m-me", LIST));
    expect(memberAvatars([{ id: "x" }], "a01", []).size).toBe(0);
  });
});

describe("家人头像：手选与建档默认", () => {
  it("手选的优先（包括本人），自动分配避开手选的；无效的手选 id 忽略", () => {
    const L4 = [...LIST, "a04"];
    const a = memberAvatars([{ id: "m-me", self: true, chosen: "a03" }, { id: "m-dad", chosen: "a01" }, { id: "m-mom" }], "a02", L4);
    expect(a.get("m-me")).toBe("a03");
    expect(a.get("m-dad")).toBe("a01");
    expect(a.get("m-mom")).toBe("a04"); // a01、a03 被手选，账号头像 a02 不分给家人
    expect(memberAvatars([{ id: "x", chosen: "zzz" }], undefined, LIST).get("x")).toBe(stableAvatar("x", LIST));
  });
  it("建档默认挑没人用的", () => {
    expect(suggestAvatar(["a01", "a02"], LIST)).toBe("a03");
    expect(LIST).toContain(suggestAvatar(LIST, LIST));
    expect(suggestAvatar([], [])).toBeUndefined();
  });
});
