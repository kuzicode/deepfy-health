import { CARDS } from "./Cards";
import { TOKENS } from "./content";

// 传送带动画引擎（Belt.tsx 只负责 DOM 结构）：一个 rAF 循环驱动所有元素；卡片只用 transform 定位，溶解效果画在 canvas 上。

const N = CARDS.length;
const PALETTE = ["#0F766E", "#0D9488", "#14B8A6", "#2DD4BF", "#5EEAD4", "#99F6E4", "#F0FDFA"];
const CARD_TOP = 70;

const fmt = (n: number) => `−${Math.round(n).toLocaleString("en-US")} tokens`;
const mod = (a: number, n: number) => ((a % n) + n) % n;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function hash(a: number, b: number, c: number) {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Spark { x: number; y: number; vx: number; vy: number; life: number; size: number; color: string }

interface Geo { W: number; cw: number; ch: number; gap: number; Lx: number; radius: number; dpr: number }

function measure(belt: HTMLElement, card: HTMLElement, probe: HTMLElement, canvas: HTMLCanvasElement): Geo {
  const W = window.innerWidth;
  const rect = card.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const b = belt.getBoundingClientRect();
  canvas.width = Math.round(b.width * dpr);
  canvas.height = Math.round(b.height * dpr);
  return { W, cw: rect.width, ch: rect.height, gap: probe.getBoundingClientRect().width, Lx: W / 2, radius: parseFloat(getComputedStyle(card).borderTopRightRadius) || 0, dpr };
}

interface Dither { ctx: CanvasRenderingContext2D; g: Geo; x: number; cut: number; idx: number; t: number; still: boolean }

/** 一列抖动粒子：p 为这一列的密度（越靠近扫描线越密） */
function ditherColumn(d: Dither, gx: number, p: number, near: boolean) {
  const { g, idx, still } = d;
  const rows = Math.floor(g.ch / 3);
  const tick = Math.floor(d.t * 9) + 97;
  const sx = d.x + gx * 3;
  for (let row = -5; row < rows + 5; row++) {
    const inside = row >= 0 && row < rows;
    const edge = inside ? 1 : 1 - (row < 0 ? -row : row - rows + 1) / 5;
    if (hash(gx, row, idx) >= (inside ? p * 0.92 : p * 0.16 * edge)) continue;
    if (!still && hash(gx, row, tick) < 0.22) continue;
    drawDot(d, { gx, row, sx, near });
  }
}

/** 单个粒子：颜色（靠近扫描线用冰白色）、大小和静止时不抖动 */
function drawDot({ ctx, idx, still }: Dither, { gx, row, sx, near }: { gx: number; row: number; sx: number; near: boolean }) {
  const h2 = hash(row, gx, idx + 31);
  ctx.fillStyle = near ? PALETTE[4 + Math.floor(h2 * 3)] : PALETTE[Math.floor(h2 * h2 * 7)];
  const s = 1.1 + h2 * 1.7;
  const jx = still ? 0 : (hash(gx, row, idx + 7) - 0.5) * 1.6;
  const jy = still ? 0 : (hash(row, gx, idx + 11) - 0.5) * 1.6;
  ctx.fillRect(sx + jx, CARD_TOP + row * 3 + jy, s, s);
}

/** 卡片表面固定的抖动粒子：越靠近扫描线越密，靠近线的用冰白色 */
function drawDither(d: Dither) {
  const R = 0.3 * d.g.cw;
  for (let gx = Math.floor(d.cut / 3); gx * 3 <= d.cut + R; gx++) {
    const dist = d.x + gx * 3 - d.g.Lx;
    if (dist < 0 || dist > R) continue;
    ditherColumn(d, gx, Math.pow(1 - dist / R, 1.7), dist < 10);
  }
}

function drawHaze(ctx: CanvasRenderingContext2D, g: Geo, x: number) {
  const w = Math.min(150, x + g.cw - g.Lx);
  if (w <= 0) return;
  const grad = ctx.createLinearGradient(g.Lx, 0, g.Lx + 150, 0);
  grad.addColorStop(0, "rgba(45,212,191,0.36)");
  grad.addColorStop(1, "rgba(45,212,191,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(g.Lx, CARD_TOP, w, g.ch);
}

function stepSparks(ctx: CanvasRenderingContext2D, sparks: Spark[], o: { g: Geo; dt: number; vel: number; spawn: boolean }) {
  const { g, dt, vel, spawn } = o;
  if (spawn) {
    for (let k = 0; k < 3; k++) {
      if (Math.random() > 0.7) continue;
      sparks.push({
        x: g.Lx + Math.random() * 30, y: CARD_TOP - 10 + Math.random() * (g.ch + 20),
        vx: -30 + Math.random() * 70 + vel * 0.6, vy: (Math.random() - 0.5) * 50,
        life: 0.3 + Math.random() * 0.8, size: 0.8 + Math.random() * 1.8, color: PALETTE[Math.floor(Math.random() * 7)],
      });
    }
  }
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.life -= dt;
    if (s.life <= 0) { sparks.splice(i, 1); continue; }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    ctx.globalAlpha = Math.min(1, s.life * 2.2);
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.globalAlpha = 1;
}

interface Els { belt: HTMLDivElement; canvas: HTMLCanvasElement; probe: HTMLDivElement; num: HTMLSpanElement; pct: HTMLSpanElement; cards: HTMLDivElement[]; codes: HTMLDivElement[] }

/** 把第 i 张卡片和它的代码层摆到 x；返回被扫描线切掉的宽度 cut */
function placeCard(card: CSSStyleDeclaration, code: CSSStyleDeclaration, g: Geo, x: number) {
  const cut = clamp(g.Lx - x, 0, g.cw);
  card.transform = code.transform = `translate3d(${x}px,0,0)`;
  if (cut > 0) {
    card.clipPath = `inset(0 0 0 ${cut}px round 0 ${g.radius}px ${g.radius}px 0)`;
    card.maskImage = card.webkitMaskImage = `linear-gradient(90deg, transparent ${cut}px, #000 ${cut + 26}px)`;
    code.clipPath = `inset(0 ${g.cw - cut}px 0 0)`;
    code.visibility = "visible";
  } else {
    card.clipPath = card.maskImage = card.webkitMaskImage = "";
    code.visibility = "hidden";
  }
  return cut;
}

interface Motion { off: number; vel: number; hover: number; hoverTarget: number; drag: { x: number; t: number } | null }

/** 拖拽、横向滚轮、悬停减速；返回解绑函数 */
function bindPointer(belt: HTMLDivElement, m: Motion) {
  const onDown = (e: PointerEvent) => {
    belt.setPointerCapture(e.pointerId);
    belt.classList.add("dragging");
    m.drag = { x: e.clientX, t: performance.now() };
  };
  const onMove = (e: PointerEvent) => {
    if (!m.drag) return;
    const now = performance.now();
    const dx = e.clientX - m.drag.x;
    m.off += dx;
    m.vel = (dx / Math.max(8, now - m.drag.t)) * 1000 * 0.8 + m.vel * 0.2;
    m.drag = { x: e.clientX, t: now };
  };
  const onUp = () => { m.drag = null; belt.classList.remove("dragging"); };
  const onWheel = (e: WheelEvent) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) m.vel += -e.deltaX * 6; };
  const onEnter = () => { m.hoverTarget = 1; };
  const onLeave = () => { m.hoverTarget = 0; };
  const events: [string, EventListener][] = [
    ["pointerdown", onDown as EventListener], ["pointermove", onMove as EventListener], ["pointerup", onUp], ["pointercancel", onUp],
    ["pointerenter", onEnter], ["pointerleave", onLeave],
  ];
  for (const [type, fn] of events) belt.addEventListener(type, fn);
  belt.addEventListener("wheel", onWheel, { passive: true });
  return () => {
    for (const [type, fn] of events) belt.removeEventListener(type, fn);
    belt.removeEventListener("wheel", onWheel);
  };
}

/** 启动传送带；返回清理函数（useEffect 用） */
export function startBelt(els: Els, savedText: string) {
  const { belt, canvas, cards, codes } = els;
  const ctx = canvas.getContext("2d")!;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let g = measure(belt, cards[0], els.probe, canvas);
  // 第一张（用例卡）刚进入扫描线：先读得到内容，同时立刻看到转换效果
  const m: Motion = { off: g.W / 2 + 0.03 * g.cw, vel: 0, hover: 0, hoverTarget: 0, drag: null };
  let shown = 0;
  let active = -1;
  let visible = true;
  let prev = performance.now();
  let raf = 0;
  const sparks: Spark[] = [];

  const setCounter = (idx: number, progress: number, dt: number) => {
    const tok = TOKENS[idx];
    const saved = tok.original - tok.distilled;
    const target = saved * progress;
    if (idx !== active) {
      active = idx;
      shown = target;
      els.pct.textContent = savedText.replace("{pct}", String(Math.round((saved / tok.original) * 100)));
    } else shown += (target - shown) * Math.min(1, dt * 14);
    els.num.textContent = fmt(shown);
  };

  const advance = (dt: number) => {
    const auto = reduced ? 0 : -0.075 * g.W;
    m.hover += (m.hoverTarget - m.hover) * Math.min(1, 4 * dt);
    if (m.drag) return;
    m.vel += (auto * (1 - 0.65 * m.hover) - m.vel) * (1 - Math.exp(-2.2 * dt));
    m.off += m.vel * dt;
  };

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - prev) / 1000);
    prev = now;
    if (!visible) return;
    advance(dt);
    const span = g.cw + g.gap;
    const period = span * N;
    ctx.setTransform(g.dpr, 0, 0, g.dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const t = now / 1000;
    let crossing = false;
    for (let i = 0; i < N; i++) {
      const x = mod(m.off + i * span + span, period) - span;
      const cut = placeCard(cards[i].style, codes[i].style, g, x);
      if (cut <= 0 || cut >= g.cw) continue;
      crossing = true;
      setCounter(i, cut / g.cw, dt);
      drawHaze(ctx, g, x);
      drawDither({ ctx, g, x, cut, idx: i, t: reduced ? 0 : t, still: reduced });
    }
    stepSparks(ctx, sparks, { g, dt, vel: m.vel, spawn: crossing && !reduced });
  };

  const onResize = () => { g = measure(belt, cards[0], els.probe, canvas); };
  const io = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
  io.observe(belt);
  window.addEventListener("resize", onResize);
  const unbind = bindPointer(belt, m);
  raf = requestAnimationFrame(frame);
  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    window.removeEventListener("resize", onResize);
    unbind();
  };
}
