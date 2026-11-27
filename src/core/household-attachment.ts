import path from "node:path";
import { RECIPE_DIR, isSafeRecipeCover } from "./recipe";

export function assertHouseholdAttachmentPath(relPath: string) {
  const prefix = `${RECIPE_DIR}/`;
  if (path.posix.normalize(relPath) !== relPath || !relPath.startsWith(prefix) || !isSafeRecipeCover(relPath.slice(prefix.length))) {
    throw new Error("家庭附件路径不合法");
  }
}
