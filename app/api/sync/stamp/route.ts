import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sync/stamp
// Grava um SyncLog de sucesso para "sales" com a data atual.
// Use após uma reconstrução manual de ciclos para garantir que o próximo sync seja incremental.
export async function POST() {
  const log = await db.syncLog.create({
    data: { entity: "sales", status: "success" },
  });
  return NextResponse.json({ ok: true, createdAt: log.createdAt });
}
