import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subDays, startOfDay, endOfDay } from "date-fns";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const gte = fromParam ? new Date(fromParam + "T00:00:00Z") : startOfDay(subDays(new Date(), 29));
  const lte = toParam ? new Date(toParam + "T23:59:59.999Z") : new Date();

  const laundries = await db.laundry.findMany({ orderBy: { name: "asc" } });

  // IDs de unidades que usam totalValue excluindo BALANCE (receita de saldo já foi contabilizada no carregamento)
  const nonBalanceIds = laundries
    .filter((l) => l.revenueMetric === "totalValueNonBalance")
    .map((l) => l.id);

  // IDs de unidades que usam paidValue — precisam somar BALANCE_PURCHASE separadamente
  const paidValueIds = laundries
    .filter((l) => l.revenueMetric === "paidValue")
    .map((l) => l.id);

  const [cycleStats, nonBalanceStats, bpStats, visitData] = await Promise.all([
    db.cycle.groupBy({
      by: ["laundryId"],
      _sum: { totalPaidValue: true, totalValue: true, machinesCount: true },
      where: { cycleDate: { gte, lte }, status: { not: "Em uso" }, machineType: { not: "" } },
    }),
    nonBalanceIds.length > 0
      ? db.cycle.groupBy({
          by: ["laundryId"],
          _sum: { totalValue: true, machinesCount: true },
          where: {
            cycleDate: { gte, lte },
            paymentMethod: { not: "BALANCE" },
            laundryId: { in: nonBalanceIds },
            status: { not: "Em uso" },
            machineType: { not: "" },
          },
        })
      : Promise.resolve([]),
    // BALANCE_PURCHASE (machineType='') para unidades com paidValue — dinheiro recebido nas recargas
    paidValueIds.length > 0
      ? db.cycle.groupBy({
          by: ["laundryId"],
          _sum: { totalPaidValue: true },
          where: {
            cycleDate: { gte, lte },
            status: { not: "Em uso" },
            machineType: "",
            laundryId: { in: paidValueIds },
          },
        })
      : Promise.resolve([]),
    db.$queryRaw<Array<{ laundryId: string; visits: bigint }>>`
      SELECT "laundryId", COUNT(DISTINCT "customerId"::text || "cycleDate"::text) AS visits
      FROM "Cycle"
      WHERE "cycleDate" >= ${gte} AND "cycleDate" <= ${lte}
      AND ("status" IS NULL OR "status" != 'Em uso')
      AND "machineType" != ''
      GROUP BY "laundryId"
    `,
  ]);

  const rawMap        = Object.fromEntries(cycleStats.map((s) => [s.laundryId, s]));
  const nonBalanceMap = Object.fromEntries(nonBalanceStats.map((s) => [s.laundryId, s]));
  const bpMap         = Object.fromEntries(bpStats.map((s) => [s.laundryId, s]));
  const visitMap      = Object.fromEntries(visitData.map((v) => [v.laundryId, Number(v.visits)]));

  const result = laundries.map((l) => {
    const s  = rawMap[l.id];
    const nb = nonBalanceMap[l.id];

    let revenue: number;
    let machinesCount: number;

    if (l.revenueMetric === "totalValueNonBalance") {
      revenue       = Number(nb?._sum.totalValue    ?? 0);
      machinesCount = Number(s?._sum.machinesCount  ?? 0);
    } else if (l.revenueMetric === "totalValue") {
      revenue       = Number(s?._sum.totalValue    ?? 0);
      machinesCount = Number(s?._sum.machinesCount ?? 0);
    } else {
      // paidValue: soma SALE paidValue + BALANCE_PURCHASE paidValue (dinheiro efetivamente recebido)
      const bp = bpMap[l.id];
      revenue       = Number(s?._sum.totalPaidValue ?? 0) + Number(bp?._sum.totalPaidValue ?? 0);
      machinesCount = Number(s?._sum.machinesCount  ?? 0);
    }

    const visits = visitMap[l.id] ?? 0;
    return {
      ...l,
      stats: {
        totalPaidValue: revenue,
        cyclesCount: machinesCount,
        ticketMedio: visits > 0 ? revenue / visits : 0,
      },
    };
  });

  return NextResponse.json({ laundries: result });
}
