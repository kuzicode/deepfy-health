import { z } from "zod";
import { isSafeHouseholdDocKey, MAX_DOC_BODY_LENGTH, type RawHouseholdDoc, type RawVault } from "@/core/bundle";
import { availableRecipeSlug, mergeRecipeFrontmatter, recipeBody, RecipeSchema, recipeSlugFromTitle } from "@/core/recipe";
import { splitList } from "./quick-entry";

export type RecipeError = "title" | "body" | "ingredients" | "details" | "missing" | "names"
  | "coverType" | "coverSize" | "quota" | "busy" | "saveFailed";

export class RecipeFormError extends Error {
  constructor(readonly code: RecipeError) { super(code); }
}

const fields = RecipeSchema.shape;
const blank = (value: unknown) => typeof value === "string" && !value.trim() ? undefined : value;
const numeric = (value: unknown) => typeof value === "string" && value.trim() ? Number(value) : blank(value);
const tagList = z.preprocess((v) => typeof v === "string" ? splitList(v) : v, fields.tags);

function ingredientList(input: unknown) {
  if (typeof input !== "string") return input;
  const value = input.trim();
  if (!value) return undefined;
  if (value.startsWith("[") || value.startsWith("{")) {
    try { return JSON.parse(value); } catch { throw new RecipeFormError("ingredients"); }
  }
  return value.split(/\r?\n/).filter((line) => line.trim()).map((line) => {
    const [name, amount, group] = line.split("|").map((field) => field.trim());
    return { name, amount, group };
  });
}

const formSchema = z.object({
  slug: z.preprocess(blank, z.string().refine((s) => isSafeHouseholdDocKey("recipe", s)).optional()),
  title: fields.title, body: z.string().max(MAX_DOC_BODY_LENGTH).refine((s) => !!s.trim()),
  keep_title: z.literal("1").optional(), keep_body: z.literal("1").optional(),
  category: z.preprocess(blank, fields.category), cuisine: z.preprocess(blank, fields.cuisine),
  servings: z.preprocess(numeric, fields.servings), prep_minutes: z.preprocess(numeric, fields.prep_minutes),
  cook_minutes: z.preprocess(numeric, fields.cook_minutes), rating: z.preprocess(numeric, fields.rating),
  difficulty: z.preprocess(blank, fields.difficulty), cover_style: z.preprocess(blank, fields.cover_style),
  ingredients: z.preprocess(ingredientList, fields.ingredients),
  tags: tagList, diet_tags: tagList, caution_tags: tagList, allergens: tagList,
});

export function parseRecipeForm(form: FormData) {
  const parsed = formSchema.safeParse(Object.fromEntries(form));
  if (parsed.success) return parsed.data;
  const field = parsed.error.issues[0].path[0];
  if (field === "title" || field === "body" || field === "ingredients") throw new RecipeFormError(field);
  throw new RecipeFormError("details");
}

function recipeBeingEdited(raw: RawVault, slug?: string) {
  if (!slug) return;
  const prev = raw.householdDocs?.find((d) => d.kind === "recipe" && d.key === slug);
  if (!prev) throw new RecipeFormError("missing");
  return prev;
}

function editedBody(prev: RawHouseholdDoc | undefined, submitted: string, keep?: "1") {
  // 浏览器提交 textarea 时可能转换换行符，仅改元数据时保留原文的字节。
  if (prev && (keep || prev.body.replace(/\r\n?/g, "\n") === submitted.replace(/\r\n?/g, "\n"))) return prev.body;
  return recipeBody(prev?.body ?? "", submitted);
}

export function buildRecipeChange(raw: RawVault, input: z.infer<typeof formSchema>, today: string) {
  const { slug, body, title, keep_title, keep_body, ...patch } = input;
  const prev = recipeBeingEdited(raw, slug);
  const key = slug ?? availableRecipeSlug(raw, recipeSlugFromTitle(input.title));
  if (!key) throw new RecipeFormError("names");
  const steps = editedBody(prev, body, keep_body);
  if (steps.length > MAX_DOC_BODY_LENGTH) throw new RecipeFormError("body");
  const data = mergeRecipeFrontmatter(prev?.data ?? {}, { ...patch, updated: today });
  if (!(prev && keep_title)) data.title = title;
  const op = prev ? "put_household" as const : "create_household" as const;
  return { op, kind: "recipe" as const, key, body: steps, data };
}
