import { Check, Mail } from "lucide-react";
import { Logo } from "@/ui/Logo";
import type { BeltCopy } from "./content";

// 传送带卡片：每张对应 Deepfy 一个真实功能（agent 对话录入 → 报告 → 解读 → 趋势 → 全家 → 已知状况 → 接下来 → 接入）。
// 内部尺寸一律用 cqw；手机上卡片高度只有宽度的 ~64%，内容高度要控制在这之内。

const Top = ({ label }: { label: string }) => (
  <div className="kc-top">
    <span className="kc-brand"><Logo size={2.6} unit="cqw" tone="current" />Deepfy</span>
    <span className="kc-pill">{label}</span>
  </div>
);

/** agent 对话：拍照 → 全量录入 → 主动问「这是不是那次复查」→ 确认后写入，可还原 */
function Chat({ c }: { c: BeltCopy }) {
  const ch = c.chat;
  return (
    <div className="kc kc-chat">
      <Top label={ch.kicker} />
      <h3 className="kc-title" style={{ marginTop: "5cqw", maxWidth: "70cqw" }}>{ch.title}</h3>
      <div className="thread">
        <div className="me"><span className="att">▦ {ch.photos}</span>{ch.ask}</div>
        <div className="bot"><span className="dot" />{ch.reply}</div>
        <div className="me">{ch.yes}</div>
        <div className="done"><span className="kc-chip"><Check style={{ width: "1.6cqw", height: "1.6cqw" }} strokeWidth={3} />{ch.tool}</span><span className="kc-label">{ch.foot}</span></div>
      </div>
    </div>
  );
}

const FLAG_COLOR = { H: ["#3b1517", "#ff8b8f"], L: ["#16224a", "#9fb4ff"], A: ["#3a2a0c", "#fcd34d"], N: ["#0b3a34", "#5eead4"] } as const;

function Report({ c }: { c: BeltCopy }) {
  const r = c.report;
  return (
    <div className="kc kc-report">
      <Top label={r.org} />
      <div style={{ marginTop: "5cqw" }} className="kc-kicker">{r.kicker}</div>
      <h3 className="kc-title" style={{ maxWidth: "62cqw" }}>{r.title}</h3>
      <div className="rows">
        {r.rows.map(([name, v, unit, f]) => (
          <div className="row" key={name}>
            <span>{name}</span>
            <b className={unit ? "" : "text"}>{v}{unit && <small>{unit}</small>}</b>
            <span className="kc-chip" style={{ background: FLAG_COLOR[f][0], color: FLAG_COLOR[f][1] }}>{r.flag[f]}</span>
          </div>
        ))}
      </div>
      <div className="kc-label" style={{ marginTop: "1.6cqw" }}>{r.note}</div>
    </div>
  );
}

/** 指标解读：agent 结合个人情况写的分析笔记，复查日期自动进「接下来」 */
function Insight({ c }: { c: BeltCopy }) {
  const s = c.insight;
  return (
    <div className="kc kc-insight">
      <Top label={s.kicker} />
      <div style={{ marginTop: "5cqw" }} className="kc-kicker">{s.code}</div>
      <h3 className="kc-title" style={{ maxWidth: "66cqw" }}>{s.title}</h3>
      <div className="blocks">
        {s.blocks.map(([k, v]) => <div key={k}><span className="kc-kicker">{k}</span><p>{v}</p></div>)}
      </div>
      <span className="kc-chip recheck">{s.recheck}</span>
    </div>
  );
}

function Trend({ c }: { c: BeltCopy }) {
  const t = c.trend;
  const pts = [72, 61, 48];
  const x = (i: number) => 20 + i * 230;
  const y = (v: number) => 230 - v * 2.6;
  return (
    <div className="kc kc-trend">
      <Top label={t.kicker} />
      <div style={{ marginTop: "6cqw" }} className="kc-kicker">{t.name}</div>
      <div className="main">
        <div>
          <div className="kc-big">48<span className="kc-unit">U/L</span></div>
          <div className="kc-label" style={{ marginTop: "1.6cqw" }}>{t.delta}</div>
          <div className="kc-label">{t.range}</div>
        </div>
        <svg viewBox="0 0 500 250" preserveAspectRatio="none">
          <rect x="0" y={y(40)} width="500" height={y(7) - y(40)} fill="#ffffff" opacity=".45" rx="6" />
          <polyline points={pts.map((v, i) => `${x(i)},${y(v)}`).join(" ")} fill="none" stroke="#06302b" strokeWidth="3" strokeLinejoin="round" />
          {pts.map((v, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(v)} r="9" fill={i === 2 ? "#0f766e" : "#06302b"} stroke="#e8fbf6" strokeWidth="4" />
              <text x={x(i)} y="248" textAnchor="middle" fontSize="20" fill="#06302b" opacity=".7">{t.years[i]}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

/** 全家档案：昵称 + 关系，每个人一眼看到状态 */
function Family({ c }: { c: BeltCopy }) {
  const f = c.family;
  return (
    <div className="kc kc-family">
      <Top label={f.kicker} />
      <h3 className="kc-title" style={{ marginTop: "5cqw" }}>{f.title}</h3>
      <div className="people">
        {f.rows.map(([ini, name, meta, state, warn], i) => (
          <div className="person" key={name}>
            <span className={`ava a${i}`}>{ini}</span>
            <span><b>{name}</b><span className="kc-label">{meta}</span></span>
            <span className={`kc-chip${warn ? " warn" : ""}`}>{state}</span>
          </div>
        ))}
      </div>
      <div className="kc-label" style={{ marginTop: "1.8cqw" }}>{f.foot}</div>
    </div>
  );
}

/** 已知状况：按病史列出相关检查的覆盖情况，缺什么一目了然 */
function Condition({ c }: { c: BeltCopy }) {
  const d = c.condition;
  const tone = { covered: ["#0b3a34", "#5eead4"], due: ["#3a2a0c", "#fcd34d"], missing: ["#3b1517", "#ff8b8f"] } as const;
  return (
    <div className="kc kc-cond">
      <Top label={d.kicker} />
      <div style={{ marginTop: "5cqw" }} className="kc-kicker">{d.who}</div>
      <h3 className="kc-title">{d.title}</h3>
      <div className="rows">
        {d.rows.map(([name, last, st]) => (
          <div className="row" key={name}>
            <span>{name}</span><small>{last}</small>
            <span className="kc-chip" style={{ background: tone[st][0], color: tone[st][1] }}>{d.status[st]}</span>
          </div>
        ))}
      </div>
      <div className="ask">{d.ask}</div>
    </div>
  );
}

/** 接下来：全家的复查 / 体检日程，到期前邮件提醒；做完点「已查 / 免查」，逾期自动顺延 */
function Schedule({ c }: { c: BeltCopy }) {
  const s = c.schedule;
  return (
    <div className="kc kc-sched">
      <Top label={s.kicker} />
      <h3 className="kc-title" style={{ marginTop: "5cqw" }}>{s.title}</h3>
      <div className="tl">
        {s.rows.map(([who, what, when, left], i) => (
          <div className="item" key={who}>
            <span className="who">{who}</span><span className="what">{what}</span>
            <time>{when}<small>{left}</small></time>
            {i === 0 ? <span className="btn-mini">{s.done}</span> : <span />}
          </div>
        ))}
      </div>
      <span className="kc-chip mail"><Mail style={{ width: "1.7cqw", height: "1.7cqw" }} />{s.mail}</span>
    </div>
  );
}

export const CARDS = [Chat, Report, Insight, Trend, Family, Condition, Schedule];
