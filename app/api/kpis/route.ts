import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function pct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// Converte "agora" para componentes de data no fuso Brasil (UTC-3),
// igual ao brazilDayUTC de lib/sync.ts — garante consistência independente do fuso do servidor.
function brazilDateComponents() {
  const now = new Date();
  const ms = now.getTime() - 3 * 60 * 60 * 1000;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate() };
}

function utcMidnight(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day));
}
function utcEndOfDay(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
}

export async function GET() {
  const { year, month, day } = brazilDateComponents();

  const todayStart     = utcMidnight(year, month, day);
  const todayEnd       = utcEndOfDay(year, month, day);
  const yesterdayStart = utcMidnight(year, month, day - 1);
  const yesterdayEnd   = utcEndOfDay(year, month, day - 1);
  const monthStart     = utcMidnight(year, month, 1);
  const prevMonthStart = utcMidnight(year, month - 1, 1);
  const prevMonthEnd   = utcEndOfDay(year, month, 0); // dia 0 = último dia do mês anterior
  const yearStart      = utcMidnight(year, 0, 1);
  const prevYearStart  = utcMidnight(year - 1, 0, 1);
  const prevYearEnd    = utcEndOfDay(year - 1, 11, 31);
  const daysElapsed    = day;

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
    db.cycle.aggregate({ _sum: { totalPaidValue: true }, where: { cycleDate: { gte: todayStart, lte: todayEnd } } }),
    db.cycle.aggregate({ _sum: { totalPaidValue: true }, where: { cycleDate: { gte: yesterdayStart, lte: yesterdayEnd } } }),
    db.cycle.count({ where: { cycleDate: { gte: todayStart, lte: todayEnd } } }),
    db.cycle.count({ where: { cycleDate: { gte: yesterdayStart, lte: yesterdayEnd } } }),
    db.cycle.aggregate({ _avg: { totalPaidValue: true }, where: { cycleDate: { gte: todayStart, lte: todayEnd } } }),
    db.cycle.aggregate({ _avg: { totalPaidValue: true }, where: { cycleDate: { gte: yesterdayStart, lte: yesterdayEnd } } }),
    db.cycle.aggregate({ _sum: { totalPaidValue: true }, where: { cycleDate: { gte: monthStart } } }),
    db.cycle.aggregate({ _sum: { totalPaidValue: true }, where: { cycleDate: { gte: prevMonthStart, lte: prevMonthEnd } } }),
    db.cycle.aggregate({ _sum: { totalPaidValue: true }, where: { cycleDate: { gte: yearStart } } }),
    db.cycle.aggregate({ _sum: { totalPaidValue: true }, where: { cycleDate: { gte: prevYearStart, lte: prevYearEnd } } }),
    db.cycle.aggregate({ _avg: { machinesCount: true }, where: { cycleDate: { gte: todayStart, lte: todayEnd } } }),
    db.cycle.groupBy({
      by: ["laundryId"],
      _sum: { totalPaidValue: true },
      _count: { id: true },
      where: { cycleDate: { gte: todayStart } },
      orderBy: { _sum: { totalPaidValue: "desc" } },
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
    total: r._sum.totalPaidValue ?? 0,
    cycles: r._count.id,
  }));

  const fatHojeVal   = fatHoje._sum.totalPaidValue ?? 0;
  const fatOntemVal  = fatOntem._sum.totalPaidValue ?? 0;
  const ticketVal    = ticketHoje._avg.totalPaidValue ?? 0;
  const ticketAntVal = ticketOntem._avg.totalPaidValue ?? 0;
  const fatMesVal    = fatMes._sum.totalPaidValue ?? 0;
  const fatMesAntVal = fatMesAnterior._sum.totalPaidValue ?? 0;
  const fatAnoVal    = fatAno._sum.totalPaidValue ?? 0;
  const fatAnoAntVal = fatAnoAnterior._sum.totalPaidValue ?? 0;
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
