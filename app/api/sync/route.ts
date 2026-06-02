import { NextResponse } from "next/server";
import { syncAll } from "@/lib/sync";

export async function POST() {
  try {
    const { newSales, newCycles, timing, errors } = await syncAll();
    return NextResponse.json({ ok: true, newSales, newCycles, timing, errors });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
