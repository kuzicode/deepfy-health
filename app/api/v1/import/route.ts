import { RawVaultSchema, json, withRepo } from "@/server/api";

export const POST = (req: Request) =>
  withRepo(req, async (repo) => {
    const raw = RawVaultSchema.parse(await req.json());
    const force = new URL(req.url).searchParams.get("force") === "1";
    return json(await repo.importRaw(raw, { force }));
  }, { write: true });
