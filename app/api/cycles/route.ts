import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subDays, startOfDay, endOfDay, format, getDay } from "date-fns";

const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const fromParam = searchParams.get("from");
  const toParam   = searchParams.get("to");

  const gte = fromParam ? startOfDay(new Date(fromParam)) : startOfDay(subDays(new Date(), 29));
  const lte = toParam   ? endOfDay(new Date(toParam))     : new Date();
  const where = { cycleDate: { gte, lte } };

  const days = Math.max(1, Math.round((lte.getTime() - gte.getTime()) / 86400000) + 1);

  const [totalCount, avgAgg, avgWasherAgg, avgDryerAgg, allCycles, unitGroups, laundries, avgByUnit] = await Promise.all([
    db.cycle.count({ where }),
    db.cycle.aggregate({ _avg: { machinesCount: true }, where }),
    db.cycle.aggregate({ _avg: { machinesCount: true }, where: { ...where, machineType: "WASHER" } }),
    db.cycle.aggregate({ _avg: { machinesCount: true }, where: { ...where, machineType: "DRYER"  } }),
    db.cycle.findMany({
      where,
      select: { cycleDate: true, machineType: true, laundryId: true },
    }),
    db.cycle.groupBy({
      by: ["laundryId", "machineType"],
      where,
      _count: { id: true },
    }),
    db.laundry.findMany({ select: { id: true, name: true } }),
    db.cycle.groupBy({
      by: ["laundryId"],
      where,
      _avg: { machinesCount: true },
      orderBy: { _avg: { machinesCount: "desc" } },
    }),
  ]);

  // byDay — group by date string
  const dayMap = new Map<string, { count: number; washer: number; dryer: number }>();
  const dowCounts = new Array(7).fill(0);

  for (const c of allCycles) {
    const dateStr = format(c.cycleDate, "yyyy-MM-dd");
    if (!dayMap.has(dateStr)) dayMap.set(dateStr, { count: 0, washer: 0, dryer: 0 });
    const d = dayMap.get(dateStr)!;
    d.count++;
    if (c.machineType === "WASHER") d.washer++; else d.dryer++;
    dowCounts[getDay(c.cycleDate)]++;
  }

  const byDay = Array.from(dayMap.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const byDayOfWeek = dowCounts.map((count, dow) => ({
    dow,
    label: DOW_LABELS[dow],
    count,
  }));

  // byUnit — merge WASHER + DRYER counts per laundry
  const laundryNameMap = Object.fromEntries(laundries.map((l) => [l.id, l.name]));
  const unitMap = new Map<string, { count: number; washer: number; dryer: number }>();
  for (const g of unitGroups) {
    if (!unitMap.has(g.laundryId)) unitMap.set(g.laundryId, { count: 0, washer: 0, dryer: 0 });
    const u = unitMap.get(g.laundryId)!;
    u.count += g._count.id;
    if (g.machineType === "WASHER") u.washer += g._count.id; else u.dryer += g._count.id;
  }
  const byUnit = Array.from(unitMap.entries())
    .map(([laundryId, v]) => ({ laundryId, name: laundryNameMap[laundryId] ?? laundryId, ...v }))
    .sort((a, b) => b.count - a.count);

  const byMachineType = {
    WASHER: byUnit.reduce((s, u) => s + u.washer, 0),
    DRYER:  byUnit.reduce((s, u) => s + u.dryer,  0),
  };

  const avgMachinesByUnit = avgByUnit.map((r) => ({
    laundryId:   r.laundryId,
    name:        laundryNameMap[r.laundryId] ?? r.laundryId,
    avgMachines: Number((r._avg.machinesCount ?? 0).toFixed(2)),
  }));

  return NextResponse.json({
    total: totalCount,
    avgPerDay: totalCount / days,
    avgMachines:       avgAgg._avg.machinesCount       ?? 0,
    avgMachinesWasher: avgWasherAgg._avg.machinesCount ?? 0,
    avgMachinesDryer:  avgDryerAgg._avg.machinesCount  ?? 0,
    byDay,
    byDayOfWeek,
    byUnit,
    byMachineType,
    avgMachinesByUnit,
  });
}
