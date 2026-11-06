// 指标分类的色板（只用于小色块；文字始终用正文色）
const COLORS: Record<string, string> = {
  体征: "#3e63dd", 血常规: "#e5484d", 肝功能: "#f76b15", 肾功能: "#12a594", 血脂: "#d6a10d", 血糖: "#d6409f",
  甲状腺: "#8e4ec6", 电解质: "#0090ff", 营养与炎症: "#30a46c", 肿瘤标志物: "#e93d82", 尿常规: "#ad7f58", 心肌酶: "#c2410c", 微量元素: "#0d9488", 感染筛查: "#be185d", 眼科: "#0369a1", 检查结论: "#5b5bd6",
};
const CATEGORY_ORDER = Object.keys(COLORS);
export const categoryColor = (name: string) => COLORS[name] ?? "#8b9a97";

export const sortCategories = (names: Iterable<string>) => {
  const rank = (n: string) => (CATEGORY_ORDER.includes(n) ? CATEGORY_ORDER.indexOf(n) : CATEGORY_ORDER.length);
  return [...new Set(names)].sort((a, b) => rank(a) - rank(b));
};
