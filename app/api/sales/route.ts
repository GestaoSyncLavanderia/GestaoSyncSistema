import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { subDays } from "date-fns";

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

  // Busca o revenueMetric da unidade para calcular faturamento corretamente
  let revenueMetric = "totalValueNonBalance";
  if (laundryId) {
    const lnd = await db.laundry.findUnique({
      where: { id: laundryId },
      select: { revenueMetric: true },
    });
    revenueMetric = lnd?.revenueMetric ?? "totalValueNonBalance";
  }

  const where: any = { status: { not: "Em uso" } };
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
      _sum: { totalPaidValue: true, totalValue: true, machinesCount: true },
    }),
    db.cycle.aggregate({
      where,
      _avg: { machinesCount: true },
    }),
    db.cycle.groupBy({
      by: ["paymentMethod"],
      where: distribWhere,
      _sum: { totalPaidValue: true, machinesCount: true },
      orderBy: { _sum: { totalPaidValue: "desc" } },
    }),
    db.cycle.groupBy({
      by: ["machineType"],
      where: distribWhere,
      _sum: { totalPaidValue: true, machinesCount: true },
      orderBy: { _sum: { totalPaidValue: "desc" } },
    }),
  ]);

  const dailyFrom = from ? new Date(from + "T00:00:00Z") : subDays(new Date(), 29);
  const dailyTo   = to   ? new Date(to + "T23:59:59.999Z") : new Date();

  const revExpr =
    revenueMetric === "totalValue"
      ? Prisma.sql`c."totalValue"`
      : revenueMetric === "paidValue"
      ? Prisma.sql`c."totalPaidValue"`
      : Prisma.sql`CASE WHEN c."paymentMethod" != 'BALANCE' THEN c."totalValue" ELSE 0 END`;

  const laundryFilter = laundryId
    ? Prisma.sql`AND c."laundryId" = ${laundryId}`
    : Prisma.empty;

  const dailyRaw = await db.$queryRaw<Array<{ cycleDate: Date; total: number; cycles: bigint }>>`
    SELECT
      c."cycleDate",
      COALESCE(SUM(${revExpr}), 0)::float8 AS total,
      COALESCE(SUM(c."machinesCount"), 0) AS cycles
    FROM "Cycle" c
    WHERE c."cycleDate" >= ${dailyFrom} AND c."cycleDate" <= ${dailyTo}
    AND (c."status" IS NULL OR c."status" != 'Em uso')
    AND c."machineType" != ''
    ${laundryFilter}
    GROUP BY c."cycleDate"
    ORDER BY c."cycleDate" ASC
  `;

  // cycleDate é armazenado como UTC midnight do dia Brasil → toISOString é timezone-safe
  const dailyMap = new Map(
    dailyRaw.map((d) => [
      d.cycleDate.toISOString().slice(0, 10),
      { total: d.total, cycles: Number(d.cycles) },
    ])
  );

  const fromStr = dailyFrom.toISOString().slice(0, 10);
  const toStr   = dailyTo.toISOString().slice(0, 10);
  const cursor  = new Date(fromStr + "T00:00:00Z");
  const stop    = new Date(toStr   + "T00:00:00Z");
  const dailyEvolution: { date: string; total: number; cycles: number }[] = [];
  while (cursor <= stop) {
    const key = cursor.toISOString().slice(0, 10);
    dailyEvolution.push({ date: key, total: dailyMap.get(key)?.total ?? 0, cycles: dailyMap.get(key)?.cycles ?? 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  const totalDistrib = paymentGroups.reduce((s, g) => s + (g._sum.totalPaidValue ?? 0), 0) || 1;
  const totalMachine = machineGroups.reduce((s, g) => s + (g._sum.totalPaidValue ?? 0), 0) || 1;

  const byPayment = paymentGroups.map((g) => {
    const val = g._sum.totalPaidValue ?? 0;
    return {
      method: g.paymentMethod,
      label:  PAYMENT_LABELS[g.paymentMethod] ?? g.paymentMethod,
      total:  val,
      count:  Number(g._sum.machinesCount ?? 0),
      pct:    Math.round((val / totalDistrib) * 100),
    };
  });

  const byMachineType = machineGroups
    .filter((g) => g.machineType != null && MACHINE_LABELS[g.machineType] != null)
    .map((g) => {
      const val = g._sum.totalPaidValue ?? 0;
      return {
        type:  g.machineType,
        label: MACHINE_LABELS[g.machineType!],
        total: val,
        count: Number(g._sum.machinesCount ?? 0),
        pct:   Math.round((val / totalMachine) * 100),
      };
    });

  const totalSalesCount = Number(agg._sum.machinesCount ?? 0);

  // Calcula faturamento respeitando o revenueMetric da unidade
  let faturamento: number;
  if (revenueMetric === "totalValue") {
    const revAgg = await db.cycle.aggregate({
      where: { ...where, machineType: { not: "" } },
      _sum: { totalValue: true },
    });
    faturamento = revAgg._sum.totalValue ?? 0;
  } else if (revenueMetric === "paidValue") {
    // paidValue: SALE paidValue + BALANCE_PURCHASE paidValue (dinheiro efetivamente recebido)
    const [saleAgg, bpAgg] = await Promise.all([
      db.cycle.aggregate({ where: { ...where, machineType: { not: "" } }, _sum: { totalPaidValue: true } }),
      db.cycle.aggregate({ where: { ...where, machineType: "" },           _sum: { totalPaidValue: true } }),
    ]);
    faturamento = (saleAgg._sum.totalPaidValue ?? 0) + (bpAgg._sum.totalPaidValue ?? 0);
  } else {
    // totalValueNonBalance: soma totalValue excluindo ciclos pagos com saldo
    const nbAgg = await db.cycle.aggregate({
      where: { ...where, machineType: { not: "" }, paymentMethod: { not: "BALANCE" } },
      _sum: { totalValue: true },
    });
    faturamento = nbAgg._sum.totalValue ?? 0;
  }

  const ticketMedio = totalSalesCount > 0 ? faturamento / totalSalesCount : 0;

  return NextResponse.json({
    cycles,
    total,
    page,
    limit,
    agg: {
      totalPaidValue: faturamento,
      count: totalSalesCount,
      ticketMedio,
      avgMachines: avgMachines._avg.machinesCount ?? 0,
    },
    byPayment,
    byMachineType,
    dailyEvolution,
  });
}
