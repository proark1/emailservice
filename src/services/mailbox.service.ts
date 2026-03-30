import { eq, and, desc } from "drizzle-orm";
import nodemailer from "nodemailer";
import { getDb } from "../db/index.js";
import { connectedMailboxes } from "../db/schema/index.js";
import { NotFoundError, ConflictError } from "../lib/errors.js";
import { encryptPrivateKey, decryptPrivateKey } from "../lib/crypto.js";
import { getConfig } from "../config/index.js";

// ---------------------------------------------------------------------------
// Provider presets — default SMTP / IMAP settings per provider
// ---------------------------------------------------------------------------
export const PROVIDER_PRESETS = {
  gmail: {
    smtpHost: "smtp.gmail.com",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
  },
  outlook: {
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecure: true,
  },
  yahoo: {
    smtpHost: "smtp.mail.yahoo.com",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "imap.mail.yahoo.com",
    imapPort: 993,
    imapSecure: true,
  },
  icloud: {
    smtpHost: "smtp.mail.me.com",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "imap.mail.me.com",
    imapPort: 993,
    imapSecure: true,
  },
  custom: {
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
  },
} as const;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createMailbox(
  accountId: string,
  input: {
    displayName: string;
    email: string;
    provider: "gmail" | "outlook" | "yahoo" | "icloud" | "custom";
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    imapHost: string;
    imapPort: number;
    imapSecure: boolean;
    username: string;
    password: string;
  },
) {
  const db = getDb();
  const config = getConfig();

  // Check for duplicate email on this account
  const [existing] = await db.select({ id: connectedMailboxes.id })
    .from(connectedMailboxes)
    .where(and(
      eq(connectedMailboxes.accountId, accountId),
      eq(connectedMailboxes.email, input.email.toLowerCase()),
    ));

  if (existing) {
    throw new ConflictError("A mailbox with this email address is already connected");
  }

  const encryptedPassword = encryptPrivateKey(input.password, config.ENCRYPTION_KEY);

  const [mailbox] = await db.insert(connectedMailboxes).values({
    accountId,
    displayName: input.displayName,
    email: input.email.toLowerCase(),
    provider: input.provider,
    smtpHost: input.smtpHost,
    smtpPort: input.smtpPort,
    smtpSecure: input.smtpSecure,
    imapHost: input.imapHost,
    imapPort: input.imapPort,
    imapSecure: input.imapSecure,
    username: input.username,
    encryptedPassword,
    status: "active",
  }).returning();

  return mailbox;
}

export async function listMailboxes(accountId: string) {
  const db = getDb();
  return db.select().from(connectedMailboxes)
    .where(eq(connectedMailboxes.accountId, accountId))
    .orderBy(desc(connectedMailboxes.createdAt));
}

export async function getMailbox(accountId: string, mailboxId: string) {
  const db = getDb();
  const [mailbox] = await db.select().from(connectedMailboxes)
    .where(and(
      eq(connectedMailboxes.id, mailboxId),
      eq(connectedMailboxes.accountId, accountId),
    ));

  if (!mailbox) throw new NotFoundError("Mailbox");
  return mailbox;
}

export async function updateMailbox(
  accountId: string,
  mailboxId: string,
  input: {
    displayName?: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpSecure?: boolean;
    imapHost?: string;
    imapPort?: number;
    imapSecure?: boolean;
    username?: string;
    password?: string;
  },
) {
  const db = getDb();
  const config = getConfig();

  // Verify ownership
  await getMailbox(accountId, mailboxId);

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (input.displayName !== undefined) updates.displayName = input.displayName;
  if (input.smtpHost !== undefined) updates.smtpHost = input.smtpHost;
  if (input.smtpPort !== undefined) updates.smtpPort = input.smtpPort;
  if (input.smtpSecure !== undefined) updates.smtpSecure = input.smtpSecure;
  if (input.imapHost !== undefined) updates.imapHost = input.imapHost;
  if (input.imapPort !== undefined) updates.imapPort = input.imapPort;
  if (input.imapSecure !== undefined) updates.imapSecure = input.imapSecure;
  if (input.username !== undefined) updates.username = input.username;
  if (input.password !== undefined) {
    updates.encryptedPassword = encryptPrivateKey(input.password, config.ENCRYPTION_KEY);
    // Reset error state on password update
    updates.status = "active";
    updates.errorMessage = null;
    // Evict cached SMTP transport so next send picks up new credentials
    const { evictMailboxTransport } = await import("./email-sender.js");
    evictMailboxTransport(mailboxId);
  }

  const [updated] = await db.update(connectedMailboxes)
    .set(updates)
    .where(eq(connectedMailboxes.id, mailboxId))
    .returning();

  return updated;
}

export async function deleteMailbox(accountId: string, mailboxId: string) {
  const db = getDb();

  // Verify ownership
  await getMailbox(accountId, mailboxId);

  // Evict cached SMTP transport so next send doesn't use stale credentials
  const { evictMailboxTransport } = await import("./email-sender.js");
  evictMailboxTransport(mailboxId);

  await db.delete(connectedMailboxes).where(eq(connectedMailboxes.id, mailboxId));
}

// ---------------------------------------------------------------------------
// Connection testing
// ---------------------------------------------------------------------------

export async function testMailboxConnection(accountId: string, mailboxId: string): Promise<{
  smtp: { ok: boolean; error?: string };
  imap: { ok: boolean; error?: string };
}> {
  const config = getConfig();
  const mailbox = await getMailbox(accountId, mailboxId);
  const password = decryptPrivateKey(mailbox.encryptedPassword, config.ENCRYPTION_KEY);

  const [smtpResult, imapResult] = await Promise.all([
    testSmtp(mailbox, password),
    testImap(mailbox, password),
  ]);

  const db = getDb();
  const allOk = smtpResult.ok && imapResult.ok;

  await db.update(connectedMailboxes)
    .set({
      status: allOk ? "active" : "error",
      errorMessage: allOk
        ? null
        : [
          !smtpResult.ok ? `SMTP: ${smtpResult.error}` : null,
          !imapResult.ok ? `IMAP: ${imapResult.error}` : null,
        ].filter(Boolean).join("; "),
      updatedAt: new Date(),
    })
    .where(eq(connectedMailboxes.id, mailboxId));

  return { smtp: smtpResult, imap: imapResult };
}

async function testSmtp(
  mailbox: typeof connectedMailboxes.$inferSelect,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  const transport = nodemailer.createTransport({
    host: mailbox.smtpHost,
    port: mailbox.smtpPort,
    secure: mailbox.smtpSecure,
    auth: { user: mailbox.username, pass: password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });

  try {
    await transport.verify();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  } finally {
    transport.close();
  }
}

async function testImap(
  mailbox: typeof connectedMailboxes.$inferSelect,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  // Dynamic import to avoid loading imapflow at module level
  const { ImapFlow } = await import("imapflow");

  const client = new ImapFlow({
    host: mailbox.imapHost,
    port: mailbox.imapPort,
    secure: mailbox.imapSecure,
    auth: { user: mailbox.username, pass: password },
    logger: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });

  try {
    await client.connect();
    await client.logout();
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Decrypted transport — used by email-sender and IMAP worker
// ---------------------------------------------------------------------------

export function getDecryptedPassword(mailbox: typeof connectedMailboxes.$inferSelect): string {
  const config = getConfig();
  return decryptPrivateKey(mailbox.encryptedPassword, config.ENCRYPTION_KEY);
}

// ---------------------------------------------------------------------------
// Formatting — never expose encrypted password
// ---------------------------------------------------------------------------

export function formatMailboxResponse(mailbox: typeof connectedMailboxes.$inferSelect) {
  return {
    id: mailbox.id,
    display_name: mailbox.displayName,
    email: mailbox.email,
    provider: mailbox.provider,
    smtp_host: mailbox.smtpHost,
    smtp_port: mailbox.smtpPort,
    smtp_secure: mailbox.smtpSecure,
    imap_host: mailbox.imapHost,
    imap_port: mailbox.imapPort,
    imap_secure: mailbox.imapSecure,
    username: mailbox.username,
    status: mailbox.status,
    error_message: mailbox.errorMessage ?? null,
    last_sync_at: mailbox.lastSyncAt?.toISOString() ?? null,
    created_at: mailbox.createdAt.toISOString(),
    updated_at: mailbox.updatedAt.toISOString(),
  };
}
