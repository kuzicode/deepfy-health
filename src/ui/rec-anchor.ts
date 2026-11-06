// 记录的锚点：记录页 <details id> 与指向它的链接共用，保证两边一致。
// slug 里有空格、中文和 %（如「糖化白蛋白GA%」）：id 里空格换成连字符；链接里的片段整体编码，OpenFromHash 再解码。

export const recAnchor = (slug: string) => `rec-${slug.replace(/\s+/g, "-")}`;

/** 指向记录页并展开某条记录（片段只留在浏览器，不进访问日志，SEC3） */
export const recHref = (member: string, slug: string) => `/m/${member}/records#${encodeURIComponent(recAnchor(slug))}`;

/** URL 片段 → 锚点 id；片段未编码或编码残缺（含裸 %）时按原样使用，不抛异常 */
export function anchorFromHash(hash: string) {
  const raw = hash.replace(/^#/, "");
  try { return decodeURIComponent(raw); } catch { return raw; }
}
