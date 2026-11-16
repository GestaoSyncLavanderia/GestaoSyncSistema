import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Histórico do batimento diário com o SisLav (gravado por lib/reconcile.ts em SyncLog).
// Só leitura. Exige login, como as demais rotas /api do painel (proxy.ts).
export async function GET() {
  const logs = await db.syncLog.findMany({
    where: { entity: "reconcile" },
    orderBy: { createdAt: "desc" },
    take: 90,
  });

  const items = logs.map((log) => {
    const message = log.message ?? "";
    const sep = message.indexOf(": ");
    const day = sep > 0 && /^\d{4}-\d{2}-\d{2}$/.test(message.slice(0, sep)) ? message.slice(0, sep) : null;
    const body = day ? message.slice(sep + 2) : message;
    const ok = log.status === "success";
    return {
      id: log.id,
      ranAt: log.createdAt.toISOString(),
      day,
      ok,
      summary: ok ? body : null,
      differences: ok ? [] : body.split(" | ").filter(Boolean),
    };
  });

  return NextResponse.json({ items });
}
