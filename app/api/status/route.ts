import { integrationStatus } from "@/lib/env";
import { json } from "@/lib/http";
export const dynamic = "force-dynamic";
export async function GET() { return json(integrationStatus()); }
