import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { mcpSnippets } from "@/mcp-snippets";
import { appUrl } from "@/site-links";
import { CopyButton } from "@/ui/CopyButton";
import { McpCopy } from "../../_parts/McpCopy";

// 官网文档页：快速上手、接入 Agent、各部分简介、数据与隐私。内容人人相同，nginx 按官网页面缓存（/zh/docs、/en/docs）

const APP = process.env.KZ_APP_URL ?? "https://app.deepfy.si";
type Step = { t: string; d: string };
type T = Awaited<ReturnType<typeof getTranslations<"site.docs">>>;

/** 整页文档的 Markdown 版：开头一段写给 agent 的说明，让它读完后一步步指导用户。和页面共用同一份文案，不会两边不一致 */
function docsMarkdown(t: T, o: { locale: string; prompt: string; mcpUrl: string; enter: string; terms: string; privacy: string }) {
  const site = `https://deepfy.si/${o.locale}/docs`;
  const steps = (k: "start.steps" | "agents.steps") => (t.raw(k) as Step[]).map((s, i) => `${i + 1}. **${s.t}** — ${s.d}`).join("\n");
  const list = (k: "agents.can" | "privacy.items") => (t.raw(k) as string[]).map((x) => `- ${x}`).join("\n");
  const snippets = mcpSnippets(o.mcpUrl, "<TOKEN>", t("agents.generic")).map(([label, code]) => `**${label}**\n\n\`\`\`\n${code}\n\`\`\``).join("\n\n");
  return [
    `> ${t("preface", { site })}`,
    `# ${t("title")}`, t("lead"),
    `## ${t("start.title")}`, steps("start.steps"), `${o.enter}: ${APP}`,
    `## ${t("agents.title")}`, t("agents.lead"), steps("agents.steps"),
    `### ${t("agents.promptTitle")}`, t("agents.promptHint"), `\`\`\`\n${o.prompt}\n\`\`\``,
    `### ${t("agents.snippetsTitle")}`, t("agents.snippetHint", { token: "<TOKEN>" }), snippets,
    `### ${t("agents.canTitle")}`, list("agents.can"),
    `## ${t("parts.title")}`, (t.raw("parts.items") as Step[]).map((p) => `- **${p.t}** — ${p.d}`).join("\n"),
    `## ${t("privacy.title")}`, list("privacy.items"),
    `## ${t("links")}`, `- ${t("title")}: ${site}\n- App: ${APP}\n- ${o.terms}: ${APP}/legal/terms\n- ${o.privacy}: ${APP}/legal/privacy`,
    t("more"),
  ].join("\n\n");
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("site.docs");
  return { title: t("metaTitle"), description: t("lead") };
}

export default async function DocsPage() {
  const t = await getTranslations("site.docs");
  const hero = await getTranslations("site.hero");
  const c = await getTranslations("common");
  const mcpUrl = `${APP}/mcp`;
  const sections = [["start", t("start.title")], ["agents", t("agents.title")], ["parts", t("parts.title")], ["privacy", t("privacy.title")]] as const;
  const startSteps = t.raw("start.steps") as Step[];
  const agentSteps = t.raw("agents.steps") as Step[];
  const parts = t.raw("parts.items") as Step[];
  const prompt = hero("mcpPrompt", { url: mcpUrl, app: APP });
  const markdown = docsMarkdown(t, { locale: (await getLocale()), prompt, mcpUrl, enter: c("enterApp"), terms: c("terms"), privacy: c("privacy") });

  return (
    <main className="s-docs">
      <header className="s-docs-head">
        <div className="eyebrow">{t("eyebrow")}</div>
        <h1>{t("title")}</h1>
        <p>{t("lead")}</p>
        <div className="s-docs-copy">
          <CopyButton text={markdown} label={t("copyMd")} copied={t("copied")} primary />
          <span>{t("copyHint")}</span>
        </div>
      </header>

      <div className="s-docs-body">
        <nav className="s-docs-toc" aria-label={t("toc")}>
          <span>{t("toc")}</span>
          {sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
        </nav>

        <article className="s-docs-main">
          <section id="start">
            <h2>{t("start.title")}</h2>
            <ol className="s-steps">
              {startSteps.map((s) => <li key={s.t}><b>{s.t}</b><p>{s.d}</p></li>)}
            </ol>
            <p><a className="btn btn-primary btn-sm" href={appUrl("/")}>{c("enterApp")}</a></p>
          </section>

          <section id="agents">
            <h2>{t("agents.title")}</h2>
            <p>{t("agents.lead")}</p>
            <ol className="s-steps">
              {agentSteps.map((s) => <li key={s.t}><b>{s.t}</b><p>{s.d}</p></li>)}
            </ol>

            <h3>{t("agents.promptTitle")}</h3>
            <p className="muted">{t("agents.promptHint")}</p>
            <McpCopy prompt={prompt} label={hero("mcpCopy")} copied={hero("mcpCopied")} hint={hero("mcpHint")} hintHref={appUrl("/agents")} />

            <h3>{t("agents.snippetsTitle")}</h3>
            <p className="muted">{t("agents.snippetHint", { token: "<TOKEN>" })}</p>
            {mcpSnippets(mcpUrl, "<TOKEN>", t("agents.generic")).map(([label, code]) => (
              <div key={label} className="s-snip">
                <b>{label}</b>
                <pre><code>{code}</code></pre>
              </div>
            ))}

            <h3>{t("agents.canTitle")}</h3>
            <ul>{(t.raw("agents.can") as string[]).map((x) => <li key={x}>{x}</li>)}</ul>
          </section>

          <section id="parts">
            <h2>{t("parts.title")}</h2>
            <dl className="s-parts">
              {parts.map((p) => <div key={p.t}><dt>{p.t}</dt><dd>{p.d}</dd></div>)}
            </dl>
          </section>

          <section id="privacy">
            <h2>{t("privacy.title")}</h2>
            <ul>{(t.raw("privacy.items") as string[]).map((x) => <li key={x}>{x}</li>)}</ul>
            <p className="muted">
              <a href={appUrl("/legal/terms")}>{c("terms")}</a> · <a href={appUrl("/legal/privacy")}>{c("privacy")}</a>
            </p>
            <p className="muted">{t("more")}</p>
          </section>
        </article>
      </div>
    </main>
  );
}
