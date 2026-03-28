import { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import * as authService from "../services/auth.service.js";

export default async function authRoutes(app: FastifyInstance) {
  // Rate limit auth endpoints more aggressively
  app.addHook("onRequest", async (request) => {
    // Handled by global rate limiter, but we enforce stricter limits via route config
  });

  // POST /auth/register
  app.post("/register", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = z.object({
      name: z.string().min(1).max(255),
      email: z.string().email(),
      password: z.string().min(8).max(128),
    }).parse(request.body);

    const account = await authService.register(body.name, body.email, body.password);
    const token = app.jwt.sign({ id: account.id, role: account.role }, { expiresIn: "7d" });

    return reply
      .setCookie("token", token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7, // 7 days
      })
      .status(201)
      .send({
        data: {
          id: account.id,
          name: account.name,
          email: account.email,
          role: account.role,
        },
      });
  });

  // POST /auth/login
  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(8),
    }).parse(request.body);

    const account = await authService.login(body.email, body.password);
    const token = app.jwt.sign({ id: account.id, role: account.role }, { expiresIn: "7d" });

    return reply
      .setCookie("token", token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 7,
      })
      .send({
        data: {
          id: account.id,
          name: account.name,
          email: account.email,
          role: account.role,
        },
      });
  });

  // POST /auth/logout
  app.post("/logout", async (_request, reply) => {
    return reply
      .clearCookie("token", { path: "/" })
      .send({ data: { message: "Logged out" } });
  });

  // GET /auth/me
  app.get("/me", async (request, reply) => {
    try {
      const token = request.cookies.token;
      if (!token) return reply.status(401).send({ data: null });

      const decoded = app.jwt.verify<{ id: string; role: string }>(token);
      const account = await authService.getAccountById(decoded.id);
      if (!account) return reply.status(401).send({ data: null });

      return reply.send({
        data: {
          id: account.id,
          name: account.name,
          email: account.email,
          role: account.role,
        },
      });
    } catch {
      return reply.status(401).send({ data: null });
    }
  });

  // PATCH /auth/profile — update name
  app.patch("/profile", async (request) => {
    const token = request.cookies.token;
    if (!token) throw new (await import("../lib/errors.js")).UnauthorizedError();
    let decoded: { id: string };
    try {
      decoded = app.jwt.verify<{ id: string }>(token);
    } catch {
      throw new (await import("../lib/errors.js")).UnauthorizedError("Invalid or expired token");
    }
    const { name } = z.object({ name: z.string().min(1).max(255) }).parse(request.body);
    const db = getDb();
    const { accounts } = await import("../db/schema/index.js");
    const [updated] = await db.update(accounts).set({ name, updatedAt: new Date() }).where(eq(accounts.id, decoded.id)).returning();
    if (!updated) throw new (await import("../lib/errors.js")).NotFoundError("Account");
    return { data: { id: updated.id, name: updated.name, email: updated.email, role: updated.role } };
  });

  // POST /auth/change-password
  app.post("/change-password", async (request) => {
    const token = request.cookies.token;
    if (!token) throw new (await import("../lib/errors.js")).UnauthorizedError();
    let decoded: { id: string };
    try {
      decoded = app.jwt.verify<{ id: string }>(token);
    } catch {
      throw new (await import("../lib/errors.js")).UnauthorizedError("Invalid or expired token");
    }
    const { current_password, new_password } = z.object({
      current_password: z.string().min(1),
      new_password: z.string().min(8).max(255),
    }).parse(request.body);

    const db = getDb();
    const { accounts } = await import("../db/schema/index.js");
    const [account] = await db.select().from(accounts).where(eq(accounts.id, decoded.id));
    if (!account) throw new (await import("../lib/errors.js")).NotFoundError("Account");

    const argon2 = await import("argon2");
    const valid = await argon2.verify(account.passwordHash!, current_password);
    if (!valid) throw new (await import("../lib/errors.js")).ValidationError("Current password is incorrect");

    const newHash = await argon2.hash(new_password);
    await db.update(accounts).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(accounts.id, decoded.id));
    return { data: { success: true } };
  });
}
