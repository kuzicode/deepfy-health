import { createTranslator } from "next-intl";
import { expect, it } from "vitest";
import en from "../../messages/en.json";
import zh from "../../messages/zh.json";
import { CARDS } from "../../app/site/_belt/Cards";
import { codes, COPY, TOKENS } from "../../app/site/_belt/content";
import { parseMd } from "@/core/bundle";
import { RecipeSchema } from "@/core/recipe";

it("keeps the eight conveyor cards, token counts and code panels in step", () => {
  expect([CARDS, TOKENS, codes("zh"), codes("en")].map((items) => items.length)).toEqual([8, 8, 8, 8]);
  expect(CARDS[7].name).toBe("Kitchen");
  expect(TOKENS[7].url).toBe("deepfy://family/kitchen/番茄炖牛腩");
});

it.each(["zh", "en"] as const)("shows a valid recipe file in the eighth %s panel", (locale) => {
  const { data, content } = parseMd(codes(locale)[7]);
  expect(RecipeSchema.parse(data)).toMatchObject({ type: "recipe", title: COPY[locale].kitchen.title });
  expect(content).toContain(COPY[locale].kitchen.method);
});

type Messages = string | { [key: string]: Messages } | Messages[];

function messageEntries(node: Messages, path = ""): [string, string][] {
  if (typeof node === "string") return [[path, node]];
  return Object.entries(node).flatMap(([key, value]) => messageEntries(value, path ? `${path}.${key}` : key));
}

it("has matching Chinese and English keys, including array entries", () => {
  const shape = (messages: Messages) => JSON.parse(JSON.stringify(messages, (_, v) => typeof v === "string" ? null : v));
  expect(shape(zh)).toEqual(shape(en));
});

// Exercise ICU plurals and rich text with sample arguments. A new argument
// needs a sample here so a misspelled or unbound placeholder fails the test.
const args = Object.fromEntries((
  "age allergy app code codes condition count covered date days email end errors expiry family id interval kw last limit list login " +
  "n name names other pct range ref site start summary text title token total url warnings who"
).split(" ").map((name) => [name, 2]));

it.each([["zh", zh], ["en", en]] as const)("renders %s site and app copy without unresolved placeholders", (locale, { site, app }) => {
  for (const [path, copy] of messageEntries({ site, app })) {
    expect(copy, path).not.toMatch(/\$\{|\{\{/);
    const t = createTranslator({ locale, messages: { copy }, onError: (error) => { throw new Error(path, { cause: error }); } });
    const rendered = t.markup("copy", { ...args, b: (text) => text });
    // English displays the age as a number without the Chinese unit suffix.
    if (locale !== "en" || path !== "app.member.years") expect(rendered.trim(), path).not.toBe("");
    expect(rendered, path).not.toMatch(/[{}]|\b(?:TODO|TBD|FIXME|PLACEHOLDER)\b|待翻译|待替换|待填充|__\w+__/i);
  }
});
