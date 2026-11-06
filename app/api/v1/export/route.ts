import { json, rateLimited, withRepo } from "@/server/api";
import { createLimiter } from "@/server/login-lookup";

// kzh push 和 pull 每次都会调用，不含附件内容，所以和网页的完整导出分开计数
const perDay = createLimiter(60, 86_400_000);

export const GET = (req: Request) =>
  withRepo(req, async (repo, userId) => {
    if (!perDay(userId)) return rateLimited();
    return json({ vault: await repo.exportRaw(), attachments: await repo.listAttachments() });
  }, { heavy: true });
