import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { subDays, startOfDay } from "date-fns";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const fromParam = searchParams.get("from");
  const toParam   = searchParams.get("to");

  const gte = fromParam ? new Date(fromParam + "T00:00:00Z") : startOfDay(subDays(new Date(), 29));
  const lte = toParam   ? new Date(toParam   + "T23:59:59.999Z") : new Date();

  // Agrupa por chave de deduplicação — mesmo timestamp + valor + pagamento + cliente + máquina
  const rows = await db.$queryRaw<Array<{
    laundryId: string;
    date: Date;
    customerId: string;
    customerName: string;
    machineType: string;
    paymentMethod: string;
    paidValue: number;
    totalValue: number;
    cnt: number;
    extraValue: number;
  }>>`
    SELECT
      "laundryId",
      date,
      "customerId",
      MAX("customerName")                              AS "customerName",
      "machineType",
      "paymentMethod",
      "paidValue",
      MAX("totalValue")::float8                        AS "totalValue",
      COUNT(*)::int                                    AS cnt,
      ((COUNT(*) - 1) * MAX("totalValue"))::float8     AS "extraValue"
    FROM "Sale"
    WHERE date >= ${gte} AND date <= ${lte}
    GROUP BY "laundryId", date, "customerId", "machineType", "paymentMethod", "paidValue"
    HAVING COUNT(*) > 1
    ORDER BY "laundryId", date DESC
  `;

  if (rows.length === 0) {
    return NextResponse.json({ units: [], totals: { dupGroups: 0, extraSales: 0, extraValue: 0 } });
  }

  const laundryIds = [...new Set(rows.map((r) => r.laundryId))];
  const laundries  = await db.laundry.findMany({
    where: { id: { in: laundryIds } },
    select: { id: true, name: true },
  });
  const nameMap = Object.fromEntries(laundries.map((l) => [l.id, l.name]));

  const byLaundry = new Map<string, typeof rows>();
  for (const r of rows) {
    if (!byLaundry.has(r.laundryId)) byLaundry.set(r.laundryId, []);
    byLaundry.get(r.laundryId)!.push(r);
  }

  const units = [...byLaundry.entries()]
    .map(([laundryId, groups]) => ({
      laundryId,
      name:       nameMap[laundryId] ?? laundryId,
      dupGroups:  groups.length,
      extraSales: groups.reduce((s, g) => s + g.cnt - 1, 0),
      extraValue: groups.reduce((s, g) => s + g.extraValue, 0),
      details:    groups.map((g) => ({
        date:          g.date.toISOString(),
        customerId:    g.customerId,
        customerName:  g.customerName,
        machineType:   g.machineType,
        paymentMethod: g.paymentMethod,
        totalValue:    g.totalValue,
        count:         g.cnt,
        extraValue:    g.extraValue,
      })),
    }))
    .sort((a, b) => b.extraValue - a.extraValue);

  const totals = {
    dupGroups:  units.reduce((s, u) => s + u.dupGroups,  0),
    extraSales: units.reduce((s, u) => s + u.extraSales, 0),
    extraValue: units.reduce((s, u) => s + u.extraValue, 0),
  };

  return NextResponse.json({ units, totals });
}
