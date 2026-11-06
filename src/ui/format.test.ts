import { describe, expect, it } from "vitest";
import { deltaText, shortDate, rangeText } from "./format";

describe("deltaText", () => {
  it("上升 / 下降带箭头和差值", () => {
    expect(deltaText(4.03, 4.8)).toBe("↓ 0.77");
    expect(deltaText(5.6, 4.8)).toBe("↑ 0.8");
  });
  it("小数位取两者较多的一方，避免浮点尾巴", () => {
    expect(deltaText(0.3, 0.1)).toBe("↑ 0.2");
    expect(deltaText(103, 97.5)).toBe("↑ 5.5");
    expect(deltaText(452, 400)).toBe("↑ 52");
  });
  it("相等为 →，缺上次或文字结论为空", () => {
    expect(deltaText(4, 4)).toBe("→");
    expect(deltaText(4)).toBe("");
    expect(deltaText("窦性心律", "窦性心律")).toBe("");
    expect(deltaText(4, "阴性")).toBe("");
  });
});

describe("shortDate", () => {
  it("YYYY-MM-DD → YY-MM", () => expect(shortDate("2026-11-03")).toBe("26-11"));
});

describe("rangeText", () => {
  it("不含边界的上限写成 <，普通上限写成 ≤", () => {
    expect(rangeText({ high: 100, high_exclusive: true })).toBe("< 100");
    expect(rangeText({ high: 40 })).toBe("≤ 40");
    expect(rangeText({ low: 1, high: 10, high_exclusive: true })).toBe("1–<10");
  });
});
