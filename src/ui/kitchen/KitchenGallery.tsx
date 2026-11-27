"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Clock3, Search, UtensilsCrossed } from "lucide-react";
import { RECIPE_CATEGORIES } from "@/core/recipe";
import { recipeCategory } from "@/ui/i18n";
import { RecipeCard } from "./RecipeCard";
import type { KitchenCard } from "./recipe-card";

export function KitchenGallery({ cards, firstAction }: { cards: KitchenCard[]; firstAction: React.ReactNode }) {
  const t = useTranslations("app.kitchen");
  const [category, setCategory] = useState("");
  const [search, setSearch] = useState("");
  const [quick, setQuick] = useState(false);
  const term = search.trim().toLowerCase();
  const matches = cards.filter((c) => (!category || c.category === category) && c.search.includes(term) && (!quick || (c.minutes ?? Infinity) <= 30));
  if (!cards.length) return (
    <section className="a-kitchen-empty">
      <UtensilsCrossed size={32} /><h2>{t("empty")}</h2><p>{t("agentHint")}</p>{firstAction}
    </section>
  );
  return (
    <>
      <div className="a-kitchen-filters">
        <div className="a-kitchen-categories" role="group" aria-label={t("category")}>
          {(["", ...RECIPE_CATEGORIES] as const).map((c) => (
            <button type="button" key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{c ? recipeCategory(t, c) : t("all")}</button>
          ))}
        </div>
        <div className="a-kitchen-tools">
          <label className="a-kitchen-search"><Search size={16} /><input type="search" aria-label={t("search")} placeholder={t("search")} value={search} onChange={(e) => setSearch(e.target.value)} /></label>
          <button type="button" aria-pressed={quick} onClick={() => setQuick(!quick)}><Clock3 size={15} />{t("quick")}</button>
        </div>
      </div>
      {matches.length ? <div className="a-recipe-grid">{matches.map((c) => <RecipeCard key={c.slug} card={c} />)}</div> : (
        <div className="a-kitchen-empty" role="status"><p>{t("noMatches")}</p>
          <button type="button" className="btn btn-glass" onClick={() => { setCategory(""); setSearch(""); setQuick(false); }}>{t("reset")}</button>
        </div>
      )}
    </>
  );
}
