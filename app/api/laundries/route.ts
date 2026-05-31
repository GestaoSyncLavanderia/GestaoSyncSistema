import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subDays, startOfDay, endOfDay } from "date-fns";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const gte = fromParam ? startOfDay(new Date(fromParam)) : startOfDay(subDays(new Date(), 29));
  const lte = toParam ? endOfDay(new Date(toParam)) : new Date();

  const laundries = await db.laundry.findMany({ orderBy: { name: "asc" } });

  const cycleStats = await db.cycle.groupBy({
    by: ["laundryId"],
    _sum: { totalPaidValue: true },
    _count: { id: true },
    where: { cycleDate: { gte, lte } },
  });

  const statsMap = Object.fromEntries(
    cycleStats.map((s) => [
      s.laundryId,
      {
        totalPaidValue: s._sum.totalPaidValue ?? 0,
        cyclesCount: s._count.id,
        ticketMedio:
          s._count.id > 0 ? (s._sum.totalPaidValue ?? 0) / s._count.id : 0,
      },
    ])
  );

  const result = laundries.map((l) => ({
    ...l,
    stats: statsMap[l.id] ?? { totalPaidValue: 0, cyclesCount: 0, ticketMedio: 0 },
  }));

  return NextResponse.json({ laundries: result });
}
