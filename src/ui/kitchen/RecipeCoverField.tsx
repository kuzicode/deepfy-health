"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { MAX_RECIPE_COVER_BYTES, type Recipe } from "@/core/recipe";
import { resizeImage } from "@/client/resize-image";
import { RecipeCover } from "./RecipeCover";

export function RecipeCoverField({ recipe, onFile, onBusy }: {
  recipe?: Recipe; onFile: (file?: File) => void; onBusy: (busy: boolean) => void;
}) {
  const t = useTranslations("app.kitchen");
  const fileInput = useRef<HTMLInputElement>(null);
  const [style, setStyle] = useState(recipe?.cover_style ?? "comic");
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  function resetChoice() {
    setError("");
    setPreview("");
    onFile(undefined);
    fileInput.current?.setCustomValidity("");
  }
  async function choose(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    resetChoice();
    if (!file) return;
    onBusy(true);
    try {
      const resized = await resizeImage(file);
      if (resized === file) throw new Error("coverType");
      if (resized.size > MAX_RECIPE_COVER_BYTES) throw new Error("coverSize");
      setPreview(URL.createObjectURL(resized));
      onFile(resized);
    } catch (cause) {
      const message = t(cause instanceof Error && cause.message === "coverSize" ? "errors.coverSize" : "errors.coverType");
      input.setCustomValidity(message);
      setError(message);
    } finally {
      onBusy(false);
    }
  }
  return (
    <div className="a-kitchen-cover-field">
      {(preview || recipe?.cover) && (
        <div className="a-kitchen-cover-preview"><RecipeCover recipe={{ cover: recipe?.cover, cover_style: style }} preview={preview} /></div>
      )}
      <label>{t("cover")}<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} /></label>
      <label>{t("style")}<select className="field" name="cover_style" value={style} onChange={(e) => setStyle(e.target.value === "photo" ? "photo" : "comic")}>
        <option value="comic">{t("comic")}</option><option value="photo">{t("photo")}</option>
      </select></label>
      {(preview || error) && <button type="button" className="btn btn-glass" onClick={() => { fileInput.current!.value = ""; resetChoice(); }}>{t("discardCover")}</button>}
      {error && <p className="a-form-err" role="alert">{error}</p>}
    </div>
  );
}
