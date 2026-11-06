"use client";

import { useEffect } from "react";
import { anchorFromHash } from "./rec-anchor";

/**
 * 记录页：按 URL 片段（#rec-…）展开并定位到那条记录。
 * 片段只在浏览器里，不发给服务器——报告标题含健康信息，不能放进查询参数（会进访问日志，SEC3）。
 */
export function OpenFromHash() {
  useEffect(() => {
    const id = anchorFromHash(location.hash);
    if (!id.startsWith("rec-")) return;
    const el = document.getElementById(id);
    if (el instanceof HTMLDetailsElement) {
      document.querySelectorAll("details.a-rec[open]").forEach((d) => d !== el && d.removeAttribute("open"));
      el.open = true;
      el.scrollIntoView({ block: "start" });
    }
  }, []);
  return null;
}
