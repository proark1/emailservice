import crypto from "node:crypto";
import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import { ForbiddenError } from "../lib/errors.js";

/**
 * Double-submit CSRF for cookie-authenticated routes (dashboard + admin).
 *
 * How it works:
 * - On every request that presents a session cookie (`token`), we make sure the
 *   caller also has a `csrf_token` cookie. If it's missing or the cookie was
 *   set by a previous session we rotate it.
 * - For any unsafe method (POST/PATCH/PUT/DELETE) the caller MUST echo the
 *   cookie's value back in the `X-CSRF-Token` header. Cross-origin attackers
 *   can forge the cookie header (sort of — SameSite=Lax blocks the top-level
 *   POST anyway) but they cannot READ it, so they cannot construct the header.
 *
 * This intentionally does not apply to `/v1/*` (Bearer-token auth) or the
 * public tracking / unsubscribe / auth endpoints.
 */
const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const UNSAFE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
// Cookie-authed mutating routes covered by double-submit CSRF. /auth is
// included so password change / profile edit / invitation accept are
// protected — these are session-cookie mutations and must not be CSRF-able.
const PROTECTED_PREFIXES = ["/dashboard", "/admin", "/auth"];
// /auth endpoints that are reachable BEFORE a session exists (and therefore
// before a CSRF cookie is in place). The frontend gets a CSRF cookie on the
// 200 response from these so subsequent calls can echo it.
const EXEMPT_PREFIXES = ["/auth/login", "/auth/register", "/auth/logout"];

function generateCsrfToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function setCsrfCookie(reply: FastifyReply, value: string) {
  reply.setCookie(CSRF_COOKIE, value, {
    path: "/",
    httpOnly: false, // must be readable by the frontend to echo
    secure: process.env.NODE_ENV !== "development",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function issueCsrfToken(reply: FastifyReply): string {
  const token = generateCsrfToken();
  setCsrfCookie(reply, token);
  return token;
}

function isProtected(url: string): boolean {
  return PROTECTED_PREFIXES.some((p) => url.startsWith(p));
}

function isExempt(url: string): boolean {
  return EXEMPT_PREFIXES.some((p) => url.startsWith(p));
}

async function onRequest(request: FastifyRequest, _reply: FastifyReply) {
  const url = request.url.split("?")[0];
  if (isExempt(url)) return;
  if (!isProtected(url)) return;
  if (!UNSAFE_METHODS.has(request.method)) return;

  const cookieToken = request.cookies?.[CSRF_COOKIE];
  const headerToken = request.headers[CSRF_HEADER];

  if (!cookieToken || !headerToken || typeof headerToken !== "string") {
    throw new ForbiddenError("CSRF token required. Include the csrf_token cookie in the X-CSRF-Token header.");
  }

  // Constant-time compare so we don't leak timing information.
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(headerToken);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new ForbiddenError("CSRF token mismatch.");
  }
}

async function csrfPlugin(app: FastifyInstance) {
  app.addHook("onRequest", onRequest);
}

export default fp(csrfPlugin, { name: "csrf" });
