import Link from "next/link";
import { useTranslations } from "next-intl";
import { Star } from "lucide-react";
import { recipeCategory, recipeDifficulty } from "@/ui/i18n";
import { RecipeCover } from "./RecipeCover";
import type { KitchenCard } from "./recipe-card";

export function RecipeCard({ card, heading: Heading = "h2" }: { card: KitchenCard; heading?: "h2" | "h3" }) {
  const t = useTranslations("app.kitchen");
  return (
    <Link className="a-recipe-card" href={`/kitchen/${encodeURIComponent(card.slug)}`}>
      <RecipeCover recipe={card} />
      <div className="a-recipe-card-copy">
        <Heading>{card.title}</Heading>
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
