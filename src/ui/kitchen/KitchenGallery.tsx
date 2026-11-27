"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Clock3, Search, Star, UtensilsCrossed } from "lucide-react";
import { RECIPE_CATEGORIES } from "@/core/recipe";
import { recipeCategory, recipeDifficulty } from "@/ui/i18n";
import { RecipeCover } from "./RecipeCover";
import type { KitchenCard } from "./recipe-card";

function RecipeCard({ card }: { card: KitchenCard }) {
  const t = useTranslations("app.kitchen");
  return (
    <Link className="a-recipe-card" href={`/kitchen/${encodeURIComponent(card.slug)}`}>
      <RecipeCover recipe={card} />
      <div className="a-recipe-card-copy">
        <h2>{card.title}</h2>
        <div className="a-recipe-meta">
          {card.category && <span>{recipeCategory(t, card.category)}</span>}
          {card.minutes !== undefined && <span>{t("minutes", { n: card.minutes })}</span>}
          {card.difficulty && <span>{recipeDifficulty(t, card.difficulty)}</span>}
          {card.rating && <span role="img" aria-label={t("stars", { n: card.rating })}><Star size={12} />{card.rating}</span>}
        </div>
        {!!card.tags.length && <div className="a-recipe-tags">{card.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
        {card.summary && <p>{card.summary}</p>}
      </div>
    </Link>
  );
}

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
