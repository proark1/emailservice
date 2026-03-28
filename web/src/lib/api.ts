export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
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
