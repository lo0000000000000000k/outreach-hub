import { apolloTest } from "@/lib/apollo";
import { errMsg, json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() { try { return json(await apolloTest()); } catch (e) { return json({ error: errMsg(e) }, 500); } }
