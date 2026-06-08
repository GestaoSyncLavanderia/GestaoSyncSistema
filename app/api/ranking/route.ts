import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startOfDay, startOfMonth } from "date-fns";

export async function GET(req: NextRequest) {
  const period = req.nextUrl.searchParams.get("period") ?? "today";
  const gte = period === "month" ? startOfMonth(new Date()) : startOfDay(new Date());

  const grouped = await db.cycle.groupBy({
    by: ["laundryId"],
    _sum: { totalPaidValue: true, machinesCount: true },
    where: { cycleDate: { gte } },
    orderBy: { _sum: { totalPaidValue: "desc" } },
  });

  const laundryIds = grouped.map((r) => r.laundryId);
  const laundries =
    laundryIds.length > 0
      ? await db.laundry.findMany({
          where: { id: { in: laundryIds } },
          select: { id: true, name: true, city: true, state: true },
        })
      : [];

  const laundryMap = Object.fromEntries(laundries.map((l) => [l.id, l]));

  const ranking = grouped.map((r, i) => ({
    position: i + 1,
    laundryId: r.laundryId,
    name: laundryMap[r.laundryId]?.name ?? r.laundryId,
    city: laundryMap[r.laundryId]?.city ?? "",
    state: laundryMap[r.laundryId]?.state ?? "",
    total: r._sum.totalPaidValue ?? 0,
    cycles: Number(r._sum.machinesCount ?? 0),
  }));

  return NextResponse.json({ ranking });
}
