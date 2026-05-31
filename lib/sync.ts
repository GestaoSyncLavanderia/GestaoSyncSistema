import { db } from "./db";
import * as api from "./sislav";
import { startOfDay } from "date-fns";

export async function syncAll(): Promise<{ newSales: number; newCycles: number }> {
  await syncLaundries();

  const laundries = await db.laundry.findMany({
    select: { id: true, organizationId: true },
  });

  const salesBefore = await db.sale.count();
  for (const l of laundries) {
    await syncSales(l.id, l.organizationId);
  }
  const newSales = (await db.sale.count()) - salesBefore;

  const cyclesBefore = await db.cycle.count();
  await buildCycles();
  const newCycles = (await db.cycle.count()) - cyclesBefore;

  return { newSales, newCycles };
}

export async function syncLaundries() {
  try {
    const data = await api.getLaundries();
    for (const l of data) {
      await db.laundry.upsert({
        where: { id: l.id },
        update: { name: l.name, syncedAt: new Date() },
        create: {
          id: l.id,
          name: l.name,
          email: l.email ?? null,
          city: l.city ?? "",
          state: l.state ?? "",
          street: l.street ?? "",
          neighborhood: l.neighborhood ?? "",
          googleMapsURL: l.googleMapsURL ?? null,
          organizationId: l.organizationId ?? "",
          ownerName: l.owner?.name ?? "",
          ownerEmail: l.owner?.email ?? "",
          ownerMobile: l.owner?.mobile ?? "",
          createdAt: new Date(l.createdAt),
        },
      });
    }
    await db.syncLog.create({ data: { entity: "laundries", status: "success" } });
  } catch (err: any) {
    await db.syncLog.create({
      data: { entity: "laundries", status: "error", message: err.message },
    });
    throw err;
  }
}

export async function syncSales(laundryId: string, orgId: string) {
  try {
    const data = await api.getSales(laundryId, orgId);
    for (const s of data) {
      await db.customer.upsert({
        where: { id: s.customer.id },
        update: {
          name: s.customer.name,
          email: s.customer.email ?? null,
          mobile: s.customer.mobile ?? null,
        },
        create: {
          id: s.customer.id,
          name: s.customer.name,
          email: s.customer.email ?? null,
          mobile: s.customer.mobile ?? null,
          document: s.customer.document ?? "",
          documentType: s.customer.documentType ?? "",
          birthDate: s.customer.birthDate ? new Date(s.customer.birthDate) : null,
        },
      });

      await db.customerLaundry.upsert({
        where: { customerId_laundryId: { customerId: s.customer.id, laundryId } },
        update: {},
        create: { customerId: s.customer.id, laundryId },
      });

      await db.sale.upsert({
        where: { id: s.id },
        update: {},
        create: {
          id: s.id,
          laundryId,
          customerId: s.customer.id,
          customerName: s.customer.name ?? "",
          customerDoc: s.customer.document ?? "",
          customerEmail: s.customer.email ?? null,
          customerMobile: s.customer.mobile ?? null,
          customerBirthDate: s.customer.birthDate ? new Date(s.customer.birthDate) : null,
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
    }
    await db.syncLog.create({ data: { entity: "sales", status: "success" } });
  } catch (err: any) {
    await db.syncLog.create({
      data: { entity: "sales", status: "error", message: err.message },
    });
  }
}

export async function buildCycles() {
  try {
    const groups = await db.sale.groupBy({
      by: ["laundryId", "customerId", "machineType"],
    });

    for (const g of groups) {
      const sales = await db.sale.findMany({
        where: {
          laundryId: g.laundryId,
          customerId: g.customerId,
          machineType: g.machineType,
        },
        orderBy: { date: "asc" },
      });

      const byDay = new Map<string, typeof sales>();
      for (const s of sales) {
        const dayKey = startOfDay(s.date).toISOString();
        if (!byDay.has(dayKey)) byDay.set(dayKey, []);
        byDay.get(dayKey)!.push(s);
      }

      for (const [dayKey, daySales] of byDay.entries()) {
        const allMachines = daySales.flatMap((s) => s.machines);
        await db.cycle.upsert({
          where: {
            laundryId_customerId_machineType_cycleDate: {
              laundryId: g.laundryId,
              customerId: g.customerId,
              machineType: g.machineType,
              cycleDate: new Date(dayKey),
            },
          },
          update: {
            machinesUsed: allMachines,
            machinesCount: allMachines.length,
            totalPaidValue: daySales.reduce((a, s) => a + s.paidValue, 0),
            totalValue: daySales.reduce((a, s) => a + s.totalValue, 0),
            salesCount: daySales.length,
            syncedAt: new Date(),
          },
          create: {
            laundryId: g.laundryId,
            customerId: g.customerId,
            machineType: g.machineType,
            machinesUsed: allMachines,
            machinesCount: allMachines.length,
            totalPaidValue: daySales.reduce((a, s) => a + s.paidValue, 0),
            totalValue: daySales.reduce((a, s) => a + s.totalValue, 0),
            salesCount: daySales.length,
            paymentMethod: daySales[0].paymentMethod,
            cycleDate: new Date(dayKey),
          },
        });
      }
    }
    await db.syncLog.create({ data: { entity: "cycles", status: "success" } });
  } catch (err: any) {
    await db.syncLog.create({
      data: { entity: "cycles", status: "error", message: err.message },
    });
  }
}
