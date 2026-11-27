import type { Recipe } from "@/core/recipe";
import { stripWikilinks } from "@/ui/markdown-html";

export function recipeCard(r: Recipe) {
  const tags = [...new Set([...(r.diet_tags ?? []), ...(r.tags ?? [])])];
  const terms = [r.title, ...tags, ...(r.ingredients ?? []).map((i) => i.name), ...(r.caution_tags ?? []), ...(r.allergens ?? [])];
  const summary = stripWikilinks(r.body.slice(0, 1024)).replace(/^[ \t]*(?:\d+[.)]|[-*#]+)[ \t]+/gm, "");
  return {
    title: r.title, slug: r.slug, cover: r.cover, cover_style: r.cover_style, category: r.category,
    minutes: r.prep_minutes !== undefined && r.cook_minutes !== undefined ? r.prep_minutes + r.cook_minutes : undefined,
    difficulty: r.difficulty, rating: r.rating, tags: tags.slice(0, 3), summary: summary.replace(/\s+/g, " ").trim().slice(0, 240),
    search: terms.join("\n").toLowerCase(),
  };
}

export type KitchenCard = ReturnType<typeof recipeCard>;
