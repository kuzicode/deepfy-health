import { json, withRepo } from "@/server/api";

export const GET = (req: Request) =>
  withRepo(req, async (repo) => json({ vault: await repo.exportRaw(), attachments: await repo.listAttachments() }));
