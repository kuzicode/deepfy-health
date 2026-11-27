import { LockKeyhole } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { insuranceNotes } from "@/core/insurance";
import { addDays, todayISO } from "@/core/schedule";
import type { MemberBundle } from "@/core/schema";
import { cloudMode } from "@/db/client";
import { insuranceRevision } from "@/server/insurance-form";
import { Markdown } from "@/ui/Markdown";
import { PageHead } from "@/ui/blocks";
import { InsuranceEditor } from "@/ui/insurance/InsuranceEditor";
import { PolicyTable } from "@/ui/insurance/PolicyTable";
import { getReader } from "@/ui/repo";
import "./insurance.css";

async function MemberInsurance({ member, writable }: { member: MemberBundle; writable: boolean }) {
  const t = await getTranslations("app.insurance");
  const { policies = [], body = "", secret } = member.insurance ?? {};
  return <section className="a-panel insurance-member">
    <header><h2>{member.name}</h2>
      {secret && <span className="insurance-private"><LockKeyhole size={14} />{t(writable ? "encrypted" : "private")}</span>}
    </header>
    <PolicyTable policies={policies} />
    <Markdown source={insuranceNotes(body)} />
    {writable && <InsuranceEditor member={member.id} body={body} revision={insuranceRevision(body, policies.length)} />}
  </section>;
}

export default async function InsurancePage() {
  const t = await getTranslations("app.insurance");
  const { members } = await (await getReader()).snapshot();
  const policies = members.flatMap((m) => m.insurance?.policies ?? []);
  const today = todayISO();
  const horizon = addDays(today, 60);
  const metrics = {
    total: policies.length,
    renewing: policies.filter(({ renewal_date: due }) => due && due >= today && due <= horizon).length,
    registered: members.filter((m) => m.insurance?.policies.length).length,
  };
  const writable = cloudMode();
  return <>
    <PageHead eyebrow={t("family")} title={t("title")} />
    <dl className="a-panel insurance-summary">
      {(["total", "renewing", "registered"] as const).map((key) => <div key={key}><dt>{t(key)}</dt><dd>{metrics[key]}</dd></div>)}
    </dl>
    {members.map((m) => <MemberInsurance key={m.id} member={m} writable={writable} />)}
  </>;
}
