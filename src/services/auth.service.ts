import { eq } from "drizzle-orm";
import * as argon2 from "argon2";
import { getDb } from "../db/index.js";
import { accounts } from "../db/schema/index.js";
import { ValidationError, UnauthorizedError, ConflictError, NotFoundError } from "../lib/errors.js";

export async function register(name: string, email: string, password: string) {
  const db = getDb();

  if (password.length < 8) {
    throw new ValidationError("Password must be at least 8 characters");
  }

  const passwordHash = await argon2.hash(password);

  try {
    const [account] = await db
      .insert(accounts)
      .values({ name, email, passwordHash, role: "user" })
      .returning();
    return account;
  } catch (error: any) {
    if (error.code === "23505") {
      throw new ConflictError("Unable to create account with this email");
    }
    throw error;
  }
}

export async function login(email: string, password: string) {
  const db = getDb();

  const [account] = await db.select().from(accounts).where(eq(accounts.email, email));
  if (!account || !account.passwordHash) {
    throw new UnauthorizedError("Invalid email or password");
  }

  const valid = await argon2.verify(account.passwordHash, password);
  if (!valid) {
    throw new UnauthorizedError("Invalid email or password");
  }

  return account;
}

export async function getAccountById(id: string) {
  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
  return account || null;
}

export async function listAllAccounts() {
  const db = getDb();
  return db.select({
    id: accounts.id,
    name: accounts.name,
    email: accounts.email,
    role: accounts.role,
    createdAt: accounts.createdAt,
  }).from(accounts);
}

export async function updateAccountRole(accountId: string, role: "user" | "admin") {
  const db = getDb();
  const [updated] = await db
    .update(accounts)
    .set({ role, updatedAt: new Date() })
    .where(eq(accounts.id, accountId))
    .returning();
  if (!updated) throw new NotFoundError("Account");
  return updated;
}

export async function deleteAccount(accountId: string) {
  const db = getDb();
  const [deleted] = await db.delete(accounts).where(eq(accounts.id, accountId)).returning();
  return deleted;
}
