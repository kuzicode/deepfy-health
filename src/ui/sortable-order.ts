// 拖动排序的纯计算：拖动时其他项让位的位置、放下后的新顺序、离指针最近的槽位

export interface Slot { left: number; top: number; width: number; height: number }

/** 把 from 位置的元素移到 to 位置 */
export function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** 拖动过程中，第 i 项应该显示在哪个槽位 */
export function slotOf(i: number, from: number, to: number) {
  if (i === from) return to;
  if (from < to && i > from && i <= to) return i - 1;
  if (to < from && i >= to && i < from) return i + 1;
  return i;
}

/** 中心离 (x, y) 最近的槽位 */
export function nearestSlot(slots: readonly Slot[], x: number, y: number) {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  slots.forEach((s, i) => {
    const dist = (s.left + s.width / 2 - x) ** 2 + (s.top + s.height / 2 - y) ** 2;
    if (dist < bestDist) { best = i; bestDist = dist; }
  });
  return best;
}
