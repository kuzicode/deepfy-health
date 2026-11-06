const AGENTS = ["Claude Code", "Codex", "Gemini CLI", "Grokbot", "WorkBuddy", "Hermes Agent"] as const;

// Agent → MCP → Deepfy 的光束流程图；SVG 描边流动，官网区块与传送带卡片共用

const W = 600;
const H = 300;
const HUB = { x: 300, y: 150 };
const NODE_W = 116;
const NODE_H = 34;

const nodes = AGENTS.map((name, i) => {
  const left = i < 3;
  const row = i % 3;
  return { name, x: left ? 0 : W - NODE_W, y: 34 + row * 116 - NODE_H / 2, left };
});

const path = (n: (typeof nodes)[number]) => {
  const sx = n.left ? n.x + NODE_W : n.x;
  const sy = n.y + NODE_H / 2;
  const ex = HUB.x + (n.left ? -46 : 46);
  const mx = (sx + ex) / 2;
  return `M${sx},${sy} C${mx},${sy} ${mx},${HUB.y} ${ex},${HUB.y}`;
};

export function AgentBeam({ tone = "dark", label = "MCP" }: { tone?: "dark" | "light"; label?: string }) {
  return (
    <svg className={`beam ${tone}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${AGENTS.join(", ")} → ${label} → Deepfy`}>
      <defs>
        <linearGradient id={`beamGrad-${tone}`} x1="0" x2="1">
          <stop offset="0" stopColor="#99f6e4" stopOpacity="0" />
          <stop offset=".5" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#f0fdfa" />
        </linearGradient>
        <radialGradient id="hubGlow">
          <stop offset="0" stopColor="#2dd4bf" stopOpacity=".55" />
          <stop offset="1" stopColor="#2dd4bf" stopOpacity="0" />
        </radialGradient>
      </defs>
      {nodes.map((n) => <path key={`w-${n.name}`} className="wire" d={path(n)} />)}
      {nodes.map((n, i) => (
        <path key={`f-${n.name}`} className="flow" d={path(n)} stroke={`url(#beamGrad-${tone})`} style={{ animationDelay: `${-i * 0.53}s` }} />
      ))}
      {nodes.map((n) => (
        <g key={n.name} className="node">
          <rect x={n.x} y={n.y} width={NODE_W} height={NODE_H} rx={NODE_H / 2} />
          <text x={n.x + NODE_W / 2} y={n.y + NODE_H / 2 + 4.5} textAnchor="middle">{n.name}</text>
        </g>
      ))}
      <g className="hub">
        <circle className="halo" cx={HUB.x} cy={HUB.y} r={86} />
        <circle cx={HUB.x} cy={HUB.y} r={44} fill="#0f766e" stroke="#5eead4" strokeOpacity=".6" />
        <text x={HUB.x} y={HUB.y + 5} textAnchor="middle">Deepfy</text>
        <text className="mcp" x={HUB.x} y={HUB.y - 62} textAnchor="middle">{label}</text>
      </g>
    </svg>
  );
}
