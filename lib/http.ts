import { NextRequest, NextResponse } from "next/server";
import { env } from "./env";
import { safeEqual } from "./auth";

// The extension calls from chrome-extension://… — allow it (auth is the capture key, not cookies).
export const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type, X-Capture-Key", "Access-Control-Allow-Methods": "POST, OPTIONS" };
export const json = (body: unknown, status = 200, cors = false) => NextResponse.json(body, { status, headers: cors ? CORS : undefined });

export function captureKeyOk(req: NextRequest) {
  const want = env.captureKey();
  const got = req.headers.get("x-capture-key") || "";
  return !!want && safeEqual(got, want);
}
export async function body(req: NextRequest) { return (await req.json().catch(() => null)) as Record<string, any> | null; }
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
