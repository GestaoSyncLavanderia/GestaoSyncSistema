import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncAll } from "@/lib/sync";

export const maxDuration = 300;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { newSales, newCycles, timing, errors } = await syncAll();
    revalidatePath("/dashboard", "layout");
    return NextResponse.json({ ok: true, newSales, newCycles, timing, errors });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
