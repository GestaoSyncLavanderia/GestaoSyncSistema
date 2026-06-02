import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
  subYears,
  endOfDay,
  getDate,
} from "date-fns";

function pct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export async function GET() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterdayStart = startOfDay(subDays(now, 1));
  const yesterdayEnd = endOfDay(subDays(now, 1));
  const monthStart = startOfMonth(now);
  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const prevMonthEnd = endOfDay(subDays(monthStart, 1));
  const yearStart = startOfYear(now);
  const prevYearStart = startOfYear(subYears(now, 1));
  const prevYearEnd = endOfDay(subDays(yearStart, 1));
  const daysElapsed = getDate(now);

  const [
    fatHoje, fatOntem,
    ciclosHoje, ciclosOntem,
    ticketHoje, ticketOntem,
    fatMes, fatMesAnterior,
    fatAno, fatAnoAnterior,
    avgMachinesHoje,
    rankingHoje,
    ciclosMes,
  ] = await Promise.all([
    db.cycle.aggregate({ _sum: { totalValue: true }, where: { cycleDate: { gte: todayStart, lte: todayEnd } } }),
    db.cycle.aggregate({ _sum: { totalValue: true }, where: { cycleDate: { gte: yesterdayStart, lte: yesterdayEnd } } }),
    db.cycle.count({ where: { cycleDate: { gte: todayStart, lte: todayEnd } } }),
    db.cycle.count({ where: { cycleDate: { gte: yesterdayStart, lte: yesterdayEnd } } }),
    db.cycle.aggregate({ _avg: { totalValue: true }, where: { cycleDate: { gte: todayStart, lte: todayEnd } } }),
    db.cycle.aggregate({ _avg: { totalValue: true }, where: { cycleDate: { gte: yesterdayStart, lte: yesterdayEnd } } }),
    db.cycle.aggregate({ _sum: { totalValue: true }, where: { cycleDate: { gte: monthStart } } }),
    db.cycle.aggregate({ _sum: { totalValue: true }, where: { cycleDate: { gte: prevMonthStart, lte: prevMonthEnd } } }),
    db.cycle.aggregate({ _sum: { totalValue: true }, where: { cycleDate: { gte: yearStart } } }),
    db.cycle.aggregate({ _sum: { totalValue: true }, where: { cycleDate: { gte: prevYearStart, lte: prevYearEnd } } }),
    db.cycle.aggregate({ _avg: { machinesCount: true }, where: { cycleDate: { gte: todayStart, lte: todayEnd } } }),
    db.cycle.groupBy({
      by: ["laundryId"],
      _sum: { totalValue: true },
      _count: { id: true },
      where: { cycleDate: { gte: todayStart } },
      orderBy: { _sum: { totalValue: "desc" } },
      take: 5,
    }),
    db.cycle.count({ where: { cycleDate: { gte: monthStart } } }),
  ]);

  const laundryIds = rankingHoje.map((r) => r.laundryId);
  const laundries =
    laundryIds.length > 0
      ? await db.laundry.findMany({
          where: { id: { in: laundryIds } },
          select: { id: true, name: true, city: true, state: true },
        })
      : [];

  const laundryMap = Object.fromEntries(laundries.map((l) => [l.id, l]));
  const distribution = rankingHoje.map((r) => ({
    laundryId: r.laundryId,
    name: laundryMap[r.laundryId]?.name ?? r.laundryId,
    city: laundryMap[r.laundryId]?.city ?? "",
    state: laundryMap[r.laundryId]?.state ?? "",
    total: r._sum.totalValue ?? 0,
    cycles: r._count.id,
  }));

  const fatHojeVal   = fatHoje._sum.totalValue ?? 0;
  const fatOntemVal  = fatOntem._sum.totalValue ?? 0;
  const ticketVal    = ticketHoje._avg.totalValue ?? 0;
  const ticketAntVal = ticketOntem._avg.totalValue ?? 0;
  const fatMesVal    = fatMes._sum.totalValue ?? 0;
  const fatMesAntVal = fatMesAnterior._sum.totalValue ?? 0;
  const fatAnoVal    = fatAno._sum.totalValue ?? 0;
  const fatAnoAntVal = fatAnoAnterior._sum.totalValue ?? 0;
  const mediaDiaria  = daysElapsed > 0 ? fatMesVal / daysElapsed : 0;

  const diasMesAnt = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth() + 1, 0).getDate();
  const mediaDiariaAnt = diasMesAnt > 0 ? fatMesAntVal / diasMesAnt : 0;

  const avgMachinesPerCycle = avgMachinesHoje._avg.machinesCount ?? 0;

  return NextResponse.json({
    kpis: {
      fatHoje:            { value: fatHojeVal },
      ciclosHoje:         { value: ciclosHoje },
      ticketMedio:        { value: ticketVal },
      avgMachinesPerCycle:{ value: avgMachinesPerCycle },
      fatMes:             { value: fatMesVal },
      mediaDiaria:        { value: mediaDiaria },
      fatAno:             { value: fatAnoVal },
      ciclosMes:          { value: ciclosMes },
    },
    distribution,
  });
}
