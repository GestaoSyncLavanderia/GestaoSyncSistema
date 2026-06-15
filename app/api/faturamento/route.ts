import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// "YYYY-MM-DD" (Brazil date) → UTC range covering that full Brazil day
function toUtcRange(from: string, to: string) {
  const gte = new Date(from + "T03:00:00.000Z");
  const lt  = new Date(to   + "T03:00:00.000Z");
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from") ?? "2020-01-01";
  const to   = searchParams.get("to")   ?? new Date().toISOString().slice(0, 10);
  const { gte, lt } = toUtcRange(from, to);

  // paidValue: dinheiro efetivamente recebido (BALANCE paidValue=0, excluído automaticamente)
  // Inclui vendas "Em uso" — espelha aba Dashboard do SisLav
  const saleWhere = { date: { gte, lt }, machineType: { not: "" } };

  const [agg, byLaundryRaw, dailyRaw] = await Promise.all([
    db.sale.aggregate({
      where: saleWhere,
      _sum: { paidValue: true },
      _count: { _all: true },
    }),
    db.sale.groupBy({
      by: ["laundryId"],
      where: saleWhere,
      _sum: { paidValue: true },
      _count: { _all: true },
      orderBy: { _sum: { paidValue: "desc" } },
    }),
    db.$queryRaw<Array<{ sale_date: Date; total: number; count: bigint }>>`
      SELECT
        DATE(s.date AT TIME ZONE 'America/Sao_Paulo') AS sale_date,
        COALESCE(SUM(s."paidValue"), 0)::float8          AS total,
        COUNT(*)::int8                                    AS count
      FROM "Sale" s
      WHERE s.date >= ${gte} AND s.date < ${lt}
        AND s."machineType" != ''
      GROUP BY DATE(s.date AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY sale_date ASC
    `,
  ]);

  const laundryIds = byLaundryRaw.map((r) => r.laundryId);
  const laundries =
    laundryIds.length > 0
      ? await db.laundry.findMany({
          where: { id: { in: laundryIds } },
          select: { id: true, name: true, city: true, state: true, street: true, neighborhood: true, ownerName: true },
        })
      : [];
  const laundryMap = Object.fromEntries(laundries.map((l) => [l.id, l]));

  const total      = agg._sum.paidValue ?? 0;
  const count      = agg._count._all;
  const ticketMedio = count > 0 ? total / count : 0;

  const ranking = byLaundryRaw.map((r, i) => {
    const l = laundryMap[r.laundryId];
    const unitTotal = r._sum.paidValue ?? 0;
    const unitCount = r._count._all;
    return {
      position:     i + 1,
      laundryId:    r.laundryId,
      name:         l?.name         ?? r.laundryId,
      city:         l?.city         ?? "",
      state:        l?.state        ?? "",
      street:       l?.street       ?? "",
      neighborhood: l?.neighborhood ?? "",
      ownerName:    l?.ownerName    ?? "",
      total:        unitTotal,
      count:        unitCount,
      ticketMedio:  unitCount > 0 ? unitTotal / unitCount : 0,
    };
  });

  const dailyEvolution = dailyRaw.map((d) => ({
    date:  d.sale_date.toISOString().slice(0, 10),
    total: d.total,
    count: Number(d.count),
  }));

  return NextResponse.json({ total, count, ticketMedio, ranking, dailyEvolution });
}
