"use client";

import { useEffect, useRef, useState } from "react";

/** 点击外部关闭的下拉（App 顶栏菜单与官网账号菜单共用） */
export function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, []);
  return { open, setOpen, ref };
}
