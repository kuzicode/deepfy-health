import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MemberStub } from "@/core/bundle";
import type { assessRecipeForMember, DietFinding } from "@/core/recipe-health";

type Assessment = ReturnType<typeof assessRecipeForMember>;
type PanelProps = { slug: string; members: MemberStub[]; selected?: string; assessment?: Assessment };

function Findings({ section, items }: { section: "cautions" | "matches"; items: DietFinding[] }) {
  const t = useTranslations("app.kitchen.fit");
  return (
    <section>
      <h3>{t(section)}</h3>
      {items.length ? <ul>{items.map(({ kind, label, detail, sourceDate }, i) => (
        <li key={i}><strong>{label}</strong>
          <small>{t(`source.${kind}`)} · {detail}{sourceDate && <> · <time dateTime={sourceDate}>{sourceDate}</time></>}</small>
        </li>
      ))}</ul> : <p>{t(section === "cautions" ? "noCautions" : "noMatches")}</p>}
    </section>
  );
}

export function HealthFitPanel({ slug, members, selected, assessment }: PanelProps) {
  const t = useTranslations("app.kitchen.fit");
  const common = useTranslations("common");
  const href = "/kitchen/" + encodeURIComponent(slug);
  return (
    <section className="a-kitchen-panel a-health-fit" aria-labelledby="diet-fit-title">
      <h2 id="diet-fit-title">{t("title")}</h2>
      {members.length === 0 && <p>{t("noMembers")}</p>}
      <div className="a-fit-members">{members.map(({ id, name }) => (
        <Link key={id} href={id === selected ? href : href + "?for=" + encodeURIComponent(id)}
          prefetch={false} scroll={false} aria-current={id === selected ? "true" : undefined}>
          {name}
        </Link>
      ))}</div>
      {assessment && <>
        <div className="a-fit-columns">
          <Findings section="cautions" items={assessment.cautions} />
          <Findings section="matches" items={assessment.matches} />
          <section><h3>{t("missing")}</h3>
            {assessment.missing.length ? <ul>{assessment.missing.map((key) => <li key={key}>{t(`gaps.${key}`)}</li>)}</ul>
              : <p>{t("noGaps")}</p>}
          </section>
        </div>
        <footer>{common("disclaimer")}</footer>
      </>}
    </section>
  );
}
