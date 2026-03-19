import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emailBatches } from "../db/schema/index.js";
import { sendEmail, formatEmailResponse } from "./email.service.js";
import type { SendEmailInput } from "../schemas/email.schema.js";

export async function sendBatch(accountId: string, emailInputs: SendEmailInput[]) {
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

  const results: Array<{ success: boolean; data?: any; error?: string }> = [];
  let sentCount = 0;
  let failedCount = 0;

  for (const input of emailInputs) {
    try {
      const result = await sendEmail(accountId, input);
      results.push({ success: true, data: result.response });
      sentCount++;
    } catch (error) {
      results.push({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      failedCount++;
    }
  }

  // Update batch status
  const status = failedCount === 0
    ? "completed" as const
    : sentCount === 0
      ? "partial_failure" as const
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
