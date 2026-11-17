import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { syncAll } from "@/lib/sync";

export const maxDuration = 300;

// Chamada a cada 30 minutos pelo pg_cron do Supabase (job "painel-sync") e, sob demanda, pelo
// workflow .github/workflows/sync.yml.
export async function GET(req: Request) {
  // Esta rota não passa pelo login, então sem CRON_SECRET configurado ela fica fechada.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
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
