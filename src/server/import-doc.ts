import { eq } from "drizzle-orm";
import { householdDocPath, type RawDoc, type RawHouseholdDoc } from "@/core/bundle";
import { doc, householdDoc } from "@/db/schema";
import { randomId, seal, sha256 } from "./crypto";
import { householdWhere } from "./doc-write";
import { docAad, docContent, hdocAad, type ImportResult, type Tx } from "./repo-base";

type Previous = { contentSha256: string; updatedAt: Date };

function importVersion(d: RawDoc | RawHouseholdDoc, prev: Previous | undefined, force: boolean) {
  const content = docContent(d);
  const contentSha256 = sha256(content);
  if (prev?.contentSha256 === contentSha256) return "unchanged";
  const updatedAt = d.updatedAt ? new Date(d.updatedAt) : new Date();
  if (prev && !force && prev.updatedAt > updatedAt) return "conflict";
  return { content, contentSha256, updatedAt };
}

export async function importDoc(tx: Tx, { dek, memberId, d, prev, force }: {
  dek: Buffer; memberId: string; d: RawDoc; prev?: typeof doc.$inferSelect; force: boolean;
}) {
  const version = importVersion(d, prev, force);
  if (typeof version === "string") return version;
  const { content, ...meta } = version;
  const row = { ...meta, ciphertext: seal(dek, content, docAad(memberId, d.kind, d.key)) };
  if (prev) {
    await tx.update(doc).set(row).where(eq(doc.id, prev.id));
    return "updated";
  }
  await tx.insert(doc).values({ id: randomId(), memberId, kind: d.kind, key: d.key, ...row });
  return "created";
}

export async function importHouseholdDocs(tx: Tx, docs: RawHouseholdDoc[], result: ImportResult, opts: { userId: string; dek: Buffer; force: boolean }) {
  for (const d of docs) {
    const where = householdWhere(opts.userId, d);
    const [prev] = await tx.select({ contentSha256: householdDoc.contentSha256, updatedAt: householdDoc.updatedAt }).from(householdDoc).where(where);
    const version = importVersion(d, prev, opts.force);
    if (version === "conflict") { result.conflicts.push(householdDocPath(d)); continue; }
    if (version === "unchanged") { result.unchanged++; continue; }
    const { content, ...meta } = version;
    const row = { ...meta, ciphertext: seal(opts.dek, content, hdocAad(opts.userId, d.kind, d.key)) };
    if (prev) {
      await tx.update(householdDoc).set(row).where(where);
      result.updated++;
    } else {
      await tx.insert(householdDoc).values({ ...row, id: randomId(), userId: opts.userId, kind: d.kind, key: d.key });
      result.created++;
    }
  }
}
