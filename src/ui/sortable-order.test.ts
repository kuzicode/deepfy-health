import { describe, expect, it } from "vitest";
import { moved, nearestSlot, slotOf } from "./sortable-order";

describe("拖动排序", () => {
  it("moved 向前向后都能移动，不改原数组", () => {
    const list = ["a", "b", "c", "d"];
    expect(moved(list, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moved(list, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moved(list, 1, 1)).toEqual(list);
    expect(list).toEqual(["a", "b", "c", "d"]);
  });

  it("slotOf 的结果和 moved 放下后的位置一致", () => {
    const list = ["a", "b", "c", "d", "e"];
    for (let from = 0; from < list.length; from++) {
      for (let to = 0; to < list.length; to++) {
        const next = moved(list, from, to);
        list.forEach((id, i) => expect(next[slotOf(i, from, to)]).toBe(id));
      }
    }
  });

  it("nearestSlot 按中心距离选槽位，也适用于换行的网格", () => {
    const slot = (left: number, top: number) => ({ left, top, width: 100, height: 100 });
    const grid = [slot(0, 0), slot(110, 0), slot(0, 110), slot(110, 110)];
    expect(nearestSlot(grid, 10, 10)).toBe(0);
    expect(nearestSlot(grid, 170, 40)).toBe(1);
    expect(nearestSlot(grid, 30, 200)).toBe(2);
    expect(nearestSlot(grid, 500, 500)).toBe(3);
  });
});
