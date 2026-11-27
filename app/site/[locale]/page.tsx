import { Download, Info, KeyRound, Lock, Mail } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { Locale } from "@/i18n/config";
import { appUrl, siteBase } from "@/site-links";
import { AgentBeam } from "@/ui/AgentBeam";
import { Belt } from "../_belt/Belt";
import { McpCopy } from "../_parts/McpCopy";
import { SiteSectionHead } from "../_parts/SectionHead";
import { Scenes } from "../_parts/Scenes";
import { Why } from "../_parts/Why";

const CIPHER = `id          | kind   | ciphertext
------------+--------+--------------------------------------
3f2a…c91e   | record | v1:Qm9h7x…:<span class="k">8KqZ2r1Vt0yX…</span>:Lk3P…
71bd…04aa   | note   | v1:aP0e2c…:<span class="k">mN4vR8cWq7Ue…</span>:T9xD…
c0e8…5f12   | profile| v1:J3sQw1…:<span class="k">Zr6Ye2Hn5kBc…</span>:p2Ma…
b79e…82cf   | recipe | v1:Hx7cK4…:<span class="k">vQ2ns6Pf9mAa…</span>:D8rB…`;

async function Flow() {
  const t = await getTranslations("site.flow");
  return (
    <section className="s-section" id="flow">
      <SiteSectionHead eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
      <div className="bento">
        <div className="cell spotlight reveal">
          <span className="step">01</span><h3>{t("s1t")}</h3><p>{t("s1")}</p>
          <div className="viz mini-file"><span>PDF</span><div>20261015-annual-checkup.pdf<br /><b>→ {t("s1v")}</b></div></div>
        </div>
        <div className="cell spotlight reveal" style={{ transitionDelay: ".08s" }}>
          <span className="step">02</span><h3>{t("s2t")}</h3><p>{t("s2")}</p>
          <div className="viz mini-trend">
            <div className="mt-head"><span>{t("s2v")}</span><span className="chip chip-mint"><Lock size={11} />{t("enc")}</span></div>
            <svg viewBox="0 0 320 64" aria-hidden="true">
              <rect x="0" y="0" width="320" height="22" rx="4" className="mt-band" />
              <polyline points="12,8 112,16 212,27 308,31" className="mt-line" />
              {[[12, 8], [112, 16], [212, 27], [308, 31]].map(([x, y]) => <circle key={x} cx={x} cy={y} r="3.5" className="mt-dot" />)}
            </svg>
          </div>
        </div>
        <div className="cell spotlight reveal" style={{ transitionDelay: ".16s" }}>
          <span className="step">03</span><h3>{t("s3t")}</h3><p>{t("s3")}</p>
          <div className="viz mini-mail">
            <div className="mm-from"><Mail size={13} />{t("mailFrom")}</div>
            <div className="mm-row"><span className="dot" style={{ background: "var(--warn)" }} />{t("m1")}<time>{t("m1d")}</time></div>
            <div className="mm-row"><span className="dot" style={{ background: "var(--ok)" }} />{t("m2")}<time>{t("m2d")}</time></div>
            <div className="mm-foot">{t("mailPause")}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

async function Security() {
  const t = await getTranslations("site.security");
  return (
    <section className="s-section" id="security">
      <SiteSectionHead eyebrow={t("eyebrow")} title={t("title")} lead={t("lead")} />
      <div className="sec-grid">
        <div className="sec-card panel reveal">
          <ul className="sec-list">
            <li><Lock size={18} /><div><b>{t("c1t")}</b><br />{t("c1")}</div></li>
            <li><KeyRound size={18} /><div><b>{t("c2t")}</b><br />{t("c2")}</div></li>
            <li><Info size={18} /><div><b>{t("c3t")}</b><br />{t("c3")}</div></li>
            <li><Download size={18} /><div><b>{t("c4t")}</b><br />{t("c4")}</div></li>
          </ul>
        </div>
        <div className="sec-card glass reveal" style={{ transitionDelay: ".08s" }}>
          <h3>{t("cipherTitle")}</h3>
          <pre className="cipher" dangerouslySetInnerHTML={{ __html: CIPHER }} />
        </div>
      </div>
    </section>
  );
}

export default async function SitePage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  const t = await getTranslations("site");

  return (
    <main>
      <section className="s-hero" lang={locale}>
        <div className="s-hero-copy">
          <div>
            <h1>{t("hero.title1")}{locale === "en" && " "}<em className="line2 accent-line">{t("hero.title2")}</em></h1>
          </div>
          <div>
            <p className="s-lead s-lead-1">{t("hero.lead1")}</p>
            <p className="s-lead s-lead-2">{t("hero.lead2")}</p>
            <div className="s-cta-row">
              <a className="btn btn-primary" href={appUrl("/")}>{t("hero.cta")}</a>
              <McpCopy prompt={t("hero.mcpPrompt", { url: `${process.env.KZ_APP_URL ?? "https://app.deepfy.si"}/mcp`, app: process.env.KZ_APP_URL ?? "https://app.deepfy.si" })}
                label={t("hero.mcpCopy")} copied={t("hero.mcpCopied")} hint={t("hero.mcpHint")} hintHref={appUrl("/agents")} />
            </div>
          </div>
        </div>
        <div className="s-hero-belt">
          <Belt locale={locale} label={t("hero.counter")} saved={t.raw("hero.saved") as string} />
        </div>
      </section>

      <Why />

      <section className="s-section" id="agents">
        <SiteSectionHead eyebrow={t("agents.eyebrow")} title={t("agents.title")} lead={t("agents.lead")} />
        <div className="agents-panel reveal">
          <div className="beam-box"><AgentBeam tone="dark" label="MCP" /></div>
          <div className="note"><span>{t("agents.note")} <a href={`${await siteBase()}/${locale}/docs#agents`}>{t("agents.docs")}</a></span><span className="chip chip-mint">{t("agents.soon")}</span></div>
        </div>
      </section>

      <Flow />

      <Scenes />

      <Security />

      <section className="s-section">
        <SiteSectionHead eyebrow={t("family.eyebrow")} title={t("family.title")} lead={t("family.lead")} />
        <div className="family">
          {([["p1", "var(--brand)", "chip-H", "c1"], ["p2", "var(--low)", "chip-warn", "c2"], ["p3", "var(--mint-deep)", "chip-mint", "c3"]] as const).map(([k, color, chip, c], i) => (
            <div className="p spotlight reveal" key={k} style={{ transitionDelay: `${i * 0.08}s` }}>
              <span className="ava" style={{ background: color }}>{[...t(`family.${k}`)][0]}</span>
              <div><b>{t(`family.${k}`)}</b><small>{t(`family.${k}m`)}</small></div>
              <span className={`chip ${chip}`}>{t(`family.${c}`)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="s-final glass reveal">
        <h2>{t("final.title")}</h2>
        <p>{t("final.lead")}</p>
        <a className="btn btn-primary" href={appUrl("/")}>{t("final.cta")}</a>
      </section>
    </main>
  );
}
