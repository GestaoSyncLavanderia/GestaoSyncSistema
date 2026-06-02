import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subDays, startOfDay, endOfDay } from "date-fns";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search") ?? "";
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "20");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");

  const periodFrom = fromParam ? startOfDay(new Date(fromParam)) : startOfDay(subDays(new Date(), 29));
  const periodTo = toParam ? endOfDay(new Date(toParam)) : new Date();

  const where: any = {};
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { document: { contains: search } },
    ];
  }

  const thirtyDaysAgo = subDays(new Date(), 30);
  const currentMonth = new Date().getMonth() + 1;
  const periodWhere = { cycleDate: { gte: periodFrom, lte: periodTo } };

  const [customers, total, uniqueTotal, newInPeriod, inactiveGroups, allWithBirthday] =
    await Promise.all([
      db.customer.findMany({
        where,
        orderBy: { name: "asc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          laundries: { include: { laundry: { select: { name: true } } } },
        },
      }),
      db.customer.count({ where }),
      db.cycle.groupBy({ by: ["customerId"], where: periodWhere }).then((r) => r.length),
      db.cycle
        .groupBy({
          by: ["customerId"],
          _min: { cycleDate: true },
          where: periodWhere,
          having: { cycleDate: { _min: { gte: periodFrom } } },
        })
        .then((r) => r.length),
      db.cycle.groupBy({
        by: ["customerId"],
        _max: { cycleDate: true },
        having: { cycleDate: { _max: { lt: thirtyDaysAgo } } },
      }),
      db.customer.findMany({
        where: { birthDate: { not: null } },
        select: { id: true, birthDate: true },
      }),
    ]);

  const birthdayCount = allWithBirthday.filter(
    (c) => c.birthDate && c.birthDate.getMonth() + 1 === currentMonth
  ).length;

  // Ranking top 10 clientes por gasto no período selecionado
  const rankingGroups = await db.cycle.groupBy({
    by: ["customerId"],
    _sum: { totalValue: true },
    _count: { id: true },
    where: periodWhere,
    orderBy: { _sum: { totalValue: "desc" } },
    take: 10,
  });

  const rankingIds = rankingGroups.map((r) => r.customerId);
  const rankingNames =
    rankingIds.length > 0
      ? await db.customer.findMany({
          where: { id: { in: rankingIds } },
          select: { id: true, name: true },
        })
      : [];

  const nameMap = Object.fromEntries(rankingNames.map((c) => [c.id, c.name]));
  const ranking = rankingGroups.map((r, i) => ({
    position: i + 1,
    customerId: r.customerId,
    name: nameMap[r.customerId] ?? r.customerId,
    totalSpent: r._sum.totalValue ?? 0,
    cycles: r._count.id,
  }));

  // Usuários de saldo — clientes que pagaram com BALANCE no período
  const balanceGroups = await db.cycle.groupBy({
    by: ["customerId"],
    where: { ...periodWhere, paymentMethod: "BALANCE" },
    _sum: { totalValue: true },
    _count: { id: true },
    orderBy: { _count: { id: "desc" } },
    take: 20,
  });

  const balanceIds = balanceGroups.map((r) => r.customerId);
  const balanceNames =
    balanceIds.length > 0
      ? await db.customer.findMany({
          where: { id: { in: balanceIds } },
          select: { id: true, name: true, document: true },
        })
      : [];

  const balanceNameMap = Object.fromEntries(balanceNames.map((c) => [c.id, c]));
  const balanceUsers = balanceGroups.map((r) => ({
    customerId: r.customerId,
    name: balanceNameMap[r.customerId]?.name ?? r.customerId,
    document: balanceNameMap[r.customerId]?.document ?? "",
    totalValue: r._sum.totalValue ?? 0,
    cycles: r._count.id,
  }));

  return NextResponse.json({
    customers,
    total,
    page,
    limit,
    stats: {
      uniqueTotal,
      newInPeriod,
      inactive: inactiveGroups.length,
      birthdaysThisMonth: birthdayCount,
    },
    ranking,
    balanceUsers,
  });
}
