"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** 全站轻交互：.reveal 滚动进入淡入，.spotlight 跟随光标高光 */
export function Interactions() {
  const path = usePathname();
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { rootMargin: "0px 0px -8% 0px" },
    );
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.(".spotlight") as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("pointermove", onMove); };
  }, [path]);
  return null;
}
