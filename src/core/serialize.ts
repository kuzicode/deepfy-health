import { isDeepStrictEqual } from "node:util";
import YAML from "yaml";
import { CATALOG_FILE, docPath, parseMd, stripNulls, type RawVault } from "./bundle";
import { frontmatter, toYaml } from "./templates";

/** 两份文件内容是否等价：md 比较 frontmatter 与正文，yaml 比较解析结果；只是写法不同不算变化 */
export function sameContent(rel: string, a: string, b: string): boolean {
  if (a === b) return true;
  try {
    if (rel.endsWith(".md")) {
      const [pa, pb] = [parseMd(a), parseMd(b)];
      return isDeepStrictEqual(stripNulls(pa.data), stripNulls(pb.data)) && pa.content.trim() === pb.content.trim();
    }
    return isDeepStrictEqual(stripNulls(YAML.parse(a)), stripNulls(YAML.parse(b)));
  } catch {
    return false;
  }
}

/** 云端数据 → vault 文件（相对 Personal/ 的路径 → 内容）；kzh pull 与网站导出共用 */
export function rawToFiles(raw: RawVault): Record<string, string> {
  const files: Record<string, string> = {
    "family.yaml": toYaml({ family: raw.family.family ?? null, members: raw.family.members }),
    [CATALOG_FILE]: toYaml({ indicators: raw.customCatalog }),
  };
  for (const fm of raw.family.members) {
    for (const d of raw.docs[fm.id] ?? []) files[docPath(fm, d)] = frontmatter(d.data, d.body);
  }
  return files;
}
