"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayISO } from "@/core/analysis";
import { isSafeHouseholdDocKey } from "@/core/bundle";
import { MAX_RECIPE_COVER_BYTES, RECIPE_DIR, recipeSlugFromTitle } from "@/core/recipe";
import { sha256 } from "@/server/crypto";
import { createLimiter } from "@/server/login-lookup";
import { ImportRejected, NotFound } from "@/server/pg-repository";
import { sniffImage } from "@/server/quick-entry";
import { QuotaExceeded } from "@/server/quota";
import { buildRecipeChange, parseRecipeForm, RecipeFormError, type RecipeError } from "@/server/recipe-form";
import { userRepository } from "@/server/session";

const mayWrite = createLimiter(60, 60_000);

async function readCover(file: FormDataEntryValue | null, stem: string) {
  if (!file || (file instanceof File && !file.name && !file.size)) return;
  if (!(file instanceof File)) throw new RecipeFormError("coverType");
  if (file.size > MAX_RECIPE_COVER_BYTES) throw new RecipeFormError("coverSize");
  const data = Buffer.from(await file.arrayBuffer());
  const image = sniffImage(data);
  if (!image) throw new RecipeFormError("coverType");
  const cover = `assets/${recipeSlugFromTitle(stem)}-${sha256(data).slice(0, 8)}.${image.ext}`;
  return { cover, upload: { relPath: `${RECIPE_DIR}/${cover}`, data, mime: image.mime } };
}

function writeError(error: unknown): { error: RecipeError } {
  if (error instanceof RecipeFormError) return { error: error.code };
  if (error instanceof QuotaExceeded) return { error: "quota" };
  if (error instanceof NotFound) return { error: "missing" };
  if (error instanceof ImportRejected) return { error: "details" };
  return { error: "saveFailed" };
}

export async function saveRecipeAction(form: FormData): Promise<{ slug: string } | { error: RecipeError }> {
  const repo = await userRepository();
  if (!mayWrite(repo.userId)) return { error: "busy" };
  try {
    const input = parseRecipeForm(form);
    const cover = await readCover(form.get("cover_file"), input.slug ?? input.title);
    let slug = "";
    await repo.applyChanges((raw) => {
      const change = buildRecipeChange(raw, input, todayISO());
      if (cover) change.data.cover = cover.cover;
      slug = change.key;
      return [change];
    }, { scope: "household", coverUpload: cover?.upload });
    revalidatePath("/kitchen");
    revalidatePath(`/kitchen/${encodeURIComponent(slug)}`);
    return { slug };
  } catch (error) {
    return writeError(error);
  }
}

export async function deleteRecipeAction(slug: string) {
  const repo = await userRepository();
  if (!mayWrite(repo.userId)) return { error: "busy" as const };
  if (typeof slug !== "string" || !isSafeHouseholdDocKey("recipe", slug)) return { error: "missing" as const };
  try {
    await repo.applyChanges([{ op: "delete_household", kind: "recipe", key: slug }], { scope: "household" });
  } catch (error) {
    return writeError(error);
  }
  revalidatePath(`/kitchen/${encodeURIComponent(slug)}`);
  revalidatePath("/kitchen");
  redirect("/kitchen");
}
