"use client";

import { Area, AreaChart, CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/core/analysis";
import { spanMarks, type RegimenSpan } from "@/core/regimen";
import { shortDate } from "./format";

const FLAG_COLOR: Record<string, string> = { H: "#e5484d", A: "#e5484d", L: "#3e63dd", N: "#12a594" };

interface Labels { value: string; range: string; flags: Record<string, string> }

function Tip({ active, payload, unit, labels }: { active?: boolean; payload?: { payload: SeriesPoint }[]; unit: string; labels: Labels }) {
  const p = active ? payload?.[0]?.payload : undefined;
  if (!p) return null;
  return (
    <div className="chart-tip">
      <div className="mono muted" style={{ fontSize: 11 }}>{p.date}</div>
      <div><b>{p.value}</b> {unit}{p.flag && <span style={{ color: FLAG_COLOR[p.flag], marginLeft: 6 }}>{labels.flags[p.flag]}</span>}</div>
    </div>
  );
}

/** compact：嵌在「最新结果」卡片里的小图——最近 8 个点、3 个刻度、日期缩写、无图例 */
const TICK = { fill: "#7c8d89", fontFamily: "IBM Plex Mono" };
const SIZE = {
  full: { margin: { top: 14, right: 40, bottom: 4, left: 0 }, font: 11, tickMargin: 10, yWidth: 44, yTicks: 5, dot: 5, ring: 2.5, wrap: "-4px -8px -6px", xFormat: undefined },
  compact: { margin: { top: 8, right: 14, bottom: 0, left: 0 }, font: 10, tickMargin: 6, yWidth: 36, yTicks: 3, dot: 4, ring: 2, wrap: "0", xFormat: shortDate },
};

export function TrendChart({ points: all, unit, labels, height = 260, compact = false, spans = [] }: { points: SeriesPoint[]; unit: string; labels: Labels; height?: number; compact?: boolean; spans?: RegimenSpan[] }) {
  const points = compact ? all.slice(-8) : all;
  const z = compact ? SIZE.compact : SIZE.full;
  const last = points.at(-1);
  const values = points.flatMap((p) => [p.value, p.low, p.high]).filter((v): v is number => v !== undefined);
  const pad = (Math.max(...values) - Math.min(...values)) * 0.2 || Math.max(...values) * 0.1 || 1;
  const domain = [Math.max(0, Math.floor(Math.min(...values) - pad)), Math.ceil(Math.max(...values) + pad)];
  const marks = spanMarks(points.map((p) => p.date), spans);
  const hasRange = last && (last.low !== undefined || last.high !== undefined);

  return (
    <div style={{ margin: z.wrap }}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={points} margin={z.margin}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0f766e" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#0f766e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(13,48,42,.07)" vertical={false} />
          {hasRange && <ReferenceArea y1={last.low ?? domain[0]} y2={last.high ?? domain[1]} fill="#2dd4bf" fillOpacity={0.14} ifOverflow="hidden" />}
          <XAxis dataKey="date" tick={{ ...TICK, fontSize: z.font }} axisLine={false} tickLine={false} tickMargin={z.tickMargin} tickFormatter={z.xFormat} />
          <YAxis domain={domain} tick={{ ...TICK, fontSize: z.font }} axisLine={false} tickLine={false} width={z.yWidth} tickCount={z.yTicks} />
          {marks.map((m) => <ReferenceLine key={`${m.kind}-${m.date}-${m.name}`} x={m.date} stroke="#7c8d89" strokeDasharray={m.kind === "end" ? "2 3" : "4 3"} ifOverflow="hidden" />)}
          <Tooltip content={<Tip unit={unit} labels={labels} />} cursor={{ stroke: "#14b8a6", strokeDasharray: "3 3" }} />
          <Area type="monotone" dataKey="value" stroke="#0f766e" strokeWidth={2} fill="url(#trendFill)" isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; payload?: SeriesPoint; index?: number }) => (
              <circle key={p.index} cx={p.cx} cy={p.cy} r={z.dot} fill={FLAG_COLOR[p.payload?.flag ?? ""] ?? "#0f766e"} stroke="#fff" strokeWidth={z.ring} />
            )}
            activeDot={{ r: 7, stroke: "#fff", strokeWidth: 2.5, fill: "#0f766e" }} />
        </AreaChart>
      </ResponsiveContainer>
      {hasRange && !compact && <p className="chart-legend"><span className="legend-band" />{labels.range}</p>}
    </div>
  );
}
