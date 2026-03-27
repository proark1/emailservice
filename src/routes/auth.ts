import { FastifyInstance } from "fastify";
import { z } from "zod";
import * as authService from "../services/auth.service.js";

export default async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post("/register", async (request, reply) => {
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
  app.post("/login", async (request, reply) => {
    const body = z.object({
      email: z.string().email(),
      password: z.string().min(1),
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
}
