import { db } from "./db";
import * as api from "./sislav";
import { startOfDay, subHours } from "date-fns";

// Retorna o midnight UTC correspondente ao dia de Brasília (UTC-3) do timestamp
export function brazilDayUTC(utcDate: Date): Date {
  const ms = utcDate.getTime() - 3 * 60 * 60 * 1000;
  const d  = new Date(ms);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const LAUNDRY_BATCH = 5;
const CYCLE_BATCH   = 20;
const UPSERT_BATCH  = 20;

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
  const salesBefore  = await db.sale.count();
  const cyclesBefore = await db.cycle.count();

  // Full sync (sem histórico): processa 1 por vez para não bater rate limit 429
  // Incremental: paralelo é seguro (poucas páginas por laundry)
  const fullSyncLaundries = laundries.filter((l) => !laundriesWithSales.has(l.id));
  const incrSyncLaundries = laundries.filter((l) => laundriesWithSales.has(l.id));

  await batch(fullSyncLaundries, 1, async (l) => {
    const err = await syncSales(l.id, l.organizationId, laundriesWithSales, since);
    if (err) errors.push(`${l.id}: ${err}`);
  });
  await batch(incrSyncLaundries, LAUNDRY_BATCH, async (l) => {
    const err = await syncSales(l.id, l.organizationId, laundriesWithSales, since);
    if (err) errors.push(`${l.id}: ${err}`);
  });

  const newSales  = (await db.sale.count())  - salesBefore;
  const newCycles = (await db.cycle.count()) - cyclesBefore;
  timing.syncSales = Date.now() - t2;
  timing.total     = Date.now() - t0;

  return { newSales, newCycles, timing, errors };
}

export async function syncLaundries() {
  try {
    const data = await api.getLaundries();
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

function parseBirthDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
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

    // Ignorar vendas sem cliente válido
    const validData = data.filter((s: any) => s.customer?.id);

    // Clientes primeiro (FK: customerLaundry e sale dependem de customer existir)
    await batch(validData, UPSERT_BATCH, async (s: any) => {
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
          birthDate: parseBirthDate(s.customer.birthDate),
        },
      });
    });

    // customerLaundry por pares únicos (evita race condition)
    const uniqueCustomerIds = [...new Set(validData.map((s: any) => s.customer.id as string))];
    for (const customerId of uniqueCustomerIds) {
      await db.customerLaundry.upsert({
        where: { customerId_laundryId: { customerId, laundryId } },
        update: {},
        create: { customerId, laundryId },
      });
    }

    // Sales em paralelo
    await batch(validData, UPSERT_BATCH, async (s: any) => {
      const machinesFromApi =
        Array.isArray(s.machines) && s.machines.length > 0 ? s.machines : undefined;
      await db.sale.upsert({
        where: { id: s.id },
        update: {
          // Atualiza machines apenas quando a API retornar valor não-vazio
          ...(machinesFromApi !== undefined && { machines: machinesFromApi }),
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

    // Ciclos construídos por lavanderia logo após as vendas — evita carregar todas as vendas em memória de uma vez
    await buildCyclesForLaundry(laundryId, effectiveSince);

    await db.syncLog.create({ data: { entity: "sales", status: "success" } });
    return null;
  } catch (err: any) {
    await db.syncLog.create({
      data: { entity: "sales", status: "error", message: err.message },
    });
    return err.message;
  }
}

// Reconstrói ciclos apenas para uma lavanderia, opcionalmente filtrando por data
export async function buildCyclesForLaundry(laundryId: string, since?: Date) {
  const sales = await db.sale.findMany({
    where: {
      laundryId,
      ...(since ? { date: { gte: startOfDay(since) } } : {}),
    },
  });

  const groupMap = new Map<string, typeof sales>();
  for (const s of sales) {
    const dayKey = brazilDayUTC(s.date).toISOString();
    const key = `${s.customerId}||${s.machineType}||${dayKey}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(s);
  }

  await batch([...groupMap.values()], CYCLE_BATCH, async (rawSales) => {
    // Deduplica vendas com timestamp + valor + pagamento idênticos (bug de registro duplo no SisLav)
    const seen = new Set<string>();
    const daySales = rawSales.filter((s) => {
      const key = `${s.date.getTime()}|${s.paidValue}|${s.paymentMethod}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const { customerId, machineType } = daySales[0];
    const cycleDate   = brazilDayUTC(daySales[0].date);
    const allMachines = daySales.flatMap((s) => s.machines) as any;
    // Fallback: se machines[] vier vazio da API, conta 1 por venda (igual ao SisLav)
    const machinesCount = daySales.reduce((sum, s) => {
      const mc = (s.machines as any[]).length;
      return sum + (mc > 0 ? mc : 1);
    }, 0);

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
        machinesUsed:   allMachines,
        machinesCount,
        totalPaidValue: daySales.reduce((a, s) => a + s.paidValue, 0),
        totalValue:     daySales.reduce((a, s) => a + s.totalValue, 0),
        salesCount:     daySales.length,
        syncedAt:       new Date(),
      },
      create: {
        laundryId,
        customerId,
        machineType,
        cycleDate,
        machinesUsed:   allMachines,
        machinesCount,
        totalPaidValue: daySales.reduce((a, s) => a + s.paidValue, 0),
        totalValue:     daySales.reduce((a, s) => a + s.totalValue, 0),
        salesCount:     daySales.length,
        paymentMethod:  daySales[0].paymentMethod,
      },
    });
  });
}

// Mantido para compatibilidade com imports externos (ex: api/sync/test)
export async function buildCycles(since?: Date) {
  const laundries = await db.laundry.findMany({ select: { id: true } });
  for (const l of laundries) {
    await buildCyclesForLaundry(l.id, since);
  }
  await db.syncLog.create({ data: { entity: "cycles", status: "success" } });
}
