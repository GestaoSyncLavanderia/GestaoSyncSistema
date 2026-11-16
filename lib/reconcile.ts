// Batimento diário: confere o dia anterior do painel contra o SisLav, unidade por unidade.
//
// Duas comparações, com fontes independentes no SisLav:
//  - Faturamento: o resumo gravado em DashboardDay x os dados da aba Dashboard baixados agora.
//    Pega lançamento manual feito depois do sync e dia que deixou de ser atualizado.
//  - Vendas: a tabela Sale x a lista de vendas do SisLav (quantidade e valor pago).
//    Pega venda que não chegou ao banco e venda cancelada no SisLav que ficou no banco.
//
// Só lê. Quem corrige é o sync (o Dashboard é relido todo dia) ou o scripts/backfill.ts.

import { db } from "./db";
import { dashboardToday, getDashboardTimezone, loadDashboardDays } from "./sislav-dashboard";
import { fetchSalesFromWebApp } from "./sislav-webapp";

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const addDays = (day: string, n: number) =>
  new Date(new Date(`${day}T00:00:00.000Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);

export type ReconcileResult = {
  day: string;
  laundries: number;
  differences: string[];
  errors: string[];
};

export async function reconcileDay(day?: string): Promise<ReconcileResult> {
  const timezoneHours = await getDashboardTimezone();
  const target = day ?? addDays(dashboardToday(timezoneHours), -1);

  const laundries = await db.laundry.findMany({
    select: { id: true, name: true, organizationId: true },
    orderBy: { name: "asc" },
  });
  // Unidades fechadas (sem receita há 60 dias) não têm o que conferir.
  const active = await db.dashboardDay.groupBy({
    by: ["laundryId"],
    where: { day: { gte: new Date(`${addDays(target, -60)}T00:00:00.000Z`) } },
  });
  const activeIds = new Set(active.map((a) => a.laundryId));

  const stored = await db.dashboardDay.findMany({ where: { day: new Date(`${target}T00:00:00.000Z`) } });
  const storedMap = new Map(stored.map((s) => [s.laundryId, s]));

  // Dia de vendas: meia-noite a meia-noite de Brasília, como a lista de vendas do SisLav.
  const salesFrom = new Date(`${target}T03:00:00.000Z`);
  const salesTo = new Date(salesFrom.getTime() + DAY_MS);

  const differences: string[] = [];
  const errors: string[] = [];
  const checked = laundries.filter((l) => activeIds.has(l.id));

  for (const l of checked) {
    const name = l.name.trim();
    try {
      const [fresh] = await loadDashboardDays(l.id, l.organizationId, target, target, timezoneHours);
      const mine = storedMap.get(l.id);
      const freshRevenue = fresh?.revenue ?? 0;
      const freshCycles = fresh?.cycles ?? 0;
      const mineRevenue = round2(mine?.revenue ?? 0);
      const mineCycles = mine?.cycles ?? 0;
      if (Math.abs(freshRevenue - mineRevenue) >= 0.01 || freshCycles !== mineCycles) {
        differences.push(
          `Faturamento ${name}: SisLav R$ ${freshRevenue.toFixed(2)} / ${freshCycles} ciclos, painel R$ ${mineRevenue.toFixed(2)} / ${mineCycles}`,
        );
      }

      const sislavSales = (await fetchSalesFromWebApp(l.id, l.organizationId, salesFrom, salesTo)).filter(
        (s) => s.date >= salesFrom && s.date < salesTo,
      );
      const dbAgg = await db.sale.aggregate({
        where: { laundryId: l.id, date: { gte: salesFrom, lt: salesTo } },
        _count: { _all: true },
        _sum: { paidValue: true },
      });
      const sislavPaid = round2(sislavSales.reduce((sum, s) => sum + s.paidValue, 0));
      const dbPaid = round2(dbAgg._sum.paidValue ?? 0);
      if (sislavSales.length !== dbAgg._count._all || Math.abs(sislavPaid - dbPaid) >= 0.01) {
        differences.push(
          `Vendas ${name}: SisLav ${sislavSales.length} vendas / R$ ${sislavPaid.toFixed(2)}, painel ${dbAgg._count._all} / R$ ${dbPaid.toFixed(2)}`,
        );
      }
    } catch (err: any) {
      errors.push(`${name}: ${err.message}`);
    }
  }

  const ok = differences.length === 0 && errors.length === 0;
  await db.syncLog
    .create({
      data: {
        entity: "reconcile",
        status: ok ? "success" : "error",
        message: ok ? `${target}: ${checked.length} unidades ok` : [...differences, ...errors].join(" | ").slice(0, 2000),
      },
    })
    .catch(() => {});

  return { day: target, laundries: checked.length, differences, errors };
}
