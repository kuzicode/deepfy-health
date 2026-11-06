import { getTranslations } from "next-intl/server";
import { requireUser } from "@/server/session";
import { PageHead } from "@/ui/blocks";
import { FeedbackForm } from "./FeedbackForm";

// 意见反馈：内测期收集建议和问题，每周汇总发给维护者

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await requireUser();
  const t = await getTranslations("app.feedback");
  const { from } = await searchParams;
  return (
    <>
      <PageHead eyebrow="" title={t("title")} sub={t("sub")} />
      <div style={{ maxWidth: 720 }}><FeedbackForm from={from} /></div>
    </>
  );
}
