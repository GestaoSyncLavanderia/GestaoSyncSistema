import { NextRequest, NextResponse } from "next/server";
import { reconcileDay } from "@/lib/reconcile";

export const maxDuration = 300;

// Batimento diário com o SisLav, chamado por .github/workflows/reconcile.yml.
// ?day=AAAA-MM-DD confere um dia específico; sem ele, confere ontem.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const day = req.nextUrl.searchParams.get("day") ?? undefined;
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: "day deve ser AAAA-MM-DD" }, { status: 400 });
  }

  try {
    const result = await reconcileDay(day);
    return NextResponse.json({ ok: result.differences.length === 0 && result.errors.length === 0, ...result });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
