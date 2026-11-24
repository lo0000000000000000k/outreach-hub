import { recentActivity } from "@/lib/activity";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() { return json({ activity: await recentActivity(40) }); }
