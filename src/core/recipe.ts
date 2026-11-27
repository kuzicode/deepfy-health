import { z } from "zod";

export const RECIPE_DIR = "菜单";
export const RECIPE_ASSETS_DIR = "菜单/assets";
export const RECIPE_CATEGORIES = ["炒菜", "炖菜", "蒸菜", "汤羹", "凉拌", "主食", "早餐", "饮品"] as const;
export const RECIPE_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export function isSafeRecipeCover(cover: string): boolean {
  return !cover.includes("..") && /^assets\/[\p{L}\p{N}_-][\p{L}\p{N} _.\-]*\.(?:webp|png|jpe?g)$/iu.test(cover);
}

export function recipeSlugFromTitle(title: string): string {
  const clean = title.replace(/[^\p{L}\p{N}_-]/gu, "").replace(/^_+/, "");
  const slug = Array.from(clean).slice(0, 80).join("");
  return slug === RECIPE_DIR ? `${slug}-recipe` : slug || "recipe";
}

const name = (max: number) => z.string().trim().min(1).refine((s) => Array.from(s).length <= max, `最多 ${max} 个字`);
const tags = z.array(z.string()).optional();
const minutes = z.number().int().nonnegative().optional();

export const RecipeIngredientSchema = z.looseObject({
  name: name(60),
  amount: z.string().optional(),
  group: z.string().optional(),
});

export const RecipeSchema = z.looseObject({
  title: name(80),
  type: z.literal("recipe").optional(),
  category: z.enum(RECIPE_CATEGORIES).optional(),
  cuisine: z.string().optional(),
  servings: z.number().int().positive().optional(),
  prep_minutes: minutes,
  cook_minutes: minutes,
  difficulty: z.enum(RECIPE_DIFFICULTIES).optional(),
  cover: z.string().refine(isSafeRecipeCover, "封面需为 assets/ 下的 PNG、JPEG 或 WebP 图片").optional(),
  cover_style: z.enum(["comic", "photo"]).optional(),
  ingredients: z.array(RecipeIngredientSchema).optional(),
  tags,
  diet_tags: tags,
  caution_tags: tags,
  allergens: tags,
  rating: z.number().int().min(1).max(5).optional(),
  updated: z.iso.date().optional(),
});

export type Recipe = z.infer<typeof RecipeSchema> & { slug: string; body: string; updatedAt?: string };

export function mergeRecipeFrontmatter(existing: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...existing, ...patch };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete merged[key];
  }
  return merged;
}
