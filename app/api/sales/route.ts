import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startOfDay, endOfDay, subDays, eachDayOfInterval, format } from "date-fns";

const PAYMENT_LABELS: Record<string, string> = {
  PIX: "PIX",
  CREDIT: "Crédito",
  DEBIT: "Débito",
  BALANCE: "Saldo",
};

const MACHINE_LABELS: Record<string, string> = {
  WASHER: "Lavadora",
  DRYER: "Secadora",
};

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const laundryId     = searchParams.get("laundryId");
  const paymentMethod = searchParams.get("paymentMethod");
  const from          = searchParams.get("from");
  const to            = searchParams.get("to");
  const page          = parseInt(searchParams.get("page") ?? "1");
  const limit         = parseInt(searchParams.get("limit") ?? "20");

  const where: any = {};
  if (laundryId)     where.laundryId     = laundryId;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (from || to) {
    where.cycleDate = {};
    if (from) where.cycleDate.gte = new Date(from + "T00:00:00Z");
    if (to)   where.cycleDate.lte = new Date(to   + "T23:59:59.999Z");
  }

  const distribWhere: any = {};
  if (laundryId) distribWhere.laundryId = laundryId;
  if (from || to) {
    distribWhere.cycleDate = {};
    if (from) distribWhere.cycleDate.gte = new Date(from + "T00:00:00Z");
    if (to)   distribWhere.cycleDate.lte = new Date(to   + "T23:59:59.999Z");
  }

  const [cycles, total, agg, avgMachines, paymentGroups, machineGroups] = await Promise.all([
    db.cycle.findMany({
      where,
      include: {
        laundry:  { select: { name: true } },
        customer: { select: { name: true } },
      },
      orderBy: { cycleDate: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.cycle.count({ where }),
    db.cycle.aggregate({
      where,
      _sum: { totalPaidValue: true },
      _count: { id: true },
    }),
    db.cycle.aggregate({
      where,
      _avg: { machinesCount: true },
    }),
    db.cycle.groupBy({
      by: ["paymentMethod"],
      where: distribWhere,
      _sum: { totalPaidValue: true },
      _count: { id: true },
      orderBy: { _sum: { totalPaidValue: "desc" } },
    }),
    db.cycle.groupBy({
      by: ["machineType"],
      where: distribWhere,
      _sum: { totalPaidValue: true },
      _count: { id: true },
      orderBy: { _sum: { totalPaidValue: "desc" } },
    }),
  ]);

  const dailyFrom = from ? new Date(from + "T00:00:00Z") : subDays(new Date(), 29);
  const dailyTo   = to   ? new Date(to + "T23:59:59.999Z") : new Date();
  const dailyWhere: any = { cycleDate: { gte: dailyFrom, lte: dailyTo } };
  if (laundryId) dailyWhere.laundryId = laundryId;

  const dailyRaw = await db.cycle.groupBy({
    by: ["cycleDate"],
    _sum: { totalPaidValue: true },
    _count: { id: true },
    where: dailyWhere,
    orderBy: { cycleDate: "asc" },
  });

  const dailyMap = new Map(
    dailyRaw.map((d) => [
      format(d.cycleDate, "yyyy-MM-dd"),
      { total: d._sum.totalPaidValue ?? 0, cycles: d._count.id },
    ])
  );

  const interval = eachDayOfInterval({ start: dailyFrom, end: dailyTo });
  const dailyEvolution = interval.map((day) => {
    const key = format(day, "yyyy-MM-dd");
    return {
      date: key,
      total: dailyMap.get(key)?.total ?? 0,
      cycles: dailyMap.get(key)?.cycles ?? 0,
    };
  });

  const totalDistrib = paymentGroups.reduce((s, g) => s + (g._sum.totalPaidValue ?? 0), 0) || 1;
  const totalMachine = machineGroups.reduce((s, g) => s + (g._sum.totalPaidValue ?? 0), 0) || 1;

  const byPayment = paymentGroups.map((g) => {
    const val = g._sum.totalPaidValue ?? 0;
    return {
      method: g.paymentMethod,
      label:  PAYMENT_LABELS[g.paymentMethod] ?? g.paymentMethod,
      total:  val,
      count:  g._count.id,
      pct:    Math.round((val / totalDistrib) * 100),
    };
  });

  const byMachineType = machineGroups.map((g) => {
    const val = g._sum.totalPaidValue ?? 0;
    return {
      type:  g.machineType,
      label: MACHINE_LABELS[g.machineType] ?? g.machineType,
      total: val,
      count: g._count.id,
      pct:   Math.round((val / totalMachine) * 100),
    };
  });

  const ticketMedio =
    agg._count.id > 0 ? (agg._sum.totalPaidValue ?? 0) / agg._count.id : 0;

  return NextResponse.json({
    cycles,
    total,
    page,
    limit,
    agg: {
      totalPaidValue: agg._sum.totalPaidValue ?? 0,
      count: agg._count.id,
      ticketMedio,
      avgMachines: avgMachines._avg.machinesCount ?? 0,
    },
    byPayment,
    byMachineType,
    dailyEvolution,
  });
}
