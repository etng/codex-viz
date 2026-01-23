import { NextResponse } from "next/server";
import { getUserWordCloud } from "@/lib/indexer";

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

function toNullableInt(v: string | null) {
  if (!v) return null;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const days = toNullableInt(searchParams.get("days"));
  const limit = toInt(searchParams.get("limit"), 200);
  const minCount = toInt(searchParams.get("min"), 2);
  const q = searchParams.get("q") ?? undefined;
  const withTools = toBool(searchParams.get("withTools"));
  const withErrors = toBool(searchParams.get("withErrors"));

  const res = await getUserWordCloud({ days, limit, minCount, q, withTools, withErrors });
  return NextResponse.json(res);
}

