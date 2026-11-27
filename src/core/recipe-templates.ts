import fs from "node:fs";
import path from "node:path";
import { RECIPE_DIR } from "./recipe";

/** Obsidian 按库根匹配 file.folder，vault 的 Personal 目录可以放在任意层级。 */
export function recipeTemplates(projectRoot: string, linkPrefix: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const name of ["菜单.md", "菜单库.base"]) {
    const rel = `${RECIPE_DIR}/${name}`;
    const file = path.join(/*turbopackIgnore: true*/ projectRoot, "templates/Personal", rel);
    files[rel] = fs.readFileSync(file, "utf8").replaceAll("{{PREFIX}}", () => linkPrefix);
  }
  return files;
}
