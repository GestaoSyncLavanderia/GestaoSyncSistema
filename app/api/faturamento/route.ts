import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// "YYYY-MM-DD" (Brazil date) → UTC range base (00:00 BRT = 03:00 UTC)
// Cada unidade tem um dayStartMinutes que desloca o início do dia para frente.
// Ex: dayStartMinutes=60 → dia começa 01:00 BRT (04:00 UTC), espelhando o SisLav Dashboard.
function toBaseRange(from: string, to: string) {
  const gte = new Date(from + "T03:00:00.000Z");
  const lt  = new Date(to   + "T03:00:00.000Z");
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

function shiftRange(gte: Date, lt: Date, minutes: number) {
  const ms = minutes * 60 * 1000;
  return { gte: new Date(gte.getTime() + ms), lt: new Date(lt.getTime() + ms) };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from") ?? "2020-01-01";
  const to   = searchParams.get("to")   ?? new Date().toISOString().slice(0, 10);
  const { gte: baseGte, lt: baseLt } = toBaseRange(from, to);

  // Busca todas as unidades com seus offsets e flags
  const allLaundries = await db.laundry.findMany({
    select: { id: true, name: true, city: true, state: true, street: true, neighborhood: true, ownerName: true, dayStartMinutes: true, balanceSaleInFaturamento: true, syncNote: true },
  });

  // Agrupa unidades por offset único; registra quais precisam de BALANCE SALE totalValue
  const offsetGroups = new Map<number, string[]>();
  const balanceSaleSet = new Set(allLaundries.filter((l) => l.balanceSaleInFaturamento).map((l) => l.id));
  for (const l of allLaundries) {
    const off = l.dayStartMinutes ?? 0;
    if (!offsetGroups.has(off)) offsetGroups.set(off, []);
    offsetGroups.get(off)!.push(l.id);
  }

  // Para cada offset, roda as queries e acumula resultados por unidade
  const unitTotals = new Map<string, { paid: number; cnt: number }>();
  let networkTotal = 0;
  let networkCount = 0;

  await Promise.all(
    [...offsetGroups.entries()].map(async ([offset, ids]) => {
      const { gte, lt } = shiftRange(baseGte, baseLt, offset);
      const directWhere   = { laundryId: { in: ids }, date: { gte, lt }, serviceType: "SALE", NOT: { paymentMethod: { in: ["BALANCE", "SISLAV_PAY"] } } };
      const rechargeWhere = { laundryId: { in: ids }, date: { gte, lt }, serviceType: "BALANCE_PURCHASE" } as const;
      const bsIds = ids.filter((id) => balanceSaleSet.has(id));

      const [directRows, rechargeRows, balanceSaleRows] = await Promise.all([
        db.sale.groupBy({ by: ["laundryId"], where: directWhere,   _sum: { paidValue: true }, _count: { _all: true } }),
        db.sale.groupBy({ by: ["laundryId"], where: rechargeWhere, _sum: { paidValue: true } }),
        // Soma totalValue de ciclos BALANCE apenas nos dias sem BALANCE_PURCHASE naquela unidade.
        // Evita double-counting quando a carteira é carregada e usada no mesmo dia.
        bsIds.length > 0
          ? db.$queryRaw<Array<{ laundryId: string; total: number }>>`
              SELECT s."laundryId", COALESCE(SUM(s."totalValue"), 0)::float8 AS total
              FROM "Sale" s
              WHERE s."laundryId" = ANY(${bsIds}::text[])
                AND s.date >= ${gte} AND s.date < ${lt}
                AND s."serviceType" = 'SALE'
                AND s."paymentMethod" = 'BALANCE'
                AND NOT EXISTS (
                  SELECT 1 FROM "Sale" bp
                  WHERE bp."laundryId" = s."laundryId"
                    AND bp."serviceType" = 'BALANCE_PURCHASE'
                    AND bp.date >= ${gte} AND bp.date < ${lt}
                    AND DATE(bp.date AT TIME ZONE 'America/Sao_Paulo') = DATE(s.date AT TIME ZONE 'America/Sao_Paulo')
                )
              GROUP BY s."laundryId"
            `
          : Promise.resolve([] as Array<{ laundryId: string; total: number }>),
      ]);

      const rechargeMap    = new Map(rechargeRows.map((r) => [r.laundryId, r._sum.paidValue ?? 0]));
      const balanceSaleMap = new Map((balanceSaleRows as Array<{ laundryId: string; total: number }>).map((r) => [r.laundryId, r.total]));

      const allIds = [...new Set([...directRows.map((r) => r.laundryId), ...rechargeRows.map((r) => r.laundryId), ...balanceSaleRows.map((r) => r.laundryId)])];
      for (const id of allIds) {
        const direct  = directRows.find((r) => r.laundryId === id);
        const paid    = (direct?._sum.paidValue ?? 0) + (rechargeMap.get(id) ?? 0) + (balanceSaleMap.get(id) ?? 0);
        const cnt     = direct?._count._all ?? 0;
        unitTotals.set(id, { paid, cnt });
        networkTotal += paid;
        networkCount += cnt;
      }
    })
  );

  // Monta ranking
  const laundryMap = Object.fromEntries(allLaundries.map((l) => [l.id, l]));
  const byLaundryMerged = [...unitTotals.entries()]
    .map(([id, { paid, cnt }]) => ({ laundryId: id, total: paid, count: cnt }))
    .sort((a, b) => b.total - a.total);

  const ranking = byLaundryMerged.map((r, i) => {
    const l = laundryMap[r.laundryId];
    return {
      position:     i + 1,
      laundryId:    r.laundryId,
      name:         l?.name         ?? r.laundryId,
      city:         l?.city         ?? "",
      state:        l?.state        ?? "",
      street:       l?.street       ?? "",
      neighborhood: l?.neighborhood ?? "",
      ownerName:    l?.ownerName    ?? "",
      total:        r.total,
      count:        r.count,
      ticketMedio:  r.count > 0 ? r.total / r.count : 0,
      syncNote:     l?.syncNote ?? undefined,
    };
  });

  // Evolução diária — usa boundary base (00:00 BRT) para o gráfico de rede
  const dailyRaw = await db.$queryRaw<Array<{ sale_date: Date; total: number; count: bigint }>>`
    SELECT
      DATE(s.date AT TIME ZONE 'America/Sao_Paulo') AS sale_date,
      COALESCE(SUM(
        CASE
          WHEN s."serviceType" = 'SALE' AND s."paymentMethod" != 'BALANCE' THEN s."paidValue"
          WHEN s."serviceType" = 'BALANCE_PURCHASE' THEN s."paidValue"
          ELSE 0
        END
      ), 0)::float8 AS total,
      COUNT(CASE WHEN s."serviceType" = 'SALE' AND s."paymentMethod" != 'BALANCE' THEN 1 END)::int8 AS count
    FROM "Sale" s
    WHERE s.date >= ${baseGte} AND s.date < ${baseLt}
      AND (
        (s."serviceType" = 'SALE' AND s."paymentMethod" != 'BALANCE')
        OR s."serviceType" = 'BALANCE_PURCHASE'
      )
    GROUP BY DATE(s.date AT TIME ZONE 'America/Sao_Paulo')
    ORDER BY sale_date ASC
  `;

  const dailyEvolution = dailyRaw.map((d) => ({
    date:  d.sale_date.toISOString().slice(0, 10),
    total: d.total,
    count: Number(d.count),
  }));

  const ticketMedio = networkCount > 0 ? networkTotal / networkCount : 0;

  return NextResponse.json({ total: networkTotal, count: networkCount, ticketMedio, ranking, dailyEvolution });
}
