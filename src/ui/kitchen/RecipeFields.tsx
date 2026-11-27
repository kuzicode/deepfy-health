"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Plus, Trash2 } from "lucide-react";
import { RECIPE_CATEGORIES, RECIPE_DIFFICULTIES, type Recipe } from "@/core/recipe";
import { recipeCategory, recipeDifficulty } from "@/ui/i18n";

type Ingredient = NonNullable<Recipe["ingredients"]>[number];

function IngredientRows({ initial = [] }: { initial?: Ingredient[] }) {
  const t = useTranslations("app.kitchen");
  const next = useRef(initial.length);
  const [rows, setRows] = useState(() => initial.map((value, id) => ({ id, value })));
  function update(id: number, field: string, text: string) {
    setRows(rows.map((r) => r.id === id ? { id, value: { ...r.value, [field]: text } } : r));
  }
  return (
    <fieldset className="a-kitchen-ingredient-editor">
      <legend>{t("ingredients")}</legend>
      <input type="hidden" name="ingredients" value={JSON.stringify(rows.map((r) => r.value))} />
      {rows.map(({ id, value }) => (
        <div className="a-kitchen-ingredient-row" key={id}>
          {(["name", "amount", "group"] as const).map((field) => (
            <label key={field}>{t(field)}<input className="field" required={field === "name"} value={value[field] ?? ""} onChange={(e) => update(id, field, e.target.value)} /></label>
          ))}
          <button type="button" className="a-icon-btn" aria-label={t("removeIngredient", { name: value.name })} onClick={() => setRows(rows.filter((r) => r.id !== id))}><Trash2 size={16} /></button>
        </div>
      ))}
      <button type="button" className="btn btn-glass" onClick={() => setRows([...rows, { id: next.current++, value: { name: "" } }])}><Plus size={15} />{t("addIngredient")}</button>
    </fieldset>
  );
}

export function RecipeFields({ recipe }: { recipe?: Recipe }) {
  const t = useTranslations("app.kitchen");
  return (
    <details className="a-kitchen-details" onInvalidCapture={(e) => { e.currentTarget.open = true; }}>
      <summary>{t("more")}</summary>
      <div className="a-kitchen-fields">
        <label>{t("category")}<select className="field" name="category" defaultValue={recipe?.category ?? ""}><option value="">{t("unspecified")}</option>
          {RECIPE_CATEGORIES.map((c) => <option value={c} key={c}>{recipeCategory(t, c)}</option>)}
        </select></label>
        <label>{t("cuisine")}<input className="field" name="cuisine" defaultValue={recipe?.cuisine} /></label>
        <label>{t("difficulty")}<select className="field" name="difficulty" defaultValue={recipe?.difficulty ?? ""}><option value="">{t("unspecified")}</option>
          {RECIPE_DIFFICULTIES.map((d) => <option value={d} key={d}>{recipeDifficulty(t, d)}</option>)}
        </select></label>
        {(["servings", "prep_minutes", "cook_minutes", "rating"] as const).map((key) => (
          <label key={key}>{t(key)}<input className="field" name={key} type="number" min={key.endsWith("minutes") ? 0 : 1} max={key === "rating" ? 5 : undefined} defaultValue={recipe?.[key]} /></label>
        ))}
      </div>
      <IngredientRows initial={recipe?.ingredients} />
      <p className="a-kitchen-field-hint">{t("listHint")}</p>
      <div className="a-kitchen-fields">
        {(["tags", "diet_tags", "caution_tags", "allergens"] as const).map((key) => (
          <label key={key}>{t(key)}<input className="field" name={key} defaultValue={recipe?.[key]?.join(", ")} /></label>
        ))}
      </div>
    </details>
  );
}
