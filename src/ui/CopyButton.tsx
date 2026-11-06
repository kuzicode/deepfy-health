"use client";

import { useState } from "react";

/** 复制按钮：成功后短暂显示 copied 文案；剪贴板不可用时静默（用户仍可手动选中复制） */
export function CopyButton({ text, label, copied, primary }: { text: string; label: string; copied: string; primary?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch { /* ignore */ }
  };
  return <button type="button" className={`btn ${primary ? "btn-primary" : "btn-glass"} btn-sm`} onClick={copy}>{done ? copied : label}</button>;
}
