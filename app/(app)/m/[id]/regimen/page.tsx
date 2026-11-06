import Link from "next/link";
import { Pill } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { activeItems, expiryState, itemStatus, latestReadings, regimenOn, regimenWarnings, relatedOptions, stoppedItems, suggestedItems, todayISO, untimedOn } from "@/core/analysis";
import type { Catalog, MemberBundle, RegimenItem } from "@/core/schema";
import { cloudMode } from "@/db/client";
import { PageHead, SectionHead } from "@/ui/blocks";
import { AddRegimen, RegimenItemActions, type MarkerOption } from "@/ui/forms/RegimenEditor";
import { indicatorName } from "@/ui/i18n";
import { Markdown } from "@/ui/Markdown";
import { memberOrNotFound } from "@/ui/repo";
import { adoptRegimenAction, deleteRegimenAction, saveRegimenAction, stopRegimenAction } from "../actions";

type T = Awaited<ReturnType<typeof getTranslations<"app.regimen">>>;
interface Ctx { id: string; m: MemberBundle; catalog: Catalog; t: T; locale: string; today: string; markers: MarkerOption[]; cloud: boolean }

const meal = (t: T, v?: boolean) => (v === true ? t("withFood") : v === false ? t("fasting") : "");

function howOften(i: RegimenItem, { t, locale }: Ctx) {
  const when = i.as_needed ? t("asNeeded") : i.frequency ?? (i.times.length ? i.times.join(" / ") : "");
  const weekly = i.days && t("weekly", { days: i.days.map((d) => t(`days.${d}`)).join(locale === "zh" ? "" : " ") });
  // 文字频率已经说了多久一次，不再补「每天」；按需没有固定日子
  const days = weekly || (i.frequency || i.as_needed ? "" : t("daily"));
  return [i.dose, when, days, meal(t, i.with_food)].filter(Boolean).join(" · ");
}

function ItemChips({ i, ctx }: { i: RegimenItem; ctx: Ctx }) {
  const { t, m, today } = ctx;
  const status = itemStatus(i);
  const exp = status === "stopped" ? undefined : expiryState(i, today);
  const warnings = status === "stopped" ? [] : regimenWarnings(i, m, today);
  return (
    <>
      {status === "suggested" && <span className="chip chip-mint">{t("suggestedChip")}</span>}
      {status === "active" && i.kind === "medication" && !i.doctor_confirmed && <span className="chip chip-warn">{t("notConfirmed")}</span>}
      {exp && <span className={`chip ${exp === "expired" ? "chip-H" : "chip-warn"}`}>{t(exp === "expired" ? "expired" : "expiring", { date: i.expiry! })}</span>}
      {warnings.map((w) => w.code === "allergy"
        ? <span key={w.allergy} className="chip chip-H">{t("allergy", { allergy: w.allergy })}</span>
        : w.code === "duplicate" ? <span key={w.other} className="chip chip-warn">{t("duplicate", { other: w.other })}</span> : null)}
    </>
  );
}

function ItemFacts({ i, ctx }: { i: RegimenItem; ctx: Ctx }) {
  const { t, today } = ctx;
  const facts = [i.brand, i.spec, i.expiry && !expiryState(i, today) ? t("expiry", { date: i.expiry }) : "", i.prescriber ? t("prescribedBy", { who: i.prescriber }) : ""].filter(Boolean).join(" · ");
  const ended = itemStatus(i) === "stopped" ? t("stoppedOn", { date: i.stopped_on! }) : i.end ?? t("longTerm");
  return (
    <>
      <p className="detail">{howOften(i, ctx)} · {i.start} → {ended}</p>
      {facts && <p className="detail">{facts}</p>}
      {i.reason && <p className="detail">{i.reason}</p>}
      {i.stop_reason && <p className="detail">{i.stop_reason}</p>}
    </>
  );
}

function ItemCard({ i, ctx }: { i: RegimenItem; ctx: Ctx }) {
  const { id, t, catalog, locale, today, markers, cloud } = ctx;
  return (
    <div className="a-rx">
      <div className="a-rx-head">
        <Pill size={18} color={i.kind === "medication" ? "var(--low)" : "var(--brand)"} />
        <span className="title">{i.name}</span>
        <ItemChips i={i} ctx={ctx} />
      </div>
      <ItemFacts i={i} ctx={ctx} />
      {i.related.length > 0 && <p className="a-rx-links">{i.related.map((c) => <Link key={c} href={`/m/${id}/indicators/${c}`} className="chip chip-mint">{indicatorName(catalog.get(c), c, locale)}</Link>)}</p>}
      {!!i.precautions?.length && (
        <div className="a-rx-care">
          <b>{t("precautions")}</b>
          <ul>{i.precautions.map((x) => <li key={x}>{x}</li>)}</ul>
          <small>{t("precautionsSource")}</small>
        </div>
      )}
      {i.basis && <p className="detail">{t("basis", { text: i.basis })}</p>}
      {cloud && (
        <RegimenItemActions item={i} status={itemStatus(i)} today={today}
          markers={relatedOptions(markers, i.related, (c) => indicatorName(catalog.get(c), c, locale))}
          save={saveRegimenAction.bind(null, id, i.id)} stop={stopRegimenAction.bind(null, id, i.id)}
          adopt={adoptRegimenAction.bind(null, id, i.id)} remove={deleteRegimenAction.bind(null, id, i.id)} />
      )}
    </div>
  );
}

function ItemSection({ title, items, hint, ctx }: { title: string; items: RegimenItem[]; hint?: string; ctx: Ctx }) {
  if (!items.length) return null;
  return (
    <section className="a-section">
      <SectionHead title={title} />
      {hint && <p className="muted a-rx-hint">{hint}</p>}
      <div className="a-panel a-rx-list">{items.map((i) => <ItemCard key={i.id} i={i} ctx={ctx} />)}</div>
    </section>
  );
}

function TodayPanel({ ctx }: { ctx: Ctx }) {
  const { m, t, today } = ctx;
  const slots = regimenOn(m, today);
  const untimed = untimedOn(m, today);
  return (
    <div className="a-panel a-today">
      {!slots.length && !untimed.length && <div className="a-empty" style={{ padding: "14px 22px" }}>{t("nothingToday")}</div>}
      {slots.map((s) => (
        <div key={`${s.itemId}-${s.time}`} className="a-slot">
          <time>{s.time}</time>
          <div><b>{s.name}</b><br /><span>{[s.dose, meal(t, s.with_food)].filter(Boolean).join(" · ")}</span></div>
          <span className={`chip ${s.kind === "medication" ? "chip-L" : "chip-mint"}`}>{t(s.kind)}</span>
        </div>
      ))}
      {untimed.map((i) => (
        <div key={i.id} className="a-slot">
          <time>{i.as_needed ? t("asNeeded") : t("untimed")}</time>
          <div><b>{i.name}</b><br /><span>{[i.dose, i.frequency, meal(t, i.with_food)].filter(Boolean).join(" · ")}</span></div>
          <span className={`chip ${i.kind === "medication" ? "chip-L" : "chip-mint"}`}>{t(i.kind)}</span>
        </div>
      ))}
    </div>
  );
}

export default async function RegimenPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { member: m, catalog } = await memberOrNotFound(id);
  const t = await getTranslations("app.regimen");
  const locale = await getLocale();
  const today = todayISO();
  const cloud = cloudMode();
  const markers = latestReadings(m, catalog).map((r) => ({ code: r.code, name: indicatorName(catalog.get(r.code), r.name, locale) })).sort((a, b) => a.name.localeCompare(b.name));
  const ctx: Ctx = { id, m, catalog, t, locale, today, markers, cloud };
  const active = activeItems(m);
  const stopped = stoppedItems(m);
  const notes = m.regimen?.body.replace(/^# .*\n?/, "").trim();
  const isEmpty = !m.regimen?.items.length;

  return (
    <>
      <PageHead eyebrow={t("eyebrow")} title={t("title")} sub={m.name} />
      {cloud && <div className="a-rx-toolbar"><AddRegimen today={today} markers={markers} action={saveRegimenAction.bind(null, id, undefined)} /></div>}
      {isEmpty && <div className="a-panel a-empty">{t("empty")}</div>}
      {!isEmpty && <section><SectionHead title={`${t("today")} · ${today}`} /><TodayPanel ctx={ctx} /></section>}
      <ItemSection title={t("activeMeds")} items={active.filter((i) => i.kind === "medication")} ctx={ctx} />
      <ItemSection title={t("activeSupps")} items={active.filter((i) => i.kind === "supplement")} ctx={ctx} />
      <ItemSection title={t("suggestions")} hint={t("suggestionsHint")} items={suggestedItems(m)} ctx={ctx} />
      {stopped.length > 0 && (
        <details className="a-section a-rx-stopped">
          <summary>{t("stopped", { count: stopped.length })}</summary>
          <div className="a-panel a-rx-list">{stopped.map((i) => <ItemCard key={i.id} i={i} ctx={ctx} />)}</div>
        </details>
      )}
      {notes && <div className="a-panel a-pad a-section"><div className="eyebrow" style={{ color: "var(--muted)", marginBottom: 10 }}>{t("notes")}</div><Markdown source={notes} /></div>}
    </>
  );
}
