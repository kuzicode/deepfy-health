// Deepfy 标志「影像环」（Imaging Ring）：开口的同心扫描弧 + 焦点。源文件见 public/brand/、docs/brand/logo-kit.md
// 主色 #0F766E 画环，强调色 #2DD4BF 画焦点；本项目所有尺寸统一用双环（不用 kit 的单环小尺寸版）

const PRIMARY = "#0F766E";
const ACCENT = "#2DD4BF";

const FULL = [
  "M 210.30 42.88 A 112.00 112.00 0 1 0 210.30 213.12 A 12.00 12.00 0 1 0 194.70 194.88 A 88.00 88.00 0 1 1 194.70 61.12 A 12.00 12.00 0 1 0 210.30 42.88 Z",
  "M 194.23 66.82 A 80.00 80.00 0 1 0 194.23 189.18 A 12.00 12.00 0 1 0 178.77 170.82 A 56.00 56.00 0 1 1 178.77 85.18 A 12.00 12.00 0 1 0 194.23 66.82 Z",
];

export function Logo({ size = 22, unit = "px", tone = "color" }: { size?: number; unit?: "px" | "cqw"; tone?: "color" | "white" | "current" }) {
  const s = `${size}${unit}`;
  // current：环跟随父元素 color（深色卡片上自动变浅），焦点保持强调色
  const ring = tone === "white" ? "#fff" : tone === "current" ? "currentColor" : PRIMARY;
  const dot = tone === "white" ? "#fff" : ACCENT;
  return (
    <svg width={s} height={s} viewBox="0 0 256 256" aria-hidden="true">
      {FULL.map((d) => <path key={d} d={d} fill={ring} />)}
      <circle cx="212.5" cy="128" r="18" fill={dot} />
    </svg>
  );
}

export function Wordmark({ size = 22 }: { size?: number }) {
  return <span className="logo"><Logo size={size} />Deepfy</span>;
}
