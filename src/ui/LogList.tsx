import { getTranslations } from "next-intl/server";
import type { HealthLog } from "@/core/schema";

// 健康日志列表（成员概览显示最近几条；记录页显示全部并可删除）
export async function LogList({ member, logs, deleteAction }: { member: string; logs: HealthLog[]; deleteAction?: (form: FormData) => Promise<void> }) {
  const t = await getTranslations("app");
  const src = (rel: string) => `/m/${member}/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
  return (
    <div className="a-panel a-rows a-logs">
      {logs.map((l) => (
        <div className="a-row a-log" key={l.slug}>
          <span className="when">{l.date.slice(5)}{l.time && ` ${l.time}`}</span>
          <span className="main">
            <span className="title">
              {l.severity && <i className={`sev sev-${l.severity}`} title={t(`quick.sev${l.severity}` as "quick.sev1")} />}
              {l.title}
              <span className="kindtag">{t(`quick.${l.type}`)}</span>
            </span>
            {l.body && <span className="detail body">{l.body}</span>}
            {l.tags.length > 0 && <span className="tags">{l.tags.map((g) => <span key={g} className="chip chip-unknown">{g}</span>)}</span>}
            {l.attachments.length > 0 && (
              <span className="pics">
                {l.attachments.map((a) => (
                  <a key={a} href={src(a)} target="_blank" rel="noreferrer">
                    <img src={src(a)} alt="" loading="lazy" />
                  </a>
                ))}
              </span>
            )}
          </span>
          {deleteAction && (
            <form action={deleteAction}><input type="hidden" name="key" value={l.slug} /><button className="link-danger">{t("quick.delete")}</button></form>
          )}
        </div>
      ))}
    </div>
  );
}
