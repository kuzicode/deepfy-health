import Link from "next/link";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ArrowLeft, Star } from "lucide-react";
import { assessRecipeForMember } from "@/core/recipe-health";
import { HealthFitPanel } from "@/ui/kitchen/HealthFitPanel";
import type { Recipe } from "@/core/recipe";
import { cloudMode } from "@/db/client";
import { recipeCategory, recipeDifficulty } from "@/ui/i18n";
import { Markdown } from "@/ui/Markdown";
import { getReader } from "@/ui/repo";
import { RecipeCover } from "@/ui/kitchen/RecipeCover";
import { RecipeEditor } from "@/ui/kitchen/RecipeEditor";
import { DeleteRecipe } from "@/ui/kitchen/DeleteRecipe";
import { IngredientChecklist } from "@/ui/kitchen/IngredientChecklist";

function RecipeHeader({ recipe: r }: { recipe: Recipe }) {
  const t = useTranslations("app.kitchen");
  const stats = [
    [t("servings"), r.servings], [t("prep"), r.prep_minutes === undefined ? undefined : t("minutes", { n: r.prep_minutes })],
    [t("cook"), r.cook_minutes === undefined ? undefined : t("minutes", { n: r.cook_minutes })],
    [t("difficulty"), r.difficulty && recipeDifficulty(t, r.difficulty)],
  ].filter(([, value]) => value !== undefined);
  return (
    <header className="a-recipe-hero">
      <RecipeCover recipe={r} />
      <div className="a-recipe-intro">
        <div className="a-recipe-kicker">{[r.category && recipeCategory(t, r.category), r.cuisine].filter(Boolean).join(" · ")}</div>
        <h1>{r.title}</h1>
        {r.rating && <div className="a-recipe-stars" role="img" aria-label={t("stars", { n: r.rating })}>{Array.from({ length: r.rating }, (_, i) => <Star key={i} size={16} />)}</div>}
        {!!stats.length && <dl>{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        {(["diet_tags", "caution_tags", "allergens"] as const).map((key) => !!r[key]?.length && (
          <div className="a-recipe-tags" key={key}><b>{t(key)}</b>{r[key].map((tag, i) => <span key={i}>{tag}</span>)}</div>
        ))}
      </div>
    </header>
  );
}

export default async function RecipePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ for?: string | string[] }> }) {
  const slug = decodeURIComponent((await params).slug);
  const reader = await getReader();
  const [r, members, query] = await Promise.all([reader.getRecipe(slug), reader.listMemberStubs(), searchParams]);
  if (!r) notFound();
  const selected = members.find((m) => m.id === query.for);
  const found = selected && await reader.getMember(selected.id);
  const assessment = found && assessRecipeForMember(r, found.member, found.catalog);
  const t = await getTranslations("app.kitchen");
  return (
    <>
      <div className="a-kitchen-toolbar">
        <Link className="a-back" href="/kitchen"><ArrowLeft size={15} />{t("title")}</Link>
        {cloudMode() && <div><RecipeEditor recipe={r} /><DeleteRecipe slug={r.slug} title={r.title} /></div>}
      </div>
      <RecipeHeader recipe={r} />
      <div className="a-recipe-sections">
        {!!r.ingredients?.length && <IngredientChecklist key={r.slug} ingredients={r.ingredients} />}
        <section className="a-kitchen-panel a-kitchen-method"><h2>{t("steps")}</h2><Markdown source={r.body} /></section>
      </div>
      <HealthFitPanel slug={r.slug} members={members} selected={selected?.id} assessment={assessment} />
    </>
  );
}
