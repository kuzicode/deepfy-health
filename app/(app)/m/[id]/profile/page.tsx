import { getLocale, getTranslations } from "next-intl/server";
import { ageOn, bmi, todayISO } from "@/core/analysis";
import { PageHead } from "@/ui/blocks";
import { Markdown } from "@/ui/Markdown";
import { cloudMode } from "@/db/client";
import { ProfileEditor } from "@/ui/forms/ProfileEditor";
import { memberOrNotFound } from "@/ui/repo";
import { updateProfileAction } from "../actions";

type Row = [string, string | number | undefined | false];

function Group({ title, rows }: { title: string; rows: Row[] }) {
  const filled = rows.filter(([, v]) => v !== undefined && v !== false && v !== "");
  if (filled.length === 0) return null;
  return (
    <div className="a-panel">
      <div className="a-panel-title">{title}</div>
      <dl className="a-kv" style={{ margin: 0 }}>{filled.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
    </div>
  );
}

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member: m } = await memberOrNotFound(id);
  const t = await getTranslations("app.profile");
  const r = await getTranslations("app.relation");
  const locale = await getLocale();
  const p = m.profile;
  const head = <PageHead eyebrow={t("eyebrow")} title={t("title")} sub={m.name} />;
  if (!p) return <>{head}<div className="a-panel a-empty">—</div></>;
  const f = (k: string) => t(`fields.${k}` as "fields.name");
  const join = (xs: string[]) => xs.length > 0 && xs.join(locale === "zh" ? "、" : ", ");
  const notes = p.body.replace(/^# .*\n?/, "").trim();

  return (
    <>
      {head}
      {cloudMode() && <div style={{ margin: "-8px 0 16px" }}><ProfileEditor profile={p} action={updateProfileAction.bind(null, id)} /></div>}
      <div className="a-masonry">
        <Group title={t("basic")} rows={[
          [f("name"), m.name], [f("relation"), p.relation && r(p.relation)],
          [f("age"), `${p.birth_estimated ? "≈ " : ""}${ageOn(p.birth_date, todayISO())}`], [f("sex"), t(p.sex)],
          [f("birth"), p.birth_estimated ? `${p.birth_date.slice(0, 4)} · ${f("birthEstimated")}` : p.birth_date],
          [f("height"), p.height_cm && `${p.height_cm} cm`], [f("weight"), p.weight_kg && `${p.weight_kg} kg`], [f("bmi"), bmi(p)],
          [f("blood"), p.blood_type], [f("interval"), t("months", { n: p.checkup_interval_months })],
        ]} />
        <Group title={t("history")} rows={[[f("conditions"), join(p.conditions)], [f("allergies"), join(p.allergies)], [f("family"), join(p.family_history)]]} />
        <Group title={t("habits")} rows={[
          [f("sleep"), p.habits.sleep], [f("diet"), p.habits.diet], [f("exercise"), p.habits.exercise],
          [f("smoking"), p.habits.smoking], [f("alcohol"), p.habits.alcohol], [f("other"), p.habits.other],
        ]} />
        {notes && <div className="a-panel a-pad"><div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 12 }}>{t("notes")}</div><Markdown source={notes} /></div>}
      </div>
      {p.updated && <p className="muted" style={{ fontSize: 12.5 }}>{t("updated", { date: p.updated })}</p>}
    </>
  );
}
