import crypto from "node:crypto";

const COOKIE_NAME = "safe_reports_session";

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map((item) => item.trim()).filter(Boolean).map((item) => {
    const index = item.indexOf("=");
    return index < 0 ? [item, ""] : [item.slice(0, index), item.slice(index + 1)];
  }));
}

function secret() {
  return process.env.REPORTS_SESSION_SECRET || process.env.REPORTS_ACCESS_CODE || "";
}

function signature(payload) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function reportsProtectionEnabled() {
  return Boolean(process.env.REPORTS_ACCESS_CODE);
}

export function verifyAccessCode(value) {
  return reportsProtectionEnabled() && safeEqual(value, process.env.REPORTS_ACCESS_CODE);
}

export function createSessionCookie() {
  const payload = Buffer.from(JSON.stringify({ scope: "reports", exp: Date.now() + 12 * 60 * 60 * 1000 })).toString("base64url");
  const secure = process.env.SAFE_LOCAL_DEV === "1" ? "" : "; Secure";
  return `${COOKIE_NAME}=${payload}.${signature(payload)}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=43200`;
}

export function clearSessionCookie() {
  const secure = process.env.SAFE_LOCAL_DEV === "1" ? "" : "; Secure";
  return `${COOKIE_NAME}=; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=0`;
}

export function isReportAuthenticated(event) {
  if (!reportsProtectionEnabled()) return true;
  const token = parseCookies(event.headers?.cookie || event.headers?.Cookie || "")[COOKIE_NAME];
  if (!token) return false;
  const [payload, provided] = token.split(".");
  if (!payload || !provided || !safeEqual(provided, signature(payload))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.scope === "reports" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}
