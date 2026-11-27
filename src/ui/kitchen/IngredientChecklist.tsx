"use client";

import { useTranslations } from "next-intl";
import type { Recipe } from "@/core/recipe";

export function IngredientChecklist({ ingredients }: { ingredients: NonNullable<Recipe["ingredients"]> }) {
  const t = useTranslations("app.kitchen");
  const groups = new Map<string, typeof ingredients>();
  for (const ingredient of ingredients) {
    const group = ingredient.group ?? "";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(ingredient);
  }
  return (
    <section className="a-kitchen-panel a-ingredient-list">
      <h2>{t("ingredients")}</h2>
      {Array.from(groups, ([group, items]) => (
        <fieldset key={group}>
          {group && <legend>{group}</legend>}
          {items.map((item, i) => (
            <label key={JSON.stringify([item.name, item.amount, i])}><input type="checkbox" /><span>{item.name}</span><span className="a-ingredient-amount">{item.amount}</span></label>
          ))}
        </fieldset>
      ))}
    </section>
  );
}
