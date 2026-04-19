import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emailBatches } from "../db/schema/index.js";
import { sendEmail, formatEmailResponse, type SendEmailOptions } from "./email.service.js";
import type { SendEmailInput } from "../schemas/email.schema.js";

export async function sendBatch(accountId: string, emailInputs: SendEmailInput[], options: SendEmailOptions = {}) {
  const db = getDb();

  // Create batch record
  const [batch] = await db
    .insert(emailBatches)
    .values({
      accountId,
      totalCount: emailInputs.length,
      status: "processing",
    })
    .returning();

  const settled = await Promise.allSettled(emailInputs.map((input) => sendEmail(accountId, input, options)));

  const results: Array<{ success: boolean; data?: any; error?: string }> = settled.map((r) => {
    if (r.status === "fulfilled") return { success: true, data: r.value.response };
    return { success: false, error: r.reason instanceof Error ? r.reason.message : "Unknown error" };
  });

  const sentCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  // Update batch status
  const status = failedCount === 0
    ? "completed" as const
    : sentCount === 0
      ? "failed" as const
      : "partial_failure" as const;

  await db
    .update(emailBatches)
    .set({ sentCount, failedCount, status, updatedAt: new Date() })
    .where(eq(emailBatches.id, batch.id));

  return {
    batch_id: batch.id,
    total: emailInputs.length,
    sent: sentCount,
    failed: failedCount,
    status,
    results,
  };
}
