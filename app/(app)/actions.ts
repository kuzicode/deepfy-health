"use server";

import { redirect } from "next/navigation";
import { todayISO } from "@/core/analysis";
import { ImportRejected } from "@/server/pg-repository";
import { NewMemberForm, newMemberId, newMemberProfile } from "@/server/quick-entry";
import { QuotaExceeded } from "@/server/quota";
import { requireUser, userRepository } from "@/server/session";

export async function createMemberAction(_prev: { error?: string }, form: FormData): Promise<{ error?: string }> {
  await requireUser();
  const parsed = NewMemberForm.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { error: "invalid" };
  const repo = await userRepository();
  const id = newMemberId();
  try {
    await repo.applyChanges([{ op: "add_member", id, name: parsed.data.name, profile: newMemberProfile(id, parsed.data, todayISO()) }]);
  } catch (e) {
    if (e instanceof ImportRejected) return { error: "invalid" };
    if (e instanceof QuotaExceeded) return { error: "quota" };
    throw e;
  }
  redirect(`/m/${id}`);
}
