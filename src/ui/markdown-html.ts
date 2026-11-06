import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

// 笔记正文来自导入数据，不能当作可信 HTML：Markdown 渲染后按白名单清洗。
// 不允许任何事件属性、style、script/iframe；链接只允许 http(s) / mailto / 站内相对路径；不加载外部图片。

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["h1", "h2", "h3", "h4", "p", "br", "hr", "ul", "ol", "li", "strong", "em", "b", "i", "del", "code", "pre", "blockquote", "a", "table", "thead", "tbody", "tr", "th", "td"],
  allowedAttributes: { a: ["href", "title", "rel", "target"] },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
  disallowedTagsMode: "escape",
  transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow", target: "_blank" }) },
};

// Obsidian 的 [[链接|别名]] 只保留文字
const stripWikilinks = (md: string) => md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, target, alias) => alias ?? target);

export function renderMarkdown(source: string): string {
  return sanitizeHtml(marked.parse(stripWikilinks(source), { async: false }), OPTIONS);
}
