import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, LOCALE_HEADER, isLocale, negotiate, type Locale } from "./config";

export async function resolveLocale(): Promise<Locale> {
  const h = await headers();
  const forced = h.get(LOCALE_HEADER);
  if (isLocale(forced)) return forced;
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(saved) ? saved : negotiate(h.get("accept-language"));
}
