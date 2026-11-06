import { useTranslations } from "next-intl";
import type { FlagValue } from "@/core/schema";

export function Flag({ flag, showNormal = true }: { flag: FlagValue | null; showNormal?: boolean }) {
  const t = useTranslations("app.flag");
  if (flag === "N" && !showNormal) return null;
  return <span className={`chip chip-${flag ?? "unknown"}`}>{t(flag ?? "unknown")}</span>;
}
