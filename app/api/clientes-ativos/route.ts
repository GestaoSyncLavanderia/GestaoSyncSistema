import { NextResponse } from "next/server";
import { db } from "@/lib/db";

function brazilDateComponents() {
  const now = new Date();
  const ms = now.getTime() - 3 * 60 * 60 * 1000;
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() };
}

export async function GET() {
  const { year, month } = brazilDateComponents();
  const monthStart = new Date(Date.UTC(year, month, 1));
  const monthEnd   = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));

  const [totalRow, perUnit, allLaundries] = await Promise.all([
    db.$queryRaw<[{ total: bigint }]>`
      SELECT COUNT(DISTINCT "customerId") AS total
      FROM "Cycle"
      WHERE "cycleDate" >= ${monthStart} AND "cycleDate" <= ${monthEnd}
        AND ("status" IS NULL OR "status" != 'Em uso')
        AND "machineType" != ''
    `,
    db.$queryRaw<Array<{ laundryId: string; customers: bigint }>>`
      SELECT "laundryId", COUNT(DISTINCT "customerId") AS customers
      FROM "Cycle"
      WHERE "cycleDate" >= ${monthStart} AND "cycleDate" <= ${monthEnd}
        AND ("status" IS NULL OR "status" != 'Em uso')
        AND "machineType" != ''
      GROUP BY "laundryId"
      ORDER BY customers DESC
    `,
    db.laundry.findMany({
      select: { id: true, name: true, city: true, state: true },
    }),
  ]);

  const laundryMap = Object.fromEntries(allLaundries.map((l) => [l.id, l]));
  const units = (perUnit as Array<{ laundryId: string; customers: bigint }>).map((r, i) => {
    const l = laundryMap[r.laundryId];
    return {
      position: i + 1,
      laundryId: r.laundryId,
      name: l?.name ?? r.laundryId,
      city: l?.city ?? "",
      state: l?.state ?? "",
      customers: Number(r.customers),
    };
  });

  const monthLabel = new Date(Date.UTC(year, month, 1))
    .toLocaleDateString("pt-BR", { month: "long", timeZone: "UTC" });

  return NextResponse.json({
    total: Number((totalRow as [{ total: bigint }])[0]?.total ?? 0),
    month: monthLabel,
    year,
    units,
  });
}
