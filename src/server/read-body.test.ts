import { describe, expect, it } from "vitest";
import { parseJsonOrUndefined, readBodyLimited } from "./read-body";

const stream = (...parts: string[]) => new ReadableStream({
  start(c) { for (const p of parts) c.enqueue(new TextEncoder().encode(p)); c.close(); },
});
const post = (body: BodyInit, headers: HeadersInit = {}) => new Request("http://x/", { method: "POST", body, headers, duplex: "half" } as RequestInit);

describe("readBodyLimited", () => {
  it("没有 Content-Length 时按实际字节数限制", async () => {
    expect(await readBodyLimited(post(stream("12345", "67890")), 9)).toBeNull();
    expect(await readBodyLimited(post(stream("12345", "6789")), 9)).toBe("123456789");
  });

  it("声明超过上限时不读取，多字节字符按字节计", async () => {
    expect(await readBodyLimited(post("x", { "content-length": "100" }), 9)).toBeNull();
    expect(await readBodyLimited(post(stream("健康档案")), 9)).toBeNull();
    expect(await readBodyLimited(post(stream("健康档")), 9)).toBe("健康档");
  });

  it("空请求体返回空字符串", async () => {
    expect(await readBodyLimited(new Request("http://x/"), 9)).toBe("");
  });
});

describe("parseJsonOrUndefined", () => {
  it("格式不对返回 undefined", () => {
    expect(parseJsonOrUndefined("[1]")).toEqual([1]);
    expect(parseJsonOrUndefined("{")).toBeUndefined();
  });
});
