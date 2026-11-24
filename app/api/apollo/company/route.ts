import { NextRequest } from "next/server";
import { companyPeople } from "@/lib/apollo";
import { errMsg, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const domain = req.nextUrl.searchParams.get("domain") || "";
  const page = Number(req.nextUrl.searchParams.get("page") || 1);
  try { return json(await companyPeople(domain, page)); } catch (e) { return json({ error: errMsg(e) }, 400); }
}
