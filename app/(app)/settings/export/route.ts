import { strToU8 } from "fflate";
import { rawToFiles } from "@/core/serialize";
import { createLimiter } from "@/server/login-lookup";
import { getDb } from "@/db/client";
import { PLANS, planOf } from "@/server/quota";
import { getSession, userRepository } from "@/server/session";
import { toStream, zipChunks, type ZipEntry } from "@/server/zip-stream";

// 导出要解密并打包全部附件，比较耗资源：按档位每天限次（按账号，内存计数，重启清零）；管理员不限
const perDay = { free: createLimiter(PLANS.free.exportsPerDay, 86_400_000), pro: createLimiter(PLANS.pro.exportsPerDay, 86_400_000), admin: () => true };
// 全站同时进行的导出数：流式打包时每个导出只占一个附件的内存，但解密仍吃 CPU
const MAX_RUNNING = 2;
let running = 0;

const text = (body: string, status: number) => new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });

export async function GET() {
  const session = await getSession();
  if (!session) return new Response("unauthorized", { status: 401 });
  const plan = await planOf(getDb(), session.user.id);
  // 检查与占位之间没有 await，并发请求不会同时越过；忙时不扣当天次数。流结束、出错或客户端断开时释放（只释放一次）
  if (running >= MAX_RUNNING) return text("正在处理其他导出，请稍后再试。 / Another export is in progress, try again shortly.", 503);
  if (!perDay[plan](session.user.id)) return text("今天的导出次数已用完，明天再试。 / Daily export limit reached, try again tomorrow.", 429);
  running++;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    running--;
  };
  try {
    const repo = await userRepository();
    const raw = await repo.exportRaw();
    const attachments = await repo.listAttachments();
    async function* entries(): AsyncGenerator<ZipEntry> {
      for (const [rel, content] of Object.entries(rawToFiles(raw))) yield { name: `Personal/${rel}`, data: strToU8(content), compress: true };
      for (const a of attachments) {
        const fm = raw.family.members.find((m) => m.id === a.member);
        if (fm) yield { name: `Personal/${fm.dir ?? fm.id}/Health/${a.relPath}`, data: (await repo.getAttachment(a.member, a.relPath)).data, compress: false };
      }
    }
    const date = new Date().toISOString().slice(0, 10);
    return new Response(toStream(zipChunks(entries()), release), {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="deepfy-health-${date}.zip"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    release();
    throw e;
  }
}
