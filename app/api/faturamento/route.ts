import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Faturamento espelha a aba Dashboard do SisLav. Os números vêm de DashboardDay, um resumo por
// unidade e por dia calculado a partir dos mesmos dados e com a mesma fórmula do Dashboard
// (lib/sislav-dashboard.ts). O dia já vem fechado como o SisLav fecha, então aqui não há regra
// por unidade: basta somar os dias do período.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from") ?? "2020-01-01";
  const to   = searchParams.get("to")   ?? new Date().toISOString().slice(0, 10);
  const where = {
    day: { gte: new Date(`${from}T00:00:00.000Z`), lte: new Date(`${to}T00:00:00.000Z`) },
  };

  const [byLaundry, byDay, laundries] = await Promise.all([
    db.dashboardDay.groupBy({ by: ["laundryId"], where, _sum: { revenue: true, cycles: true } }),
    db.dashboardDay.groupBy({ by: ["day"], where, _sum: { revenue: true, cycles: true }, orderBy: { day: "asc" } }),
    db.laundry.findMany({
      select: { id: true, name: true, city: true, state: true, street: true, neighborhood: true, ownerName: true },
    }),
  ]);

  const laundryMap = new Map(laundries.map((l) => [l.id, l]));

  const ranking = byLaundry
    .map((r) => ({ laundryId: r.laundryId, total: r._sum.revenue ?? 0, count: r._sum.cycles ?? 0 }))
    .sort((a, b) => b.total - a.total)
    .map((r, i) => {
      const l = laundryMap.get(r.laundryId);
      return {
        position:     i + 1,
        laundryId:    r.laundryId,
        name:         l?.name         ?? r.laundryId,
        city:         l?.city         ?? "",
        state:        l?.state        ?? "",
        street:       l?.street       ?? "",
        neighborhood: l?.neighborhood ?? "",
        ownerName:    l?.ownerName    ?? "",
        total:        r.total,
        count:        r.count,
        ticketMedio:  r.count > 0 ? r.total / r.count : 0,
      };
    });

  const dailyEvolution = byDay.map((d) => ({
    date:  d.day.toISOString().slice(0, 10),
    total: d._sum.revenue ?? 0,
    count: d._sum.cycles ?? 0,
  }));

  const total = ranking.reduce((sum, r) => sum + r.total, 0);
  const count = ranking.reduce((sum, r) => sum + r.count, 0);
  const ticketMedio = count > 0 ? total / count : 0;

  return NextResponse.json({ total, count, ticketMedio, ranking, dailyEvolution });
}
