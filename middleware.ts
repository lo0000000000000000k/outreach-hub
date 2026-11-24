import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

// Everything needs the boss's login, except: the login itself, the extension's capture
// endpoints (they check CAPTURE_KEY) and the daily cron (checks CRON_SECRET).
const PUBLIC = ["/login", "/api/login", "/api/capture/", "/api/cron/", "/icon.svg"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();
  if (await isValidSession(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = "/login";
  return NextResponse.redirect(url);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
