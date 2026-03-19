export async function api<T = any>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || "Request failed");
  return data;
}

export const post = <T = any>(path: string, body: any) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body) });

export const patch = <T = any>(path: string, body: any) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(body) });

export const del = <T = any>(path: string) =>
  api<T>(path, { method: "DELETE" });
