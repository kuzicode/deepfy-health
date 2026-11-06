import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown-html";

describe("renderMarkdown 清洗", () => {
  it("保留正常 Markdown", () => {
    const html = renderMarkdown("## 饮食\n- 少喝酒\n\n**加粗** [链接](https://example.com)");
    expect(html).toContain("<h2>饮食</h2>");
    expect(html).toContain("<li>少喝酒</li>");
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
  it.each([
    ['<img src=x onerror="alert(1)">', /onerror|<img/],
    ["<script>alert(1)</script>", /<script/],
    ['<a href="javascript:alert(1)">x</a>', /javascript:/],
    ["[x](javascript:alert(1))", /javascript:/],
    ['<iframe src="https://evil"></iframe>', /<iframe/],
    ['<p style="background:url(x)" onclick="x()">t</p>', /style=|onclick/],
    ["![img](https://tracker.example/p.png)", /<img/],
  ])("去掉危险内容：%s", (input, bad) => {
    expect(renderMarkdown(input)).not.toMatch(bad);
  });
});
