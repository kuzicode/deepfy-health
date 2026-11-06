"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { copyText } from "@/client/copy-text";

/** 官网首屏：一键复制不含 token 的 MCP 接入提示词；token 由用户登录后在「Agent 接入」创建 */
export function McpCopy({ prompt, label, copied, hint, hintHref }: { prompt: string; label: string; copied: string; hint: string; hintHref: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    if (!(await copyText(prompt))) return; // 复制失败：用户可在 Agent 接入页复制
    setDone(true);
    setTimeout(() => setDone(false), 2400);
  };
  return (
    <span className="s-mcp">
      <button type="button" className="btn btn-glass btn-sm s-mcp-btn" onClick={copy}>
        {done ? <Check size={14} /> : <Copy size={14} />}{done ? copied : label}
      </button>
      <a href={hintHref}><i />{hint}</a>
    </span>
  );
}
