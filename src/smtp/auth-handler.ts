import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { apiKeys, accounts } from "../db/schema/index.js";
import { verifyApiKey, getKeyPrefix } from "../lib/crypto.js";

export interface SmtpAuthResult {
  accountId: string;
  apiKeyId: string;
  // Forwarded into sendEmail() so SMTP-relay sends respect the same
  // company-isolation boundary as HTTP /v1/emails sends.
  companyId: string | null;
}

export async function authenticateSmtp(
  _username: string,
  password: string,
): Promise<SmtpAuthResult | null> {
  // password should be the API key (es_xxx)
  if (!password.startsWith("es_")) return null;

  const prefix = getKeyPrefix(password);
  const db = getDb();

  const candidates = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyPrefix, prefix));

  for (const candidate of candidates) {
    if (candidate.revokedAt) continue;
    if (candidate.expiresAt && candidate.expiresAt < new Date()) continue;
    if (await verifyApiKey(password, candidate.keyHash)) {
      // Verify account exists
      const [account] = await db.select().from(accounts).where(eq(accounts.id, candidate.accountId));
      if (account) {
        return { accountId: account.id, apiKeyId: candidate.id, companyId: candidate.companyId ?? null };
      }
    }
  }

  return null;
}
