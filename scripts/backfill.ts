// Recuperação manual de dados, para rodar na máquina — sem o limite de tempo da Vercel.
//
//   npx tsx scripts/backfill.ts dashboard 2024-04-01   recalcula o resumo do Dashboard desde a data
//   npx tsx scripts/backfill.ts sales 2026-10-06       reimporta as vendas desde a data
//
// Um terceiro argumento opcional restringe a uma unidade (id). As duas operações podem ser
// repetidas sem duplicar nada. As credenciais vêm de .env.local.
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const DAY_MS = 24 * 60 * 60 * 1000;
const toDay = (date: Date) => date.toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Último dia do mês de `day` e primeiro dia do mês seguinte (datas "AAAA-MM-DD").
function monthBounds(day: string): { end: string; next: string } {
  const [year, month] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return { end: toDay(new Date(next.getTime() - DAY_MS)), next: toDay(next) };
}

async function main() {
  const [mode, from, laundryId] = process.argv.slice(2);
  if (!["dashboard", "sales"].includes(mode) || !/^\d{4}-\d{2}-\d{2}$/.test(from ?? "")) {
    console.error("Uso: npx tsx scripts/backfill.ts <dashboard|sales> <AAAA-MM-DD> [id da unidade]");
    process.exit(1);
  }

  // Importados só aqui: lib/db lê DATABASE_URL ao ser carregado, então o .env.local precisa vir antes.
  const { db } = await import("../lib/db");
  const laundries = await db.laundry.findMany({
    where: laundryId ? { id: laundryId } : undefined,
    select: { id: true, name: true, organizationId: true },
    orderBy: { name: "asc" },
  });
  if (laundries.length === 0) throw new Error("Nenhuma unidade encontrada");

  if (mode === "dashboard") {
    const { getDashboardTimezone, syncDashboardDays, dashboardToday } = await import("../lib/sislav-dashboard");
    const timezoneHours = await getDashboardTimezone();
    const today = dashboardToday(timezoneHours);
    console.log(`Resumo do Dashboard de ${from} a ${today} (fuso da conta: ${timezoneHours}h)`);

    for (const l of laundries) {
      let days = 0;
      try {
        // Um mês por vez, para cada resposta do SisLav ficar pequena.
        for (let start = from; start <= today; start = monthBounds(start).next) {
          const { end } = monthBounds(start);
          const month = () => syncDashboardDays(l.id, l.organizationId, start, end < today ? end : today, timezoneHours);
          // O SisLav falha de vez em quando sem motivo aparente; uma segunda tentativa costuma passar.
          days += await month().catch(() => sleep(3000).then(month));
          await sleep(200);
        }
        console.log(`ok    ${l.name}: ${days} dias`);
      } catch (err: any) {
        console.log(`ERRO  ${l.name}: ${err.message} (gravados ${days} dias antes do erro)`);
      }
    }
  } else {
    const { syncSalesWebApp } = await import("../lib/sync");
    const since = new Date(`${from}T03:00:00.000Z`); // 00:00 de Brasília
    console.log(`Vendas desde ${from}`);

    for (const l of laundries) {
      const before = await db.sale.count({ where: { laundryId: l.id } });
      const err = await syncSalesWebApp(l.id, l.organizationId, new Set([l.id]), since);
      const added = (await db.sale.count({ where: { laundryId: l.id } })) - before;
      console.log(`${err ? "ERRO " : "ok   "} ${l.name}: ${added} vendas novas${err ? ` — ${err}` : ""}`);
    }
  }

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
