"use client";

import { useActionState } from "react";
import { recipeError } from "@/ui/i18n";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { deleteRecipeAction } from "../../../app/(app)/kitchen/actions";

export function DeleteRecipe({ slug, title }: { slug: string; title: string }) {
  const t = useTranslations("app.kitchen");
  const [state, action, pending] = useActionState(() => deleteRecipeAction(slug), undefined);
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm(t("deleteConfirm", { title }))) e.preventDefault(); }}>
      <button type="submit" className="btn btn-ghost" disabled={pending}><Trash2 size={15} />{t("delete")}</button>
      {state && <span className="a-form-err" role="alert">{recipeError(t, state.error)}</span>}
    </form>
  );
}
