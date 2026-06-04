import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncAll } from "@/lib/sync";

export const maxDuration = 3600;

export async function POST() {
  try {
    const { newSales, newCycles, timing, errors } = await syncAll();
    revalidatePath("/dashboard", "layout");
    return NextResponse.json({ ok: true, newSales, newCycles, timing, errors });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
