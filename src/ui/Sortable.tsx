"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { moved, nearestSlot, slotOf, type Slot } from "./sortable-order";

interface Drag { id: string; from: number; to: number; dx: number; dy: number; slots: Slot[]; x: number; y: number }

function itemStyle(id: string, i: number, drag: Drag | null): CSSProperties | undefined {
  if (!drag) return undefined;
  if (id === drag.id) return { transform: `translate(${drag.dx}px, ${drag.dy}px)`, zIndex: 20, transition: "none" };
  const slot = drag.slots[slotOf(i, drag.from, drag.to)];
  const own = drag.slots[i];
  return { transform: `translate(${slot.left - own.left}px, ${slot.top - own.top}px)` };
}

const KEY_STEP: Record<string, number> = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 };

/**
 * 可拖动排序的列表：只有手柄能拖，不和卡片里的链接抢点击；方向键也能调整。
 * 拖动时其他项用 transform 让位，放下才改 DOM 顺序和保存；保存失败就恢复。
 */
export function Sortable({ items, save, label, className, itemClassName }: {
  items: { id: string; node: ReactNode }[];
  save: (ids: string[]) => Promise<void>;
  label: string;
  className?: string;
  itemClassName?: string;
}) {
  const key = items.map((x) => x.id).join("\n");
  const [order, setOrder] = useState(() => items.map((x) => x.id));
  const [seen, setSeen] = useState(key);
  if (key !== seen) {
    setSeen(key);
    setOrder(items.map((x) => x.id));
  }
  const [drag, setDrag] = useState<Drag | null>(null);
  const els = useRef(new Map<string, HTMLElement>());
  const router = useRouter();

  const commit = (next: string[]) => {
    const prev = order;
    setOrder(next);
    save(next).catch(() => { setOrder(prev); router.refresh(); });
  };
  const start = (e: PointerEvent<HTMLButtonElement>, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const slots = order.map((x) => els.current.get(x)!.getBoundingClientRect());
    const from = order.indexOf(id);
    setDrag({ id, from, to: from, dx: 0, dy: 0, slots, x: e.clientX, y: e.clientY });
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    const own = drag.slots[drag.from];
    setDrag({ ...drag, dx, dy, to: nearestSlot(drag.slots, own.left + own.width / 2 + dx, own.top + own.height / 2 + dy) });
  };
  const end = () => {
    if (drag && drag.to !== drag.from) commit(moved(order, drag.from, drag.to));
    setDrag(null);
  };
  const onKey = (e: KeyboardEvent, id: string) => {
    const to = order.indexOf(id) + (KEY_STEP[e.key] ?? 0);
    if (!KEY_STEP[e.key] || to < 0 || to >= order.length) return;
    e.preventDefault();
    commit(moved(order, order.indexOf(id), to));
  };

  const byId = new Map(items.map((x) => [x.id, x.node]));
  return (
    <div className={`${className ?? ""}${drag ? " sorting" : ""}`}>
      {order.map((id, i) => (
        <div key={id} className={`sortable-item ${itemClassName ?? ""}`} style={itemStyle(id, i, drag)} ref={(el) => { if (el) els.current.set(id, el); else els.current.delete(id); }}>
          {byId.get(id)}
          <button type="button" className="sortable-handle" aria-label={label} title={label}
            onPointerDown={(e) => start(e, id)} onPointerMove={move} onPointerUp={end} onPointerCancel={() => setDrag(null)}
            onKeyDown={(e) => onKey(e, id)}>
            <GripVertical size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
