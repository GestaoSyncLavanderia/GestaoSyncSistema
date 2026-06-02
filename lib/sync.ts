import { db } from "./db";
import * as api from "./sislav";
import { startOfDay, subHours } from "date-fns";

const LAUNDRY_BATCH = 5;   // D: mantém 5 (seguro); testar C=20 separadamente
const CYCLE_BATCH   = 20;
const UPSERT_BATCH  = 20;  // A: upserts de cliente/venda em paralelo

async function batch<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export async function syncAll(): Promise<{
  newSales: number;
  newCycles: number;
  timing: Record<string, number>;
  errors: string[];
}> {
  const t0 = Date.now();
  const timing: Record<string, number> = {};
  const errors: string[] = [];

  await syncLaundries();
  timing.syncLaundries = Date.now() - t0;

  const laundries = await db.laundry.findMany({ select: { id: true, organizationId: true } });

  const lastLog = await db.syncLog.findFirst({
    where: { entity: "sales", status: "success" },
    orderBy: { createdAt: "desc" },
  });
  const since = lastLog ? subHours(lastLog.createdAt, 1) : undefined;
  timing.since = since?.getTime() ?? 0;

  const laundriesWithSales = since
    ? new Set(
        (await db.sale.findMany({ select: { laundryId: true }, distinct: ["laundryId"] }))
          .map((s) => s.laundryId)
      )
    : new Set<string>();

  const t2 = Date.now();
  const salesBefore = await db.sale.count();
  await batch(laundries, LAUNDRY_BATCH, async (l) => {
    const err = await syncSales(l.id, l.organizationId, laundriesWithSales, since);
    if (err) errors.push(`${l.id}: ${err}`);
  });
  const newSales = (await db.sale.count()) - salesBefore;
  timing.syncSales = Date.now() - t2;

  const t3 = Date.now();
  const cyclesBefore = await db.cycle.count();
  await buildCycles(since);
  const newCycles = (await db.cycle.count()) - cyclesBefore;
  timing.buildCycles = Date.now() - t3;

  timing.total = Date.now() - t0;
  return { newSales, newCycles, timing, errors };
}

export async function syncLaundries() {
  try {
    const data = await api.getLaundries();
    // B: upserts em paralelo em vez de loop sequencial
    await batch(data, 10, async (l) => {
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
    });
    await db.syncLog.create({ data: { entity: "laundries", status: "success" } });
  } catch (err: any) {
    await db.syncLog.create({
      data: { entity: "laundries", status: "error", message: err.message },
    });
    throw err;
  }
}

// Retorna string de erro em caso de falha, null em caso de sucesso
export async function syncSales(
  laundryId: string,
  orgId: string,
  laundriesWithSales: Set<string>,
  since?: Date
): Promise<string | null> {
  try {
    const effectiveSince = laundriesWithSales.has(laundryId) ? since : undefined;
    const allData = await api.getSales(laundryId, orgId, effectiveSince);
    const data = effectiveSince
      ? allData.filter((s: any) => new Date(s.date) >= effectiveSince)
      : allData;

    // A: clientes primeiro (FK: customerLaundry e sale dependem de customer existir)
    await batch(data, UPSERT_BATCH, async (s: any) => {
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
    });

    // A: customerLaundry + sale em paralelo por venda (não dependem entre si)
    await batch(data, UPSERT_BATCH, async (s: any) => {
      await Promise.all([
        db.customerLaundry.upsert({
          where: { customerId_laundryId: { customerId: s.customer.id, laundryId } },
          update: {},
          create: { customerId: s.customer.id, laundryId },
        }),
        db.sale.upsert({
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
        }),
      ]);
    });

    await db.syncLog.create({ data: { entity: "sales", status: "success" } });
    return null;
  } catch (err: any) {
    await db.syncLog.create({
      data: { entity: "sales", status: "error", message: err.message },
    });
    return err.message;
  }
}

export async function buildCycles(since?: Date) {
  try {
    const allSales = await db.sale.findMany({
      where: since ? { date: { gte: startOfDay(since) } } : {},
    });

    const groupMap = new Map<string, typeof allSales>();
    for (const s of allSales) {
      const dayKey = startOfDay(s.date).toISOString();
      const key = `${s.laundryId}||${s.customerId}||${s.machineType}||${dayKey}`;
      if (!groupMap.has(key)) groupMap.set(key, []);
      groupMap.get(key)!.push(s);
    }

    await batch([...groupMap.values()], CYCLE_BATCH, async (daySales) => {
      const { laundryId, customerId, machineType } = daySales[0];
      const cycleDate = startOfDay(daySales[0].date);
      const allMachines = daySales.flatMap((s) => s.machines) as any;

      await db.cycle.upsert({
        where: {
          laundryId_customerId_machineType_cycleDate: {
            laundryId,
            customerId,
            machineType,
            cycleDate,
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
          laundryId,
          customerId,
          machineType,
          cycleDate,
          machinesUsed: allMachines,
          machinesCount: allMachines.length,
          totalPaidValue: daySales.reduce((a, s) => a + s.paidValue, 0),
          totalValue: daySales.reduce((a, s) => a + s.totalValue, 0),
          salesCount: daySales.length,
          paymentMethod: daySales[0].paymentMethod,
        },
      });
    });

    await db.syncLog.create({ data: { entity: "cycles", status: "success" } });
  } catch (err: any) {
    await db.syncLog.create({
      data: { entity: "cycles", status: "error", message: err.message },
    });
  }
}
