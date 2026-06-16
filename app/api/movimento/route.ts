import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// SisLav inicia o "dia" à meia-noite BRT = 03:00 UTC
function toUtcRange(from: string, to: string) {
  const gte = new Date(from + "T03:00:00.000Z");
  const lt  = new Date(to   + "T03:00:00.000Z");
  lt.setUTCDate(lt.getUTCDate() + 1);
  return { gte, lt };
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const from = searchParams.get("from") ?? "2020-01-01";
  const to   = searchParams.get("to")   ?? new Date().toISOString().slice(0, 10);
  const { gte, lt } = toUtcRange(from, to);

  // Busca todas as unidades com flag de BALANCE SALE in Vendas
  const allLaundries = await db.laundry.findMany({
    select: { id: true, name: true, city: true, state: true, street: true, neighborhood: true, ownerName: true, balanceSaleInVendas: true },
  });
  const balanceSaleIds = allLaundries.filter((l) => l.balanceSaleInVendas).map((l) => l.id);

  // Espelha aba Vendas do SisLav:
  // = paidValue de SALEs não-BALANCE + paidValue de BALANCE_PURCHASE
  // Para unidades com balanceSaleInVendas=true, soma também totalValue dos SALEs BALANCE
  // (cliente usou saldo carregado em período anterior, sem recarga correspondente no mesmo dia).
  const directWhere   = { date: { gte, lt }, serviceType: "SALE", NOT: { paymentMethod: { in: ["BALANCE", "SISLAV_PAY"] } } };
  const rechargeWhere = { date: { gte, lt }, serviceType: "BALANCE_PURCHASE" } as const;
  const cycleWhere    = { date: { gte, lt }, serviceType: "SALE" } as const;

  const [
    directAgg,
    rechargeAgg,
    cycleCountAgg,
    directByLaundry,
    rechargeByLaundry,
    cycleByLaundry,
    dailyRaw,
    balanceSaleByLaundry,
  ] = await Promise.all([
    db.sale.aggregate({ where: directWhere,   _sum: { paidValue: true } }),
    db.sale.aggregate({ where: rechargeWhere, _sum: { paidValue: true } }),
    db.sale.aggregate({ where: cycleWhere,    _count: { _all: true } }),
    db.sale.groupBy({ by: ["laundryId"], where: directWhere,   _sum: { paidValue: true } }),
    db.sale.groupBy({ by: ["laundryId"], where: rechargeWhere, _sum: { paidValue: true } }),
    db.sale.groupBy({ by: ["laundryId"], where: cycleWhere,    _count: { _all: true } }),
    db.$queryRaw<Array<{ sale_date: Date; total: number; count: bigint }>>`
      SELECT
        DATE(s.date AT TIME ZONE 'America/Sao_Paulo') AS sale_date,
        COALESCE(SUM(
          CASE
            WHEN s."serviceType" = 'SALE' AND s."paymentMethod" != 'BALANCE' THEN s."paidValue"
            WHEN s."serviceType" = 'BALANCE_PURCHASE' THEN s."paidValue"
            ELSE 0
          END
        ), 0)::float8 AS total,
        COUNT(CASE WHEN s."serviceType" = 'SALE' THEN 1 END)::int8 AS count
      FROM "Sale" s
      WHERE s.date >= ${gte} AND s.date < ${lt}
        AND (s."serviceType" = 'SALE' OR s."serviceType" = 'BALANCE_PURCHASE')
      GROUP BY DATE(s.date AT TIME ZONE 'America/Sao_Paulo')
      ORDER BY sale_date ASC
    `,
    balanceSaleIds.length > 0
      ? db.sale.groupBy({
          by: ["laundryId"],
          where: { date: { gte, lt }, serviceType: "SALE", paymentMethod: "BALANCE", laundryId: { in: balanceSaleIds } },
          _sum: { totalValue: true },
        })
      : Promise.resolve([] as Array<{ laundryId: string; _sum: { totalValue: number | null } }>),
  ]);

  const rechargeMap   = Object.fromEntries(rechargeByLaundry.map((r) => [r.laundryId, r._sum.paidValue ?? 0]));
  const balanceSaleMap = Object.fromEntries(balanceSaleByLaundry.map((r) => [r.laundryId, r._sum.totalValue ?? 0]));
  const cycleCountMap = Object.fromEntries(cycleByLaundry.map((r) => [r.laundryId, r._count._all]));

  const allLaundryIds = [
    ...new Set([
      ...directByLaundry.map((r) => r.laundryId),
      ...rechargeByLaundry.map((r) => r.laundryId),
      ...balanceSaleByLaundry.map((r) => r.laundryId),
    ]),
  ];
  const directMap = Object.fromEntries(directByLaundry.map((r) => [r.laundryId, r._sum.paidValue ?? 0]));

  const byLaundryMerged = allLaundryIds
    .map((id) => ({
      laundryId: id,
      total:     (directMap[id] ?? 0) + (rechargeMap[id] ?? 0) + (balanceSaleMap[id] ?? 0),
      count:     cycleCountMap[id] ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

  const laundryMap = Object.fromEntries(allLaundries.map((l) => [l.id, l]));

  const balanceSaleNetworkTotal = balanceSaleByLaundry.reduce((s, r) => s + (r._sum.totalValue ?? 0), 0);
  const total       = (directAgg._sum.paidValue ?? 0) + (rechargeAgg._sum.paidValue ?? 0) + balanceSaleNetworkTotal;
  const count       = cycleCountAgg._count._all;
  const ticketMedio = count > 0 ? total / count : 0;

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
    };
  });

  const dailyEvolution = dailyRaw.map((d) => ({
    date:  d.sale_date.toISOString().slice(0, 10),
    total: d.total,
    count: Number(d.count),
  }));

  return NextResponse.json({ total, count, ticketMedio, ranking, dailyEvolution });
}
