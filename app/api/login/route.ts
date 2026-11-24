import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, cookieOptions, createSession, safeEqual } from "@/lib/auth";
import { env } from "@/lib/env";

const fails = new Map<string, { n: number; until: number }>(); // 5 wrong tries → 5-minute lockout

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const f = fails.get(ip);
  if (f && f.until > Date.now()) return NextResponse.json({ error: "Too many tries. Wait a few minutes." }, { status: 429 });
  const { passcode } = await req.json().catch(() => ({ passcode: "" }));
  if (!env.passcode()) return NextResponse.json({ error: "OUTREACH_PASSCODE isn't set on the server." }, { status: 500 });
  if (!safeEqual(String(passcode || ""), env.passcode())) {
    const n = (f?.n || 0) + 1;
    fails.set(ip, { n, until: n >= 5 ? Date.now() + 5 * 60_000 : 0 });
    return NextResponse.json({ error: "Wrong passcode." }, { status: 401 });
  }
  fails.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSession(), cookieOptions);
  return res;
}
