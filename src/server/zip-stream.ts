import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

// 流式 ZIP：一次只在内存里放一个文件，按客户端读取的速度往下打包（pull）。
// 以前整包 zipSync 会同时持有全部附件、ZIP 和副本，500 MB 附件时会超过容器 1 GB 内存上限（ISS-013 review）。

export interface ZipEntry { name: string; data: Uint8Array; compress: boolean }

/** 依次把条目写进 ZIP，按块产出；附件（图片、PDF 已压缩）原样存储，文本用 deflate */
export async function* zipChunks(entries: AsyncIterable<ZipEntry>): AsyncGenerator<Uint8Array> {
  const out: Uint8Array[] = [];
  let failed: Error | null = null;
  const zip = new Zip((err, chunk) => {
    if (err) failed = err;
    else out.push(chunk);
  });
  for await (const e of entries) {
    const f = e.compress ? new ZipDeflate(e.name, { level: 6 }) : new ZipPassThrough(e.name);
    zip.add(f);
    f.push(e.data, true);
    if (failed) throw failed;
    yield* out.splice(0);
  }
  zip.end();
  if (failed) throw failed;
  yield* out.splice(0);
}

/** 异步生成器 → Web ReadableStream（有背压）。结束、出错或客户端断开时都调用 onClose（调用方保证幂等） */
export function toStream(gen: AsyncGenerator<Uint8Array>, onClose: () => void = () => {}): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async pull(ctrl) {
      try {
        const { value, done } = await gen.next();
        if (done) {
          onClose();
          ctrl.close();
        } else ctrl.enqueue(value);
      } catch (e) {
        onClose();
        ctrl.error(e);
      }
    },
    async cancel() {
      onClose();
      await gen.return(undefined);
    },
  });
}
