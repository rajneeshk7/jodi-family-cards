import { NextResponse } from "next/server";
import { ApiError, RuleError, ops } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {}
  const op = ops[String(body.op)];
  if (!op) return NextResponse.json({ error: "Unknown request." }, { status: 404 });
  try {
    return NextResponse.json(await op(body));
  } catch (e) {
    if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof RuleError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error(`[rpc:${body.op}]`, e);
    const msg = e instanceof Error && e.message.startsWith("No database") ? e.message : "Something went wrong on the server.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
