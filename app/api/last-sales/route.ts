import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

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
  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "20"),
    100
  );

  const sales = await db.sale.findMany({
    take: limit,
    orderBy: { date: "desc" },
    select: {
      id: true,
      paidValue: true,
      paymentMethod: true,
      machineType: true,
      date: true,
      laundry: { select: { name: true } },
    },
  });

  return NextResponse.json({
    sales: sales.map((s) => ({
      id: s.id,
      laundryName: s.laundry.name,
      machineLabel: MACHINE_LABELS[s.machineType] ?? s.machineType,
      paymentLabel: PAYMENT_LABELS[s.paymentMethod] ?? s.paymentMethod,
      paidValue: s.paidValue,
      date: s.date.toISOString(),
    })),
  });
}
