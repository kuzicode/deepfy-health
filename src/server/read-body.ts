// 按实际读取的字节数限制请求体：Content-Length 可以不带（分块发送），不能只看它

/** 读出请求体文本；超过 max 时停止读取并返回 null */
export async function readBodyLimited(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** 解析 JSON，格式不对时返回 undefined，交给调用方的校验拒绝 */
export function parseJsonOrUndefined(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
