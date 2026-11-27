"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { recipeError } from "@/ui/i18n";
import { useTranslations } from "next-intl";
import { Pencil, Plus, X } from "lucide-react";
import { saveRecipeAction } from "../../../app/(app)/kitchen/actions";
import type { Recipe } from "@/core/recipe";
import type { RecipeError } from "@/server/recipe-form";
import { RecipeCoverField } from "./RecipeCoverField";
import { RecipeFields } from "./RecipeFields";

function changedFields(element: HTMLFormElement, initial: FormData | null) {
  const form = new FormData(element);
  for (const [name, value] of initial ?? []) {
    if (form.get(name) !== value) continue;
    if (name === "title" || name === "body") form.set(`keep_${name}`, "1");
    else form.delete(name);
  }
  return form;
}

type EditorStatus = "preparing" | "saving" | undefined;

function RecipeForm({ recipe, done, status, setStatus }: {
  recipe?: Recipe; done: () => void; status: EditorStatus; setStatus: (status: EditorStatus) => void;
}) {
  const t = useTranslations("app.kitchen");
  const router = useRouter();
  const initial = useRef<FormData | null>(null);
  const capture = useCallback((form: HTMLFormElement | null) => { if (form) initial.current = new FormData(form); }, []);
  const [cover, setCover] = useState<File>();
  const [error, setError] = useState<RecipeError>();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status) return;
    const form = changedFields(e.currentTarget, initial.current);
    if (recipe) form.set("slug", recipe.slug);
    if (cover) form.set("cover_file", cover);
    setStatus("saving");
    try {
      const result = await saveRecipeAction(form);
      if ("error" in result) { setError(result.error); return; }
      done();
      if (recipe) router.refresh();
      else router.push(`/kitchen/${encodeURIComponent(result.slug)}`);
    } catch { setError("saveFailed"); } finally { setStatus(undefined); }
  }
  return (
    <form onSubmit={submit} ref={capture} className="a-kitchen-form">
      <fieldset disabled={!!status}>
        <label>{t("dishName")}<input className="field" name="title" required defaultValue={recipe?.title} /></label>
        <label>{t("method")}<textarea className="field" name="body" rows={6} required placeholder={t("methodHint")} defaultValue={recipe?.body} /></label>
        <RecipeCoverField recipe={recipe} onFile={setCover} onBusy={(busy) => setStatus(busy ? "preparing" : undefined)} />
        <RecipeFields recipe={recipe} />
        {error && <p className="a-form-err" role="alert">{recipeError(t, error)}</p>}
        <button type="submit" className="btn btn-primary">{t(status ?? "save")}</button>
      </fieldset>
    </form>
  );
}

function EditorDialog({ recipe, close }: { recipe?: Recipe; close: () => void }) {
  const t = useTranslations("app.kitchen");
  const [status, setStatus] = useState<EditorStatus>();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="a-kitchen-dialog" aria-labelledby={id} onCancel={(e) => { e.preventDefault(); if (!status) close(); }}>
      <header><h2 id={id}>{t(recipe ? "edit" : "add")}</h2><button type="button" className="a-icon-btn" aria-label={t("close")} disabled={!!status} onClick={close}><X size={20} /></button></header>
      <RecipeForm recipe={recipe} done={close} status={status} setStatus={setStatus} />
    </dialog>
  );
}

export function RecipeEditor({ recipe, first = false }: { recipe?: Recipe; first?: boolean }) {
  const t = useTranslations("app.kitchen");
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={`btn ${recipe ? "btn-glass" : "btn-primary"}`} onClick={() => setOpen(true)}>
        {recipe ? <Pencil size={15} /> : <Plus size={17} />}{t(recipe ? "edit" : first ? "addFirst" : "add")}
      </button>
      {open && <EditorDialog recipe={recipe} close={() => setOpen(false)} />}
    </>
  );
}
