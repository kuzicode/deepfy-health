"use server";

import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { buildInsuranceChange, InsuranceFormError } from "@/server/insurance-form";
import { createLimiter } from "@/server/login-lookup";
import { ImportRejected, NotFound } from "@/server/repo-base";
import { QuotaExceeded } from "@/server/quota";
import { userRepository } from "@/server/session";

const mayWrite = createLimiter(60, 60_000);

export async function saveInsurance(member: string, revision: string, form: FormData) {
  const repo = await userRepository();
  if (!mayWrite(repo.userId)) return "busy";
  try {
    await repo.applyChanges((raw) => [buildInsuranceChange(raw, member, revision, form)]);
  } catch (error) {
    if (error instanceof NotFound) notFound();
    if (error instanceof InsuranceFormError) return error.code;
    if (error instanceof ImportRejected) return "invalid";
    if (error instanceof QuotaExceeded) return "quota";
    throw error;
  }
  revalidatePath("/insurance");
  revalidatePath("/");
  revalidatePath(`/m/${member}`);
  revalidatePath("/reminders");
  return "saved";
}
