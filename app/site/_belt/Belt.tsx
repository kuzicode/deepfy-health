"use client";

import { useEffect, useRef } from "react";
import type { Locale } from "@/i18n/config";
import { CARDS } from "./Cards";
import { COPY, TOKENS, codes } from "./content";
import { startBelt } from "./engine";

// 扫描线传送带：右侧是给人看的卡片，穿过扫描线溶解成薄荷色粒子，左侧露出给 agent 的结构化数据。
// 动画引擎在 engine.ts（一个 rAF 循环驱动所有元素；卡片只用 transform 定位，溶解效果画在 canvas 上）。

export function Belt({ locale, label, saved: savedText }: { locale: Locale; label: string; saved: string }) {
  const beltRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const codeRefs = useRef<(HTMLDivElement | null)[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const numRef = useRef<HTMLSpanElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const copy = COPY[locale];
  const codeTexts = codes(locale);

  useEffect(() => startBelt({
    belt: beltRef.current!, canvas: canvasRef.current!, probe: probeRef.current!, num: numRef.current!, pct: pctRef.current!,
    cards: cardRefs.current as HTMLDivElement[], codes: codeRefs.current as HTMLDivElement[],
  }, savedText), [savedText]);

  return (
    <>
      <div className="belt" ref={beltRef} aria-hidden="true">
        <div ref={probeRef} style={{ position: "absolute", width: "var(--gap)", height: 0, visibility: "hidden" }} />
        <div className="belt-codes">
          {codeTexts.map((code, i) => (
            <div className="belt-code" key={i} ref={(el) => { codeRefs.current[i] = el; }}>
              <div className="c-html">{code}</div>
              <div className="c-meta">{`# agent-ready: ${TOKENS[i].distilled.toLocaleString("en-US")} tokens\n# source: ${TOKENS[i].original.toLocaleString("en-US")} tokens\n# ${TOKENS[i].url}`}</div>
            </div>
          ))}
        </div>
        <div className="belt-cards">
          {CARDS.map((Card, i) => (
            <div className="belt-card" key={i} ref={(el) => { cardRefs.current[i] = el; }}><Card c={copy} /></div>
          ))}
        </div>
        <canvas ref={canvasRef} />
      </div>
      <div className="scan" aria-hidden="true"><b /><i /></div>
      <div className="badge" aria-hidden="true">
        <span className="badge-label">{label}</span>
        <span className="badge-pill"><span className="badge-num" ref={numRef}>−0 tokens</span><span className="badge-pct" ref={pctRef}>{savedText.replace("{pct}", String(Math.round((1 - TOKENS[0].distilled / TOKENS[0].original) * 100)))}</span></span>
      </div>
    </>
  );
}
