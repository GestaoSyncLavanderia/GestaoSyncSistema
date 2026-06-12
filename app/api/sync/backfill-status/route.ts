import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchStatusMap } from "@/lib/sislav-webapp";
import { buildCyclesForLaundry } from "@/lib/sync";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const from = body.from ? new Date(body.from + "T00:00:00Z") : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const to   = body.to   ? new Date(body.to   + "T23:59:59.999Z") : new Date();

  const laundries = await db.laundry.findMany({ select: { id: true, name: true, organizationId: true } });

  const results: Record<string, { mapped: number; emUso: number; concluido: number; error?: string }> = {};

  for (const l of laundries) {
    try {
      const map = await fetchStatusMap(l.id, l.organizationId, from, to);

      const emUso = [...map.entries()].filter(([, v]) => v === "Em uso").map(([k]) => k);
      const concl = [...map.entries()].filter(([, v]) => v === "Concluído").map(([k]) => k);

      if (emUso.length > 0)
        await db.sale.updateMany({ where: { id: { in: emUso } }, data: { status: "Em uso" } });
      if (concl.length > 0)
        await db.sale.updateMany({ where: { id: { in: concl } }, data: { status: "Concluído" } });

      if (map.size > 0)
        await buildCyclesForLaundry(l.id, from);

      results[l.name] = { mapped: map.size, emUso: emUso.length, concluido: concl.length };
    } catch (err: any) {
      results[l.name] = { mapped: 0, emUso: 0, concluido: 0, error: err.message };
    }
  }

  return NextResponse.json({ ok: true, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10), results });
}
