import { getTranslations } from "next-intl/server";
import { cloudMode } from "@/db/client";
import { PageHead } from "@/ui/blocks";
import { getReader } from "@/ui/repo";
import { KitchenGallery } from "@/ui/kitchen/KitchenGallery";
import { RecipeEditor } from "@/ui/kitchen/RecipeEditor";
import { recipeCard } from "@/ui/kitchen/recipe-card";

export default async function KitchenPage() {
  const t = await getTranslations("app.kitchen");
  const recipes = await (await getReader()).listRecipes();
  const writable = cloudMode();
  return (
    <>
      <PageHead eyebrow={t("eyebrow")} title={t("title")} right={writable ? <RecipeEditor /> : <span className="a-kitchen-local">{t("local")}</span>} />
      <KitchenGallery cards={recipes.map(recipeCard)} firstAction={writable && <RecipeEditor first />} />
    </>
  );
}
