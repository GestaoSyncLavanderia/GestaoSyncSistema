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

  const cycleStats = await db.cycle.groupBy({
    by: ["laundryId"],
    _sum: { totalPaidValue: true, totalValue: true },
    _count: { id: true },
    where: { cycleDate: { gte, lte } },
  });

  const rawMap = Object.fromEntries(
    cycleStats.map((s) => [s.laundryId, s])
  );

  const result = laundries.map((l) => {
    const s = rawMap[l.id];
    const useTotal = l.revenueMetric === "totalValue";
    const revenue = useTotal
      ? (s?._sum.totalValue ?? 0)
      : (s?._sum.totalPaidValue ?? 0);
    const count = s?._count.id ?? 0;
    return {
      ...l,
      stats: {
        totalPaidValue: revenue,
        cyclesCount: count,
        ticketMedio: count > 0 ? revenue / count : 0,
      },
    };
  });

  return NextResponse.json({ laundries: result });
}
