/**
 * Reusable validators for the `Input` component's `validate` prop. Each one
 * returns null when the value is acceptable, or a short message that explains
 * the problem in user-facing language. Don't return technical jargon — these
 * strings end up in `aria-describedby` and read aloud by screen readers.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const URL_RE = /^https?:\/\/[^\s/$.?#].[^\s]*$/i;

export const required = (msg = "Required") => (v: string) => v.trim() ? null : msg;

export const email = (v: string) => {
  if (!v) return null;
  return EMAIL_RE.test(v.trim()) ? null : "Enter a valid email address";
};

export const domain = (v: string) => {
  if (!v) return null;
  return DOMAIN_RE.test(v.trim()) ? null : "Enter a domain like example.com";
};

export const url = (v: string) => {
  if (!v) return null;
  return URL_RE.test(v.trim()) ? null : "Enter a URL starting with http:// or https://";
};

export const minLength = (n: number, label = "value") => (v: string) =>
  v.length >= n ? null : `${label} must be at least ${n} characters`;

export const maxLength = (n: number, label = "value") => (v: string) =>
  v.length <= n ? null : `${label} must be ${n} characters or fewer`;

export const port = (v: string) => {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? null : "Port must be between 1 and 65535";
};

export const positiveInt = (v: string) => {
  if (!v) return null;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? null : "Must be a positive whole number";
};

/**
 * Compose multiple validators — first error wins, runs in order so cheap
 * checks (required) precede expensive ones (regex).
 */
export const compose = (...vs: Array<(v: string) => string | null>) => (v: string) => {
  for (const fn of vs) {
    const err = fn(v);
    if (err) return err;
  }
  return null;
};
