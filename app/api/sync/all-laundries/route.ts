import { NextResponse } from "next/server";
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

async function syncOneLaundry(laundryId: string, orgId: string): Promise<{ newSales: number; newCycles: number; error?: string }> {
  const salesBefore  = await db.sale.count({ where: { laundryId } });
  const cyclesBefore = await db.cycle.count({ where: { laundryId } });

  try {
    const allData  = await getSales(laundryId, orgId);
    const validData = allData.filter((s: any) => s.customer?.id);

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

    const uniqueCustomerIds = [...new Set(validData.map((s: any) => s.customer.id as string))];
    for (const customerId of uniqueCustomerIds) {
      await db.customerLaundry.upsert({
        where: { customerId_laundryId: { customerId, laundryId } },
        update: {},
        create: { customerId, laundryId },
      });
    }

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

    await buildCyclesForLaundry(laundryId);
  } catch (err: any) {
    return { newSales: 0, newCycles: 0, error: err.message };
  }

  return {
    newSales:  (await db.sale.count({ where: { laundryId } }))  - salesBefore,
    newCycles: (await db.cycle.count({ where: { laundryId } })) - cyclesBefore,
  };
}

// POST /api/sync/all-laundries
// Sincroniza todas as unidades sequencialmente (full sync, sem filtro de data).
// Seguro re-executar: upsert por ID de venda, sem duplicatas.
export async function POST() {
  const laundries = await db.laundry.findMany({
    select: { id: true, name: true, organizationId: true },
    orderBy: { name: "asc" },
  });

  const results: { name: string; newSales: number; newCycles: number; error?: string }[] = [];

  for (const l of laundries) {
    const result = await syncOneLaundry(l.id, l.organizationId);
    results.push({ name: l.name, ...result });
  }

  const totalNewSales  = results.reduce((a, r) => a + r.newSales, 0);
  const totalNewCycles = results.reduce((a, r) => a + r.newCycles, 0);
  const errors = results.filter((r) => r.error);

  return NextResponse.json({
    ok: errors.length === 0,
    totalNewSales,
    totalNewCycles,
    results,
  });
}
