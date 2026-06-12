import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchSalesFromWebApp } from "@/lib/sislav-webapp";
import { buildCyclesForLaundry } from "@/lib/sync";

export const maxDuration = 300;

/**
 * POST /api/sync/rebuild-webapp
 * Body: { laundryId?: string, from?: "YYYY-MM-DD", to?: "YYYY-MM-DD" }
 *
 * Re-importa vendas via web app do SisLav para uma ou todas as unidades,
 * corrigindo paidValue/totalValue/status/paymentMethod nos registros existentes
 * e depois reconstrói os ciclos.
 *
 * Se laundryId for omitido, processa todas as unidades sequencialmente.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { laundryId: targetId, from, to } = body as {
    laundryId?: string;
    from?: string;
    to?: string;
  };

  const since = from ? new Date(from + "T00:00:00Z") : undefined;
  const until = to   ? new Date(to   + "T23:59:59.999Z") : undefined;

  const laundries = targetId
    ? await db.laundry.findMany({ where: { id: targetId }, select: { id: true, name: true, organizationId: true } })
    : await db.laundry.findMany({ select: { id: true, name: true, organizationId: true }, orderBy: { name: "asc" } });

  if (laundries.length === 0) {
    return NextResponse.json({ error: "Lavanderia não encontrada" }, { status: 404 });
  }

  const t0 = Date.now();
  const results: Record<string, {
    fetched: number;
    upserted: number;
    skipped: number;
    error?: string;
  }> = {};

  for (const l of laundries) {
    try {
      const sales = await fetchSalesFromWebApp(l.id, l.organizationId, since);

      // Filtra por 'until' se informado (o filtro de 'since' é feito na query da web app)
      const filtered = until ? sales.filter((s) => s.date <= until) : sales;
      const valid    = filtered.filter((s) => s.customer?.id);

      let upserted = 0;
      let skipped  = 0;

      for (const s of valid) {
        try {
          // Upsert do cliente (dados mínimos da web app)
          await db.customer.upsert({
            where: { id: s.customer.id },
            update: {
              name:   s.customer.name,
              email:  s.customer.email  ?? null,
              mobile: s.customer.phone  ?? null,
            },
            create: {
              id:           s.customer.id,
              name:         s.customer.name,
              email:        s.customer.email  ?? null,
              mobile:       s.customer.phone  ?? null,
              document:     s.customer.cpf?.replace(/\D/g, "") ?? "",
              documentType: s.customer.cpf ? "CPF" : "",
              birthDate:    null,
            },
          });

          await db.customerLaundry.upsert({
            where: { customerId_laundryId: { customerId: s.customer.id, laundryId: l.id } },
            update: {},
            create: { customerId: s.customer.id, laundryId: l.id },
          });

          // Upsert da venda: atualiza valores corrigidos nos registros existentes
          const machinesFromApi = s.machines.length > 0 ? s.machines : undefined;
          await db.sale.upsert({
            where: { id: s.id },
            update: {
              paidValue:    s.paidValue,
              totalValue:   s.totalValue,
              paymentMethod: s.paymentMethod,
              status:       s.status,
              ...(machinesFromApi && { machines: machinesFromApi }),
            },
            create: {
              id:                s.id,
              laundryId:         l.id,
              customerId:        s.customer.id,
              customerName:      s.customer.name,
              customerDoc:       s.customer.cpf?.replace(/\D/g, "") ?? "",
              customerEmail:     s.customer.email  ?? null,
              customerMobile:    s.customer.phone  ?? null,
              customerBirthDate: null,
              documentType:      s.customer.cpf ? "CPF" : "",
              paidValue:         s.paidValue,
              totalValue:        s.totalValue,
              paymentMethod:     s.paymentMethod,
              machineType:       s.machineType,
              machines:          s.machines,
              serviceType:       s.serviceType,
              status:            s.status,
              date:              s.date,
            },
          });
          upserted++;
        } catch {
          skipped++;
        }
      }

      // Reconstrói ciclos com dados corrigidos
      await buildCyclesForLaundry(l.id, since);

      results[l.name] = { fetched: filtered.length, upserted, skipped };
    } catch (err: any) {
      results[l.name] = { fetched: 0, upserted: 0, skipped: 0, error: err.message };
    }
  }

  return NextResponse.json({
    ok: true,
    from: from ?? "all",
    to:   to   ?? "today",
    totalMs: Date.now() - t0,
    results,
  });
}
