import { NotFound } from "@/server/pg-repository";
import { requireUser, userRepository } from "@/server/session";

// 网页查看日志照片：必须登录，只读自己的数据；只放行图片类型，禁止嗅探
const SAFE = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  await requireUser();
  const { id, path } = await params;
  const rel = path.map(decodeURIComponent).join("/");
  try {
    const { data, mime } = await (await userRepository()).getAttachment(id, rel);
    if (!SAFE.has(mime)) return new Response("unsupported", { status: 415 });
    return new Response(new Uint8Array(data), {
      headers: { "content-type": mime, "x-content-type-options": "nosniff", "cache-control": "no-store", "content-disposition": "inline" },
    });
  } catch (e) {
    if (e instanceof NotFound || (e instanceof Error && e.message.startsWith("附件路径"))) return new Response("not found", { status: 404 });
    throw e;
  }
}
