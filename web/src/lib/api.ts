/**
 * Read a cookie value by name. Returns undefined if the cookie isn't present.
 * Used to pull the double-submit CSRF token so we can echo it in a header.
 */
function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

const UNSAFE_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);
// Login / register / logout don't need CSRF — they predate the session
// cookie. Every other /auth mutation (change-password, profile, accept
// invitation) is now CSRF-protected on the server, so we echo the token.
const CSRF_AUTH_EXEMPT = new Set(["/auth/login", "/auth/register", "/auth/logout"]);

export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || "GET").toUpperCase();
  const csrfRequired =
    UNSAFE_METHODS.has(method) &&
    (path.startsWith("/dashboard") ||
      path.startsWith("/admin") ||
      (path.startsWith("/auth") && !CSRF_AUTH_EXEMPT.has(path.split("?")[0])));
  const needsCsrf = csrfRequired;
  const csrfToken = needsCsrf ? readCookie("csrf_token") : undefined;
  const res = await fetch(path, {
    credentials: "include",
    // Only set Content-Type for requests that have a body — Fastify 5 rejects
    // Content-Type: application/json with an empty body (e.g. DELETE requests).
    headers: {
      ...(options?.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(csrfToken ? { "X-CSRF-Token": csrfToken } : {}),
      ...options?.headers,
    },
    ...options,
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
  if (!res.ok) {
    if ((res.status === 401 || res.status === 403) && !path.startsWith("/auth/")) {
      window.location.href = "/login";
    }
    throw new Error(data?.error?.message || `Request failed (${res.status})`);
  }
  return data;
}

export const post = <T = any>(path: string, body: any) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const patch = <T = any>(path: string, body: any) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });

export const del = <T = any>(path: string) =>
  api<T>(path, { method: "DELETE" });
