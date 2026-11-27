import { constants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { assertHouseholdAttachmentPath } from "@/core/household-attachment";
import { RECIPE_DIR } from "@/core/recipe";
import { resolveHealthDir } from "@/core/vault";
import { cloudMode } from "@/db/client";
import { clientIp, createLimiter } from "@/server/login-lookup";
import { NotFound } from "@/server/pg-repository";
import { sniffImage } from "@/server/quick-entry";
import { requireUser, userRepository } from "@/server/session";

const mayRead = createLimiter(300, 60_000);
const missing = () => new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

async function localImage(relPath: string) {
  if (process.env.NODE_ENV === "production" && process.env.KZ_ALLOW_LOCAL_VAULT !== "1") return;
  try {
    const root = await fs.realpath(/*turbopackIgnore: true*/ resolveHealthDir());
    const file = path.resolve(/*turbopackIgnore: true*/ root, relPath);
    if (!file.startsWith(root + path.sep) || await fs.realpath(/*turbopackIgnore: true*/ file) !== file) return;
    const handle = await fs.open(/*turbopackIgnore: true*/ file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
      if ((await handle.stat()).isFile()) return await handle.readFile();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (!["ENOENT", "ENOTDIR", "ELOOP", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")) throw error;
  }
}

async function cloudImage(relPath: string) {
  await requireUser();
  try {
    return (await (await userRepository()).getHouseholdAttachment(relPath)).data;
  } catch (error) {
    if (!(error instanceof NotFound)) throw error;
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const relPath = [RECIPE_DIR, ...(await params).path].join("/");
  try { assertHouseholdAttachmentPath(relPath); } catch { return missing(); }
  if (!mayRead(clientIp(req))) return new Response(null, { status: 429, headers: { "retry-after": "60", "cache-control": "no-store" } });
  const data = cloudMode() ? await cloudImage(relPath) : await localImage(relPath);
  const image = data && sniffImage(data);
  if (!image || !data) return missing();
  return new Response(new Uint8Array(data), {
    headers: { "content-type": image.mime, "x-content-type-options": "nosniff", "cache-control": "no-store", "content-disposition": "inline" },
  });
}
