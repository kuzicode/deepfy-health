import { strToU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { toStream, zipChunks, type ZipEntry } from "./zip-stream";

async function* from(list: ZipEntry[]) {
  for (const e of list) yield e;
}

describe("流式 ZIP 导出", () => {
  it("打包结果可解压，内容一致；文本压缩、附件原样存储", async () => {
    const photo = new Uint8Array(200_000).map((_, i) => (i * 7919) % 251);
    const entries = [
      { name: "Personal/a/profile.md", data: strToU8("# 档案\n".repeat(500)), compress: true },
      { name: "Personal/a/Health/attachments/x.jpg", data: photo, compress: false },
    ];
    const chunks: Uint8Array[] = [];
    for await (const c of zipChunks(from(entries))) chunks.push(c);
    const files = unzipSync(Buffer.concat(chunks));
    expect(new TextDecoder().decode(files["Personal/a/profile.md"])).toBe("# 档案\n".repeat(500));
    expect(Buffer.from(files["Personal/a/Health/attachments/x.jpg"]).equals(Buffer.from(photo))).toBe(true);
  });

  it("按读取逐个文件打包；客户端断开时结束生成器并释放", async () => {
    let produced = 0;
    let closed = 0;
    async function* lazy(): AsyncGenerator<ZipEntry> {
      for (let i = 0; i < 5; i++) {
        produced++;
        yield { name: `f${i}.bin`, data: new Uint8Array(1000), compress: false };
      }
    }
    const reader = toStream(zipChunks(lazy()), () => closed++).getReader();
    await reader.read();
    expect(produced).toBe(1); // 没读的文件不会提前解密进内存
    await reader.cancel();
    expect(closed).toBe(1);
  });

  it("读完时释放", async () => {
    let closed = 0;
    const reader = toStream(zipChunks(from([{ name: "a.txt", data: strToU8("a"), compress: true }])), () => closed++).getReader();
    while (!(await reader.read()).done);
    expect(closed).toBe(1);
  });
});
