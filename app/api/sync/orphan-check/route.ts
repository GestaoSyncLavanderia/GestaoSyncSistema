import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchSalesFromWebApp } from "@/lib/sislav-webapp";
import { buildCyclesForLaundry } from "@/lib/sync";

export const maxDuration = 300;

// GET /api/sync/orphan-check
//   ?windowDays=60      — janela de verificação (padrão: 60 dias)
//   ?dryRun=true        — "false" para deletar os órfãos encontrados
//   ?secret=xxx         — comparado com CRON_SECRET env var (se configurado)
//   ?laundryId=xxx      — restringe a uma única unidade (útil para testes)
export async function GET(req: NextRequest) {
  const params     = req.nextUrl.searchParams;
  const windowDays = Math.max(1, parseInt(params.get("windowDays") ?? "60"));
  const dryRun     = params.get("dryRun") !== "false";
  const secret     = params.get("secret") ?? "";
  const filterId   = params.get("laundryId") ?? null;

  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Início da janela. fetchSalesFromWebApp filtra no servidor pelo date range —
  // não precisa paginar todo o histórico como o getSales fazia.
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  // Margem de segurança: só considera órfão se o registro tiver pelo menos 2 dias.
  // Registros muito recentes podem ainda estar em trânsito no SisLav.
  const safetyDate = new Date();
  safetyDate.setDate(safetyDate.getDate() - 2);

  const laundries = await db.laundry.findMany({
    where:   filterId ? { id: filterId } : undefined,
    select:  { id: true, name: true, organizationId: true },
    orderBy: { name: "asc" },
  });

  const unitResults: Array<{
    laundry: string;
    laundryId: string;
    ok: boolean;
    dbCount?: number;
    slCount?: number;
    orphans?: number;
    orphanValue?: number;
    deleted?: number;
    cyclesRebuilt?: boolean;
    error?: string;
    ms: number;
  }> = [];

  for (const laundry of laundries) {
    const t0 = Date.now();
    try {
      // Busca apenas o período necessário — a API filtra por date range no servidor
      const slSales = await fetchSalesFromWebApp(laundry.id, laundry.organizationId, since);
      const slIds   = new Set(slSales.map((s) => s.id));

      // Registros no DB na mesma janela
      const dbSales = await db.sale.findMany({
        where:  { laundryId: laundry.id, date: { gte: since } },
        select: { id: true, date: true, paidValue: true, serviceType: true, paymentMethod: true },
      });

      // Órfãos: no DB mas não no SisLav, com mais de 2 dias (margem de segurança)
      const orphans     = dbSales.filter((s) => !slIds.has(s.id) && s.date < safetyDate);
      const orphanValue = orphans.reduce((sum, o) => sum + o.paidValue, 0);

      let deleted       = 0;
      let cyclesRebuilt = false;

      if (!dryRun && orphans.length > 0) {
        const orphanIds      = orphans.map((o) => o.id);
        const earliestOrphan = orphans.reduce(
          (min, o) => (o.date < min ? o.date : min),
          orphans[0].date
        );

        await db.sale.deleteMany({ where: { id: { in: orphanIds } } });
        deleted = orphanIds.length;

        // Reconstrói ciclos a partir do dia mais antigo afetado
        await buildCyclesForLaundry(laundry.id, earliestOrphan);
        cyclesRebuilt = true;
      }

      unitResults.push({
        laundry:      laundry.name,
        laundryId:    laundry.id,
        ok:           true,
        dbCount:      dbSales.length,
        slCount:      slIds.size,
        orphans:      orphans.length,
        orphanValue:  Math.round(orphanValue * 100) / 100,
        deleted,
        cyclesRebuilt,
        ms: Date.now() - t0,
      });
    } catch (err: any) {
      unitResults.push({
        laundry:   laundry.name,
        laundryId: laundry.id,
        ok:        false,
        error:     err.message,
        ms:        Date.now() - t0,
      });
    }

    await new Promise((r) => setTimeout(r, 200));
  }

  const totalOrphans = unitResults.reduce((s, r) => s + (r.orphans ?? 0), 0);
  const totalDeleted = unitResults.reduce((s, r) => s + (r.deleted ?? 0), 0);
  const errors       = unitResults.filter((r) => !r.ok);

  return NextResponse.json({
    ok:               errors.length === 0,
    dryRun,
    windowDays,
    since:            since.toISOString(),
    safetyMarginDays: 2,
    totalOrphans,
    totalDeleted,
    errorCount:       errors.length,
    results:          unitResults,
  });
}
