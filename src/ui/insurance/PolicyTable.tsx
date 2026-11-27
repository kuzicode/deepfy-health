import { useTranslations } from "next-intl";
import { POLICY_COLUMNS, type InsurancePolicy } from "@/core/insurance";

const columns = [...POLICY_COLUMNS.slice(0, 6), "renewal_date", ...POLICY_COLUMNS.slice(6)] as const;

export function PolicyTable({ policies }: { policies: InsurancePolicy[] }) {
  const t = useTranslations("app.insurance");
  if (!policies.length) return <p className="insurance-empty">{t("empty")}</p>;
  return <table className="insurance-table">
    <thead><tr>{columns.map((col) => <th key={col} scope="col">{t(`fields.${col}`)}</th>)}</tr></thead>
    <tbody>{policies.map((policy, index) => <tr key={index}>
      {columns.map((col) => <td key={col} data-label={t(`fields.${col}`)}>{policy[col] ?? "—"}</td>)}
    </tr>)}</tbody>
  </table>;
}
