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

  const [cycleStats, visitData] = await Promise.all([
    db.cycle.groupBy({
      by: ["laundryId"],
      _sum: { totalPaidValue: true, totalValue: true, machinesCount: true },
      where: { cycleDate: { gte, lte } },
    }),
    db.$queryRaw<Array<{ laundryId: string; visits: bigint }>>`
      SELECT "laundryId", COUNT(DISTINCT "customerId"::text || "cycleDate"::text) AS visits
      FROM "Cycle"
      WHERE "cycleDate" >= ${gte} AND "cycleDate" <= ${lte}
      GROUP BY "laundryId"
    `,
  ]);

  const rawMap = Object.fromEntries(cycleStats.map((s) => [s.laundryId, s]));
  const visitMap = Object.fromEntries(visitData.map((v) => [v.laundryId, Number(v.visits)]));

  const result = laundries.map((l) => {
    const s = rawMap[l.id];
    const useTotal = l.revenueMetric === "totalValue";
    const revenue = useTotal
      ? (s?._sum.totalValue ?? 0)
      : (s?._sum.totalPaidValue ?? 0);
    const machinesCount = Number(s?._sum.machinesCount ?? 0);
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
