import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { isSelfHosted } from "@/server/edition";
import { requireUser } from "@/server/session";
import { PageHead } from "@/ui/blocks";
import { FeedbackForm } from "./FeedbackForm";

// 意见反馈：早鸟期收集建议和问题，每周汇总发给维护者

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  if (isSelfHosted()) notFound(); // 反馈是发给官方实例维护者的
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
