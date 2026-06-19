import { NextResponse } from "next/server";
import { db } from "@/lib/db";

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

// Soma faturamento pela tabela Cycle, respeitando o revenueMetric de cada unidade.
async function revenueForPeriod(gte: Date, lte: Date): Promise<number> {
  const rows = await db.$queryRaw<[{ rev: number }]>`
    SELECT COALESCE(SUM(
      CASE l."revenueMetric"
        WHEN 'totalValue' THEN
          CASE WHEN c."machineType" != '' THEN c."totalValue" ELSE 0 END
        WHEN 'paidValue' THEN
          c."totalPaidValue"
        ELSE
          CASE WHEN c."machineType" != '' AND c."paymentMethod" != 'BALANCE' THEN c."totalValue" ELSE 0 END
      END
    ), 0)::float8 AS rev
    FROM "Cycle" c
    JOIN "Laundry" l ON l.id = c."laundryId"
    WHERE c."cycleDate" >= ${gte} AND c."cycleDate" <= ${lte}
    AND (c."status" IS NULL OR c."status" != 'Em uso')
  `;
  return rows[0]?.rev ?? 0;
}

export async function GET() {
  const { year, month, day } = brazilDateComponents();

  const todayStart     = utcMidnight(year, month, day);
  const todayEnd       = utcEndOfDay(year, month, day);
  const monthStart     = utcMidnight(year, month, 1);
  const monthEnd       = utcEndOfDay(year, month + 1, 0); // último dia do mês atual
  const yearStart      = utcMidnight(year, 0, 1);
  const yearEnd        = utcEndOfDay(year, 11, 31);
  const daysElapsed    = day;

  const [
    fatHojeVal,
    fatMesVal,
    fatAnoVal,
    machinesCountHojeAgg,
    visitsHoje,
    avgMachinesHoje,
    rankingHoje,
    machinesCountMesAgg,
  ] = await Promise.all([
    revenueForPeriod(todayStart, todayEnd),
    revenueForPeriod(monthStart, monthEnd),
    revenueForPeriod(yearStart,  yearEnd),
    db.cycle.aggregate({ _sum: { machinesCount: true }, where: { cycleDate: { gte: todayStart, lte: todayEnd }, status: { not: "Em uso" }, machineType: { not: "" } } }),
    db.$queryRaw<[{ visits: bigint }]>`
      SELECT COUNT(DISTINCT "customerId"::text || "cycleDate"::text) AS visits
      FROM "Cycle"
      WHERE "cycleDate" >= ${todayStart} AND "cycleDate" <= ${todayEnd}
      AND ("status" IS NULL OR "status" != 'Em uso')
      AND "machineType" != ''
    `,
    db.cycle.aggregate({ _avg: { machinesCount: true }, where: { cycleDate: { gte: todayStart, lte: todayEnd }, status: { not: "Em uso" }, machineType: { not: "" } } }),
    db.$queryRaw<Array<{ laundryId: string; total: number; cycles: number }>>`
      SELECT
        c."laundryId",
        COALESCE(SUM(
          CASE l."revenueMetric"
            WHEN 'totalValue' THEN c."totalValue"
            WHEN 'paidValue'  THEN c."totalPaidValue"
            ELSE CASE WHEN c."paymentMethod" != 'BALANCE' THEN c."totalValue" ELSE 0 END
          END
        ), 0)::float8 AS total,
        SUM(c."machinesCount")::int AS cycles
      FROM "Cycle" c
      JOIN "Laundry" l ON l.id = c."laundryId"
      WHERE c."cycleDate" >= ${todayStart} AND c."cycleDate" <= ${todayEnd}
      AND (c."status" IS NULL OR c."status" != 'Em uso')
      AND c."machineType" != ''
      GROUP BY c."laundryId"
      ORDER BY total DESC
      LIMIT 5
    `,
    db.cycle.aggregate({ _sum: { machinesCount: true }, where: { cycleDate: { gte: monthStart, lte: monthEnd }, status: { not: "Em uso" }, machineType: { not: "" } } }),
  ]);

  const laundryIds = rankingHoje.map((r) => r.laundryId);
  const laundries  =
    laundryIds.length > 0
      ? await db.laundry.findMany({
          where: { id: { in: laundryIds } },
          select: { id: true, name: true, city: true, state: true },
        })
      : [];

  const laundryMap = Object.fromEntries(laundries.map((l) => [l.id, l]));
  const distribution = rankingHoje.map((r) => ({
    laundryId: r.laundryId,
    name:  laundryMap[r.laundryId]?.name  ?? r.laundryId,
    city:  laundryMap[r.laundryId]?.city  ?? "",
    state: laundryMap[r.laundryId]?.state ?? "",
    total:  r.total,
    cycles: r.cycles,
  }));

  const ciclosHoje  = machinesCountHojeAgg._sum.machinesCount ?? 0;
  const visitsHojeN = Number(visitsHoje[0]?.visits ?? 0);
  const ticketVal   = visitsHojeN > 0 ? fatHojeVal / visitsHojeN : 0;
  const mediaDiaria = daysElapsed > 0 ? fatMesVal / daysElapsed : 0;
  const avgMachinesPerCycle = avgMachinesHoje._avg.machinesCount ?? 0;

  return NextResponse.json({
    kpis: {
      fatHoje:             { value: fatHojeVal },
      ciclosHoje:          { value: ciclosHoje },
      ticketMedio:         { value: ticketVal },
      avgMachinesPerCycle: { value: avgMachinesPerCycle },
      fatMes:              { value: fatMesVal },
      mediaDiaria:         { value: mediaDiaria },
      fatAno:              { value: fatAnoVal },
      ciclosMes:           { value: machinesCountMesAgg._sum.machinesCount ?? 0 },
    },
    distribution,
  });
}
