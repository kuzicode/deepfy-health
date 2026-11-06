"use client";

import { useState } from "react";
import { copyText } from "@/client/copy-text";

/** 复制按钮：成功后短暂显示 copied 文案；复制失败时静默（用户仍可手动选中复制） */
export function CopyButton({ text, label, copied, primary }: { text: string; label: string; copied: string; primary?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    if (!(await copyText(text))) return;
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };
  return <button type="button" className={`btn ${primary ? "btn-primary" : "btn-glass"} btn-sm`} onClick={copy}>{done ? copied : label}</button>;
}
