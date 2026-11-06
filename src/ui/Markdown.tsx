import { renderMarkdown } from "./markdown-html";

export function Markdown({ source }: { source?: string }) {
  if (!source?.trim()) return null;
  return <div className="prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />;
}
