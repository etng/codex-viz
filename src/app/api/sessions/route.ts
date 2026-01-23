import { NextResponse } from "next/server";
import { listSessions } from "@/lib/indexer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function toBool(v: string | null) {
  if (!v) return false;
  return v === "1" || v.toLowerCase() === "true";
}

function toInt(v: string | null, fallback: number) {
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? undefined;
  const withTools = toBool(searchParams.get("withTools"));
  const withErrors = toBool(searchParams.get("withErrors"));
  const limit = toInt(searchParams.get("limit"), 100);
  const offset = toInt(searchParams.get("offset"), 0);

  const res = await listSessions({ q, withTools, withErrors, limit, offset });
  return NextResponse.json(res);
}

