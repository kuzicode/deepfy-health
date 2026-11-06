import { describe, expect, it } from "vitest";
import { createBudget, createGate } from "./throttle";

describe("createBudget", () => {
  it("窗口内累计超过上限就拒绝，被拒绝的量不计入", () => {
    const allow = createBudget(1000);
    expect(allow("a", 60, 100, 0)).toBe(true);
    expect(allow("a", 60, 100, 1)).toBe(false);
    expect(allow("a", 40, 100, 2)).toBe(true);
    expect(allow("b", 100, 100, 3)).toBe(true);
  });

  it("窗口过后额度恢复", () => {
    const allow = createBudget(1000);
    expect(allow("a", 100, 100, 0)).toBe(true);
    expect(allow("a", 1, 100, 999)).toBe(false);
    expect(allow("a", 100, 100, 1000)).toBe(true);
  });
});

describe("createGate", () => {
  it("每个 key 和全站都有上限，leave 后释放", () => {
    const gate = createGate(1, 2);
    expect(gate.enter("a")).toBe(true);
    expect(gate.enter("a")).toBe(false);
    expect(gate.enter("b")).toBe(true);
    expect(gate.enter("c")).toBe(false);
    gate.leave("a");
    expect(gate.enter("c")).toBe(true);
    expect(gate.enter("a")).toBe(false);
  });
});
