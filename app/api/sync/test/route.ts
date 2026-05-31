import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startOfDay } from "date-fns";

const BASE    = process.env.SISLAV_API_URL!;
const API_KEY = process.env.SISLAV_API_KEY!;

async function apiFetch<T>(path: string, orgId?: string): Promise<T> {
  const headers: Record<string, string> = { "X-API-KEY": API_KEY };
  if (orgId) headers["X-ORG-ID"] = orgId;
  const res = await fetch(`${BASE}${path}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(`Sislav ${res.status} — ${path}`);
  return res.json();
}

export async function POST() {
  const errors: string[] = [];
  let laundriesSynced = 0;
  let salesSynced = 0;
  let cyclesSynced = 0;

  // 1. Primeira página de unidades, máximo 3
  let apiLaundries: any[] = [];
  try {
    const page = await apiFetch<{ data: any[] }>("/v1/franchise/laundry?page=1&limit=3");
    apiLaundries = page.data.slice(0, 3);
  } catch (err: any) {
    return NextResponse.json({ laundries: 0, sales: 0, cycles: 0, errors: [`getLaundries: ${err.message}`] }, { status: 502 });
  }

  for (const l of apiLaundries) {
    try {
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
      laundriesSynced++;
    } catch (err: any) {
      errors.push(`laundry:${l.id}: ${err.message}`);
    }
  }

  // 2. Primeira página de vendas por unidade, máximo 50 cada
  const fetchedSaleIds: string[] = [];

  for (const l of apiLaundries) {
    let apiSales: any[] = [];
    try {
      const page = await apiFetch<{ data: any[] }>(
        `/v1/laundry/${l.id}/sales?page=1&limit=50`,
        l.organizationId
      );
      apiSales = page.data.slice(0, 50);
    } catch (err: any) {
      errors.push(`getSales:${l.id}: ${err.message}`);
      continue;
    }

    for (const s of apiSales) {
      try {
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
            birthDate: s.customer.birthDate ? new Date(s.customer.birthDate) : null,
          },
        });

        await db.customerLaundry.upsert({
          where: { customerId_laundryId: { customerId: s.customer.id, laundryId: l.id } },
          update: {},
          create: { customerId: s.customer.id, laundryId: l.id },
        });

        await db.sale.upsert({
          where: { id: s.id },
          update: {},
          create: {
            id: s.id,
            laundryId: l.id,
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

        fetchedSaleIds.push(s.id);
        salesSynced++;
      } catch (err: any) {
        errors.push(`sale:${s.id}: ${err.message}`);
      }
    }
  }

  // 3. buildCycles apenas para as vendas buscadas neste teste
  if (fetchedSaleIds.length > 0) {
    const sales = await db.sale.findMany({ where: { id: { in: fetchedSaleIds } } });

    // Agrupa por (laundryId, customerId, machineType, dia)
    const groups = new Map<string, typeof sales>();
    for (const s of sales) {
      const dayKey = startOfDay(s.date).toISOString();
      const key = `${s.laundryId}||${s.customerId}||${s.machineType}||${dayKey}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(s);
    }

    for (const [, daySales] of groups.entries()) {
      const { laundryId, customerId, machineType } = daySales[0];
      const cycleDate = startOfDay(daySales[0].date);
      const allMachines = daySales.flatMap((s) => s.machines);
      try {
        await db.cycle.upsert({
          where: {
            laundryId_customerId_machineType_cycleDate: { laundryId, customerId, machineType, cycleDate },
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
        cyclesSynced++;
      } catch (err: any) {
        errors.push(`cycle:${laundryId}/${customerId}/${machineType}: ${err.message}`);
      }
    }
  }

  return NextResponse.json({ laundries: laundriesSynced, sales: salesSynced, cycles: cyclesSynced, errors });
}
