export const LOCALES = ["zh", "en"] as const;
export type Locale = (typeof LOCALES)[number];
const DEFAULT_LOCALE: Locale = "zh";
export const LOCALE_COOKIE = "kz_locale";
/** proxy.ts 为官网路由设置，优先级最高 */
export const LOCALE_HEADER = "x-kz-locale";

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);
/** 存在数据库里的语言：空值（老账号、还没打开过 App）按默认语言 */
export const toLocale = (v: unknown): Locale => (isLocale(v) ? v : DEFAULT_LOCALE);

/** 按 Accept-Language 的权重挑选：第一个 zh* 或 en* 胜出 */
export function negotiate(acceptLanguage: string | null | undefined): Locale {
  const prefs = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of prefs) {
    if (tag.startsWith("zh")) return "zh";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}
