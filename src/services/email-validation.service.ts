import { eq, and, gte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { emailValidations } from "../db/schema/index.js";
import { disposableDomains } from "../data/disposable-domains.js";
import { typoDomains } from "../data/typo-domains.js";
import dns from "dns/promises";

const ROLE_ADDRESSES = new Set([
  "admin", "administrator", "postmaster", "hostmaster", "webmaster",
  "abuse", "noreply", "no-reply", "mailer-daemon", "nobody",
  "info", "support", "sales", "contact", "help", "security",
  "root", "ftp", "www", "mail", "smtp", "pop", "imap",
]);

const FREE_PROVIDERS = new Set([
  "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "aol.com",
  "icloud.com", "mail.com", "protonmail.com", "zoho.com", "yandex.com",
  "gmx.com", "gmx.net", "live.com", "msn.com", "yahoo.co.uk",
  "yahoo.co.in", "yahoo.ca", "me.com", "mac.com", "fastmail.com",
  "tutanota.com", "hey.com",
]);

const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

interface ValidationResult {
  email: string;
  result: "valid" | "invalid" | "risky" | "unknown";
  reason: string | null;
  mx_found: boolean | null;
  is_disposable: boolean;
  is_role_address: boolean;
  is_free_provider: boolean;
  suggested_correction: string | null;
}

export async function validateEmail(email: string, accountId?: string): Promise<ValidationResult> {
  const normalized = email.trim().toLowerCase();

  // Check cache (results valid for 7 days)
  const db = getDb();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [cached] = await db.select().from(emailValidations)
    .where(and(eq(emailValidations.email, normalized), gte(emailValidations.checkedAt, sevenDaysAgo)));

  if (cached) {
    return {
      email: normalized,
      result: cached.result as ValidationResult["result"],
      reason: cached.reason,
      mx_found: cached.mxFound,
      is_disposable: cached.isDisposable ?? false,
      is_role_address: cached.isRoleAddress ?? false,
      is_free_provider: cached.isFreeProvider ?? false,
      suggested_correction: cached.suggestedCorrection,
    };
  }

  // Step 1: Syntax check
  if (!EMAIL_REGEX.test(normalized)) {
    return saveAndReturn(db, normalized, accountId, {
      result: "invalid", reason: "invalid_syntax",
      mxFound: null, isDisposable: false, isRoleAddress: false, isFreeProvider: false,
      suggestedCorrection: null,
    });
  }

  const [localPart, domain] = normalized.split("@");

  // Step 2: Domain typo check
  const correction = typoDomains[domain];
  const suggestedCorrection = correction ? `${localPart}@${correction}` : null;

  // Step 3: Disposable domain check
  const isDisposable = disposableDomains.has(domain);

  // Step 4: Role address check
  const isRoleAddress = ROLE_ADDRESSES.has(localPart);

  // Step 5: Free provider check
  const isFreeProvider = FREE_PROVIDERS.has(domain);

  // Step 6: MX lookup
  let mxFound: boolean | null = null;
  try {
    const mxRecords = await dns.resolveMx(domain);
    mxFound = mxRecords.length > 0;
  } catch {
    mxFound = false;
  }

  // Determine result
  let result: ValidationResult["result"] = "valid";
  let reason: string | null = null;

  if (!mxFound) {
    result = "invalid";
    reason = "no_mx";
  } else if (isDisposable) {
    result = "risky";
    reason = "disposable";
  } else if (isRoleAddress) {
    result = "risky";
    reason = "role_address";
  } else if (suggestedCorrection) {
    result = "risky";
    reason = "possible_typo";
  }

  return saveAndReturn(db, normalized, accountId, {
    result, reason, mxFound, isDisposable, isRoleAddress, isFreeProvider, suggestedCorrection,
  });
}

async function saveAndReturn(
  db: ReturnType<typeof getDb>,
  email: string,
  accountId: string | undefined,
  data: {
    result: string;
    reason: string | null;
    mxFound: boolean | null;
    isDisposable: boolean;
    isRoleAddress: boolean;
    isFreeProvider: boolean;
    suggestedCorrection: string | null;
  },
): Promise<ValidationResult> {
  // Upsert into cache
  await db.insert(emailValidations).values({
    email,
    accountId: accountId || null,
    result: data.result,
    reason: data.reason,
    mxFound: data.mxFound,
    isDisposable: data.isDisposable,
    isRoleAddress: data.isRoleAddress,
    isFreeProvider: data.isFreeProvider,
    suggestedCorrection: data.suggestedCorrection,
    checkedAt: new Date(),
  }).onConflictDoUpdate({
    target: emailValidations.email,
    set: {
      accountId: accountId || null,
      result: data.result,
      reason: data.reason,
      mxFound: data.mxFound,
      isDisposable: data.isDisposable,
      isRoleAddress: data.isRoleAddress,
      isFreeProvider: data.isFreeProvider,
      suggestedCorrection: data.suggestedCorrection,
      checkedAt: new Date(),
    },
  });

  return {
    email,
    result: data.result as ValidationResult["result"],
    reason: data.reason,
    mx_found: data.mxFound,
    is_disposable: data.isDisposable,
    is_role_address: data.isRoleAddress,
    is_free_provider: data.isFreeProvider,
    suggested_correction: data.suggestedCorrection,
  };
}

export async function validateBatch(emails: string[], accountId?: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const email of emails) {
    results.push(await validateEmail(email, accountId));
  }
  return results;
}

export async function listValidations(accountId: string, limit = 50) {
  const db = getDb();
  return db.select().from(emailValidations)
    .where(eq(emailValidations.accountId, accountId))
    .orderBy(emailValidations.createdAt)
    .limit(limit);
}
