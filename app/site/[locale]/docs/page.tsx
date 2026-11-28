import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { mcpSnippets } from "@/mcp-snippets";
import { appUrl, SOCIAL } from "@/site-links";
import { CopyButton } from "@/ui/CopyButton";
import { McpCopy } from "../../_parts/McpCopy";

type Step = { t: string; d: string };
type T = Awaited<ReturnType<typeof getTranslations<"site.docs">>>;

/** 整页文档的 Markdown 版：开头一段写给 agent 的说明，让它读完后一步步指导用户。和页面共用同一份文案，不会两边不一致 */
function docsMarkdown(t: T, o: { locale: string; prompt: string; guide: string; hint: string; terms: string; privacy: string }) {
  const site = `https://deepfy.si/${o.locale}/docs`;
  const steps = (k: "start.steps" | "agents.steps") => (t.raw(k) as Step[]).map((s, i) => `${i + 1}. **${s.t}** — ${s.d}`).join("\n");
  const list = (k: "agents.can" | "privacy.items") => (t.raw(k) as string[]).map((x) => `- ${x}`).join("\n");
  const snippets = mcpSnippets(MCP_URL, "<TOKEN>", t("agents.generic")).map(([label, code]) => `**${label}**\n\n\`\`\`\n${code}\n\`\`\``).join("\n\n");
  return [
    `> ${t("preface", { site })}`,
    `# ${t("title")}`, t("lead"),
    `## ${t("selfHost.title")}`, t("selfHost.lead"),
    `### ${t("selfHost.step1")}`, t("selfHost.step1d"), `\`\`\`bash\n${SELF_HOST_SETUP}\n\`\`\``,
    `### ${t("selfHost.step2")}`, `\`\`\`bash\n${SELF_HOST_START}\n\`\`\``,
    `### ${t("selfHost.step3")}`, t("selfHost.step3d"),
    `- ${t("selfHost.keyT")} ${t("selfHost.keyD")}\n- ${t("selfHost.netT")} ${t("selfHost.netD")}\n- ${t("selfHost.agentT")} ${t("selfHost.agentD")}`,
    `${t("selfHost.more")} [${t("selfHost.moreLink")}](${o.guide})`,
    `## ${t("start.title")}`, steps("start.steps"), t("start.note"),
    `## ${t("agents.title")}`, t("agents.lead"), steps("agents.steps"),
    `### ${t("agents.promptTitle")}`, t("agents.promptHint"), `\`\`\`\n${o.prompt}\n\`\`\``, `[${o.hint}](${site}#self-host)`,
    `### ${t("agents.snippetsTitle")}`, t("agents.snippetHint", { token: "<TOKEN>" }), snippets,
    `### ${t("agents.canTitle")}`, list("agents.can"),
    `## ${t("parts.title")}`, (t.raw("parts.items") as Step[]).map((p) => `- **${p.t}** — ${p.d}`).join("\n"),
    `## ${t("privacy.title")}`, list("privacy.items"),
    `[${o.terms}](${appUrl("/legal/terms")}) · [${o.privacy}](${appUrl("/legal/privacy")})`,
    t("more"),
  ].join("\n\n");
}

const LOCAL_APP = "http://localhost:3100";
const MCP_URL = `${LOCAL_APP}/mcp`;
const SELF_HOST_SETUP = `git clone https://github.com/kuzicode/deepfy-family.git && cd deepfy-family
sh scripts/selfhost-init.sh`;
const SELF_HOST_START = "docker compose up -d";

function SelfHostSection({ t, guide }: { t: T; guide: string }) {
  return (
    <section id="self-host">
      <h2>{t("selfHost.title")}</h2>
      <p>{t("selfHost.lead")}</p>
      <h3>{t("selfHost.step1")}</h3>
      <p className="muted">{t("selfHost.step1d")}</p>
      <div className="s-snip"><pre><code>{SELF_HOST_SETUP}</code></pre></div>
      <h3>{t("selfHost.step2")}</h3>
      <div className="s-snip"><pre><code>{SELF_HOST_START}</code></pre></div>
      <h3>{t("selfHost.step3")}</h3>
      <p className="muted">{t("selfHost.step3d")}</p>
      <ul>
        <li><b>{t("selfHost.keyT")}</b> {t("selfHost.keyD")}</li>
        <li><b>{t("selfHost.netT")}</b> {t("selfHost.netD")}</li>
        <li><b>{t("selfHost.agentT")}</b> {t("selfHost.agentD")}</li>
      </ul>
      <p className="muted">{t("selfHost.more")} <a href={guide} target="_blank" rel="noopener">{t("selfHost.moreLink")}</a></p>
    </section>
  );
}

function AgentsSection({ t, hero, prompt }: { t: T; hero: Awaited<ReturnType<typeof getTranslations<"site.hero">>>; prompt: string }) {
  const agentSteps = t.raw("agents.steps") as Step[];
  return (
    <section id="agents">
      <h2>{t("agents.title")}</h2>
      <p>{t("agents.lead")}</p>
      <ol className="s-steps">
        {agentSteps.map((s) => <li key={s.t}><b>{s.t}</b><p>{s.d}</p></li>)}
      </ol>

      <h3>{t("agents.promptTitle")}</h3>
      <p className="muted">{t("agents.promptHint")}</p>
      <McpCopy prompt={prompt} label={hero("mcpCopy")} copied={hero("mcpCopied")} hint={hero("mcpHint")} hintHref="#self-host" />

      <h3>{t("agents.snippetsTitle")}</h3>
      <p className="muted">{t("agents.snippetHint", { token: "<TOKEN>" })}</p>
      {mcpSnippets(MCP_URL, "<TOKEN>", t("agents.generic")).map(([label, code]) => (
        <div key={label} className="s-snip">
          <b>{label}</b>
          <pre><code>{code}</code></pre>
        </div>
      ))}

      <h3>{t("agents.canTitle")}</h3>
      <ul>{(t.raw("agents.can") as string[]).map((x) => <li key={x}>{x}</li>)}</ul>
    </section>
  );
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("site.docs");
  return { title: t("metaTitle"), description: t("lead") };
}

export default async function DocsPage() {
  const t = await getTranslations("site.docs");
  const hero = await getTranslations("site.hero");
  const c = await getTranslations("common");
  const locale = await getLocale();
  const guide = `${SOCIAL.github}/blob/main/${t("selfHost.moreLink")}`;
  const sections = [["self-host", t("selfHost.title")], ["start", t("start.title")], ["agents", t("agents.title")], ["parts", t("parts.title")], ["privacy", t("privacy.title")]] as const;
  const startSteps = t.raw("start.steps") as Step[];
  const parts = t.raw("parts.items") as Step[];
  const prompt = hero("mcpPrompt", { url: MCP_URL, app: LOCAL_APP });
  const markdown = docsMarkdown(t, { locale, guide, prompt, hint: hero("mcpHint"), terms: c("terms"), privacy: c("privacy") });

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
          <SelfHostSection t={t} guide={guide} />

          <section id="start">
            <h2>{t("start.title")}</h2>
            <ol className="s-steps">
              {startSteps.map((s) => <li key={s.t}><b>{s.t}</b><p>{s.d}</p></li>)}
            </ol>
            <p>{t("start.note")}</p>
          </section>

          <AgentsSection t={t} hero={hero} prompt={prompt} />

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
