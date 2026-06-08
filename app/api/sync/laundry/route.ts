import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSales } from "@/lib/sislav";
import { buildCyclesForLaundry } from "@/lib/sync";
import { startOfDay } from "date-fns";

export const maxDuration = 300;

function parseBirthDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

const UPSERT_BATCH = 20;

async function batchRun<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

// POST /api/sync/laundry?id=<laundryId>
// Faz full sync de uma lavanderia específica (sem filtro de data)
export async function POST(req: NextRequest) {
  const laundryId = req.nextUrl.searchParams.get("id");
  if (!laundryId) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const laundry = await db.laundry.findUnique({
    where: { id: laundryId },
    select: { id: true, name: true, organizationId: true },
  });
  if (!laundry) return NextResponse.json({ error: "Lavanderia não encontrada" }, { status: 404 });

  const salesBefore  = await db.sale.count({ where: { laundryId } });
  const cyclesBefore = await db.cycle.count({ where: { laundryId } });
  const errors: string[] = [];
  let skippedCount      = 0;
  let skippedPaidValue  = 0;

  try {
    // Full sync — sem filtro de data
    const allData = await getSales(laundryId, laundry.organizationId);
    const validData = allData.filter((s: any) => s.customer?.id);
    const skippedNoCustomer = allData.filter((s: any) => !s.customer?.id);
    skippedCount     = skippedNoCustomer.length;
    skippedPaidValue = skippedNoCustomer.reduce((sum: number, s: any) => sum + (s.paidValue ?? 0), 0);

    // Clientes
    await batchRun(validData, UPSERT_BATCH, async (s: any) => {
      await db.customer.upsert({
        where: { id: s.customer.id },
        update: { name: s.customer.name, email: s.customer.email ?? null, mobile: s.customer.mobile ?? null },
        create: {
          id: s.customer.id,
          name: s.customer.name,
          email: s.customer.email ?? null,
          mobile: s.customer.mobile ?? null,
          document: s.customer.document ?? "",
          documentType: s.customer.documentType ?? "",
          birthDate: parseBirthDate(s.customer.birthDate),
        },
      });
    });

    // CustomerLaundry (sequencial para evitar race condition)
    const uniqueCustomerIds = [...new Set(validData.map((s: any) => s.customer.id as string))];
    for (const customerId of uniqueCustomerIds) {
      await db.customerLaundry.upsert({
        where: { customerId_laundryId: { customerId, laundryId } },
        update: {},
        create: { customerId, laundryId },
      });
    }

    // Sales
    await batchRun(validData, UPSERT_BATCH, async (s: any) => {
      await db.sale.upsert({
        where: { id: s.id },
        update: {
          paidValue: s.paidValue ?? 0,
          totalValue: s.totalValue ?? 0,
          machines: Array.isArray(s.machines) && s.machines.length > 0 ? s.machines : undefined,
        },
        create: {
          id: s.id,
          laundryId,
          customerId: s.customer.id,
          customerName: s.customer.name ?? "",
          customerDoc: s.customer.document ?? "",
          customerEmail: s.customer.email ?? null,
          customerMobile: s.customer.mobile ?? null,
          customerBirthDate: parseBirthDate(s.customer.birthDate),
          documentType: s.customer.documentType ?? "",
          paidValue: s.paidValue ?? 0,
          totalValue: s.totalValue ?? 0,
          paymentMethod: s.paymentMethod ?? "",
          machineType: s.machineType ?? "",
          machines: Array.isArray(s.machines) ? s.machines : [],
          serviceType: s.serviceType ?? "",
          date: new Date(s.date),
        },
      });
    });

    // Ciclos
    await buildCyclesForLaundry(laundryId);
  } catch (err: any) {
    errors.push(err.message);
  }

  const newSales  = (await db.sale.count({ where: { laundryId } }))  - salesBefore;
  const newCycles = (await db.cycle.count({ where: { laundryId } })) - cyclesBefore;

  return NextResponse.json({
    ok: errors.length === 0,
    laundry: laundry.name,
    newSales,
    newCycles,
    skippedNoCustomer: skippedCount,
    skippedPaidValue,
    errors,
  });
}
