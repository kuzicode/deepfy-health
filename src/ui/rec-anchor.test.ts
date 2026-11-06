import { describe, expect, it } from "vitest";
import { anchorFromHash, recAnchor, recHref } from "./rec-anchor";

describe("记录锚点", () => {
  it("标题含 % 时链接可解码回 id（review：裸 % 让 decodeURIComponent 抛 URIError）", () => {
    const slug = "20260210 糖化白蛋白GA%";
    const href = recHref("m-1", slug);
    expect(anchorFromHash(href.slice(href.indexOf("#")))).toBe(recAnchor(slug));
  });
  it("未编码 / 残缺编码的片段不抛异常，按原样返回", () => {
    expect(anchorFromHash("#rec-20260210-GA%")).toBe("rec-20260210-GA%");
    expect(anchorFromHash("#rec-a%E4")).toBe("rec-a%E4");
  });
});
