import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { brazilDayUTC } from "@/lib/sync";

export const maxDuration = 300;

const CYCLE_BATCH = 20;

async function batchRun<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

export async function POST() {
  const t0 = Date.now();

  const laundries = await db.laundry.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const log: Array<{
    laundryId: string;
    name: string;
    deleted: number;
    created: number;
    ms: number;
  }> = [];

  for (const { id: laundryId, name } of laundries) {
    const tL = Date.now();
    try {
      // 1. Remove todos os ciclos dessa unidade
      const { count: deleted } = await db.cycle.deleteMany({ where: { laundryId } });

      // 2. Busca todas as vendas da unidade no banco
      const sales = await db.sale.findMany({ where: { laundryId } });
      if (sales.length === 0) {
        log.push({ laundryId, name, deleted, created: 0, ms: Date.now() - tL });
        continue;
      }

      // 3. Agrupa por dia Brasília + cliente + tipo de máquina
      const groupMap = new Map<string, typeof sales>();
      for (const s of sales) {
        const dayKey = brazilDayUTC(s.date).toISOString();
        const key = `${s.customerId}||${s.machineType}||${dayKey}`;
        if (!groupMap.has(key)) groupMap.set(key, []);
        groupMap.get(key)!.push(s);
      }

      // 4. Cria os ciclos em lotes
      let created = 0;
      await batchRun([...groupMap.values()], CYCLE_BATCH, async (rawSales) => {
        // Deduplica vendas com timestamp + valor + pagamento idênticos (bug de registro duplo no SisLav)
        const seen = new Set<string>();
        const daySales = rawSales.filter((s) => {
          const key = `${s.date.getTime()}|${s.paidValue}|${s.paymentMethod}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        const { customerId, machineType } = daySales[0];
        const cycleDate    = brazilDayUTC(daySales[0].date);
        const allMachines  = daySales.flatMap((s) => s.machines) as number[];
        // Fallback: se machines[] vier vazio da API, conta 1 por venda (igual ao SisLav)
        const machinesCount = daySales.reduce((sum, s) => {
          const mc = (s.machines as number[]).length;
          return sum + (mc > 0 ? mc : 1);
        }, 0);

        await db.cycle.create({
          data: {
            laundryId,
            customerId,
            machineType,
            cycleDate,
            machinesUsed:   allMachines,
            machinesCount,
            totalPaidValue: daySales.reduce((acc, s) => acc + s.paidValue, 0),
            totalValue:     daySales.reduce((acc, s) => acc + s.totalValue, 0),
            salesCount:     daySales.length,
            paymentMethod:  daySales[0].paymentMethod,
          },
        });
        created++;
      });

      log.push({ laundryId, name, deleted, created, ms: Date.now() - tL });
    } catch (err: any) {
      return NextResponse.json(
        {
          ok: false,
          error: { laundryId, name, message: err.message },
          processed: log,
          totalMs: Date.now() - t0,
        },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    processed: log,
    totalDeleted: log.reduce((s, l) => s + l.deleted, 0),
    totalCreated: log.reduce((s, l) => s + l.created, 0),
    totalMs: Date.now() - t0,
  });
}
