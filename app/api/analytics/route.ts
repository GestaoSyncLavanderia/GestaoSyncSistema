import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startOfDay, endOfDay, subDays, differenceInDays, format, eachDayOfInterval } from "date-fns";

const DOW_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function fillHours(rows: Array<{ hour: number; total: number; count: number }>) {
  const map = new Map(rows.map((r) => [r.hour, r]));
  return Array.from({ length: 24 }, (_, h) => ({
    label: `${String(h).padStart(2, "0")}h`,
    hour: h,
    total: Number(map.get(h)?.total ?? 0),
    count: Number(map.get(h)?.count ?? 0),
  }));
}

function fillWeekdays(rows: Array<{ dow: number; total: number; count: number }>) {
  const map = new Map(rows.map((r) => [r.dow, r]));
  return Array.from({ length: 7 }, (_, d) => ({
    label: DOW_LABELS[d],
    dow: d,
    total: Number(map.get(d)?.total ?? 0),
    count: Number(map.get(d)?.count ?? 0),
  }));
}

async function queryDailyTotals(
  dateFrom: Date,
  dateTo: Date,
  laundryId: string | null
): Promise<Array<{ date: string; total: number; count: number }>> {
  const rows: Array<{ day: Date; total: number; count: bigint }> = laundryId
    ? await db.$queryRaw`
        SELECT
          DATE_TRUNC('day', "cycleDate" AT TIME ZONE 'America/Sao_Paulo') AS day,
          COALESCE(SUM("totalPaidValue"), 0)::float AS total,
          COUNT(*)                                  AS count
        FROM "Cycle"
        WHERE "cycleDate" >= ${dateFrom} AND "cycleDate" <= ${dateTo}
          AND "laundryId" = ${laundryId}
        GROUP BY day
        ORDER BY day`
    : await db.$queryRaw`
        SELECT
          DATE_TRUNC('day', "cycleDate" AT TIME ZONE 'America/Sao_Paulo') AS day,
          COALESCE(SUM("totalPaidValue"), 0)::float AS total,
          COUNT(*)                                  AS count
        FROM "Cycle"
        WHERE "cycleDate" >= ${dateFrom} AND "cycleDate" <= ${dateTo}
        GROUP BY day
        ORDER BY day`;

  const map = new Map(rows.map((r) => [format(r.day, "yyyy-MM-dd"), r]));
  return eachDayOfInterval({ start: dateFrom, end: dateTo }).map((day) => {
    const key = format(day, "yyyy-MM-dd");
    return { date: key, total: Number(map.get(key)?.total ?? 0), count: Number(map.get(key)?.count ?? 0) };
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const laundryId = searchParams.get("laundryId");
  const from = searchParams.get("from");
  const to   = searchParams.get("to");

  const dateFrom = from ? startOfDay(new Date(from)) : startOfDay(subDays(new Date(), 29));
  const dateTo   = to   ? endOfDay(new Date(to))     : new Date();

  // Período anterior: mesmo número de dias, imediatamente antes de dateFrom
  const days = differenceInDays(dateTo, dateFrom) + 1;
  const prevFrom = startOfDay(subDays(dateFrom, days));
  const prevTo   = endOfDay(subDays(dateFrom, 1));

  // Horários de pico — tabela Sale
  const peakHoursRaw: Array<{ hour: number; total: number; count: bigint }> = laundryId
    ? await db.$queryRaw`
        SELECT
          EXTRACT(HOUR FROM date AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
          COALESCE(SUM("paidValue"), 0)::float AS total,
          COUNT(*) AS count
        FROM "Sale"
        WHERE date >= ${dateFrom} AND date <= ${dateTo}
          AND "laundryId" = ${laundryId}
        GROUP BY hour ORDER BY hour`
    : await db.$queryRaw`
        SELECT
          EXTRACT(HOUR FROM date AT TIME ZONE 'America/Sao_Paulo')::int AS hour,
          COALESCE(SUM("paidValue"), 0)::float AS total,
          COUNT(*) AS count
        FROM "Sale"
        WHERE date >= ${dateFrom} AND date <= ${dateTo}
        GROUP BY hour ORDER BY hour`;

  // Dias da semana — tabela Cycle
  const weekdaysRaw: Array<{ dow: number; total: number; count: bigint }> = laundryId
    ? await db.$queryRaw`
        SELECT
          EXTRACT(DOW FROM "cycleDate" AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
          COALESCE(SUM("totalPaidValue"), 0)::float AS total,
          COUNT(*) AS count
        FROM "Cycle"
        WHERE "cycleDate" >= ${dateFrom} AND "cycleDate" <= ${dateTo}
          AND "laundryId" = ${laundryId}
        GROUP BY dow ORDER BY dow`
    : await db.$queryRaw`
        SELECT
          EXTRACT(DOW FROM "cycleDate" AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
          COALESCE(SUM("totalPaidValue"), 0)::float AS total,
          COUNT(*) AS count
        FROM "Cycle"
        WHERE "cycleDate" >= ${dateFrom} AND "cycleDate" <= ${dateTo}
        GROUP BY dow ORDER BY dow`;

  // Comparativo: séries diárias do período atual e do período anterior
  const [currentSeries, prevSeries] = await Promise.all([
    queryDailyTotals(dateFrom, dateTo, laundryId),
    queryDailyTotals(prevFrom, prevTo, laundryId),
  ]);

  // Alinha as duas séries por índice relativo (dia 1, dia 2…)
  const comparison = currentSeries.map((cur, i) => ({
    day: i + 1,
    label: `Dia ${i + 1}`,
    current: cur.total,
    currentCycles: cur.count,
    previous: prevSeries[i]?.total ?? 0,
    previousCycles: prevSeries[i]?.count ?? 0,
  }));

  // Totais para o resumo
  const currentTotal  = currentSeries.reduce((s, r) => s + r.total, 0);
  const previousTotal = prevSeries.reduce((s, r) => s + r.total, 0);
  const changePct =
    previousTotal > 0 ? Math.round(((currentTotal - previousTotal) / previousTotal) * 100) : null;

  return NextResponse.json({
    peakHours: fillHours(
      peakHoursRaw.map((r) => ({ hour: r.hour, total: r.total, count: Number(r.count) }))
    ),
    weekdays: fillWeekdays(
      weekdaysRaw.map((r) => ({ dow: r.dow, total: r.total, count: Number(r.count) }))
    ),
    comparison: {
      series: comparison,
      currentTotal,
      previousTotal,
      changePct,
      currentLabel: `${format(dateFrom, "dd/MM")} – ${format(dateTo, "dd/MM")}`,
      previousLabel: `${format(prevFrom, "dd/MM")} – ${format(prevTo, "dd/MM")}`,
    },
  });
}
