import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [customer, cycles, spentAgg, prefPayment] = await Promise.all([
    db.customer.findUnique({
      where: { id },
      include: {
        laundries: { include: { laundry: { select: { name: true, city: true, state: true } } } },
      },
    }),
    db.cycle.findMany({
      where: { customerId: id },
      include: { laundry: { select: { name: true } } },
      orderBy: { cycleDate: "desc" },
      take: 50,
    }),
    db.cycle.aggregate({
      where: { customerId: id },
      _sum: { totalValue: true },
      _count: { id: true },
    }),
    db.cycle.groupBy({
      by: ["paymentMethod"],
      where: { customerId: id },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: 1,
    }),
  ]);

  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const lastCycle = cycles[0] ?? null;

  return NextResponse.json({
    customer,
    cycles,
    summary: {
      totalSpent: spentAgg._sum.totalValue ?? 0,
      cyclesCount: spentAgg._count.id,
      lastVisit: lastCycle?.cycleDate ?? null,
      preferredPayment: prefPayment[0]?.paymentMethod ?? null,
    },
  });
}
