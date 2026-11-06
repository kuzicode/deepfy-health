import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { activeItems, ageOn, bmi, isAbnormal, latestOtherAbnormal, latestReadings, regimenOn, schedule, summarizeLatest, todayISO, untimedOn } from "@/core/analysis";
import type { Catalog, MemberBundle } from "@/core/schema";
import { recHref } from "@/ui/rec-anchor";
import type { LatestReading } from "@/core/analysis";
import { Flag } from "@/ui/Flag";
import { IndicatorTile, PageHead, SectionHead } from "@/ui/blocks";
import { Markdown } from "@/ui/Markdown";
import { attentionCount, checkupPlan, conditionFocus } from "@/core/health-template";
import { cloudMode } from "@/db/client";
import { CheckupHints } from "@/ui/CheckupHints";
import { ConditionPanel } from "@/ui/ConditionPanel";
import { MemberName } from "@/ui/forms/MemberName";
import { MemberAvatarEditor } from "@/ui/forms/AvatarChooser";
import { familyAvatars } from "@/server/member-avatars";
import { getReader } from "@/ui/repo";
import { QuickEntry } from "@/ui/forms/QuickEntry";
import { Schedule } from "@/ui/Schedule";
import { LogList } from "@/ui/LogList";
import { memberOrNotFound } from "@/ui/repo";
import { addLogAction, addMeasuresAction, renameMemberAction, scheduleAction, setMemberAvatarAction } from "./actions";

const hasText = (md: string) => md.split("\n").some((l) => l.trim() && !l.trim().startsWith("#"));

/** 没有异常时的说明：区分「确有判为正常的项目」与「没有任何可判定的项目」（例如报告只有其他项目） */
const emptyKey = (sum: { normal: number; unknown: number }) =>
  sum.normal === 0 ? "member.noJudged" : sum.unknown ? "member.judgedNormal" : "member.allNormal";

/** 字典未收录的「其他项目」不参与上面的汇总：明确告诉用户，并点出报告自己标了异常的 */
/** 字典未收录的「其他项目」：报告标了异常的按名称取最近一次单独列出（不进上面的指标统计，也没有趋势）；其余只提示数量 */
async function OtherItemsNote({ member, records }: { member: string; records: MemberBundle["records"] }) {
  const items = records.flatMap((r) => r.other_items ?? []);
  if (!items.length) return null;
  const t = await getTranslations("app.member");
  const flagged = latestOtherAbnormal({ records });
  const shown = flagged.slice(0, 12);
  return (
    <div className="a-other-abn">
      {flagged.length > 0 && (
        <>
          <p className="muted">{t("otherAbnTitle", { count: flagged.length })}</p>
          <div className="chips">
            {shown.map((x) => (
              <Link key={x.name} href={recHref(member, x.record)} className="chip-other" title={`${x.date}${x.ref_text ? ` · ${x.ref_text}` : ""}`}>
                <b>{x.name}</b> {x.value}{x.unit ? ` ${x.unit}` : ""} <Flag flag={x.flag} />
              </Link>
            ))}
            {flagged.length > shown.length && <span className="muted">+{flagged.length - shown.length}</span>}
          </div>
        </>
      )}
      <p className="muted">
        {t("otherNote", { count: items.length })} <Link href={`/m/${member}/records`} style={{ color: "var(--brand)" }}>{t("otherNoteLink")} →</Link>
      </p>
    </div>
  );
}

type T = Awaited<ReturnType<typeof getTranslations<"app">>>;

/** 标题下一行：关系 · 年龄 · 性别 · 生日 */
function memberSubline(t: T, p: MemberBundle["profile"], today: string) {
  if (!p) return t("member.noProfile");
  return [
    p.relation && p.relation !== "other" && t(`relation.${p.relation}`),
    t(p.birth_estimated ? "member.approxAge" : "member.ageLine", { age: ageOn(p.birth_date, today) }),
    t(`profile.${p.sex}`), !p.birth_estimated && p.birth_date,
  ].filter(Boolean).join(" · ");
}

/** 「需要关注」的指标卡片：没有记录 / 没有异常（区分有无可判定项）/ 异常卡片网格 */
function AbnormalTiles({ id, m, catalog, abnormal, sum, t }: { id: string; m: MemberBundle; catalog: Catalog; abnormal: LatestReading[]; sum: ReturnType<typeof summarizeLatest>; t: T }) {
  if (m.records.length === 0) return <div className="a-panel a-empty">{t("member.noRecords")}</div>;
  if (abnormal.length === 0) {
    return (
      <div className="a-panel a-empty">
        <p>{t(emptyKey(sum), { count: sum.normal })}</p>
        {sum.unknown > 0 && <p>{t("member.unknown", { count: sum.unknown })} <Link href={`/m/${id}/browse`} style={{ color: "var(--brand)" }}>{t("member.allIndicators")} →</Link></p>}
      </div>
    );
  }
  return (
    <>
      <div className="a-grid">
        {abnormal.map((r) => (
          <IndicatorTile key={r.code} r={r} catalog={catalog} note={m.notes.get(r.code)?.summary} href={`/m/${id}/indicators/${r.code}`} />
        ))}
      </div>
      {sum.unknown > 0 && <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>{t("member.unknown", { count: sum.unknown })}</p>}
    </>
  );
}

/** 健康计划 + 近期日志 */
function PlanAndLogs({ id, m, t }: { id: string; m: MemberBundle; t: T }) {
  return (
    <>
      {m.carePlan && hasText(m.carePlan.body) && (
        <section className="a-section" id="care-plan">
          <SectionHead title={t("member.carePlan")} />
          <div className="a-panel a-pad">
            <div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 14 }}>{t("member.updated", { date: m.carePlan.updated })}</div>
            <Markdown source={m.carePlan.body.replace(/^# .*\n/, "")} />
          </div>
        </section>
      )}
      {m.logs.length > 0 && (
        <section className="a-section">
          <SectionHead title={t("quick.logsTitle")} action={m.logs.length > 5 ? { href: `/m/${id}/records`, label: t("quick.allLogs") } : undefined} />
          <LogList member={id} logs={m.logs.slice(0, 5)} />
        </section>
      )}
    </>
  );
}

/** 云端模式的标题：头像（点开可换）+ 称呼（可改） */
/** 概览上一行：在吃什么、今天几项，点进用药页 */
function RegimenSummary({ id, m, today, t }: { id: string; m: MemberBundle; today: string; t: T }) {
  const items = activeItems(m);
  if (!items.length) return null;
  const count = regimenOn(m, today).length + untimedOn(m, today).length;
  return (
    <Link href={`/m/${id}/regimen`} className="a-rx-summary">
      <span>{t("regimen.summary", { names: items.map((i) => i.name).join("、") })}</span>
      <span>{t("regimen.summaryToday", { count })}</span>
    </Link>
  );
}

async function MemberTitle({ id, m }: { id: string; m: MemberBundle }) {
  const avatars = await familyAvatars((await (await getReader()).snapshot()).members);
  return (
    <span className="a-title-row">
      <MemberAvatarEditor name={m.name} avatar={avatars.get(id)} action={setMemberAvatarAction.bind(null, id)} />
      <MemberName name={m.name} action={renameMemberAction.bind(null, id)} />
    </span>
  );
}

export default async function MemberOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member: m, catalog } = await memberOrNotFound(id);
  const t = await getTranslations("app");
  const today = todayISO();
  const p = m.profile;
  const latest = latestReadings(m, catalog);
  const abnormal = latest.filter((r) => isAbnormal(r.flag));
  const sum = summarizeLatest(latest, catalog);
  const plan = checkupPlan(m, catalog, today);
  const conditions = conditionFocus(m, catalog, today, plan);
  const attention = attentionCount(m, catalog);
  const cloud = cloudMode();

  return (
    <>
      <PageHead eyebrow={t("member.eyebrow")} title={cloud ? <MemberTitle id={id} m={m} /> : m.name} sub={memberSubline(t, p, today)} />

      {/* 关键数字压成一行小胶囊；复查 / 体检日期统一看下面的「接下来」 */}
      <div className="a-facts reveal">
        <span className="fact"><span className="k">{t("member.bmi")}</span><b>{bmi(p) ?? "—"}</b></span>
        <span className={`fact${attention ? " hot" : ""}`}><span className="k">{t("member.attention")}</span><b>{attention ?? "—"}</b></span>
      </div>

      <RegimenSummary id={id} m={m} today={today} t={t} />

      {cloud && <QuickEntry today={today} logAction={addLogAction.bind(null, id)} measureAction={addMeasuresAction.bind(null, id)} />}

      <section className="a-section">
        <SectionHead title={t("member.scheduleTitle")} />
        <Schedule items={schedule(m, today)} today={today} catalog={catalog} action={cloud ? scheduleAction.bind(null, id) : undefined} />
      </section>

      <section className="a-section">
        <SectionHead title={t("member.attentionTitle")} action={{ href: `/m/${id}/browse`, label: t("member.allIndicators") }} />
        <ConditionPanel member={id} name={m.name} conditions={conditions} allergies={p?.allergies ?? []} catalog={catalog} />
        <AbnormalTiles id={id} m={m} catalog={catalog} abnormal={abnormal} sum={sum} t={t} />
        <OtherItemsNote member={id} records={m.records} />
      </section>

      <PlanAndLogs id={id} m={m} t={t} />
      <CheckupHints plan={plan} catalog={catalog} />
    </>
  );
}
