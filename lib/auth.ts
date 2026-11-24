import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "oh_session";
const MAX_AGE_DAYS = 30;

function secret() {
  const s = process.env.SESSION_SECRET || "dev-only-secret-change-me-please-1234";
  return new TextEncoder().encode(s);
}

export async function createSession(role: "boss" = "boss"): Promise<string> {
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_DAYS}d`)
    .sign(secret());
}

export async function isValidSession(token?: string | null, role: "boss" = "boss"): Promise<boolean> {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload.role === role;
  } catch {
    return false;
  }
}

/** Constant-time string compare so the passcode can't be guessed by timing. */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: MAX_AGE_DAYS * 24 * 3600,
};
