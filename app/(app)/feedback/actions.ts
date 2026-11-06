"use server";

import { getDb } from "@/db/client";
import { addFeedback, FeedbackForm } from "@/server/feedback";
import { createLimiter } from "@/server/login-lookup";
import { requireUser } from "@/server/session";

export type FeedbackState = { ok?: boolean; error?: "invalid" | "tooMany" };

const limit = createLimiter(10, 60 * 60 * 1000);

export async function feedbackAction(_prev: FeedbackState, form: FormData): Promise<FeedbackState> {
  const u = await requireUser();
  const parsed = FeedbackForm.safeParse(Object.fromEntries(form.entries()));
  if (!parsed.success) return { error: "invalid" };
  if (!limit(u.id)) return { error: "tooMany" };
  await addFeedback(getDb(), u, parsed.data);
  return { ok: true };
}
